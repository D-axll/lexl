'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const {buildTestRelease,APP,DB,NAMESPACE,DEFAULT_ORIGIN}=require('../scripts/build-test.cjs');
const fixture=require('../test-build/synthetic-fixture.cjs');
const {packageTestRelease}=require('../scripts/package-test.cjs');
let browser,server,temp,release,url;
const key=NAMESPACE+'-v1';
const mime=name=>name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'application/octet-stream';
before(async()=>{
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'lexl-fault-2a-'));const out=path.join(temp,'release');
 if(process.env.LEXL_FAULT_RELEASE_DIR){await fs.cp(process.env.LEXL_FAULT_RELEASE_DIR,out,{recursive:true});release=JSON.parse(await fs.readFile(path.join(out,'release-manifest.json')))}else release=await buildTestRelease({out});
 server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/blank'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic setup</title>');return}const file=path.resolve(out,'site','.'+(name.endsWith('/')?name+'index.html':name));if(!file.startsWith(path.join(out,'site')+path.sep))throw Error('path');res.setHeader('Content-Type',mime(file));res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://localhost:'+server.address().port;
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(temp)await fs.rm(temp,{recursive:true,force:true})});
async function app(t,{workers='block',init}={}){
 const context=await browser.newContext({serviceWorkers:workers,viewport:{width:412,height:915},timezoneId:'Europe/Stockholm'});t.after(()=>context.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 if(init)await context.addInitScript(init);await page.goto(url+'/'+APP+'/');await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);return {page,context,errors};
}
async function approve(page){await page.locator('#transition-prepare').click();await page.locator('#transition-consent').check();await page.locator('#transition-approve').click();await page.waitForFunction(()=>!lexlMigrationBusy)}
async function reload(page){await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized)}
const state=page=>page.evaluate(()=>JSON.parse(JSON.stringify(state)));
const raw=page=>page.evaluate(key=>localStorage.getItem(key),key);
async function dbRows(page){return page.evaluate(async dbName=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readonly'),s=tx.objectStore('records');let keys,values;const k=s.getAllKeys(),v=s.getAll();k.onsuccess=()=>{keys=k.result};v.onsuccess=()=>{values=v.result};tx.oncomplete=()=>{db.close();resolve(Object.fromEntries(keys.map((key,i)=>[key,values[i]])))};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)}),DB)}

function preserves(original,actual){if(Array.isArray(original)){assert.equal(actual.length,original.length);original.forEach((value,i)=>preserves(value,actual[i]))}else if(original&&typeof original==='object'){for(const [key,value]of Object.entries(original))preserves(value,actual[key])}else assert.deepEqual(actual,original)}

test('2A uses separate identity, origin, scope, keys, cache and verified files',async t=>{
 assert.equal(release.stage,'2A');assert.equal(release.approvedBase,'2b9cbc12e217963635f761618fbb42255433d772');assert.equal(release.faultTest,true);assert.equal(release.importEnabled,false);assert.notEqual(DEFAULT_ORIGIN,'https://lexl-beta-test.pages.dev');assert.equal(release.files.length,17);
 for(const file of release.files){const bytes=await fs.readFile(path.join(temp,'release','site',file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256)}
 const manifest=JSON.parse(await fs.readFile(path.join(temp,'release','site',APP,'manifest.webmanifest')));assert.equal(manifest.id,'/'+APP+'/pwa');assert.equal(manifest.short_name,'FELTEST 2A');
 const {page,errors}=await app(t);assert.match(await page.title(),/FELTEST.*2A/);assert.match(await page.locator('#fault-mode').textContent(),/ARMERAT/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
});

test('2A interrupts after verified copy and receipt, before activation, preserving every source byte',async t=>{
 const {page,errors}=await app(t),original=await raw(page),before=await state(page);await approve(page);const rows=await dbRows(page),current=JSON.parse(rows.current.raw),owner=rows['copy-owner'].proposalId;
 assert.equal(await raw(page),original);assert.deepEqual(await state(page),before);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal(rows.activation,undefined);assert.equal(rows.current.raw,rows['proposal:'+owner].copyRaw);assert.ok(rows['proposal:'+owner].approved);assert.equal(rows.current.revision,1);
 assert.equal(crypto.createHash('sha256').update(rows.current.raw).digest('hex'),rows['receipt:1'].digest);assert.equal(rows['backup:'+owner].sha256,crypto.createHash('sha256').update(rows['backup:'+owner].payload).digest('hex'));assert.equal(JSON.parse(rows['backup:'+owner].payload).legacyRaw,original);
 for(let i=0;i<fixture().history.length;i++)for(const [field,value]of Object.entries(fixture().history[i]))preserves(value,current.history[i][field]);
 assert.equal(current.draft.comments['test-x-a'],fixture().draft.comments['test-x-a']);assert.deepEqual(current.draft.circleGroups,fixture().draft.circleGroups);assert.match(await page.locator('#data-error').textContent(),/AVSIKTLIGT FELTEST 2A/);
 const diag=await page.evaluate(()=>LEXL2AFault.refresh());assert.equal(diag.copyVerified,true);assert.equal(diag.backupVerified,true);assert.equal(diag.originalUnchanged,true);assert.equal(diag.activationPresent,false);assert.deepEqual(errors,[]);
});

test('2A actual restart keeps copied state inactive and original draft readable, even across repeated retries',async t=>{
 const {page}=await app(t);await approve(page);const before=await dbRows(page),original=await raw(page);await reload(page);
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal(await page.evaluate(()=>lexlStore.pending.copiedButInactive),true);assert.equal((await state(page)).storageRevision,0);assert.equal((await state(page)).draft.comments['test-x-a'],fixture().draft.comments['test-x-a']);
 await approve(page);const after=await dbRows(page);assert.equal(after.activation,undefined);assert.equal(after.current.raw,before.current.raw);assert.equal(after.current.revision,1);assert.equal(after['copy-owner'].proposalId,before['copy-owner'].proposalId);assert.equal(await raw(page),original);
});

test('2A incomplete copy cannot be activated by ordinary writes or JSON/ZIP import',async t=>{
 const {page}=await app(t);await approve(page);await reload(page);const before=await dbRows(page),original=await raw(page);
 const result=await page.evaluate(async()=>{let reads=0;const file={text(){reads++;throw Error('External data')},arrayBuffer(){reads++;throw Error('External data')}};await importData(file);await verifyRollbackFile(file);await newProgram();return reads});assert.equal(result,0);assert.equal((await dbRows(page)).current.raw,before.current.raw);assert.equal((await dbRows(page)).activation,undefined);assert.equal(await raw(page),original);
 await page.evaluate(()=>go('settings'));assert.equal(await page.locator('input[type=file]').count(),0);
});

test('2A disarming alone never activates; explicit renewed consent resumes the same verified copy',async t=>{
 const {page,errors}=await app(t);await approve(page);const before=await dbRows(page),original=await raw(page);await reload(page);await page.locator('#fault-disarm').click();
 assert.equal((await dbRows(page)).activation,undefined);await reload(page);assert.match(await page.locator('#fault-mode').textContent(),/AVSTÄNGT/);assert.equal(await page.locator('#transition-consent').isChecked(),false);assert.equal(await page.locator('#transition-approve').isDisabled(),true);assert.equal((await dbRows(page)).activation,undefined);
 await approve(page);assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb');const after=await dbRows(page);assert.ok(after.activation);assert.equal(after.current.raw,before.current.raw);assert.equal(after.activation.proposalId,before['copy-owner'].proposalId);assert.equal((await state(page)).history.length,5);assert.equal(await raw(page),original);
 await page.locator('#fault-refresh').click();await page.waitForFunction(()=>LEXL2AFault.lastStatus?.activationPresent===true);assert.match(await page.locator('#fault-status').textContent(),/"activationPresent": true/);await reload(page);assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb');assert.equal((await state(page)).draft.comments['test-x-a'],fixture().draft.comments['test-x-a']);assert.deepEqual(errors,[]);
});

test('2A damaged inactive copy is preserved and cannot activate after disarming',async t=>{
 const {page}=await app(t);await approve(page);const original=await raw(page);await page.evaluate(async dbName=>{await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),g=s.get('current');g.onsuccess=()=>{const record=g.result,value=JSON.parse(record.raw);value.history[0].rows[0].weight='999';record.raw=JSON.stringify(value);s.put(record,'current')};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})},DB);
 await reload(page);await page.locator('#fault-disarm').click();await approve(page);assert.equal((await dbRows(page)).activation,undefined);assert.equal(JSON.parse((await dbRows(page)).current.raw).history[0].rows[0].weight,'999');assert.equal(await raw(page),original);
});

test('2A missing or changed original is never restored or overwritten on restart',async t=>{
 for(const change of ['missing','modified']){
  const {page,context}=await app(t);await approve(page);const before=await dbRows(page),original=await raw(page);
  await context.addInitScript(({key,change})=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;window.syntheticActualSource=()=>get.call(localStorage,key);window.syntheticWrites=[];Storage.prototype.getItem=function(k){if(this===localStorage&&k===key)return change==='missing'?null:'Synthetic changed source preserved';return get.call(this,k)};Storage.prototype.setItem=function(k,v){syntheticWrites.push(k);return set.call(this,k,v)}},{key,change});
  await page.reload();await page.waitForFunction(()=>document.getElementById('lexl-test-banner').textContent.includes('avbruten'));assert.equal(await raw(page),change==='missing'?null:'Synthetic changed source preserved');assert.equal((await dbRows(page)).activation,undefined);assert.equal((await dbRows(page)).current.raw,before.current.raw);assert.equal(await page.evaluate(()=>syntheticActualSource()),original);assert.deepEqual(await page.evaluate(()=>syntheticWrites),[]);
 }
});

test('2A does not seed a missing original even if its local marker is lost while the DB survives',async t=>{
 const {page,context}=await app(t);await approve(page);const original=await raw(page);await context.addInitScript(key=>{const get=Storage.prototype.getItem;window.syntheticActualSource=()=>get.call(localStorage,key);Storage.prototype.getItem=function(k){if(this===localStorage&&(k===key||k===key+'-fixture-created'))return null;return get.call(this,k)}},key);await page.reload();await page.waitForFunction(()=>document.getElementById('lexl-test-banner').textContent.includes('avbruten'));assert.equal(await raw(page),null);assert.equal(await page.evaluate(()=>syntheticActualSource()),original);assert.equal((await dbRows(page)).activation,undefined);
});

test('2A cannot access the regular beta host, even if its files are served there',async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());const page=await context.newPage();await page.addInitScript(()=>{window.access=[];const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){access.push(k);return get.call(this,k)};const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(k,...args){access.push(k);return open.call(this,k,...args)}});
 await context.route('https://lexl-beta-test.pages.dev/**',async route=>{const name=new URL(route.request().url()).pathname;const file=path.join(temp,'release','site',name.endsWith('/')?name+'index.html':name);try{await route.fulfill({status:200,contentType:mime(file),body:await fs.readFile(file)})}catch{await route.fulfill({status:404,body:''})}});
 await page.goto('https://lexl-beta-test.pages.dev/'+APP+'/');assert.match(await page.locator('#lexl-test-banner').textContent(),/fel adress/);assert.deepEqual(await page.evaluate(()=>access),[]);
});

test('2A offline restart does not turn an inactive copy into the primary',async t=>{
 const {page,context}=await app(t,{workers:'allow'});await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await approve(page);await context.setOffline(true);await reload(page);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal((await dbRows(page)).activation,undefined);assert.equal((await state(page)).history.length,5);
});

test('2A unrecognized fault control state fails closed before activation',async t=>{
 const {page}=await app(t);await page.evaluate(k=>sessionStorage.setItem(k+':abort-before-activation','invalid'),NAMESPACE);await approve(page);assert.equal((await dbRows(page)).activation,undefined);assert.match(await page.locator('#data-error').textContent(),/ogiltigt kontrolläge/);
});

test('2A ZIP is a verified isolated fault artifact',async()=>{
 const copy=path.join(temp,'zip-test-copy');await fs.cp(path.join(temp,'release'),copy,{recursive:true});for(const name of ['lexl-feltest-01115-2a-upload.zip','lexl-feltest-01115-2a-upload.zip.sha256','archive-info.json'])await fs.rm(path.join(copy,name),{force:true});const result=await packageTestRelease(copy);assert.equal(result.files,17);assert.equal(result.file,'lexl-feltest-01115-2a-upload.zip');assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(copy,result.file))).digest('hex'),result.sha256);
});

test('2A locks controls and attempt mode during migration; disarming clears earlier UI consent',async t=>{
 const {page}=await app(t);await page.locator('#transition-prepare').click();await page.locator('#transition-consent').check();
 // Synthetic out-of-band flag change after confirm has captured its mode. The
 // ongoing attempt must still abort, and UI controls must be disabled while busy.
 const result=await page.evaluate(async namespace=>{const digest=crypto.subtle.digest;let injected=false,locked=false;crypto.subtle.digest=function(...args){if(!injected){injected=true;locked=document.getElementById('fault-disarm').disabled;sessionStorage.setItem(namespace+':abort-before-activation','disabled')}return digest.apply(this,args)};try{await lexlApproveTransition()}finally{crypto.subtle.digest=digest}return {injected,locked}},NAMESPACE);
 assert.deepEqual(result,{injected:true,locked:true});assert.equal((await dbRows(page)).activation,undefined);assert.match(await page.locator('#data-error').textContent(),/AVSIKTLIGT FELTEST/);
 await page.locator('#fault-arm').click();await page.locator('#transition-consent').check();await page.locator('#fault-disarm').click();assert.equal(await page.locator('#transition-consent').isChecked(),false);assert.equal(await page.locator('#transition-approve').isDisabled(),true);assert.equal((await dbRows(page)).activation,undefined);
});
