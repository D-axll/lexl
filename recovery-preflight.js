/* LEXL 0.11.15 – Etapp 3B. Read-only restore decision preflight.
 * A preflight result is NEVER permission to activate or overwrite data.
 */
(function(root){
 'use strict';
 const D=root.LEXLData;
 const fail=message=>{throw Error(message)};
 function compare(candidate,active){
  const oldSessions=new Map(active.history.map(s=>[s.sessionId,s]));
  const newSessions=new Map(candidate.history.map(s=>[s.sessionId,s]));
  return {
   lostSessions:active.history.filter(s=>!newSessions.has(s.sessionId)).length,
   addedSessions:candidate.history.filter(s=>!oldSessions.has(s.sessionId)).length,
   changedSessions:candidate.history.filter(s=>oldSessions.has(s.sessionId)&&JSON.stringify(oldSessions.get(s.sessionId))!==JSON.stringify(s)).length,
   lostPrograms:active.programs.filter(p=>!candidate.programs.some(q=>q.id===p.id)).length,
   activeDraftWouldChange:JSON.stringify(active.draft??null)!==JSON.stringify(candidate.draft??null)
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
  const revisionIsOlder=candidate.storageRevision<active.storageRevision;
  return Object.freeze({
   eligibleForAutomaticActivation:false,
   source:session.source,
   activeRevision:active.storageRevision,
   candidateRevision:candidate.storageRevision,
   revisionIsOlder,
   activePrograms:active.programs.length,
   activeSessions:active.history.length,
   candidatePrograms:candidate.programs.length,
   candidateSessions:candidate.history.length,
   ...differences,
   warning:'Endast förhandsgranskning. Ingen data har aktiverats eller ersatts. Behåll alltid en verifierad säkerhetskopia av aktuell data.'
  });
 }
 root.LEXLRecoveryPreflight=Object.freeze({review});
})(globalThis);
