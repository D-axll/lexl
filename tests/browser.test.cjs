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
 if(activate&&raw!==null&&!await page.evaluate(()=>!!lexlStore.blocked))await page.evaluate(text=>importData(new File([text],'synthetic-activation.json')),raw);
 return {page,context,errors};
}
const state=page=>page.evaluate(()=>JSON.parse(JSON.stringify(state)));
const raw=page=>page.evaluate(async key=>(await lexlStore.readPrimaryRaw())??localStorage.getItem(key),key);
const invoke=(page,code)=>page.evaluate(code);

test('valid startup leaves source untouched and normal views render',async t=>{const original=JSON.stringify(f()),{page,errors}=await isolated(t,{activate:false});assert.equal(await raw(page),original);for(const [v,id]of [['program','synthetic-p'],['edit','synthetic-p'],['history',null],['detail',0],['settings',null],['stats',null],['about',null],['home',null]]){await page.evaluate(([v,id])=>go(v,id),[v,id]);assert.ok(await page.locator('#app').textContent())}assert.deepEqual(errors,[]);assert.equal(await raw(page),original)});
test('first startup has in-memory defaults but no persistent training data',async t=>{const {page,errors}=await isolated(t,{raw:null});assert.equal(await raw(page),null);assert.ok((await state(page)).programs.length>=3);assert.deepEqual(errors,[])});
for(const damaged of ['{broken','{"programs":[],"history":{}}'])test('invalid startup preserves raw bytes and provides raw download',async t=>{const {page,errors}=await isolated(t,{raw:damaged});assert.equal(await page.locator('#data-error').isVisible(),true);assert.match(await page.locator('#data-error').textContent(),/blockerad/);await invoke(page,()=>newProgram());assert.equal(await raw(page),damaged);const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportera ursprungliga rådata',exact:true}).click();const d=await download;assert.equal(await fs.readFile(await d.path(),'utf8'),damaged);assert.deepEqual(errors,[])});
test('workout lifecycle preserves values, IDs, comments and explicit training date',async t=>{const {page,errors}=await isolated(t);await invoke(page,()=>start('synthetic-p'));let a=await state(page);const sessionId=a.draft.sessionId;assert.ok(sessionId);await invoke(page,()=>setWorkoutDate('2026-10-20'));await invoke(page,()=>upd(0,'weight','12.5'));await invoke(page,()=>upd(0,'reps','9'));await invoke(page,()=>upd(0,'done',true));await invoke(page,()=>commentUpdate('synthetic-x','Synthetic session comment'));await invoke(page,()=>addWarm());await invoke(page,()=>warmUpdate(0,'minutes','3'));await invoke(page,()=>warmUpdate(0,'seconds','20'));await invoke(page,()=>addSet('synthetic-x'));await invoke(page,()=>removeSet('synthetic-x'));await invoke(page,()=>timerPause());await invoke(page,()=>timerPause());await invoke(page,()=>finish());a=await state(page);assert.equal(a.draft,null);const h=a.history.at(-1);assert.equal(h.sessionId,sessionId);assert.equal(h.programId,'synthetic-p');assert.equal(h.workoutDate,'2026-10-20');assert.equal(h.rows[0].weight,'12.5');assert.equal(h.rows[0].reps,'9');assert.equal(h.rows[0].done,true);assert.equal(h.comments['synthetic-x'],'Synthetic session comment');assert.equal(h.warmup[0].seconds,20);assert.equal(h.programSnapshot.name,'Synthetic program');assert.equal(h.circleGroups['synthetic-x'],'1');assert.equal(h.snapshot.record.sessionId,sessionId);assert.deepEqual(a.history[0].extra,f().history[0].extra);assert.deepEqual(errors,[])});
test('retrospective entry is a single persisted start; date and time preserved',async t=>{const {page,errors}=await isolated(t);await invoke(page,()=>startRetrospective('synthetic-p'));assert.equal((await state(page)).storageRevision,2);await invoke(page,()=>setWorkoutDate('2026-09-10'));await invoke(page,()=>setWorkoutClock('06:45'));await invoke(page,()=>setTimeMinutes('35'));await invoke(page,()=>finish());const h=(await state(page)).history.at(-1);assert.equal(h.workoutDate,'2026-09-10');assert.equal(h.workoutClock,'06:45');assert.equal(h.totalMinutes,35);assert.equal(h.manualEntry,true);assert.deepEqual(errors,[])});
test('legacy split combo rows survive app startup, editing, export and completion',async t=>{const fixture=f();fixture.programs=[{id:'b2',name:'Synthetic legacy combo',type:'vanligt',rounds:1,pages:[],exercises:[{id:'b2-1',name:'Side bend',sets:1,reps:'8',note:''},{id:'b2-2',name:'Press',sets:1,reps:'10',note:''}]}];fixture.draft={id:'b2',name:'Synthetic legacy combo',started:'2026-11-01T12:00:00Z',rows:[{id:'b2-1',name:'Side bend',set:1,weight:'8',reps:'9',done:true},{id:'b2-2',name:'Press',set:1,weight:'10',reps:'11',done:true}],comments:{'b2-1':'side','b2-2':'press'},warmup:[],circleGroups:{'b2-1':'A','b2-2':'A'}};const initial=JSON.stringify(fixture),{page,errors}=await isolated(t,{raw:initial,activate:false});assert.equal(await raw(page),initial);await page.evaluate(text=>importData(new File([text],'synthetic-activation.json')),initial);await page.evaluate(()=>go('workout'));assert.equal(await page.locator('.lexl-workout-exercise').count(),2);const migrated=await page.evaluate(()=>{migrateCombo(state);return LEXLData.exportData(state)});assert.equal(JSON.parse(migrated).draft.rows.length,2);await invoke(page,()=>commentUpdate('b2-2','updated press note'));await invoke(page,()=>finish());const h=(await state(page)).history.at(-1);for(let i=0;i<2;i++)for(const [k,v]of Object.entries(fixture.draft.rows[i]))assert.deepEqual(h.rows[i][k],v);assert.equal(h.comments['b2-1'],'side');assert.equal(h.comments['b2-2'],'updated press note');assert.deepEqual(h.circleGroups,fixture.draft.circleGroups);assert.deepEqual(errors,[])});
test('program editor, copies, new exercise and deletion leave history intact',async t=>{const {page,errors}=await isolated(t);const originalHistory=(await state(page)).history;await invoke(page,()=>duplicate('synthetic-p'));let a=await state(page),copy=a.programs.at(-1);assert.notEqual(copy.id,'synthetic-p');assert.equal(copy.exercises[0].exerciseId,a.programs[0].exercises[0].exerciseId);assert.notEqual(copy.exercises[0].slotId,a.programs[0].exercises[0].slotId);await page.evaluate(id=>{setProg(id,'name','Synthetic edited copy');addEx(id)},copy.id);await page.evaluate(id=>saveExerciseOrder(id),copy.id);a=await state(page);copy=a.programs.at(-1);assert.equal(copy.name,'Synthetic edited copy');assert.equal(copy.exercises.length,3);assert.ok(copy.exercises[2].exerciseId);assert.deepEqual(a.history,originalHistory);await page.evaluate(id=>deleteProg(id),copy.id);assert.equal((await state(page)).programs.length,1);assert.deepEqual((await state(page)).history,originalHistory);assert.deepEqual(errors,[])});
test('legacy import replaces state only after durable save and can be restored',async t=>{const {page,errors}=await isolated(t),before=await raw(page),incoming=f();incoming.history[0].name='Synthetic imported';await page.evaluate(text=>importData(new File([text],'synthetic.json',{type:'application/json'})),JSON.stringify(incoming));assert.equal((await state(page)).history[0].name,'Synthetic imported');assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw()),before);await page.evaluate(async()=>{const raw=await lexlStore.recoveryRaw();return importData(new File([raw],'synthetic-restore.json'))});assert.equal((await state(page)).history[0].name,'Synthetic old session');assert.deepEqual(errors,[])});
test('malformed or incomplete import never changes storage or active state',async t=>{const {page}=await isolated(t),before=await raw(page),active=await state(page);for(const text of ['{bad','{}','{"programs":[]}','{"programs":[],"history":[],"schemaVersion":42}']){await page.evaluate(text=>importData(new File([text],'bad.json')),text);assert.equal(await raw(page),before);assert.deepEqual(await state(page),active)}});
test('quota failure during import leaves active state, original and recovery intact',async t=>{const {page}=await isolated(t),before=await raw(page),active=await state(page),priorRecovery=await page.evaluate(()=>lexlStore.recoveryRaw());await page.evaluate(key=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return put.call(this,v,k)}},stateKey);const incoming=f();incoming.history=[];await page.evaluate(text=>importData(new File([text],'synthetic.json')),JSON.stringify(incoming));assert.equal(await raw(page),before);assert.deepEqual(await state(page),active);assert.equal(await page.evaluate(()=>lexlStore.recoveryRaw()),priorRecovery);assert.equal(await page.locator('#status').textContent(),'Inte sparat');assert.equal(await page.locator('#data-error').isVisible(),true)});
test('failed workout save preserves old state; retry commits retained candidate',async t=>{const {page}=await isolated(t);await invoke(page,()=>start('synthetic-p'));const before=await raw(page),active=await state(page);await page.evaluate(key=>{window.syntheticPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('Synthetic quota','QuotaExceededError');return window.syntheticPut.call(this,v,k)}},stateKey);await invoke(page,()=>upd(0,'weight','99'));assert.equal(await raw(page),before);assert.deepEqual(await state(page),active);await invoke(page,()=>upd(0,'reps','100'));assert.equal(await page.evaluate(()=>lexlUnsaved.draft.rows[0].weight),'99');assert.equal(await page.evaluate(()=>lexlUnsaved.draft.rows[0].reps),'8');await page.evaluate(()=>{IDBObjectStore.prototype.put=window.syntheticPut});await page.getByRole('button',{name:'Försök spara osparat arbete igen'}).click();await page.waitForFunction(()=>state.draft.rows[0].weight==='99');assert.equal(await page.locator('#data-error').isVisible(),false)});
test('two real app tabs serialize writes; stale tab cannot overwrite',async t=>{const {page,context,errors}=await isolated(t);const b=await context.newPage();await b.goto(url);await b.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);await Promise.all([page.evaluate(()=>newProgram()),b.evaluate(()=>newProgram())]);const persisted=JSON.parse(await raw(page));assert.equal(persisted.programs.length,2);const states=await Promise.all([state(page),state(b)]);assert.equal(states.filter(s=>s.programs.length===2).length,1);assert.equal(states.filter(s=>s.programs.length===1).length,1);const stale=states[0].programs.length===1?page:b;await stale.waitForFunction(()=>!document.getElementById('data-error').hidden);assert.match(await stale.locator('#data-error').textContent(),/annat appfönster|osparad/);assert.deepEqual(errors,[])});
test('IndexedDB does not require Web Locks',async t=>{const {page,errors}=await isolated(t,{init:()=>Object.defineProperty(navigator,'locks',{value:undefined})});await invoke(page,()=>newProgram());assert.equal((await state(page)).programs.length,2);assert.deepEqual(errors,[])});
test('history display and order use training date independently of original timestamps',async t=>{const fixture=f();fixture.history[0].workoutDate='2026-11-10';fixture.history.push({...D.copy(fixture.history[0]),name:'Synthetic earlier training',date:'2026-11-12T12:00:00Z',workoutDate:'2026-11-09'});const {page}=await isolated(t,{raw:JSON.stringify(fixture)});await invoke(page,()=>go('history'));const titles=await page.locator('.lexl-history-card-body h3').allTextContents();assert.deepEqual(titles,['Synthetic old session','Synthetic earlier training']);assert.match(await page.locator('.lexl-history-card').first().textContent(),/10 november/);assert.equal((await state(page)).history[0].date,'2026-10-31T23:30:00Z')});
test('export download is versioned and round-trips without historical changes',async t=>{const {page}=await isolated(t),active=await state(page),download=page.waitForEvent('download');await invoke(page,()=>exportData());const d=await download,text=await fs.readFile(await d.path(),'utf8');const parsed=D.importData(text);assert.equal(parsed.schemaVersion,1);assert.deepEqual(parsed,active)});
test('legacy draft recovery key is retained even after completed pass',async t=>{const fixture=f();const draft={id:'synthetic-p',name:'Synthetic recovered',started:'2026-11-01T12:00:00Z',rows:[{id:'synthetic-x',name:'Synthetic exercise',set:1,weight:'17',reps:'4',done:true}],warmup:[],comments:{},circleGroups:{}};const {page,errors}=await isolated(t);await page.evaluate(({key,draft})=>localStorage.setItem(key+'-draft-recovery-v27',JSON.stringify({draft,savedAt:'2026-11-01T13:00:00Z'})),{key,draft});await page.reload();const originalRecovery=await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key);await invoke(page,()=>recoverDraft());assert.equal((await state(page)).draft.rows[0].weight,'17');await invoke(page,()=>finish());assert.ok(await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key));assert.equal(await page.evaluate(key=>localStorage.getItem(key+'-draft-recovery-v27'),key),originalRecovery);await page.reload();await page.waitForFunction(()=>typeof lexlStore!=='undefined'&&lexlStore.initialized);assert.equal(await page.evaluate(()=>recoveredDraft),null);assert.deepEqual(errors,[])});
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

test('manual import is the only activation path for existing legacy data; reload selects primary',async t=>{
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
test('denied legacy write can be followed by an explicit import without losing original',async t=>{
 const {page}=await isolated(t,{activate:false});
 await page.evaluate(()=>newProgram());assert.ok(await page.evaluate(()=>!!lexlUnsaved));
 await page.evaluate(text=>importData(new File([text],'synthetic-explicit-import.json')),JSON.stringify(f()));
 assert.equal(await page.evaluate(()=>lexlStore.source),'indexeddb');
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
