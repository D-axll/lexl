/* App-facing storage gate. Never publish an unactivated IndexedDB copy. */
(function(root){
 'use strict';
 const D=root.LEXLData;
 function create(options){
  const {storage,legacyKey,recoveryKey,experimentalKey,defaults,getIndexedDB=()=>root.indexedDB,onChange=()=>{}}=options;
  const dbName='lexl-training-schema1';
  let initialRaw=null,recoveryRaw=null,state=null,raw=null,blocked=null,source='loading',initialized=false,pending=null,channel=null;
  let initialError=null;
  try{
   initialRaw=storage.getItem(legacyKey);recoveryRaw=storage.getItem(recoveryKey);
   if(experimentalKey&&storage.getItem(experimentalKey)!==null)throw Error('En tidigare experimentell kopia finns. Den bevaras och måste granskas före fortsatt sparning.');
   state=D.freeze(initialRaw===null?D.prepare({...defaults(),calculationVersion:D.CALCULATION_VERSION}):D.importData(initialRaw));
   if(recoveryRaw!==null){const r=D.parse(recoveryRaw);D.prepare({programs:[],history:[],draft:r.draft})}
  }catch(e){initialError=e}
  raw=initialRaw;
  source=initialRaw!==null||recoveryRaw!==null?'legacy-readonly':'first-start';
  const engine=root.LEXLTransition.create({dbName,readLegacy:()=>storage.getItem(legacyKey),readRecovery:()=>storage.getItem(recoveryKey),defaults,getIndexedDB,onChange});
  const ready=(async()=>{
   try{
    const status=await engine.inspect();
    if(status.primary==='indexeddb'){
     state=D.freeze(status.state);raw=status.stateRaw;source='indexeddb';
     if(status.legacyChanged)throw Error('Äldre localStorage-data har ändrats. Båda källorna bevaras; granska dem innan du sparar vidare.');
    }else{
     if(status.unprovenCopy)throw Error('En IndexedDB-kopia utan verifierbar aktivering finns. Ingen datakälla byts och kopian skrivs inte över. Exportera för granskning.');
     if(status.pendingProposalId){
      try{pending=await engine.review(status.pendingProposalId)}catch(e){if(status.copiedButInactive||status.reserved)throw e}
     }
    }
    if(initialError)throw initialError;
    if(typeof BroadcastChannel==='function'){
     channel=new BroadcastChannel(dbName+':changes');
     channel.onmessage=e=>{if(e.data?.revision!==state?.storageRevision)onChange('Data har ändrats i ett annat appfönster. Exportera osparat arbete och ladda om innan du fortsätter.')};
    }
   }catch(e){blocked=e}
   initialized=true;
  })();
  async function ensure(){await ready;if(blocked)throw Error('Skrivning blockerad: '+blocked.message)}
  async function prepareTransition(){
   await ensure();
   if(source==='indexeddb')throw Error('Övergången är redan genomförd.');
   const status=await engine.inspect();
   if(status.primary==='indexeddb')throw Error('Ett annat appfönster har genomfört övergången. Ladda om.');
   if(status.pendingProposalId){
    try{pending=await engine.review(status.pendingProposalId);return pending}catch(e){if(status.copiedButInactive||status.reserved)throw e}
   }
   pending=await engine.prepare();return pending;
  }
  async function approveTransition(id,approval){
   await ensure();
   const result=await engine.confirm(id,approval);
   if(result.primary!=='indexeddb'||result.legacyChanged)throw Error('Övergången kunde inte verifieras. Ladda om och granska källorna.');
   state=D.freeze(result.state);raw=result.stateRaw;source='indexeddb';pending=null;
   return state;
  }
  async function commit(candidate,{intent='change'}={}){
   D.validate(candidate,false);const next=D.copy(candidate);await ensure();
   if(source==='legacy-readonly')throw Error('Äldre data är skrivskyddade tills du uttryckligen godkänner den verifierade engångsövergången.');
   if(source==='first-start'){
    if(pending)throw Error('En tidigare sparning avbröts. Fortsätt verifieringen av den innan du registrerar något nytt.');
    if(next.storageRevision!==state.storageRevision)throw Error('Ändringen bygger på ett äldre tillstånd. Ladda om.');
    pending=await engine.prepare({firstState:next});
    try{return await approveTransition(pending.id,{approved:true,backupSha256:pending.backupSha256})}
    catch(e){
     try{const s=await engine.inspect();if(s.primary==='indexeddb')blocked=Error('Första sparningen kan vara utförd. Ladda om innan du fortsätter.')}catch{blocked=Error('Sparandet kunde inte verifieras. Ladda om innan du fortsätter.')}
     throw blocked||e;
    }
   }
   try{
    const accepted=await engine.commit(next);state=D.freeze(accepted);raw=JSON.stringify(accepted);return state;
   }catch(e){if(e.message.includes('kan vara sparad'))blocked=e;throw e}
  }
  return {ready,commit,prepareTransition,approveTransition,
   exportPreparedBackup:async id=>{await ensure();return engine.exportPreparedBackup(id)},
   exportBeforeRollback:async options=>{await ready;return engine.exportBeforeRollback(options)},
   verifyBundle:root.LEXLTransition.verifyBundle,
   readPrimaryRaw:()=>engine.readPrimaryRaw(),recoveryRaw:which=>engine.recoveryRaw(which),
   get state(){return state},get raw(){return raw},get legacyRaw(){return initialRaw},get blocked(){return blocked},get source(){return source},get initialized(){return initialized},get pending(){return pending},
   close(){channel?.close();engine.close()}
  };
 }
 root.LEXLStorageSession={create};
})(globalThis);
