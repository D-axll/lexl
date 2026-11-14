/* LEXL 0.11.15 Etapp 3B – guarded restore through the existing CAS writer.
 * NOT WIRED TO THE APP UI. Requires manual failure testing before release.
 * No direct IndexedDB writes; session.commit -> transition.commit -> data-layer CAS.
 */
(function(root){
 'use strict';
 const D=root.LEXLData;
 const fail=message=>{throw Error(message)};
 const sha=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 async function activate({session,inspection,stagingTicket,preflight,safetyBackupFile,safetyBackupExpected,confirmation,assertNoUnsavedWork}={}){
  if(!session||!inspection||!stagingTicket||!preflight||!safetyBackupFile||!safetyBackupExpected)fail('Fullständig återställningsgranskning och säkerhetskopia krävs.');
  if(typeof assertNoUnsavedWork!=='function')fail('Appen måste kontrollera osparat arbete före återställning.');
  if(confirmation!=='ÅTERSTÄLL MIN TRÄNING')fail('Uttryckligt återställningsgodkännande saknas.');
  await session.ready;
  if(session.blocked||session.source!=='indexeddb')fail('Endast verifierad IndexedDB-lagring kan återställas.');
  if(preflight.source!=='indexeddb'||preflight.activeSha256!==safetyBackupExpected.activeSha256||preflight.activeRevision!==safetyBackupExpected.activeRevision)fail('Godkännandet avser inte aktuellt tillstånd.');
  if(preflight.activeDraftWouldChange)fail('Pågående träningsutkast skulle ändras. Hantera utkastet innan återställning.');
  if(await assertNoUnsavedWork()!==true)fail('Osparat arbete eller ett aktivt träningspass hindrar återställning.');
  if(preflight.lostSessions||preflight.changedSessions||preflight.lostPrograms||preflight.changedPrograms)fail('Kopian skulle ta bort eller ändra befintliga pass eller program. Detta måste hanteras separat; ingen tyst förlust tillåts.');
  const staged=await root.LEXLRecoveryStaging.inspectStaged(stagingTicket);
  if(!staged.verified||stagingTicket.sha256!==inspection.sha256||stagingTicket.revision!==inspection.revision)fail('Staging-kopian matchar inte filen.');
  const candidateRaw=inspection.raw;
  if(typeof candidateRaw!=='string'||await sha(candidateRaw)!==stagingTicket.sha256)fail('Kandidaten är inte verifierad.');
  const safety=await root.LEXLRecoverySafetyBackup.verifyReselected({file:safetyBackupFile,expected:safetyBackupExpected,session});
  if(!safety.verified||safety.activeSha256!==preflight.activeSha256)fail('Säkerhetskopian kunde inte verifieras.');
  // Re-run comparison immediately before committing; preflight is not a lock.
  const latest=await root.LEXLRecoveryPreflight.review({inspection,session,stagingTicket});
  if(latest.activeSha256!==preflight.activeSha256||latest.activeRevision!==preflight.activeRevision)fail('Aktiva data ändrades efter godkännandet.');
  for(const key of ['lostSessions','changedSessions','lostPrograms','changedPrograms','activeDraftWouldChange']){
   if(latest[key])fail('Återställningen skulle ändra eller förlora befintliga data.');
  }
  // No activation while localStorage still contains a recovery draft. The
  // session's primary state alone does not represent unsaved recovery work.
  if(typeof root.localStorage?.getItem!=='function')fail('Kan inte kontrollera webbläsarens återställningsutkast.');
  if(root.localStorage.getItem('min-traning-recovery-v1')!==null)fail('Ett lokalt återställningsutkast finns kvar. Hantera det före återställning.');
  const active=session.state;
  if(active?.draft||D.importData(candidateRaw).draft)fail('Återställning med ett pågående utkast är blockerad tills det avslutats eller hanterats separat.');
  if(await assertNoUnsavedWork()!==true)fail('Osparat arbete upptäcktes precis före skrivning.');
  if(!active||active.storageRevision!==latest.activeRevision)fail('Appens minne är inte synkroniserat med lagringen. Ladda om.');
  const next=D.copy(D.importData(candidateRaw));
  // The restored snapshot's historical revision must never be reused.
  next.storageRevision=latest.activeRevision;
  // Existing session.commit uses an atomic compare-and-swap against current and
  // writes previous backup + receipt in the SAME IndexedDB transaction.
  // If another tab commits first, the writer aborts without overwriting it.
  const result=await session.commit(next,{intent:'change'});
  const persisted=await session.readPrimaryRaw();
  if(typeof persisted!=='string'||await sha(persisted)!==await sha(JSON.stringify(result)))fail('Skrivningen kunde inte verifieras. Ladda om och granska data innan du fortsätter.');
  return Object.freeze({committed:true,revision:result.storageRevision,sessions:result.history.length,programs:result.programs.length,requiresReload:true});
 }
 root.LEXLRecoveryActivation=Object.freeze({activate});
})(globalThis);
