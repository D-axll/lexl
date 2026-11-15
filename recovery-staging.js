/* LEXL 0.11.15 – Etapp 3B. Isolated, non-activating recovery staging.
 * This module NEVER writes to lexl-training-schema1 or localStorage.
 * It does not change the source selected by LEXLStorageSession.
 */
(function(root){
 'use strict';
 const fail=message=>{throw Error(message)};
 const hash=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const prefix='lexl-restore-staging-01115-';
 const nameOK=name=>typeof name==='string'&&/^lexl-restore-staging-01115-[0-9a-f-]{36}$/.test(name);
 function open(name,factory,create=false){
  return new Promise((resolve,reject)=>{
   let settled=false,request;
   const bad=e=>{if(!settled){settled=true;reject(e)}};
   try{
    request=factory.open(name,1);
    request.onupgradeneeded=()=>{if(create)request.result.createObjectStore('records');else request.transaction.abort()};
    request.onerror=()=>bad(request.error||Error('Staging-databasen kunde inte öppnas.'));
    request.onblocked=()=>bad(Error('Staging-databasen är blockerad av ett annat fönster.'));
    request.onsuccess=()=>{if(settled){request.result.close();return}settled=true;request.result.onversionchange=()=>request.result.close();resolve(request.result)};
   }catch(e){bad(e)}
  });
 }
 function read(db,key){
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('records','readonly'),req=tx.objectStore('records').get(key);
   let result;
   req.onsuccess=()=>{result=req.result};
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||Error('Läsning misslyckades.'));
   tx.onabort=()=>reject(tx.error||Error('Läsning avbröts.'));
  });
 }
 function putOnce(db,key,value){
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('records','readwrite',{durability:'strict'});
   // add fails closed if this name/key is already occupied
   tx.objectStore('records').add(value,key);
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||Error('Skrivning misslyckades.'));
   tx.onabort=()=>reject(tx.error||Error('Skrivning avbröts.'));
  });
 }
 async function stage(inspection,{getIndexedDB=()=>root.indexedDB}={}){
  if(!inspection||typeof inspection.raw!=='string'||!['json','rollback-zip'].includes(inspection.kind))fail('Granska säkerhetskopian innan staging.');
  const D=root.LEXLData;
  const state=D.importData(inspection.raw);
  const digest=await hash(inspection.raw);
  if(digest!==inspection.sha256)fail('Säkerhetskopian har ändrats sedan granskningen.');
  if(state.storageRevision!==inspection.revision)fail('Säkerhetskopians revision stämmer inte.');
  const factory=getIndexedDB();
  if(!factory||typeof root.crypto?.randomUUID!=='function')fail('Säker staging kan inte startas i denna webbläsare.');
  const name=prefix+root.crypto.randomUUID();
  let db;
  try{
   db=await open(name,factory,true);
   // A freshly named database must be empty; do not reuse any existing staging data.
   if((await read(db,'candidate'))!==undefined)fail('Staging-platsen innehåller redan data.');
   const record={format:'lexl-restore-stage-v1',raw:inspection.raw,sha256:digest,revision:state.storageRevision,kind:inspection.kind,createdAt:new Date().toISOString()};
   await putOnce(db,'candidate',record);
   const verified=await read(db,'candidate');
   if(!verified||verified.format!==record.format||verified.raw!==record.raw||verified.sha256!==digest||verified.revision!==record.revision||await hash(verified.raw)!==digest)fail('Staging kunde inte verifieras efter skrivning.');
   D.importData(verified.raw);
   return Object.freeze({database:name,sha256:digest,revision:record.revision,kind:record.kind,verified:true,activated:false});
  }finally{db?.close()}
 }
 async function inspectStaged(ticket,{getIndexedDB=()=>root.indexedDB}={}){
  if(!ticket||!nameOK(ticket.database)||ticket.verified!==true||ticket.activated!==false)fail('Ogiltigt staging-kvitto.');
  const factory=getIndexedDB();if(!factory)fail('IndexedDB är inte tillgängligt.');
  const db=await open(ticket.database,factory);
  try{
   const record=await read(db,'candidate');
   if(!record||record.format!=='lexl-restore-stage-v1'||record.sha256!==ticket.sha256||record.revision!==ticket.revision||await hash(record.raw)!==ticket.sha256)fail('Staging-kopian kunde inte verifieras.');
   const state=root.LEXLData.importData(record.raw);
   if(state.storageRevision!==ticket.revision)fail('Staging-revisionen stämmer inte.');
   return Object.freeze({verified:true,activated:false,revision:ticket.revision,programs:state.programs.length,sessions:state.history.length,draft:!!state.draft});
  }finally{db.close()}
 }
 root.LEXLRecoveryStaging=Object.freeze({stage,inspectStaged});
})(globalThis);
