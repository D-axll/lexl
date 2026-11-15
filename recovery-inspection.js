/* Etapp 3B: read-only inspection of user-selected recovery files.
 * This module does not select, open, create or write any IndexedDB database.
 * Activation must be implemented separately through the app's storage gate.
 */
(function(root){
 'use strict';
 const D=root.LEXLData, P=root.LEXLBackupPackage, T=root.LEXLTransition;
 const MAX=128*1024*1024;
 const fail=m=>{throw Error(m)};
 const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 const utf8=new TextDecoder('utf-8',{fatal:true});
 function inspectState(raw){
  if(typeof raw!=='string')fail('Säkerhetskopian saknar träningsdata.');
  const parsed=D.parse(raw);
  if(parsed&&typeof parsed==='object'&&parsed.schemaVersion!==undefined&&parsed.schemaVersion!==1)fail('Okänd schemaversion. Inga data har ändrats.');
  const state=D.importData(raw);
  return {state,revision:state.storageRevision??0,programs:state.programs.length,sessions:state.history.length,draft:!!state.draft};
 }
 async function inspectBytes(bytes,{filename=''}={}){
  if(!(bytes instanceof Uint8Array))fail('Ogiltigt filinnehåll.');
  if(!bytes.byteLength||bytes.byteLength>MAX)fail('Säkerhetskopian är tom eller för stor.');
  const zip=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b;
  const name=String(filename).toLowerCase();
  if(zip&&!name.endsWith('.zip')||!zip&&name.endsWith('.zip'))fail('Filens innehåll motsvarar inte filtypen.');
  let raw,kind,warning,manifest=null;
  if(zip){
   const bundle=P.decode(bytes);
   manifest=await T.verifyBundle(bundle);
   raw=bundle.files['indexeddb-01115.json'];
   if(typeof raw!=='string')fail('ZIP-paketet saknar IndexedDB-export.');
   kind='rollback-zip';
   warning='Detta är ett återgångspaket. Granskning aktiverar inte data och ersätter inte befintliga pass.';
  }else{
   if(bytes.byteLength>20*1024*1024)fail('JSON-filen är för stor.');
   raw=utf8.decode(bytes);
   const envelope=D.parse(raw);
   if(envelope?.format==='lexl-before-restore-v1'){
    if(typeof envelope.raw!=='string'||await digest(envelope.raw)!==envelope.activeSha256||D.importData(envelope.raw).storageRevision!==envelope.activeRevision)fail('Återställningsbackupens kontrollsumma stämmer inte.');
    raw=envelope.raw;
   }
   kind='json';
   warning='En äldre kopia kan sakna senare träningspass och utkast. Kontrollera datum och innehåll före godkännande.';
  }
  if(root.LEXLRecoveryFilePolicy&&await root.LEXLRecoveryFilePolicy(raw)!==true)fail('Denna beta tillåter endast medföljande syntetiska testfiler.');
  const summary=inspectState(raw);
  return Object.freeze({kind,sha256:await digest(raw),revision:summary.revision,programs:summary.programs,sessions:summary.sessions,draft:summary.draft,warning,manifestRevision:manifest?.revision??null,raw});
 }
 async function inspectFile(file){
  if(!file||typeof file.arrayBuffer!=='function')fail('Välj en säkerhetskopia.');
  if(file.size>MAX)fail('Säkerhetskopian är för stor.');
  return inspectBytes(new Uint8Array(await file.arrayBuffer()),{filename:file.name||''});
 }
 root.LEXLRecoveryInspection=Object.freeze({inspectFile,inspectBytes});
})(globalThis);
