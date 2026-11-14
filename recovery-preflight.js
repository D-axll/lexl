/* LEXL 0.11.15 – Etapp 3B. Read-only restore decision preflight.
 * A preflight result is NEVER permission to activate or overwrite data.
 */
(function(root){
 'use strict';
 const D=root.LEXLData;
 const fail=message=>{throw Error(message)};
 const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const canonical=value=>JSON.stringify(normalize(value));
 function normalize(value){
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])]));
  return value;
 }
 function compare(candidate,active){
  const oldSessions=new Map(active.history.map(s=>[s.sessionId,s]));
  const newSessions=new Map(candidate.history.map(s=>[s.sessionId,s]));
  const oldPrograms=new Map(active.programs.map(p=>[p.id,p]));
  const newPrograms=new Map(candidate.programs.map(p=>[p.id,p]));
  return {
   lostSessions:active.history.filter(s=>!newSessions.has(s.sessionId)).length,
   addedSessions:candidate.history.filter(s=>!oldSessions.has(s.sessionId)).length,
   changedSessions:candidate.history.filter(s=>oldSessions.has(s.sessionId)&&canonical(oldSessions.get(s.sessionId))!==canonical(s)).length,
   lostPrograms:active.programs.filter(p=>!newPrograms.has(p.id)).length,
   addedPrograms:candidate.programs.filter(p=>!oldPrograms.has(p.id)).length,
   changedPrograms:candidate.programs.filter(p=>oldPrograms.has(p.id)&&canonical(oldPrograms.get(p.id))!==canonical(p)).length,
   activeDraftWouldChange:canonical(active.draft??null)!==canonical(candidate.draft??null)
  };
 }
 async function review({inspection,session,stagingTicket}={}){
  if(!inspection||!session||!stagingTicket)fail('Granskning, lagringssession och staging-kvitto krävs.');
  await session.ready;
  if(session.blocked)fail('Appens lagring är blockerad. Återställning får inte fortsätta.');
  if(!['indexeddb','legacy-readonly','first-start'].includes(session.source))fail('Okänd aktiv datakälla.');
  const staged=await root.LEXLRecoveryStaging.inspectStaged(stagingTicket);
  if(!staged.verified||staged.revision!==inspection.revision||stagingTicket.sha256!==inspection.sha256)fail('Staging-kopian stämmer inte med den granskade filen.');
  // Always read the currently selected source, never assume the in-memory state is current.
  const activeRaw=session.source==='indexeddb'?await session.readPrimaryRaw():session.legacyRaw;
  const active=activeRaw===null?D.prepare({programs:[],history:[],draft:null,calculationVersion:D.CALCULATION_VERSION}):D.importData(activeRaw);
  const candidate=D.importData(inspection.raw);
  const differences=compare(candidate,active);
  // Detect changes while preflight is running. This is NOT an atomic activation lock.
  const secondRaw=session.source==='indexeddb'?await session.readPrimaryRaw():session.legacyRaw;
  if(secondRaw!==activeRaw)fail('Träningsdata ändrades under granskningen. Börja om utan att aktivera något.');
  if(session.blocked)fail('Lagringen blockerades under granskningen.');
  const activeSha256=await digest(activeRaw===null?'null':activeRaw);
  const revisionIsOlder=candidate.storageRevision<active.storageRevision;
  const revisionIsNewer=candidate.storageRevision>active.storageRevision;
  return Object.freeze({
   eligibleForAutomaticActivation:false,
   source:session.source,
   activeRevision:active.storageRevision,
   activeSha256,
   snapshotIsNotActivationLock:true,
   candidateRevision:candidate.storageRevision,
   revisionIsOlder,
   revisionIsNewer,
   revisionCannotProveFreshness:true,
   activePrograms:active.programs.length,
   activeSessions:active.history.length,
   candidatePrograms:candidate.programs.length,
   candidateSessions:candidate.history.length,
   ...differences,
   warning:'Endast förhandsgranskning. Revisionen bevisar inte att kopian innehåller alla träningspass. Ingen data har aktiverats eller ersatts. Behåll alltid en verifierad säkerhetskopia av aktuell data.'
  });
 }
 root.LEXLRecoveryPreflight=Object.freeze({review});
})(globalThis);
