/* Isolated 2B recovery protocol. No production DB names or arbitrary file input. */
(function(root){
'use strict';
const D=root.LEXLData, cfg=root.LEXL_RESTORE_CONFIG;
const fail=m=>{throw Error(m)};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let currentDB=null, original=null, originalVerified=false;
function context(){const local=['localhost','127.0.0.1'].includes(location.hostname)&&location.protocol==='http:';if(!(location.origin===cfg.origin||local)||!location.pathname.startsWith(cfg.scope))fail('Fel adress. Ingen lagringsåtkomst tillåts.');}
function source(){context();if(localStorage.getItem(cfg.namespace+'-original')!==original)fail('Testoriginalet saknas eller har ändrats. Inga data ersätts.');}
function dbName(name){if(typeof name!=='string'||!new RegExp('^'+cfg.namespace+'-target-[a-f0-9-]{36}$').test(name))fail('Otillåtet databasmål.');return name;}
async function open(name,create=false){context();dbName(name);return new Promise((resolve,reject)=>{let reason,settled=false;const bad=e=>{if(!settled){settled=true;reject(e)}};const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{if(!create){reason=Error('Databasen saknas. Ingen ersättningsdatabas skapas.');r.transaction.abort();return}r.result.createObjectStore('records')};r.onerror=()=>bad(reason||r.error);r.onblocked=()=>bad(Error('Lagringen är blockerad.'));r.onsuccess=()=>{const db=r.result;if(settled){db.close();return}settled=true;db.onversionchange=()=>db.close();resolve(db)}});}
async function snapshot(name=currentDB){const db=await open(name);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),s=tx.objectStore('records'),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve(Object.fromEntries(keys.result.map((k,i)=>[k,values.result[i]])));tx.onabort=()=>reject(tx.error||Error('Läsningen avbröts.'))})}finally{db.close()}}
async function write(name,fn){const db=await open(name);try{return await new Promise((resolve,reject)=>{let reason;const tx=db.transaction('records','readwrite',{durability:'strict'}),s=tx.objectStore('records'),k=s.getAllKeys(),v=s.getAll();tx.oncomplete=resolve;tx.onabort=()=>reject(reason||tx.error||Error('Skrivningen avbröts; transaktionen sparades inte.'));v.onsuccess=()=>{try{source();fn(s,Object.fromEntries(k.result.map((key,i)=>[key,v.result[i]])),tx)}catch(e){reason=e;tx.abort()}}})}finally{db.close()}}
async function decode(bytes,descriptor){
 if(bytes.byteLength>2*1024*1024||await hash(bytes)!==descriptor.sha256)fail('SHA-256 stämmer inte. Säkerhetskopian avvisas.');
 let raw;
 if(descriptor.transport==='zip'){
  const bundle=root.LEXLBackupPackage.decode(bytes);
  await root.LEXLTransition.verifyBundle(bundle);
  raw=bundle.files['indexeddb-01115.json'];
  // Exact fixture lineage, original, and exported state are checked below.
  if(bundle.files['localstorage-original-01114.json']!==original)fail('ZIP-originalet tillhör inte denna syntetiska testserie.');
 }else raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const value=D.parse(raw);let state;
 if(descriptor.kind==='legacy'){
  if(raw!==original||value.schemaVersion!==undefined)fail('Originalkopian stämmer inte.');state=D.importData(raw);
 }else{
  if(value.schemaVersion!==1)fail('Okänd schemaversion. Ingen återställning.');state=D.importData(raw);
 }
 if(await hash(JSON.stringify(state))!==descriptor.stateSha256)fail('Datainnehåll, revision eller syntetiskt ursprung kunde inte verifieras.');
 return {raw:JSON.stringify(state),state,revision:state.storageRevision,sha256:await hash(JSON.stringify(state)),asset:descriptor.id,kind:descriptor.kind,createdAt:descriptor.createdAt};
}
async function candidate(id){context();source();const descriptor=cfg.backups.find(b=>b.id===id);if(!descriptor)fail('Endast medföljande syntetiska säkerhetskopior får läsas.');const r=await fetch('./'+descriptor.file,{cache:'no-store'});if(!r.ok)fail('Testkopian kunde inte läsas.');return decode(new Uint8Array(await r.arrayBuffer()),descriptor);}
async function verifyStage(stage){
 if(stage?.format!=='lexl-restore-stage-v1'||typeof stage.raw!=='string'||await hash(stage.raw)!==stage.sha256)fail('Stagingkopian är skadad. Ingen aktivering.');
 const descriptor=cfg.backups.find(b=>b.id===stage.asset);if(!descriptor||descriptor.stateSha256!==stage.sha256||stage.kind!==descriptor.kind||stage.createdAt!==descriptor.createdAt)fail('Stagingkopian saknar verifierat syntetiskt ursprung.');
 const state=D.importData(stage.raw);if(JSON.stringify(state)!==stage.raw||stage.revision!==state.storageRevision)fail('Stagingrevisionen eller datamodellen stämmer inte.');return state;
}
async function inspect({simulate='none'}={}){
 context();source();if(!['none','missing','corrupt','unavailable'].includes(simulate))fail('Okänd simulering.');
 const rows=await snapshot();let state=null,activeVerified=false;
 if(rows.activation){const a=rows.activation,s=rows.stage;if(a.format!=='lexl-restore-activation-v1'||a.stageId!==s?.id||a.sha256!==s?.sha256||a.revision!==s?.revision)fail('Aktiveringsbeviset är skadat. Data lämnas orörda.');state=await verifyStage(s);activeVerified=true;}
 const unavailable=simulate!=='none';
 return {database:currentDB,source:activeVerified&&!unavailable?'restored-indexeddb':'no-active-source',activationPresent:!!rows.activation,activeVerified,stagingPresent:!!rows.stage,stagingVerified:rows.stage?!!(await verifyStage(rows.stage)):false,revision:state?.storageRevision??null,historyCount:state?.history.length??0,programCount:state?.programs.length??0,draftPresent:!!state?.draft,originalUnchanged:true,originalSha256:cfg.originalSha256,backupAsset:rows.stage?.asset??null,backupCreatedAt:rows.stage?.createdAt??null,stagingSha256:rows.stage?.sha256??null,simulation:simulate,simulatedSourceUnavailable:unavailable,state:unavailable?null:state};
}
async function restore({asset,approved=false,acknowledgeLegacy=false,fault='none'}={}){
 context();source();if(approved!==true)fail('Uttryckligt godkännande saknas.');if(!['none','after-stage','abort-transaction','abort-activation','quota'].includes(fault))fail('Okänt feltest.');
 const name=currentDB,sourceRaw=original,c=await candidate(asset);
 if(c.kind==='legacy'&&acknowledgeLegacy!==true)fail('Bekräfta att originalkopian saknar senare IndexedDB-pass.');
 const before=await snapshot(name);
 if(before.activation){const existing=await verifyStage(before.stage);if(c.revision<existing.storageRevision||c.createdAt<before.stage.createdAt)fail('ÄLDRE SÄKERHETSKOPIA: befintliga data är nyare. Återställning stoppad.');fail('Målet innehåller redan träningsdata. Ingen överskrivning eller dubblering tillåts.');}
 if(Object.keys(before).some(k=>k!=='stage'))fail('Okända befintliga data. Målet får inte skrivas över.');
 if(before.stage&&(before.stage.raw!==c.raw||before.stage.asset!==c.asset))fail('En annan stagingkopia finns. Välj en ny tom testyta; inget raderas.');
 if(before.stage)await verifyStage(before.stage);
 const stage=before.stage||{format:'lexl-restore-stage-v1',id:crypto.randomUUID(),...c};delete stage.state;
 if(!before.stage)await write(name,(s,rows,tx)=>{if(currentDB!==name||original!==sourceRaw||Object.keys(rows).length)fail('Målet ändrades i ett annat fönster. Ladda om.');s.add(stage,'stage');if(fault==='abort-transaction'||fault==='quota'){tx.abort();}});
 const readBack=await snapshot(name);if(!equal(readBack.stage,stage))fail('Kopian kunde inte återläsas.');await verifyStage(readBack.stage);
 if(fault==='after-stage')fail('AVSIKTLIGT AVBROTT: kopian verifierad men inte aktiverad. Original och staging bevaras.');
 if(fault==='quota'||fault==='abort-transaction')fail('Simulerat skrivfel. Ingen aktivering.');
 const marker={format:'lexl-restore-activation-v1',stageId:stage.id,sha256:stage.sha256,revision:stage.revision};
 await write(name,(s,rows,tx)=>{if(currentDB!==name||localStorage.getItem(cfg.namespace+'-selected')!==name||rows.activation||!equal(rows.stage,stage)||Object.keys(rows).some(k=>k!=='stage'))fail('Målet eller revisionen ändrades. Ingen aktivering.');s.add(marker,'activation');if(fault==='abort-activation')tx.abort();});
 const final=await snapshot(name);if(currentDB!==name||!equal(final.activation,marker)||!equal(final.stage,stage))fail('Slutverifieringen misslyckades. Ingen framgång visas; ladda om för kontroll.');await verifyStage(final.stage);source();return inspect();
}
async function newTarget(){context();source();const name=cfg.namespace+'-target-'+crypto.randomUUID();const db=await open(name,true);db.close();if(Object.keys(await snapshot(name)).length)fail('Testytan är inte tom.');localStorage.setItem(cfg.namespace+'-selected',name);if(localStorage.getItem(cfg.namespace+'-selected')!==name)fail('Valet av testyta kunde inte sparas.');currentDB=name;return inspect();}
async function init(){
 context();if(!crypto?.subtle||!indexedDB||typeof indexedDB.databases!=='function')fail('Säker lagringskontroll saknas. Ingen återställning tillåts.');
 const response=await fetch('./synthetic-original.json',{cache:'no-store'});if(!response.ok)fail('Testoriginalet kunde inte läsas.');original=await response.text();if(await hash(original)!==cfg.originalSha256)fail('Testoriginalets kontrollsumma stämmer inte.');D.importData(original);
 const key=cfg.namespace+'-original',marker=cfg.namespace+'-created',saved=localStorage.getItem(key),created=localStorage.getItem(marker),names=await indexedDB.databases();
 if(saved===null){if(created!==null||localStorage.getItem(cfg.namespace+'-selected')!==null||names.some(x=>x.name?.startsWith(cfg.namespace+'-')))fail('Testoriginalet saknas efter tidigare användning. Ingen automatisk återskapning.');localStorage.setItem(key,original);if(localStorage.getItem(key)!==original)fail('Testoriginalet kunde inte återläsas.');localStorage.setItem(marker,'synthetic-2b-v1');}
 if(localStorage.getItem(marker)!=='synthetic-2b-v1')fail('Ursprungsmarkören saknas.');source();
 originalVerified=true;const selected=localStorage.getItem(cfg.namespace+'-selected');if(selected===null)return {source:'no-target',originalUnchanged:true,state:null};currentDB=dbName(selected);return inspect();
}
root.LEXLRestore=Object.freeze({init,newTarget,restore,inspect,snapshot,candidate,hash,get database(){return currentDB},get safeForNewTarget(){try{source();return originalVerified}catch{return false}}});
})(globalThis);
