'use strict';
// Present only inside the generated, separately namespaced 2A fault build.
module.exports=function installFaultHarness(config){
 const modeKey=config.namespace+':abort-before-activation',eventKey=config.namespace+':last-fault';
 let latest=null,controlError=null;const attempts=new WeakSet();
 const canControl=()=>{try{return typeof lexlStore!=='undefined'&&lexlStore.initialized&&!lexlMigrationBusy&&!lexlExportBusy}catch{return false}};
 const ensure=()=>{
  const b=globalThis.LEXL_TEST_BUILD;
  if(!globalThis.LEXL_TEST_ALLOWED||b?.faultTest!==true||b.stage!=='2A'||b.database!==config.database||!b.legacyKey.startsWith(config.namespace+'-'))throw Error('FELTEST: fel lagringskontext. Ingen aktivering tillåts.');
 };
 function armed(){
  const value=sessionStorage.getItem(modeKey);
  if(value!==null&&!['armed','disabled'].includes(value))throw Error('FELTEST: ogiltigt kontrolläge. Aktivering blockeras.');
  return value!=='disabled';
 }
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
 async function records(){
  ensure();
  const names=await indexedDB.databases();if(!names.some(d=>d.name===config.database))return {};
  return new Promise((resolve,reject)=>{
   const open=indexedDB.open(config.database,1);open.onupgradeneeded=()=>open.transaction.abort();open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{const db=open.result;db.onversionchange=()=>db.close();const tx=db.transaction('records','readonly'),store=tx.objectStore('records');let keys,values;
    const k=store.getAllKeys(),v=store.getAll();k.onsuccess=()=>{keys=k.result};v.onsuccess=()=>{values=v.result};
    tx.oncomplete=()=>{db.close();resolve(Object.fromEntries(keys.map((key,i)=>[key,values[i]])))};tx.onabort=()=>{db.close();reject(tx.error||Error('Diagnostikläsningen avbröts'))};
   };
  });
 }
 async function snapshot(){
  const rows=await records(),id=rows['copy-owner']?.proposalId||rows['prepared-proposal']?.proposalId,p=rows['proposal:'+id],backup=rows['backup:'+id],current=rows.current;
  const backupVerified=!!backup&&await hash(backup.payload)===backup.sha256;
  const original=backupVerified?JSON.parse(backup.payload):null;
  const copyVerified=!!current&&current.raw===p?.copyRaw&&await hash(current.raw)===p?.copySha256&&rows['receipt:'+current.revision]?.digest===p.copySha256;
  return {armed:armed(),copyPresent:!!current,copyVerified,backupVerified,activationPresent:!!rows.activation,revision:current?.revision??null,proposalId:id??null,originalAvailable:localStorage.getItem(globalThis.LEXL_TEST_BUILD.legacyKey)!==null,originalUnchanged:original?original.legacyRaw===localStorage.getItem(globalThis.LEXL_TEST_BUILD.legacyKey):null,appSource:typeof lexlStore==='undefined'?'loading':lexlStore.source};
 }
 function render(){
  let panel=document.getElementById('fault-controls');
  if(!panel){panel=document.createElement('section');panel.id='fault-controls';panel.className='card';panel.setAttribute('aria-label','Kontrollerat migreringsfel');document.getElementById('lexl-test-banner').insertAdjacentElement('afterend',panel);
   panel.innerHTML='<h2>FELTEST ETAPP 2A</h2><p>Avsiktligt avbrott efter verifierad kopia, före aktivering. Endast syntetiska data. Inga original återställs eller raderas.</p><p id="fault-mode" role="status"></p><button id="fault-arm" type="button">Armera avbrott före aktivering</button><button id="fault-disarm" type="button">Stäng av avbrottet för manuellt återupptagningsförsök</button><button id="fault-refresh" type="button">Kontrollera kopia och aktivering</button><pre id="fault-status" aria-live="polite">Ingen diagnostikläsning gjord ännu.</pre><p>Avstängning aktiverar ingenting. Nytt uttryckligt godkännande krävs i övergångspanelen. Ändra eller radera inga lagringsnycklar.</p>';
   for(const [id,value]of [['fault-arm','armed'],['fault-disarm','disabled']])document.getElementById(id).addEventListener('click',()=>{try{ensure();if(!canControl())throw Error('Testläget kan inte ändras under uppstart eller migrering');sessionStorage.setItem(modeKey,value);if(sessionStorage.getItem(modeKey)!==value)throw Error('Kontrolläget kunde inte verifieras');controlError=null;latest=null;lexlMigrationConsent=false;lexlRenderTransition();render()}catch(e){controlError=e.message;render()}});
   document.getElementById('fault-refresh').addEventListener('click',()=>refresh());
  }
  let active=true;try{active=armed()}catch(e){controlError=e.message}
  document.getElementById('fault-mode').textContent=controlError?'Testkontrollfel: '+controlError:active?'Avbrott ARMERAT – aktiveringsmarkören ska inte skrivas.':'Avbrott AVSTÄNGT – endast ett nytt manuellt godkännande får aktivera kopian.';
  document.getElementById('fault-arm').disabled=!canControl();document.getElementById('fault-disarm').disabled=!canControl()||!!controlError;document.getElementById('fault-refresh').disabled=!canControl();
  let stale=false;try{stale=!!latest?.appSource&&latest.appSource!==lexlStore.source}catch{}
  document.getElementById('fault-status').textContent=stale?'Datakällan har ändrats sedan senaste kontrollen. Välj Kontrollera kopia och aktivering.':latest?'Senast kontrollerade status:\n'+JSON.stringify(latest,null,2):'Ingen aktuell diagnostikläsning. Välj Kontrollera kopia och aktivering.';
 }
 async function refresh(){try{latest=await snapshot();render();return latest}catch(error){latest={error:error.message};render();return latest}}
 function beginAttempt(){ensure();const attempt=Object.freeze({armed:armed()});attempts.add(attempt);return attempt}
 async function afterVerifiedCopy(info,attempt){
  ensure();if(!attempts.has(attempt))throw Error('FELTEST: försökets kontrolläge saknas. Ingen aktivering.');attempts.delete(attempt);const status=await snapshot();
  if(!status.copyVerified||!status.backupVerified||!status.originalUnchanged||status.activationPresent||status.proposalId!==info.proposalId||status.revision!==info.revision)throw Error('FELTEST: stoppunktens underlag kunde inte verifieras. Ingen aktivering.');
  if(attempt.armed){
   sessionStorage.setItem(eventKey,JSON.stringify({point:'after-verified-copy-before-activation',...info}));
   latest={...status,fault:'AVSIKTLIGT AVBROTT',point:'after-verified-copy-before-activation'};render();
   throw Error('AVSIKTLIGT FELTEST 2A: kopian är verifierad men inaktiv. Aktiveringsmarkören har inte skrivits. Originalet bevaras. Ladda om och kontrollera teststatus.');
  }
 }
 globalThis.LEXL2AFault=Object.freeze({beginAttempt,afterVerifiedCopy,render,refresh,get lastStatus(){return latest}});
 render();
};
