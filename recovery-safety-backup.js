/* LEXL 0.11.15 – Etapp 3B: export and verify a pre-restore safety backup.
 * Read-only. Does not activate staged data or write to IndexedDB/localStorage.
 * A download click is NOT proof that the file was saved: user must reselect it.
 */
(function(root){
 'use strict';
 const D=root.LEXLData;
 const fail=message=>{throw Error(message)};
 const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
 const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const MAX=20*1024*1024;
 async function prepare({session}={}){
  if(!session)fail('Lagringssession saknas.');
  await session.ready;
  if(session.blocked||session.source!=='indexeddb')fail('Verifierad IndexedDB-lagring krävs innan återställningsbackup kan skapas.');
  const raw=await session.readPrimaryRaw();
  if(typeof raw!=='string')fail('Aktiva träningsdata kunde inte läsas.');
  const state=D.importData(raw),digest=await sha(raw);
  if((await session.readPrimaryRaw())!==raw)fail('Träningsdata ändrades under exporten. Försök igen.');
  const payload=JSON.stringify({
   format:'lexl-before-restore-v1',
   createdAt:new Date().toISOString(),
   activeRevision:state.storageRevision,
   activeSha256:digest,
   raw
  });
  if(encoder.encode(payload).length>MAX)fail('Säkerhetskopian är för stor.');
  return Object.freeze({
   filename:'lexl-before-restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',
   bytes:encoder.encode(payload),
   activeSha256:digest,
   activeRevision:state.storageRevision,
   sessions:state.history.length,
   programs:state.programs.length
  });
 }
 async function verifyReselected({file,expected,session}={}){
  if(!file||typeof file.arrayBuffer!=='function'||!expected||!session)fail('Välj tillbaka den exporterade säkerhetskopian.');
  if(file.size>MAX)fail('Filen är för stor.');
  const data=D.parse(decoder.decode(new Uint8Array(await file.arrayBuffer())));
  if(data.format!=='lexl-before-restore-v1'||typeof data.raw!=='string'||data.activeSha256!==expected.activeSha256||data.activeRevision!==expected.activeRevision)fail('Den valda filen är inte den säkerhetskopia som just exporterades.');
  const state=D.importData(data.raw);
  if(state.storageRevision!==data.activeRevision||await sha(data.raw)!==data.activeSha256)fail('Säkerhetskopian kunde inte verifieras.');
  await session.ready;
  if(session.blocked||session.source!=='indexeddb')fail('Appens aktiva lagring är inte verifierad.');
  const activeRaw=await session.readPrimaryRaw();
  if(typeof activeRaw!=='string'||await sha(activeRaw)!==data.activeSha256||activeRaw!==data.raw)fail('Aktiva träningsdata har ändrats sedan säkerhetskopian skapades. Börja om.');
  return Object.freeze({
   verified:true,
   activeSha256:data.activeSha256,
   activeRevision:data.activeRevision,
   sessions:state.history.length,
   programs:state.programs.length,
   activationAuthorized:false,
   warning:'Filen är verifierad, men ingen återställning har aktiverats. Detta kvitto är inte ett godkännande att ersätta träningsdata.'
  });
 }
 root.LEXLRecoverySafetyBackup=Object.freeze({prepare,verifyReselected});
})(globalThis);
