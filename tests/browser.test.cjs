'use strict';
// Run manually: node --test tests/browser.test.cjs (requires Playwright and Chromium).
// Each case creates a new browser context and an ephemeral localhost origin; no real app data.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const D=require('../data-layer.js');
let browser,server,url;
const key='min-traning-v1',stateKey=key+'-schema1';
const f=()=>({programs:[{id:'synthetic-p',name:'Synthetic program',type:'cirkel',rounds:2,pages:[],exercises:[{id:'synthetic-x',name:'Synthetic exercise',sets:2,reps:'8',note:'',circleGroup:'1'},{id:'synthetic-y',name:'Second exercise',sets:1,reps:'10',note:'',circleGroup:'1'}]}],history:[{name:'Synthetic old session',date:'2026-10-31T23:30:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',set:1,weight:'7.5',reps:'11',done:true}],warmup:[{activity:'Synthetic rowing',minutes:'1.30'}],warmupMinutes:1.5,totalMinutes:21,comments:{'synthetic-x':'Synthetic historical note'},circleGroups:{'synthetic-x':'A'},extra:{unchanged:'synthetic'}}],draft:null});
before(async()=>{
 server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/__test_blank.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic fixture setup</title>');return}const file=path.resolve(__dirname,'..','.'+(name==='/'?'/index.html':name));if(!file.startsWith(path.resolve(__dirname,'..')+path.sep)){res.writeHead(403);res.end();return}const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://localhost:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r))});
async function isolated(t,{raw=JSON.stringify(f()),init,serviceWorkers='block',activate=true}={}){
 const context=await browser.newContext({serviceWorkers,timezoneId:'Europe/Stockholm'});t.after(()=>context.close());
 const errors=[];context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept())});
 const page=await context.newPage();await page.goto(url+'/__test_blank.html');
 if(raw!==null)await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});
 if(init)await context.addInitScript(init);
 await page.goto(url);await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 if(activate&&raw!==null&&!await page.evaluate(()=>!!lexlStore.blocked))await activateTransition(page);
 return {page,context,errors};
}
async function activateTransition(page){await page.evaluate(async()=>{await lexlPrepareTransition();lexlMigrationConsent=true;document.getElementById('transition-consent').checked=true;await lexlApproveTransition()});assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb')}
const state=page=>page.evaluate(()=>JSON.parse(JSON.stringify(state)));
const raw=page=>page.evaluate(async key=>(await lexlStore.readPrimaryRaw())??localStorage.getItem(key),key);
const invoke=(page,code)=>page.evaluate(code);

test('valid startup leaves source untouched and normal views render',async t=>{const original=JSON.stringify(f()),{page,errors}=await isolated(t,{activate:false});assert.equal(await raw(page),original);for(const [v,id]of [['program','synthetic-p'],['edit','synthetic-p'],['history',null],['detail',0],['settings',null],['stats',null],['about',null],['home',null]]){await page.evaluate(([v,id])=>go(v,id),[v,id]);assert.ok(await page.locator('#app').textContent())}assert.deepEqual(errors,[]);assert.equal(await raw(page),original)});
test('first startup has in-memory defaults but no persistent training data',async t=>{const {page,errors}=await isolated(t,{raw:null});assert.equal(await raw(page),null);assert.ok((await state(page)).programs.length>=3);assert.deepEqual(errors,[])});
for(const damaged of ['{broken','{"programs":[],"history":{}}'])test('invalid startup preserves raw bytes and provides raw download',async t=>{const {page,errors}=await isolated(t,{raw:damaged});assert.equal(await page.locator('#data-error').isVisible(),true);assert.match(await page.locator('#data-error').textContent(),/blockerad/);await invoke(page,()=>newProgram());assert.equal(await raw(page),damaged);const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportera localStorage-rådata',exact:true}).click();const d=await download;assert.equal(await fs.readFile(await d.path(),'utf8'),damaged);assert.deepEqual(errors,[])});
test('workout lifecycle preserves values, IDs, comments and explicit training date',async t=>{const {page,errors}=await isolated(t);await invoke(page,()=>start('synthetic-p'));let a=await state(page);const sessionId=a.draft.sessionId;assert.ok(sessionId);await invoke(page,()=>setWorkoutDate('2026-10-20'));await invoke(page,()=>upd(0,'weight','12.5'));await invoke(page,()=>upd(0,'reps','9'));await invoke(page,()=>upd(0,'done',true));await invoke(page,()=>commentUpdate('synthetic-x','Synthetic session comment'));await invoke(page,()=>addWarm());await invoke(page,()=>warmUpdate(0,'minutes','3'));await invoke(page,()=>warmUpdate(0,'seconds','20'));await invoke(page,()=>addSet('synthetic-x'));await invoke(page,()=>removeSet('synthetic-x'));await invoke(page,()=>timerPause());await invoke(page,()=>timerPause());await invoke(page,()=>finish());a=await state(page);assert.equal(a.draft,null);const h=a.history.at(-1);assert.equal(h.sessionId,sessionId);assert.equal(h.programId,'synthetic-p');assert.equal(h.workoutDate,'2026-10-20');assert.equal(h.rows[0].weight,'12.5');assert.equal(h.rows[0].reps,'9');assert.equal(h.rows[0].done,true);assert.equal(h.comments['synthetic-x'],'Synthetic session comment');assert.equal(h.warmup[0].seconds,20);assert.equal(h.programSnapshot.name,'Synthetic program');assert.equal(h.circleGroups['synthetic-x'],'1');assert.equal(h.snapshot.record.sessionId,sessionId);assert.deepEqual(a.history[0].extra,f().history[0].extra);assert.deepEqual(errors,[])});
test('retrospective entry is a single persisted start; date and time preserved',async t=>{const {page,errors}=await isolated(t);await invoke(page,()=>startRetrospective('synthetic-p'));assert.equal((await state(page)).storageRevision,2);await invoke(page,()=>setWorkoutDate('2026-09-10'));await invoke(page,()=>setWorkoutClock('06:45'));await invoke(page,()=>setTimeMinutes('35'));await invoke(page,()=>finish());const h=(await state(page)).history.at(-1);assert.equal(h.workoutDate,'2026-09-10');assert.equal(h.workoutClock,'06:45');assert.equal(h.totalMinutes,35);assert.equal(h.manualEntry,true);assert.deepEqual(errors,[])});
test('legacy split combo rows survive app startup, editing, export and completion',async t=>{const fixture=f();fixture.programs=[{id:'b2',name:'Synthetic legacy combo',type:'vanligt',rounds:1,pages:[],exercises:[{id:'b2-1',name:'Side bend',sets:1,reps:'8',note:''},{id:'b2-2',name:'Press',sets:1,reps:'10',note:''}]}];fixture.draft={id:'b2',name:'Synthetic legacy combo',started:'2026-11-01T12:00:00Z',rows:[{id:'b2-1',name:'Side bend',set:1,weight:'8',reps:'9',done:true},{id:'b2-2',name:'Press',set:1,weight:'10',reps:'11',done:true}],comments:{'b2-1':'side','b2-2':'press'},warmup:[],circleGroups:{'b2-1':'A','b2-2':'A'}};const initial=JSON.stringify(fixture),{page,errors}=await isolated(t,{raw:initial,activate:false});assert.equal(await raw(page),initial);await activateTransition(page);await page.evaluate(()=>go('workout'));assert.equal(await page.locator('.lexl-workout-exercise').count(),2);const migrated=await page.evaluate(()=>{migrateCombo(state);return LEXLData.exportData(state)});assert.equal(JSON.parse(migrated).draft.rows.length,2);await invoke(page,()=>commentUpdate('b2-2','updated press note'));await invoke(page,()=>finish());const h=(await state(page)).history.at(-1);for(let i=0;i<2;i++)for(const [k,v]of Object.entries(fixture.draft.rows[i]))assert.deepEqual(h.rows[i][k],v);assert.equal(h.comments['b2-1'],'side');assert.equal(h.comments['b2-2'],'updated press note');assert.deepEqual(h.circleGroups,fixture.draft.circleGroups);assert.deepEqual(errors,[])});
test('program editor, copies, new exercise and deletion leave history intact',async t=>{const {page,errors}=await isolated(t);const originalHistory=(await state(page)).history;await invoke(page,()=>duplicate('synthetic-p'));let a=await state(page),copy=a.programs.at(-1);assert.notEqual(copy.id,'synthetic-p');assert.equal(copy.exercises[0].exerciseId,a.programs[0].exercises[0].exerciseId);assert.notEqual(copy.exercises[0].slotId,a.programs[0].exercises[0].slotId);await page.evaluate(id=>{setProg(id,'name','Synthetic edited copy');addEx(id)},copy.id);await page.evaluate(id=>saveExerciseOrder(id),copy.id);a=await state(page);copy=a.programs.at(-1);assert.equal(copy.name,'Synthetic edited copy');assert.equal(copy.exercises.length,3);assert.ok(copy.exercises[2].exerciseId);assert.deepEqual(a.history,originalHistory);await page.evaluate(id=>deleteProg(id),copy.id);assert.equal((await state(page)).programs.length,1);assert.deepEqual((await state(page)).history,originalHistory);assert.deepEqual(errors,[])});
test('legacy import replaces state only after durable save and can be restored',async t=>{const {page,errors}=await isolated(t),before=await raw(page),incoming=f();incoming.history[0].name='Synthetic imported';await page.evaluate(text=>importData(new File([text],'synthetic.json',{type:'application/json'})),JSON.stringify(incoming));assert.equal((await state(page)).history[0].name,'Synthetic imported');assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw()),before);await page.evaluate(async()=>{const raw=await lexlStore.recoveryRaw();return importData(new File([raw],'synthetic-restore.json'))});assert.equal((await state(page)).history[0].name,'Synthetic old session');assert.deepEqual(errors,[])});
test('malformed or incomplete import never changes storage or active state',async t=>{const {page}=await isolated(t),before=await raw(page),active=await state(page);for(const text of ['{bad','{}','{"programs":[]}','{"programs":[],"history":[],"schemaVersion":42}']){await page.evaluate(text=>importData(new File([text],'bad.json')),text);assert.equal(await raw(page),before);assert.deepEqual(await state(page),active)}});
test('quota failure during import leaves active state, original and recovery intact',async t=>{const {page}=await isolated(t),before=await raw(page),active=await state(page),priorRecovery=await page.evaluate(()=>lexlStore.recoveryRaw());await page.evaluate(key=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return put.call(this,v,k)}},stateKey);const incoming=f();incoming.history=[];await page.evaluate(text=>importData(new File([text],'synthetic.json')),JSON.stringify(incoming));assert.equal(await raw(page),before);assert.deepEqual(await state(page),active);assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw()),priorRecovery);assert.equal(await page.locator('#status').textContent(),'Inte sparat');assert.equal(await page.locator('#data-error').isVisible(),true)});
test('failed workout save preserves old state; retry commits retained candidate',async t=>{const {page}=await isolated(t);await invoke(page,()=>start('synthetic-p'));const before=await raw(page),active=await state(page);await page.evaluate(key=>{window.syntheticPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return window.syntheticPut.call(this,v,k)}},stateKey);await invoke(page,()=>upd(0,'weight','99'));assert.equal(await raw(page),before);assert.deepEqual(await state(page),active);await invoke(page,()=>upd(0,'reps','100'));assert.equal(await page.evaluate(()=>lexlUnsaved.draft.rows[0].weight),'99');assert.equal(await page.evaluate(()=>lexlUnsaved.draft.rows[0].reps),'8');await page.evaluate(()=>{IDBObjectStore.prototype.put=window.syntheticPut});await page.getByRole('button',{name:'Försök spara osparat arbete igen'}).click();await page.waitForFunction(()=>state.draft.rows[0].weight==='99');assert.equal(await page.locator('#data-error').isVisible(),false)});
test('two real app tabs serialize writes; stale tab cannot overwrite',async t=>{const {page,context,errors}=await isolated(t);const b=await context.newPage();await b.goto(url);await b.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);await Promise.all([page.evaluate(()=>newProgram()),b.evaluate(()=>newProgram())]);const persisted=JSON.parse(await raw(page));assert.equal(persisted.programs.length,2);const states=await Promise.all([state(page),state(b)]);assert.equal(states.filter(s=>s.programs.length===2).length,1);assert.equal(states.filter(s=>s.programs.length===1).length,1);const stale=states[0].programs.length===1?page:b;await stale.waitForFunction(()=>!document.getElementById('data-error').hidden);assert.match(await stale.locator('#data-error').textContent(),/annat appfönster|osparad|äldre tillstånd/);assert.deepEqual(errors,[])});
test('IndexedDB does not require Web Locks',async t=>{const {page,errors}=await isolated(t,{init:()=>Object.defineProperty(navigator,'locks',{value:undefined})});await invoke(page,()=>newProgram());assert.equal((await state(page)).programs.length,2);assert.deepEqual(errors,[])});
test('history display and order use training date independently of original timestamps',async t=>{const fixture=f();fixture.history[0].workoutDate='2026-11-10';fixture.history.push({...D.copy(fixture.history[0]),name:'Synthetic earlier training',date:'2026-11-12T12:00:00Z',workoutDate:'2026-11-09'});const {page}=await isolated(t,{raw:JSON.stringify(fixture)});await invoke(page,()=>go('history'));const titles=await page.locator('.lexl-history-card-body h3').allTextContents();assert.deepEqual(titles,['Synthetic old session','Synthetic earlier training']);assert.match(await page.locator('.lexl-history-card').first().textContent(),/10 november/);assert.equal((await state(page)).history[0].date,'2026-10-31T23:30:00Z')});
test('export download is versioned and round-trips without historical changes',async t=>{const {page}=await isolated(t),active=await state(page),download=page.waitForEvent('download');await invoke(page,()=>exportData());const d=await download,text=await fs.readFile(await d.path(),'utf8');const parsed=D.importData(text);assert.equal(parsed.schemaVersion,1);assert.deepEqual(parsed,active)});
test('legacy draft recovery key is retained even after completed pass',async t=>{const fixture=f();const draft={id:'synthetic-p',name:'Synthetic recovered',started:'2026-11-01T12:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',set:1,weight:'17',reps:'4',done:true}],warmup:[],comments:{},circleGroups:{}};const {page,errors}=await isolated(t,{activate:false});await page.evaluate(({key,draft})=>localStorage.setItem(key+'-draft-recovery-v27',JSON.stringify({draft,savedAt:'2026-11-01T13:00:00Z'})),{key,draft});await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);await activateTransition(page);const originalRecovery=await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key);await invoke(page,()=>recoverDraft());assert.equal((await state(page)).draft.rows[0].weight,'17');await invoke(page,()=>finish());assert.ok(await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key));assert.equal(await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key),originalRecovery);await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal(await page.evaluate(()=>recoveredDraft),null);assert.deepEqual(errors,[])});
test('service worker includes data layer and supports isolated offline reload',{timeout:20000},async t=>{const {page,context,errors}=await isolated(t,{serviceWorkers:'allow'});await page.evaluate(async()=>{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker ready timeout')),7000))]);if(!navigator.serviceWorker.controller)await Promise.race([new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true})),new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker controller timeout')),7000))])});assert.equal(await page.evaluate(async()=>{const names=await caches.keys();const cache=await caches.open(names.find(x=>x.includes('01115-stage1')));return !!await cache.match('./data-layer.js')}),true);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal((await state(page)).history[0].rows[0].weight,'7.5');await invoke(page,()=>start('synthetic-p'));assert.ok((await state(page)).draft.sessionId);assert.deepEqual(errors,[])});

// These tests exercise real IndexedDB transactions rather than mocked transaction semantics.
async function nativeCase(t, scenario) {
 const {page,errors}=await isolated(t,{raw:null});
 const result=await page.evaluate(scenario,f());
 assert.deepEqual(errors,[]);
 return result;
}

test('legacy startup performs no automatic migration and rejects ordinary writes',async t=>{
 const original=JSON.stringify(f());
 const {page,errors}=await isolated(t,{activate:false});
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),original);
 await page.evaluate(()=>newProgram());
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),original);
 assert.equal((await state(page)).programs.length,1);
 assert.match(await page.locator('#data-error').textContent(),/skrivskyddade/);
 assert.deepEqual(errors,[]);
});

test('empty installation activates IndexedDB only after first verified commit',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const legacy='synthetic-legacy',dbName='synthetic-empty',reads=[];
  const store=LEXLData.createStore({dbName,legacyKey:legacy,storage:{getItem:k=>{reads.push(k);return null}},defaults:()=>fixture});
  await store.ready;
  const initial={source:store.source,primary:await store.readPrimaryRaw(),raw:store.raw};
  const saved=await store.commit(LEXLData.copy(store.state));
  const verified=JSON.parse(await store.readPrimaryRaw());
  const result={initial,source:store.source,revision:saved.storageRevision,equal:JSON.stringify(saved)===JSON.stringify(verified),original:await store.recoveryRaw('original'),previous:await store.recoveryRaw(),onlyReadLegacy:reads.every(k=>k===legacy)};
  store.close();return result;
 });
 assert.deepEqual(result,{initial:{source:'first-start',primary:null,raw:null},source:'indexeddb',revision:1,equal:true,original:null,previous:null,onlyReadLegacy:true});
});

test('low-level copy adapter requires explicit import intent; application activation is separately gated',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const original=JSON.stringify(fixture),dbName='synthetic-manual',options={dbName,legacyKey:'legacy',storage:{getItem:()=>original},defaults:()=>fixture};
  const a=LEXLData.createStore(options);await a.ready;
  const incoming=LEXLData.copy(a.state);incoming.history[0].comments['synthetic-x']='Explicit import';
  await a.commit(incoming,{intent:'import'});a.close();
  const b=LEXLData.createStore(options);await b.ready;
  const result={source:b.source,blocked:!!b.blocked,note:b.state.history[0].comments['synthetic-x'],original:await b.recoveryRaw('original'),legacy:b.legacyRaw};b.close();return result;
 });
 assert.equal(result.source,'indexeddb');assert.equal(result.blocked,false);assert.equal(result.note,'Explicit import');assert.equal(result.original,JSON.stringify(f()));assert.equal(result.legacy,JSON.stringify(f()));
});

test('IndexedDB unavailable or access denied preserves legacy and reports a write error',async t=>{
 const {page,errors}=await isolated(t,{activate:false,init:()=>Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Synthetic denial','SecurityError')}})});
 const before=await page.evaluate(key=>localStorage.getItem(key),key),active=await state(page);
 await page.evaluate(()=>newProgram());
 assert.deepEqual(await state(page),active);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
 assert.match(await page.locator('#data-error').textContent(),/SecurityError|denial|blockerad/);assert.deepEqual(errors,[]);
});

test('a future IndexedDB database version is rejected without deleting it',async t=>{
 const result=await nativeCase(t,async fixture=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-future',2);r.onupgradeneeded=()=>r.result.createObjectStore('future');r.onsuccess=()=>{r.result.close();resolve()};r.onerror=()=>reject(r.error)});
  const store=LEXLData.createStore({dbName:'synthetic-future',legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;
  const blocked=!!store.blocked;
  const version=await new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-future');r.onsuccess=()=>{const v=r.result.version;r.result.close();resolve(v)};r.onerror=()=>reject(r.error)});
  store.close();return {blocked,version};
 });
 assert.deepEqual(result,{blocked:true,version:2});
});

test('abort after a successful put rolls back state, revision, backups and receipt together',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const store=LEXLData.createStore({dbName:'synthetic-abort',legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;
  await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw(),previous=await store.recoveryRaw(),active=JSON.stringify(store.state);
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){const r=put.call(this,value,key);if(key==='current')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r};
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.message}finally{IDBObjectStore.prototype.put=put}
  const result={error,primaryUnchanged:await store.readPrimaryRaw()===before,previousUnchanged:await store.recoveryRaw()===previous,activeUnchanged:JSON.stringify(store.state)===active};
  await store.commit({...LEXLData.copy(store.state),history:[]});result.retryRevision=store.state.storageRevision;result.retryHistory=store.state.history.length;store.close();return result;
 });
 assert.match(result.error,/avbröts|abort/i);assert.equal(result.primaryUnchanged,true);assert.equal(result.previousUnchanged,true);assert.equal(result.activeUnchanged,true);assert.equal(result.retryRevision,2);assert.equal(result.retryHistory,0);
});

for(const target of ['original','previous','current','receipt:1'])test('quota failure at '+target+' atomically leaves empty primary and legacy intact',async t=>{
 const {page}=await isolated(t,{raw:null});
 const result=await page.evaluate(async({fixture,target})=>{
  const original=JSON.stringify(fixture),store=LEXLData.createStore({dbName:'synthetic-quota-'+target,legacyKey:'legacy',storage:{getItem:()=>original},defaults:()=>fixture});await store.ready;
  const active=JSON.stringify(store.state),put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){if(key===target)throw new DOMException('Synthetic quota','QuotaExceededError');return put.call(this,value,key)};
  let error='';try{await store.commit(LEXLData.copy(store.state),{intent:'import'})}catch(e){error=e.message}finally{IDBObjectStore.prototype.put=put}
  const result={error,primary:await store.readPrimaryRaw(),activeUnchanged:JSON.stringify(store.state)===active,legacy:store.legacyRaw};
  let backupMissing=false;try{await store.recoveryRaw()}catch{backupMissing=true}result.backupMissing=backupMissing;
  await store.commit(LEXLData.copy(store.state),{intent:'import'});result.retryRevision=store.state.storageRevision;result.original=await store.recoveryRaw('original');store.close();return result;
 },{fixture:f(),target});
 assert.match(result.error,/quota/i);assert.equal(result.primary,null);assert.equal(result.activeUnchanged,true);assert.equal(result.legacy,JSON.stringify(f()));assert.equal(result.backupMissing,true);assert.equal(result.retryRevision,1);assert.equal(result.original,JSON.stringify(f()));
});

test('asynchronous request failure aborts all writes instead of being mistaken for success',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const store=LEXLData.createStore({dbName:'synthetic-request-error',legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw(),put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){return key==='current'?this.add(value,key):put.call(this,value,key)};
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.name+': '+e.message}finally{IDBObjectStore.prototype.put=put}
  const result={error,primaryUnchanged:await store.readPrimaryRaw()===before,revision:store.state.storageRevision};store.close();return result;
 });
 assert.match(result.error,/ConstraintError/);assert.equal(result.primaryUnchanged,true);assert.equal(result.revision,1);
});

test('failed read-back within write transaction aborts before publishing active state',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const store=LEXLData.createStore({dbName:'synthetic-write-verification',legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw(),get=IDBObjectStore.prototype.get;let count=0;
  IDBObjectStore.prototype.get=function(key){const r=get.call(this,key);if(key==='current'&&this.transaction.mode==='readwrite'&&++count===2)r.addEventListener('success',()=>Object.defineProperty(r,'result',{value:{raw:'wrong',revision:2}}));return r};
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.message}finally{IDBObjectStore.prototype.get=get}
  const result={error,primaryUnchanged:await store.readPrimaryRaw()===before,revision:store.state.storageRevision};store.close();return result;
 });
 assert.match(result.error,/verifieras/);assert.equal(result.primaryUnchanged,true);assert.equal(result.revision,1);
});

test('failed verification after commit blocks retries and explains that data may already be saved',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const store=LEXLData.createStore({dbName:'synthetic-postcommit-verification',legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw(),get=IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get=function(key){const r=get.call(this,key);if(key==='receipt:2'&&this.transaction.mode==='readonly')r.addEventListener('success',()=>Object.defineProperty(r,'result',{value:undefined}));return r};
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.message}finally{IDBObjectStore.prototype.get=get}
  let retryError='';try{await store.commit(LEXLData.copy(store.state))}catch(e){retryError=e.message}
  const persisted=JSON.parse(await store.readPrimaryRaw()),result={error,retryError,activeRevision:store.state.storageRevision,persistedRevision:persisted.storageRevision,persistedHistory:persisted.history.length,backupPreserved:await store.recoveryRaw()===before};store.close();return result;
 });
 assert.match(result.error,/kan vara sparad/);assert.match(result.retryError,/blockerad/);assert.equal(result.activeRevision,1);assert.equal(result.persistedRevision,2);assert.equal(result.persistedHistory,0);assert.equal(result.backupPreserved,true);
});

test('corrupt IndexedDB primary never silently falls back to valid legacy',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const dbName='synthetic-corrupt-primary',legacy=JSON.stringify(fixture),options={dbName,legacyKey:'legacy',storage:{getItem:()=>legacy},defaults:()=>fixture};
  const first=LEXLData.createStore(options);await first.ready;await first.commit(LEXLData.copy(first.state),{intent:'import'});first.close();
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({format:'lexl-idb-state-v1',revision:1,raw:'{broken',legacyRaw:legacy},'current');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  const store=LEXLData.createStore(options);await store.ready;
  const result={blocked:!!store.blocked,active:store.state,raw:store.raw,primary:await store.readPrimaryRaw(),legacy:store.legacyRaw};store.close();return result;
 });
 assert.equal(result.blocked,true);assert.equal(result.active,null);assert.equal(result.raw,'{broken');assert.equal(result.primary,'{broken');assert.equal(result.legacy,JSON.stringify(f()));
});

test('legacy changes after activation preserve both sources and block writes after reload',async t=>{
 const {page,context}=await isolated(t),primary=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 const other=await context.newPage();await other.goto(url+'/__test_blank.html');
 await other.evaluate(key=>localStorage.setItem(key,'{"programs":[],"history":[],"draft":null}'),key);
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),primary);assert.equal((await state(page)).history.length,1);
 await page.evaluate(()=>newProgram());assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),primary);assert.match(await page.locator('#data-error').textContent(),/localStorage-data har ändrats/);
});

test('restoring previous backup is a new verified revision and retains permanent original',async t=>{
 const {page}=await isolated(t),original=await page.evaluate(()=>lexlStore.recoveryRaw('original'));
 await page.evaluate(()=>newProgram());const before=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 await page.evaluate(()=>newProgram());assert.equal((await state(page)).programs.length,3);
 await page.evaluate(async()=>importData(new File([await lexlStore.recoveryRaw()],'synthetic-restore.json')));
 assert.equal((await state(page)).programs.length,2);assert.equal((await state(page)).storageRevision,4);
 assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw('original')),original);assert.equal(JSON.parse(before).programs.length,2);
});

test('twenty concurrent IndexedDB transactions accept exactly one writer per base revision',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const dbName='synthetic-contention',options={dbName,legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture};
  const seed=LEXLData.createStore(options);await seed.ready;await seed.commit(LEXLData.copy(seed.state));seed.close();
  const stores=Array.from({length:20},()=>LEXLData.createStore(options));await Promise.all(stores.map(s=>s.ready));
  const results=await Promise.allSettled(stores.map((s,i)=>s.commit({...LEXLData.copy(s.state),syntheticWriter:i})));
  const accepted=results.filter(r=>r.status==='fulfilled'),persisted=JSON.parse(await stores[0].readPrimaryRaw());
  const result={accepted:accepted.length,rejected:results.filter(r=>r.status==='rejected').length,revision:persisted.storageRevision,winner:accepted[0]?.value.syntheticWriter,persistedWinner:persisted.syntheticWriter};stores.forEach(s=>s.close());return result;
 });
 assert.equal(result.accepted,1);assert.equal(result.rejected,19);assert.equal(result.revision,2);assert.equal(result.winner,result.persistedWinner);
});

test('ten rounds of simultaneous real app tabs never silently overwrite a change',{timeout:30000},async t=>{
 const {page,context}=await isolated(t),other=await context.newPage();
 for(let round=0;round<10;round++){
  if(round){await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized)}
  await other.goto(url);await other.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
  const before=(await state(page)).programs.length;
  await Promise.all([page.evaluate(()=>newProgram()),other.evaluate(()=>newProgram())]);
  const a=await state(page),b=await state(other),persisted=JSON.parse(await page.evaluate(()=>lexlStore.readPrimaryRaw()));
  assert.equal(persisted.programs.length,before+1,'persisted count round '+round);
  assert.equal([a,b].filter(s=>s.programs.length===before+1).length,1,'accepted writer count round '+round);
  assert.equal([a,b].filter(s=>s.programs.length===before).length,1,'rejected writer count round '+round);
 }
});

test('legacy time near midnight retains its former local date display without inventing workoutDate',async t=>{
 const {page}=await isolated(t,{activate:false});
 assert.equal((await state(page)).history[0].workoutDate,null);
 await page.evaluate(()=>go('history'));
 assert.match(await page.locator('.lexl-history-card').first().textContent(),/1 november/);
 assert.equal((await state(page)).history[0].date,'2026-10-31T23:30:00Z');
});
test('ordinary writes and imports cannot bypass the explicit transition',async t=>{
 const {page}=await isolated(t,{activate:false});
 await page.evaluate(()=>newProgram());
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await page.evaluate(text=>importData(new File([text],'synthetic-import.json')),JSON.stringify(f()));
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await activateTransition(page);
 assert.equal((await state(page)).programs.length,1);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(f()));
});
test('real form events persist asynchronously and leave every legacy training key byte-for-byte unchanged',async t=>{
 const {page,errors}=await isolated(t);
 const legacy=await page.evaluate(key=>({primary:localStorage.getItem(key),draft:localStorage.getItem(key+'-draft-recovery-v27'),experimental:localStorage.getItem(key+'-schema1')}),key);
 await page.evaluate(()=>go('program','synthetic-p'));
 await page.getByRole('button',{name:/Starta pass/}).click();
 await page.waitForFunction(()=>!!state.draft);
 await page.locator('#workout-date').fill('2026-11-03');
 await page.waitForFunction(()=>state.draft.workoutDate==='2026-11-03');
 await page.locator('#workout-row-0-weight').fill('14.5');
 await page.locator('#workout-row-0-weight').press('Tab');
 await page.waitForFunction(()=>state.draft.rows[0].weight==='14.5');
 await page.locator('#workout-row-0-done').check();
 await page.waitForFunction(()=>state.draft.rows[0].done);
 await page.locator('#workout-comment-0').fill('Synthetic form note');
 await page.locator('#workout-comment-0').press('Tab');
 await page.waitForFunction(()=>state.draft.comments['synthetic-x']==='Synthetic form note');
 await page.getByRole('button',{name:'✓ Avsluta och spara pass',exact:true}).click();
 await page.waitForFunction(()=>state.draft===null);
 const h=(await state(page)).history.at(-1);
 assert.equal(h.rows[0].weight,'14.5');assert.equal(h.rows[0].done,true);assert.equal(h.comments['synthetic-x'],'Synthetic form note');assert.equal(h.workoutDate,'2026-11-03');
 assert.deepEqual(await page.evaluate(key=>({primary:localStorage.getItem(key),draft:localStorage.getItem(key+'-draft-recovery-v27'),experimental:localStorage.getItem(key+'-schema1')}),key),legacy);
 assert.deepEqual(errors,[]);
});

test('old appearance preferences remain untouched when new-version preferences are saved',async t=>{
 const {page,errors}=await isolated(t,{init:()=>{localStorage.setItem('min-traning-font-v28','3');localStorage.setItem('min-traning-theme-v30','light')}});
 const before=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 assert.equal(await page.evaluate(()=>fontStep),3);assert.equal(await page.evaluate(()=>themeChoice),'light');
 await page.evaluate(()=>{setFontStep(1);setTheme('dark')});
 assert.equal(await page.evaluate(()=>localStorage.getItem('min-traning-font-v28')),'3');
 assert.equal(await page.evaluate(()=>localStorage.getItem('min-traning-theme-v30')),'light');
 assert.equal(await page.evaluate(()=>localStorage.getItem('min-traning-font-v28-01115')),'1');
 assert.equal(await page.evaluate(()=>localStorage.getItem('min-traning-theme-v30-01115')),'dark');
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),before);assert.deepEqual(errors,[]);
});

test('changed unknown primary format is rejected inside transaction without replacing data',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const dbName='synthetic-format-guard',store=LEXLData.createStore({dbName,legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw();
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),records=tx.objectStore('records'),get=records.get('current');get.onsuccess=()=>records.put({...get.result,format:'future-format'},'current');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.message}
  const result={error,revision:store.state.storageRevision,unchanged:await store.readPrimaryRaw()===before};store.close();return result;
 });
 assert.match(result.error,/Ogiltig IndexedDB-post/);assert.equal(result.revision,1);assert.equal(result.unchanged,true);
});

test('damaged original recovery point blocks replacement and preserves current and previous records',async t=>{
 const result=await nativeCase(t,async fixture=>{
  const dbName='synthetic-backup-guard',store=LEXLData.createStore({dbName,legacyKey:'legacy',storage:{getItem:()=>null},defaults:()=>fixture});await store.ready;await store.commit(LEXLData.copy(store.state));
  const before=await store.readPrimaryRaw(),previous=await store.recoveryRaw();
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({format:'lexl-raw-backup-v1',raw:'{broken'},'original');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  let error='';try{await store.commit({...LEXLData.copy(store.state),history:[]})}catch(e){error=e.message}
  const result={error,revision:store.state.storageRevision,unchanged:await store.readPrimaryRaw()===before,previousUnchanged:await store.recoveryRaw()===previous};store.close();return result;
 });
 assert.match(result.error,/Återställningskopian kunde inte valideras/);assert.equal(result.revision,1);assert.equal(result.unchanged,true);assert.equal(result.previousUnchanged,true);
});

// The one-time transition investigation is never loaded by the application.
async function transitionCase(t, scenario) {
 const {page,errors}=await isolated(t,{raw:null});
 await page.addScriptTag({url:url+'/prototypes/one-time-transition.js'});
 const result=await page.evaluate(scenario,f());
 assert.deepEqual(errors,[]);return result;
}

test('transition prototype is absent from normal app and rejects production database names',async t=>{
 const {page}=await isolated(t,{raw:null});
 assert.equal(await page.evaluate(()=>typeof LEXLMigrationPrototype),'undefined');
 await page.addScriptTag({url:url+'/prototypes/one-time-transition.js'});
 assert.match(await page.evaluate(()=>{try{LEXLMigrationPrototype.create({dbName:'lexl-training-schema1',readLegacy:()=>null})}catch(e){return e.message}}),/isolerad/);
});

test('transition prepares verified source and draft backup before consent, without copying primary',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),recovery=JSON.stringify({draft:{id:'synthetic-p',name:'Synthetic recovery',started:'2026-11-01T12:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',weight:'9',reps:'8',set:1,done:true}],comments:{'synthetic-x':'Recovery note'},circleGroups:{'synthetic-x':'1'}}});
  const p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-prepare',readLegacy:()=>raw,readRecovery:()=>recovery});
  const summary=await p.prepare(),status=await p.inspect();let rejected='';try{await p.confirm(summary.id,{approved:false,backupSha256:summary.backupSha256})}catch(e){rejected=e.message}
  const after=await p.inspect();p.close();return {summary,status,rejected,after,rawUnchanged:raw===JSON.stringify(fixture)};
 });
 assert.equal(result.summary.sessions,1);assert.equal(result.summary.recovery,true);assert.equal(result.summary.primaryActivated,false);assert.equal(result.status.primary,'legacy-readonly');assert.equal(result.status.copiedButInactive,false);assert.equal(result.after.copiedButInactive,false);assert.match(result.rejected,/godkännande/);assert.equal(result.rawUnchanged,true);
});

test('explicit one-time transition preserves legacy training values and needs no export/import file',async t=>{
 const result=await transitionCase(t,async fixture=>{
  fixture.draft={id:'synthetic-p',name:'Synthetic ongoing',started:'2026-11-01T12:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',weight:'18.5',reps:'6',set:1,done:true}],comments:{'synthetic-x':'Ongoing note'},warmup:[],circleGroups:{'synthetic-x':'1'}};
  const raw=JSON.stringify(fixture),options={dbName:'lexl-prototype-success',readLegacy:()=>raw},p=LEXLMigrationPrototype.create(options);
  const summary=await p.prepare(),active=await p.confirm(summary.id,{approved:true,backupSha256:summary.backupSha256});
  const copy=JSON.parse(active.backup.payload),originalDraft=fixture.draft;
  p.close();const reopened=LEXLMigrationPrototype.create(options),boot=await reopened.inspect();reopened.close();
  return {primary:active.primary,revision:active.revision,raw:copy.legacyRaw,weight:active.state.draft.rows[0].weight,reps:active.state.draft.rows[0].reps,comments:active.state.draft.comments,circles:active.state.draft.circleGroups,history:active.state.history[0],boot:boot.primary,sourceUnchanged:raw===JSON.stringify(fixture)};
 });
 assert.equal(result.primary,'indexeddb');assert.equal(result.boot,'indexeddb');assert.equal(result.revision,1);assert.equal(result.weight,'18.5');assert.equal(result.reps,'6');assert.equal(result.comments['synthetic-x'],'Ongoing note');assert.equal(result.circles['synthetic-x'],'1');assert.equal(result.history.rows[0].weight,'7.5');assert.equal(result.history.warmupMinutes,1.5);assert.equal(result.sourceUnchanged,true);
});

for(const kind of ['primary','recovery'])test('transition rejects '+kind+' source changed after verified backup',async t=>{ const {page:browserPage}=await isolated(t,{raw:null});await browserPage.addScriptTag({url:url+'/prototypes/one-time-transition.js'});
 const outcome=await browserPage.evaluate(async({fixture,kind})=>{
  let raw=JSON.stringify(fixture),recovery=null;const p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-change-'+kind,readLegacy:()=>raw,readRecovery:()=>recovery});const s=await p.prepare();if(kind==='primary')raw+=' ';else recovery='changed';let error='';try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch(e){error=e.message}const state=await p.inspect();p.close();return {error,state};
 },{fixture:f(),kind});
 assert.match(outcome.error,/källan har ändrats/);assert.equal(outcome.state.primary,'legacy-readonly');assert.equal(outcome.state.copiedButInactive,false);
});

test('transition backup quota failure leaves no primary and no consent',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-backup-quota',readLegacy:()=>raw}),add=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value,key){if(String(key).startsWith('backup:'))throw new DOMException('Synthetic backup quota','QuotaExceededError');return add.call(this,value,key)};
  let error='';try{await p.prepare()}catch(e){error=e.message}finally{IDBObjectStore.prototype.add=add}
  const status=await p.inspect();p.close();return {error,status,unchanged:raw===JSON.stringify(fixture)};
 });
 assert.match(result.error,/quota/);assert.equal(result.status.primary,'legacy-readonly');assert.equal(result.status.pendingProposalId,null);assert.equal(result.unchanged,true);
});

test('transition copy abort keeps verified backup; explicit retry completes exactly once',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-copy-abort',readLegacy:()=>raw}),s=await p.prepare(),put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){const r=put.call(this,value,key);if(key==='current')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r};
  let error='';try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch(e){error=e.message}finally{IDBObjectStore.prototype.put=put}
  const failed=await p.inspect(),active=await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256}),repeat=await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});
  const result={error,failed,revision:active.revision,repeatRevision:repeat.revision,raw:JSON.parse(active.backup.payload).legacyRaw};p.close();return result;
 });
 assert.match(result.error,/avbröts|abort/i);assert.equal(result.failed.primary,'legacy-readonly');assert.equal(result.failed.copiedButInactive,false);assert.equal(result.revision,1);assert.equal(result.repeatRevision,1);assert.equal(result.raw,JSON.stringify(f()));
});

test('interruption before activation leaves staged copy inactive after restart; explicit resume verifies it',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),options={dbName:'lexl-prototype-activation-failure',readLegacy:()=>raw},p=LEXLMigrationPrototype.create(options),s=await p.prepare(),add=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value,key){if(key==='activation')throw new DOMException('Synthetic activation quota','QuotaExceededError');return add.call(this,value,key)};
  let error='';try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch(e){error=e.message}finally{IDBObjectStore.prototype.add=add}
  p.close();const reopened=LEXLMigrationPrototype.create(options),before=await reopened.inspect();let saveError='';try{await reopened.save(next=>next.history=[])}catch(e){saveError=e.message}
  const active=await reopened.confirm(s.id,{approved:true,backupSha256:s.backupSha256});reopened.close();return {error,before,saveError,revision:active.revision};
 });
 assert.match(result.error,/quota/);assert.equal(result.before.primary,'legacy-readonly');assert.equal(result.before.copiedButInactive,true);assert.match(result.saveError,/aktivering/);assert.equal(result.revision,1);
});

test('transition refuses damaged backup and leaves original source unchanged',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),dbName='lexl-prototype-damaged-backup',p=LEXLMigrationPrototype.create({dbName,readLegacy:()=>raw}),s=await p.prepare();
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({format:'lexl-transition-backup-v1',payload:'tampered',sha256:s.backupSha256},'backup:'+s.id);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  let error='';try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch(e){error=e.message}const status=await p.inspect();p.close();return {error,status,raw};
 });
 assert.match(result.error,/Säkerhetskopian/);assert.equal(result.status.copiedButInactive,false);assert.equal(result.raw,JSON.stringify(f()));
});

test('transition new-session export preserves original, hashes all files and never converts old data',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-export',readLegacy:()=>raw}),s=await p.prepare();await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});
  await p.save(next=>{const program=next.programs[0],e=program.exercises[0];next.history.push({...LEXLData.newSession(program,()=> 'synthetic-new-session','2026-11-12T12:00:00Z','2026-11-12'),name:'Synthetic new session',date:'2026-11-12T12:00:00Z',rows:[{id:e.id,exerciseId:e.exerciseId,slotId:e.slotId,name:e.name,set:1,weight:'19.5',reps:'8',done:true}],comments:{[e.id]:'New synthetic note'},circleGroups:{[e.id]:'1'}})});
  const bundle=await p.exportBeforeRollback(),verified=await LEXLMigrationPrototype.verifyBundle(bundle),manifest=JSON.parse(bundle.manifestText),review=JSON.parse(bundle.files['new-sessions-review.json']);
  let corruptionError='';const altered=LEXLData.copy(bundle);altered.files['indexeddb-01115.json']+=' ';try{await LEXLMigrationPrototype.verifyBundle(altered)}catch(e){corruptionError=e.message}
  let oldImportRejected=false;try{LEXLData.importData(bundle.files['new-sessions-review.json'])}catch{oldImportRejected=true}
  const native=LEXLData.importData(bundle.files['indexeddb-01115.json']);const result={verified,manifest,review,original:bundle.files['localstorage-original-01114.json'],nativeSessions:native.history.length,corruptionError,oldImportRejected,sourceUnchanged:raw===JSON.stringify(fixture)};p.close();return result;
 });
 assert.equal(result.verified.verified,true);assert.equal(result.verified.newSessions,1);assert.equal(result.verified.revision,2);assert.equal(result.review.sessions[0].rows[0].weight,'19.5');assert.equal(result.review.sessions[0].comments['synthetic-x'],'New synthetic note');assert.equal(result.nativeSessions,2);assert.equal(result.original,JSON.stringify(f()));assert.equal(result.sourceUnchanged,true);assert.match(result.corruptionError,/verifieras/);assert.equal(result.oldImportRejected,true);assert.match(result.manifest.warning,/Importera inte/);
});

test('rollback export identifies edits and removals of old sessions separately from new sessions',async t=>{
 const result=await transitionCase(t,async fixture=>{
  fixture.history.push({...LEXLData.copy(fixture.history[0]),name:'Synthetic second old session'});
  const raw=JSON.stringify(fixture),p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-delta',readLegacy:()=>raw}),s=await p.prepare();await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});
  await p.save(next=>{next.history[0].comments['synthetic-x']='Explicit edit';next.history.pop()});
  const bundle=await p.exportBeforeRollback(),result=await LEXLMigrationPrototype.verifyBundle(bundle);p.close();return result;
 });
 assert.equal(result.newSessions,0);assert.equal(result.changedSessions,1);assert.equal(result.removedSessions,1);
});

test('rollback export retains both legacy snapshots if an old app has changed localStorage',async t=>{
 const result=await transitionCase(t,async fixture=>{
  let raw=JSON.stringify(fixture);const original=raw,p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-old-tab',readLegacy:()=>raw}),s=await p.prepare();await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});
  raw=JSON.stringify({...fixture,history:[]});let saveError='';try{await p.save(next=>next.history=[])}catch(e){saveError=e.message}
  const bundle=await p.exportBeforeRollback(),verified=await LEXLMigrationPrototype.verifyBundle(bundle);p.close();return {saveError,verified,original:bundle.files['localstorage-original-01114.json'],current:bundle.files['localstorage-current-raw.json'],expectedOriginal:original,expectedCurrent:raw};
 });
 assert.match(result.saveError,/oförändrad/);assert.equal(result.verified.verified,true);assert.equal(result.original,result.expectedOriginal);assert.equal(result.current,result.expectedCurrent);
});

test('transition rejects malformed sources before creating a backup or primary',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw='{synthetic broken',p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-invalid',readLegacy:()=>raw});let error='';try{await p.prepare()}catch(e){error=e.message}const status=await p.inspect();p.close();return {error,status,raw};
 });
 assert.ok(result.error);assert.equal(result.status.copiedButInactive,false);assert.equal(result.status.pendingProposalId,null);assert.equal(result.raw,'{synthetic broken');
});

test('two transition approvals on the same destination reserve exactly one copy and activation',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),options={dbName:'lexl-prototype-two-approvals',readLegacy:()=>raw},a=LEXLMigrationPrototype.create(options),b=LEXLMigrationPrototype.create(options);
  const [sa,sb]=await Promise.all([a.prepare(),b.prepare()]);
  const results=await Promise.allSettled([a.confirm(sa.id,{approved:true,backupSha256:sa.backupSha256}),b.confirm(sb.id,{approved:true,backupSha256:sb.backupSha256})]);
  const current=await a.inspect(),accepted=results.filter(r=>r.status==='fulfilled');a.close();b.close();return {accepted:accepted.length,rejected:results.filter(r=>r.status==='rejected').length,revision:current.revision,winner:current.marker.proposalId,expected:accepted[0]?.value.marker.proposalId};
 });
 assert.equal(result.accepted,1);assert.equal(result.rejected,1);assert.equal(result.revision,1);assert.equal(result.winner,result.expected);
});

test('altered inactive transition copy is not overwritten or activated on retry',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),dbName='lexl-prototype-altered-copy',p=LEXLMigrationPrototype.create({dbName,readLegacy:()=>raw}),s=await p.prepare(),add=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(v,k){if(k==='activation')throw Error('Synthetic interrupted activation');return add.call(this,v,k)};
  try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch{}finally{IDBObjectStore.prototype.add=add}
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),records=tx.objectStore('records'),get=records.get('current');get.onsuccess=()=>{const value=get.result,data=JSON.parse(value.raw);data.history=[];records.put({...value,raw:JSON.stringify(data)},'current')};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  let error='';try{await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256})}catch(e){error=e.message}const status=await p.inspect();p.close();return {error,status,raw};
 });
 assert.match(result.error,/annat primärt|annan kopia/);assert.equal(result.status.primary,'legacy-readonly');assert.equal(result.status.copiedButInactive,true);assert.equal(result.raw,JSON.stringify(f()));
});

test('rollback export can be downloaded, read back and verified; missing files are rejected',async t=>{
 const {page,errors}=await isolated(t,{raw:null});await page.addScriptTag({url:url+'/prototypes/one-time-transition.js'});
 const bundle=await page.evaluate(async fixture=>{const raw=JSON.stringify(fixture),p=LEXLMigrationPrototype.create({dbName:'lexl-prototype-file-download',readLegacy:()=>raw}),s=await p.prepare();await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});const bundle=await p.exportBeforeRollback();p.close();return bundle},f());
 const download=page.waitForEvent('download');
 await page.evaluate(text=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='indexeddb-01115.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},bundle.files['indexeddb-01115.json']);
 const file=await download,downloaded=await fs.readFile(await file.path(),'utf8');assert.equal(downloaded,bundle.files['indexeddb-01115.json']);
 const result=await page.evaluate(async bundle=>{const verified=await LEXLMigrationPrototype.verifyBundle(bundle);delete bundle.files['indexeddb-01115.json'];let error='';try{await LEXLMigrationPrototype.verifyBundle(bundle)}catch(e){error=e.message}return {verified,error}}, {...bundle,files:{...bundle.files,'indexeddb-01115.json':downloaded}});
 assert.equal(result.verified.verified,true);assert.match(result.error,/fillista|saknas/);assert.deepEqual(errors,[]);
});

test('transition startup rejects damaged consent proof after later saves without changing either data source',async t=>{
 const result=await transitionCase(t,async fixture=>{
  const raw=JSON.stringify(fixture),dbName='lexl-prototype-consent-proof',options={dbName,readLegacy:()=>raw},p=LEXLMigrationPrototype.create(options),s=await p.prepare();await p.confirm(s.id,{approved:true,backupSha256:s.backupSha256});await p.save(next=>{next.syntheticLaterChange=true});const before=(await p.inspect()).stateRaw;p.close();
  await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),records=tx.objectStore('records'),get=records.get('proposal:'+s.id);get.onsuccess=()=>records.put({...get.result,copyRaw:'tampered'},'proposal:'+s.id);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  const reopened=LEXLMigrationPrototype.create(options);let error='';try{await reopened.inspect()}catch(e){error=e.message}reopened.close();
  const after=await new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readonly'),get=tx.objectStore('records').get('current');get.onsuccess=()=>{};tx.oncomplete=()=>{db.close();resolve(get.result.raw)};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)});
  return {error,unchanged:before===after,legacyUnchanged:raw===JSON.stringify(fixture)};
 });
 assert.match(result.error,/underlaget kunde inte verifieras/);assert.equal(result.unchanged,true);assert.equal(result.legacyUnchanged,true);
});

// End-to-end acceptance of the actual app, not the separate investigation prototype.
async function prepareThroughUI(page){await page.locator('#transition-prepare').click();await page.waitForFunction(()=>!!lexlMigrationSummary&&!lexlMigrationBusy)}
async function approveThroughUI(page){await page.getByRole('checkbox',{name:/Jag godkänner/}).check();await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click();await page.waitForFunction(()=>lexlStore.source==='indexeddb'&&!lexlMigrationBusy)}

test('integrated first start persists first action with verified activation and survives restart',async t=>{
 const {page,errors}=await isolated(t,{raw:null});assert.equal(await page.locator('#transition-panel').isVisible(),false);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await page.evaluate(()=>newProgram());assert.equal((await state(page)).storageRevision,1);
 const count=(await state(page)).programs.length;
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb');assert.equal((await state(page)).programs.length,count);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);assert.deepEqual(errors,[]);
});

test('integrated consent is explicit, readable on mobile and needs no file export/import',async t=>{
 const {page,errors}=await isolated(t,{activate:false});await page.setViewportSize({width:390,height:844});
 assert.equal(await page.getByRole('checkbox',{name:/Jag godkänner/}).count(),0);
 await prepareThroughUI(page);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 assert.equal(await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).isEnabled(),false);
 assert.match(await page.locator('#transition-panel').textContent(),/SHA-256/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.locator('#transition-panel').screenshot({path:'/workspace/work/transition-consent-mobile.png'});
 await approveThroughUI(page);assert.equal(await page.locator('#transition-panel').isVisible(),false);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(f()));assert.deepEqual(errors,[]);
});

test('integrated declined transition remains read-only after restart and can be approved later',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);await page.locator('#transition-decline').click();
 await page.evaluate(()=>go('program','synthetic-p'));
 assert.equal(await page.getByRole('button',{name:/Starta pass/}).isEnabled(),false);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.match(await page.locator('#transition-panel').textContent(),/valt att vänta/);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await prepareThroughUI(page);await approveThroughUI(page);assert.equal((await state(page)).history.length,1);
});

test('integrated backup failure exposes no consent and leaves localStorage and primary untouched',async t=>{
 const {page}=await isolated(t,{activate:false});
 await page.evaluate(()=>{window.syntheticAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v,k){if(String(k).startsWith('backup:'))throw new DOMException('Synthetic backup quota','QuotaExceededError');return window.syntheticAdd.call(this,v,k)}});
 await page.locator('#transition-prepare').click();await page.waitForFunction(()=>!lexlMigrationBusy);
 assert.equal(await page.getByRole('checkbox',{name:/Jag godkänner/}).count(),0);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 assert.match(await page.locator('#data-error').textContent(),/quota/);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(f()));
 await page.evaluate(()=>{IDBObjectStore.prototype.add=window.syntheticAdd});await prepareThroughUI(page);await approveThroughUI(page);
});

test('integrated interrupted copy remains inactive on restart and resumes without duplicate history',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);
 await page.evaluate(()=>{window.syntheticAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v,k){if(k==='activation')throw new DOMException('Synthetic activation quota','QuotaExceededError');return window.syntheticAdd.call(this,v,k)}});
 await page.getByRole('checkbox',{name:/Jag godkänner/}).check();await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click();await page.waitForFunction(()=>!lexlMigrationBusy);
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.notEqual(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal((await state(page)).storageRevision,0);
 await approveThroughUI(page);assert.equal((await state(page)).storageRevision,1);assert.equal((await state(page)).history.length,1);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(f()));
});

test('integrated copy transaction abort rolls back primary and allows verified restart retry',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);
 await page.evaluate(()=>{window.syntheticPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){const r=window.syntheticPut.call(this,v,k);if(k==='current')r.addEventListener('success',()=>this.transaction.abort(),{once:true});return r}});
 await page.getByRole('checkbox',{name:/Jag godkänner/}).check();await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click();await page.waitForFunction(()=>!lexlMigrationBusy);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);await approveThroughUI(page);assert.equal((await state(page)).storageRevision,1);
});

test('integrated damaged backup blocks consent confirmation without replacing source data',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);
 await page.evaluate(async()=>{const id=lexlMigrationSummary.id;await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({format:'lexl-transition-backup-v1',payload:'damaged',sha256:lexlMigrationSummary.backupSha256},'backup:'+id);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)})});
 await page.getByRole('checkbox',{name:/Jag godkänner/}).check();await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click();await page.waitForFunction(()=>!lexlMigrationBusy);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');
 assert.match(await page.locator('#data-error').textContent(),/Säkerhetskopian/);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(f()));
});

test('integrated missing activation marker cannot be bypassed by ordinary import or writes',async t=>{
 const {page}=await isolated(t);const before=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').delete('activation');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)})});
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');
 await page.evaluate(()=>newProgram());await page.evaluate(text=>importData(new File([text],'synthetic.json')),JSON.stringify(f()));
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),before);assert.equal((await state(page)).storageRevision,0);
});

test('integrated ZIP export is standard-compatible and verifies the actual downloaded file without importing',async t=>{
 const {execFileSync}=require('node:child_process');
 const {page,errors}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await page.evaluate(()=>upd(0,'weight','21.5'));await page.evaluate(()=>commentUpdate('synthetic-x','Syntetisk åäö 🏋️'));await page.evaluate(()=>finish());await page.evaluate(()=>go('settings'));
 const before=await page.evaluate(()=>lexlStore.readPrimaryRaw()),legacy=await page.evaluate(key=>localStorage.getItem(key),key),download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Exportera återgångspaket (ZIP)',exact:true}).click();
 const file=await download,path=await file.path(),bytes=await fs.readFile(path);
 assert.match(file.suggestedFilename(),/\.zip$/);
 execFileSync('python3',['-c',`import sys, zipfile, json, hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 m=json.loads(z.read('manifest.json'))
 for f in m['files']:
  data=z.read(f['name'])
  assert hashlib.sha256(data).hexdigest()==f['sha256']
  assert len(data)==f['utf8Bytes']
 assert 'Syntetisk' in z.read('indexeddb-01115.json').decode('utf-8')
`,path]);
 await page.locator('#rollback-package-file').setInputFiles({name:'synthetic-downloaded.zip',mimeType:'application/zip',buffer:bytes});
 await page.waitForFunction(()=>lexlRollbackMessage.startsWith('Verifierat nedladdat paket'));
 assert.match(await page.locator('#rollback-verification').textContent(),/1 nytt pass/);
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),before);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),legacy);
 const bad=Buffer.from(bytes);bad[60]^=1;
 await page.locator('#rollback-package-file').setInputFiles({name:'synthetic-damaged.zip',mimeType:'application/zip',buffer:bad});await page.waitForFunction(()=>lexlRollbackMessage.startsWith('Paketet kunde inte verifieras'));
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),before);assert.deepEqual(errors,[]);
});

test('integrated first-start rollback package represents missing original explicitly',async t=>{
 const {page}=await isolated(t,{raw:null});await page.evaluate(()=>newProgram());
 const result=await page.evaluate(async()=>{const bundle=await lexlStore.exportBeforeRollback();const archive=LEXLBackupPackage.encode(bundle),roundtrip=LEXLBackupPackage.decode(archive);return {manifest:JSON.parse(roundtrip.manifestText),verified:await lexlStore.verifyBundle(roundtrip),original:roundtrip.files['localstorage-original-01114.json']}});
 assert.equal(result.manifest.originalMissing,true);assert.equal(result.original,'null');assert.equal(result.verified.verified,true);
});

test('integrated two-window transition and subsequent edits permit one writer per revision',async t=>{
 const {page,context}=await isolated(t,{activate:false}),other=await context.newPage();await other.goto(url);await other.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 await Promise.all([prepareThroughUI(page),prepareThroughUI(other)]);
 await Promise.all([page.getByRole('checkbox',{name:/Jag godkänner/}).check(),other.getByRole('checkbox',{name:/Jag godkänner/}).check()]);
 await Promise.all([page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click(),other.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click()]);
 await page.waitForFunction(()=>!lexlMigrationBusy);await other.waitForFunction(()=>!lexlMigrationBusy);
 const sources=await Promise.all([page.evaluate(()=>lexlStore.source),other.evaluate(()=>lexlStore.source)]);assert.ok(sources.filter(s=>s==='indexeddb').length>=1);assert.equal(JSON.parse(await page.evaluate(()=>lexlStore.readPrimaryRaw())).storageRevision,1);assert.equal(JSON.parse(await page.evaluate(()=>lexlStore.readPrimaryRaw())).history.length,1);
 await Promise.all([page.reload(),other.reload()]);await page.waitForFunction(()=>lexlStore.initialized);await other.waitForFunction(()=>lexlStore.initialized);
 await Promise.all([page.evaluate(()=>newProgram()),other.evaluate(()=>newProgram())]);const counts=await Promise.all([state(page),state(other)]);assert.equal(counts.filter(s=>s.programs.length===2).length,1);assert.equal(counts.filter(s=>s.programs.length===1).length,1);
});

test('integrated failed first save offers resume and retains the exact proposed first action',async t=>{
 const {page}=await isolated(t,{raw:null});const originalCount=(await state(page)).programs.length;
 await page.evaluate(()=>{window.syntheticAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v,k){if(k==='activation')throw new DOMException('Synthetic first activation quota','QuotaExceededError');return window.syntheticAdd.call(this,v,k)}});
 await page.evaluate(()=>newProgram());assert.equal((await state(page)).programs.length,originalCount);assert.equal(await page.locator('#transition-panel').isVisible(),true);assert.ok(await page.evaluate(()=>!!lexlUnsaved));
 await page.evaluate(()=>{IDBObjectStore.prototype.add=window.syntheticAdd});
 await approveThroughUI(page);
 assert.equal((await state(page)).programs.length,originalCount+1);assert.equal((await state(page)).storageRevision,1);assert.equal(await page.evaluate(()=>lexlUnsaved),null);
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal((await state(page)).programs.length,originalCount+1);
});

test('integrated recovery-only installation requires consent and preserves the original draft checkpoint',async t=>{
 const draft={id:'synthetic-old',name:'Synthetic orphan recovery',started:'2026-11-01T12:00:00Z',rows:[{id:'old-x',name:'Old exercise',set:1,weight:'31',reps:'7',done:true}],comments:{'old-x':'Old checkpoint note'},circleGroups:{'old-x':'A'}};
 const {page}=await isolated(t,{raw:null,init:()=>localStorage.setItem('min-traning-v1-draft-recovery-v27',JSON.stringify({draft:{id:'synthetic-old',name:'Synthetic orphan recovery',started:'2026-11-01T12:00:00Z',rows:[{id:'old-x',name:'Old exercise',set:1,weight:'31',reps:'7',done:true}],comments:{'old-x':'Old checkpoint note'},circleGroups:{'old-x':'A'}},savedAt:'2026-11-01T13:00:00Z'}))});
 const original=await page.evaluate(()=>localStorage.getItem('min-traning-v1-draft-recovery-v27'));
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);
 await prepareThroughUI(page);await approveThroughUI(page);await page.evaluate(()=>recoverDraft());
 const active=(await state(page)).draft;assert.equal(active.rows[0].weight,draft.rows[0].weight);assert.equal(active.rows[0].reps,draft.rows[0].reps);assert.deepEqual(active.comments,draft.comments);assert.deepEqual(active.circleGroups,draft.circleGroups);
 assert.equal(await page.evaluate(()=>localStorage.getItem('min-traning-v1-draft-recovery-v27')),original);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
});

test('integrated rollback package includes unsaved work without changing committed state',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));const committed=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 await page.evaluate(()=>{window.syntheticPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return window.syntheticPut.call(this,v,k)}});
 await page.evaluate(()=>upd(0,'weight','99'));assert.ok(await page.evaluate(()=>!!lexlUnsaved));await page.evaluate(()=>{IDBObjectStore.prototype.put=window.syntheticPut});
 const result=await page.evaluate(async()=>{const b=await lexlStore.exportBeforeRollback({unsavedRaw:JSON.stringify(lexlUnsaved)}),z=LEXLBackupPackage.encode(b),decoded=LEXLBackupPackage.decode(z);return {verified:await lexlStore.verifyBundle(decoded),manifest:JSON.parse(decoded.manifestText),unsaved:JSON.parse(decoded.files['unsaved-work.json']),saved:JSON.parse(decoded.files['indexeddb-01115.json'])}});
 assert.equal(result.verified.verified,true);assert.equal(result.manifest.containsUnsavedWork,true);assert.equal(result.unsaved.draft.rows[0].weight,'99');assert.notEqual(result.saved.draft.rows[0].weight,'99');assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),committed);
});

test('integrated real page reload before activation retains an inactive copy until consent is renewed',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);
 await page.evaluate(()=>{const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v,k){if(k==='activation'){location.reload();throw Error('Synthetic page interruption')}return add.call(this,v,k)}});
 await page.getByRole('checkbox',{name:/Jag godkänner/}).check();const navigation=page.waitForNavigation({waitUntil:'load'});await page.getByRole('button',{name:'Fortsätt med säker övergång',exact:true}).click();await navigation;await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.equal((await state(page)).storageRevision,0);assert.equal(await page.getByRole('checkbox',{name:/Jag godkänner/}).isChecked(),false);
 await approveThroughUI(page);assert.equal((await state(page)).storageRevision,1);assert.equal((await state(page)).history.length,1);
});

test('integrated verification warns when a valid downloaded package is older than current saved data',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>go('settings'));const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportera återgångspaket (ZIP)',exact:true}).click();const file=await download,bytes=await fs.readFile(await file.path());
 await page.evaluate(()=>newProgram());await page.evaluate(()=>go('settings'));const before=await page.evaluate(()=>lexlStore.readPrimaryRaw());
 await page.locator('#rollback-package-file').setInputFiles({name:'synthetic-earlier.zip',mimeType:'application/zip',buffer:bytes});await page.waitForFunction(()=>lexlRollbackMessage.startsWith('Verifierat nedladdat paket'));
 assert.match(await page.locator('#rollback-verification').textContent(),/skiljer sig/);assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),before);
});

test('integrated package preserves new data when the old localStorage key is missing',async t=>{
 const {page}=await isolated(t);await page.evaluate(key=>localStorage.removeItem(key),key);
 const result=await page.evaluate(async()=>{const b=await lexlStore.exportBeforeRollback(),z=LEXLBackupPackage.encode(b),round=LEXLBackupPackage.decode(z);return {verified:await lexlStore.verifyBundle(round),manifest:JSON.parse(round.manifestText),freshness:await lexlRollbackFreshness(round),original:round.files['localstorage-original-01114.json']}});
 assert.equal(result.verified.verified,true);assert.equal(result.manifest.legacyChanged,true);assert.equal(result.manifest.sourceSnapshot.legacyMissing,true);assert.equal(result.freshness,'');assert.equal(result.original,JSON.stringify(f()));assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
});

test('integrated restart checks the latest committed SHA-256 receipt before publishing data',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>newProgram());const original=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),records=tx.objectStore('records'),get=records.get('current');get.onsuccess=()=>{const current=get.result,data=JSON.parse(current.raw);data.history[0].rows[0].weight='888';records.put({...current,raw:JSON.stringify(data)},'current')};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)};r.onerror=()=>reject(r.error)})});
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal(await page.evaluate(()=>!!lexlStore.blocked),true);assert.equal(await page.evaluate(()=>lexlStore.source),'legacy-readonly');assert.notEqual((await state(page)).history[0].rows[0].weight,'888');assert.match(await page.locator('#data-error').textContent(),/SHA-256-kvitto/);
 const raw=await page.evaluate(()=>lexlStore.readPrimaryRaw());await page.evaluate(()=>newProgram());assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),raw);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),original);
});

test('integrated optional pre-consent backup downloads the exact verified source and does not activate migration',async t=>{
 const {page}=await isolated(t,{activate:false});await prepareThroughUI(page);const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Ladda ned verifierad originalkopia (JSON, valfritt)',exact:true}).click();const file=await download,backup=JSON.parse(await fs.readFile(await file.path(),'utf8'));
 const {createHash}=require('node:crypto');assert.equal(createHash('sha256').update(backup.payload,'utf8').digest('hex'),backup.sha256);assert.equal(JSON.parse(backup.payload).legacyRaw,JSON.stringify(f()));assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);assert.equal(await page.getByRole('checkbox',{name:/Jag godkänner/}).isChecked(),false);
 await approveThroughUI(page);assert.equal((await state(page)).storageRevision,1);
});

test('integrated uncertain first-save read after activation blocks retry and restores the saved action on reload',async t=>{
 const {page}=await isolated(t,{raw:null}),count=(await state(page)).programs.length;
 await page.evaluate(()=>{const add=IDBObjectStore.prototype.add,get=IDBObjectStore.prototype.get;let activated=false,failed=false;IDBObjectStore.prototype.add=function(v,k){const r=add.call(this,v,k);if(k==='activation')r.addEventListener('success',()=>{activated=true});return r};IDBObjectStore.prototype.get=function(k){const r=get.call(this,k);if(activated&&!failed&&k==='current'&&this.transaction.mode==='readonly'){failed=true;r.addEventListener('success',()=>this.transaction.abort(),{once:true})}return r}});
 await page.evaluate(()=>newProgram());assert.equal((await state(page)).programs.length,count);assert.equal(await page.evaluate(()=>!!lexlStore.blocked),true);assert.match(await page.locator('#data-error').textContent(),/kan vara utförd/);
 const saved=await page.evaluate(()=>lexlStore.readPrimaryRaw());assert.equal(JSON.parse(saved).programs.length,count+1);await page.evaluate(()=>newProgram());assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),saved);
 await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb');assert.equal((await state(page)).programs.length,count+1);assert.equal((await state(page)).storageRevision,1);
});

// Etapp 1B: control the interleaving rather than relying on a slow machine/history.
async function holdWrites(page){await page.evaluate(()=>{lexlWriteQueue=new Promise(resolve=>{window.syntheticRelease=()=>resolve(true)})})}
async function releaseWrites(page){await page.evaluate(()=>{syntheticRelease();return lexlWriteQueue});await page.evaluate(()=>Promise.resolve())}

test('1B rapid add-set and real weight/reps events keep the original stable target',async t=>{
 const {page,errors}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));
 const target=await page.evaluate(()=>state.draft.rows[2].rowId);await holdWrites(page);
 await page.getByRole('button',{name:'＋ Lägg till set',exact:true}).first().click();
 await page.locator('#workout-row-2-weight').fill('99');await page.locator('#workout-row-2-weight').press('Tab');
 await page.locator('#workout-row-2-reps').fill('17');await page.locator('#workout-row-2-reps').press('Tab');
 await releaseWrites(page);
 const saved=JSON.parse(await raw(page)).draft;
 assert.ok(target);assert.equal(saved.rows.find(r=>r.rowId===target).weight,'99');assert.equal(saved.rows.find(r=>r.rowId===target).reps,'17');
 assert.notEqual(saved.rows[2].rowId,target);assert.notEqual(saved.rows[2].weight,'99');assert.notEqual(saved.rows[2].reps,'17');assert.equal(new Set(saved.rows.map(r=>r.rowId)).size,4);assert.deepEqual(errors,[]);
});

test('1B in-flight save preserves uncommitted input, focus and honest status',async t=>{
 const {page,errors}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await holdWrites(page);
 await page.locator('#workout-row-0-weight').fill('25.5');await page.locator('#workout-row-0-weight').press('Tab');
 await page.locator('#workout-row-0-reps').fill('77');await releaseWrites(page);
 assert.equal(await page.locator('#workout-row-0-reps').inputValue(),'77');assert.equal(await page.locator('#workout-row-0-reps').evaluate(n=>n===document.activeElement),true);
 assert.equal((await state(page)).draft.rows[0].reps,'8');assert.equal(await page.locator('#status').textContent(),'Osparad inmatning');
 await page.locator('#workout-row-0-reps').press('Tab');await page.evaluate(()=>lexlWriteQueue);await page.waitForFunction(()=>document.getElementById('status').textContent==='Sparat lokalt');
 assert.equal(JSON.parse(await raw(page)).draft.rows[0].reps,'77');assert.deepEqual(errors,[]);
});

test('1B comment text selection and navigation preserve unsaved input through rerenders',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await holdWrites(page);
 await page.locator('#workout-row-0-weight').fill('26');await page.locator('#workout-row-0-weight').press('Tab');
 const comment=page.locator('#workout-comment-0');await comment.fill('Synthetic unsaved note');await comment.evaluate(n=>n.setSelectionRange(3,9));await releaseWrites(page);
 assert.equal(await comment.inputValue(),'Synthetic unsaved note');assert.deepEqual(await comment.evaluate(n=>[n===document.activeElement,n.selectionStart,n.selectionEnd]),[true,3,9]);
 await page.evaluate(()=>{go('history');go('workout')});assert.equal(await comment.inputValue(),'Synthetic unsaved note');
 await comment.press('Tab');await page.evaluate(()=>lexlWriteQueue);assert.equal(JSON.parse(await raw(page)).draft.comments['synthetic-x'],'Synthetic unsaved note');
});

test('1B removed row rejects queued update without retargeting another set',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await holdWrites(page);
 await page.getByRole('button',{name:'− Ta bort sista setet',exact:true}).first().click();
 await page.locator('#workout-row-1-weight').fill('99');await page.locator('#workout-row-1-weight').press('Tab');await releaseWrites(page);
 assert.equal(JSON.parse(await raw(page)).draft.rows.length,2);assert.equal(JSON.parse(await raw(page)).draft.rows.some(r=>r.weight==='99'),false);
 assert.match(await page.locator('#data-error').textContent(),/tagits bort/);
});

test('1B warmup deletion cannot redirect a queued update to a different item',async t=>{
 const {page}=await isolated(t);await page.evaluate(async()=>{await start('synthetic-p');await addWarm();await addWarm()});
 const id=await page.evaluate(()=>state.draft.warmup[1].warmupId);await holdWrites(page);
 await page.getByRole('button',{name:'Ta bort',exact:true}).first().click();await page.locator('#warm-1-minutes').fill('7');await page.locator('#warm-1-minutes').press('Tab');await releaseWrites(page);
 const warm=JSON.parse(await raw(page)).draft.warmup;assert.equal(warm.length,1);assert.equal(warm[0].warmupId,id);assert.equal(warm[0].minutes,7);
});

async function alterRecord(page,key,edit){return page.evaluate(async({key,edit})=>{
 await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),g=store.get(key);g.onsuccess=()=>{const b=g.result;if(edit==='content'){const value=JSON.parse(b.raw);value.history[0].rows[0].weight='888';b.raw=JSON.stringify(value)}else if(edit==='revision'){b.revision++;b.savedAtRevision++}else b.sha256='0'.repeat(64);store.put(b,key)};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 },{key,edit})}
for(const edit of ['content','revision','receipt'])test('1B rolling backup rejects '+edit+' corruption and preserves primary',async t=>{
 const {page}=await isolated(t);await page.evaluate(async()=>{await start('synthetic-p');await upd(0,'weight','25.5')});const before=await raw(page);
 await alterRecord(page,edit==='receipt'?'backup-receipt:previous':'previous',edit);
 const error=await page.evaluate(async()=>{try{await lexlStore.recoveryRaw();return ''}catch(e){return e.message}});assert.match(error,/kontrollsumma|revision/);assert.equal(await raw(page),before);
});

test('1B damaged permanent backup blocks writes and retains last valid revision',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await alterRecord(page,'original','receipt');const before=await raw(page);
 await page.evaluate(()=>upd(0,'weight','99'));assert.equal(await raw(page),before);assert.equal(await page.locator('#status').textContent(),'Inte sparat');
});

test('1B service worker preserves foreign caches and falls back on uncached offline navigation',async t=>{
 const {page,context,errors}=await isolated(t,{serviceWorkers:'allow',init:async()=>{await caches.open('lexl-production-synthetic-sentinel');await caches.open('lexl-scope:another-installation:old')}});
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const names=await page.evaluate(()=>caches.keys());assert.ok(names.includes('lexl-production-synthetic-sentinel'));assert.ok(names.includes('lexl-scope:another-installation:old'));
 await context.setOffline(true);await page.goto(url+'/?synthetic-uncached-offline=1');await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);
 assert.equal((await state(page)).history[0].rows[0].weight,'7.5');assert.deepEqual(errors,[]);
});

test('1B invalid date input is retained and never reported as saved',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));const before=await raw(page);
 await page.locator('#workout-date').fill('');await page.locator('#workout-date').press('Tab');await page.evaluate(()=>lexlWriteQueue);
 assert.equal(await raw(page),before);assert.equal(await page.locator('#status').textContent(),'Osparad inmatning');await page.evaluate(()=>render());assert.equal(await page.locator('#workout-date').inputValue(),'');
});

test('1B unblurred input survives a verified rollback package as explicit review data',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));await page.locator('#workout-row-0-reps').fill('77');
 const result=await page.evaluate(async()=>{const snapshot=lexlUnsavedSnapshot();const bundle=await lexlStore.exportBeforeRollback({unsavedRaw:JSON.stringify(snapshot)});const bytes=LEXLBackupPackage.encode(bundle),decoded=LEXLBackupPackage.decode(bytes);return {verified:await lexlStore.verifyBundle(decoded),unsaved:JSON.parse(decoded.files['unsaved-work.json']),saved:JSON.parse(decoded.files['indexeddb-01115.json'])}});
 assert.equal(result.verified.verified,true);assert.equal(result.saved.draft.rows[0].reps,'8');assert.equal(result.unsaved.pendingInputReview.fields[0].value,'77');assert.match(result.unsaved.pendingInputReview.warning,/Inte automatiskt/);
});

test('1B real form write error retains typed input and retry clears unsaved status',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>{return start('synthetic-p')});
 await page.evaluate(()=>{window.syntheticPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return syntheticPut.call(this,v,k)}});
 await page.locator('#workout-row-0-weight').fill('99');await page.locator('#workout-row-0-weight').press('Tab');await page.evaluate(()=>lexlWriteQueue);
 assert.equal(await page.locator('#workout-row-0-weight').inputValue(),'99');assert.equal(await page.locator('#status').textContent(),'Inte sparat');
 await page.evaluate(()=>{IDBObjectStore.prototype.put=syntheticPut});await page.getByRole('button',{name:'Försök spara osparat arbete igen'}).click();await page.waitForFunction(()=>document.getElementById('status').textContent==='Sparat lokalt');assert.equal(JSON.parse(await raw(page)).draft.rows[0].weight,'99');
});

test('1B valid old backups use independent proof, and unverifiable old content is rejected',async t=>{
 const {page}=await isolated(t);await page.evaluate(async()=>{await start('synthetic-p');await upd(0,'weight','25')});
 await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records');for(const key of ['original','previous']){const g=s.get(key);g.onsuccess=()=>s.put({format:'lexl-raw-backup-v1',raw:g.result.raw},key);s.delete('backup-receipt:'+key)}tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})});
 assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw('original')),JSON.stringify(f()));assert.ok(JSON.parse(await page.evaluate(()=>lexlStore.recoveryRaw())).draft);
 await page.evaluate(()=>upd(0,'weight','26'));assert.equal(JSON.parse(await raw(page)).draft.rows[0].weight,'26');
 await page.evaluate(async()=>{const payload={format:'lexl-raw-backup-v1',raw:JSON.stringify({...state,storageRevision:999})};let error='';try{await LEXLData.verifyRecovery(payload,null)}catch(e){error=e.message}if(!error.includes('oberoende'))throw Error(error||'Accepted unverified backup')});
});

test('1B backup receipt write failure aborts the complete transaction',async t=>{
 const {page}=await isolated(t);await page.evaluate(()=>start('synthetic-p'));const before=await raw(page),backup=await page.evaluate(()=>lexlStore.recoveryRaw());
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='backup-receipt:previous')throw new DOMException('Synthetic quota','QuotaExceededError');return put.call(this,v,k)}});
 await page.evaluate(()=>upd(0,'weight','99'));assert.equal(await raw(page),before);assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw()),backup);
});

test('1B active earlier stage-1 draft without row identities remains readable and safely writable',async t=>{
 const fixture=f();fixture.draft={id:'synthetic-p',name:'Synthetic old draft',started:'2026-10-20T10:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',set:1,reps:'8',weight:'10',done:false}],warmup:[{activity:'Synthetic rowing',minutes:2}],comments:{},circleGroups:{}};
 const {page}=await isolated(t,{raw:JSON.stringify(fixture)});
 await page.evaluate(async()=>{const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const text=await lexlStore.readPrimaryRaw(),value=JSON.parse(text);value.draft.rows.forEach(r=>delete r.rowId);value.draft.warmup.forEach(w=>delete w.warmupId);const raw=JSON.stringify(value),digest=await hash(raw);
 await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),m=s.get('activation');m.onsuccess=()=>{const marker=m.result;marker.copySha256=digest;s.put(marker,'activation');const p=s.get('proposal:'+marker.proposalId);p.onsuccess=()=>s.put({...p.result,copyRaw:raw,copySha256:digest},'proposal:'+marker.proposalId)};const c=s.get('current');c.onsuccess=()=>s.put({...c.result,raw},'current');const receipt=s.get('receipt:1');receipt.onsuccess=()=>s.put({...receipt.result,digest},'receipt:1');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 });
 await page.reload();await page.waitForFunction(()=>lexlStore.initialized);assert.equal(await page.evaluate(()=>lexlStore.blocked?.message||''),'');assert.ok((await state(page)).draft.rows[0].rowId);
 await page.evaluate(()=>upd(0,'weight','33'));assert.equal(JSON.parse(await raw(page)).draft.rows[0].weight,'33');assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(fixture));
});

for(const target of ['backup','current'])test('1B reused verification and writer still reject changed '+target+' content',async t=>{
 const {page}=await isolated(t);await page.evaluate(async()=>{await start('synthetic-p');await upd(0,'weight','25')});const before=await raw(page);
 await page.evaluate(async target=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),m=s.get('activation');m.onsuccess=()=>{const key=target==='current'?'current':'backup:'+m.result.proposalId,g=s.get(key);g.onsuccess=()=>{const record=g.result;if(target==='current'){const state=JSON.parse(record.raw);state.history[0].rows[0].weight='888';record.raw=JSON.stringify(state)}else{const payload=JSON.parse(record.payload),source=JSON.parse(payload.legacyRaw);source.history[0].rows[0].weight='888';payload.legacyRaw=JSON.stringify(source);record.payload=JSON.stringify(payload)}s.put(record,key)}};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})},target);
 const changed=await raw(page);await page.evaluate(()=>upd(0,'weight','99'));assert.equal(await raw(page),changed);assert.equal(await page.locator('#status').textContent(),'Inte sparat');assert.notEqual((await state(page)).draft.rows[0].weight,'99');if(target==='backup')assert.equal(changed,before);
});

test('1B old unactivated proposal is stopped before copying if its serialization needs new identities',async t=>{
 const fixture=f();fixture.draft={id:'synthetic-p',name:'Synthetic draft',started:'2026-10-20T10:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',set:1,weight:'10',reps:'8'}],warmup:[],comments:{},circleGroups:{}};
 const {page}=await isolated(t,{raw:JSON.stringify(fixture),activate:false});
 await page.evaluate(async()=>{await lexlPrepareTransition();await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),g=s.get('proposal:'+lexlMigrationSummary.id);g.onsuccess=()=>{const proposal=g.result,value=JSON.parse(proposal.copyRaw);value.draft.rows.forEach(r=>delete r.rowId);window.syntheticOldProposal={...proposal,copyRaw:JSON.stringify(value)}};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 const p=syntheticOldProposal;p.copySha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.copyRaw))),b=>b.toString(16).padStart(2,'0')).join('');
 await new Promise((resolve,reject)=>{const r=indexedDB.open('lexl-training-schema1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(p,'proposal:'+p.id);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 lexlMigrationConsent=true;document.getElementById('transition-consent').checked=true;await lexlApproveTransition();});
 assert.equal(await page.evaluate(()=>lexlStore.readPrimaryRaw()),null);assert.match(await page.locator('#data-error').textContent(),/äldre modell/);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(fixture));
});

test('1B application gate rejects unsafe candidate values before JSON can normalize them away',async t=>{
 const {page}=await isolated(t);const before=await raw(page);
 const error=await page.evaluate(async()=>{const candidate=LEXLData.copy(state);candidate.history[0].extra.unsafe=Infinity;try{await lexlStore.commit(candidate);return ''}catch(e){return e.message}});
 assert.match(error,/JSON-värde/);assert.equal(await raw(page),before);
});
