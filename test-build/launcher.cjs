'use strict';
// Embedded inline in generated HTML so an old root worker cannot supply a stale
// external loader/module before the new scoped worker has taken control.
module.exports=function launchTest(config){
 const banner=document.getElementById('lexl-test-banner');
 const local=['localhost','127.0.0.1'].includes(location.hostname)&&location.protocol==='http:';
 globalThis.LEXL_TEST_ALLOWED=false;
 if(!(location.origin===config.origin||local)||!location.pathname.startsWith(config.scope)){
  banner.textContent='LEXL FELTEST 2A stoppad: fel adress. Ingen träningslagring har öppnats.';return;
 }
 const workers=navigator.serviceWorker;
 const target=new URL('sw.js?build='+config.sourceCommit.slice(0,12),new URL(config.scope,location.origin)).href;
 const controlled=()=>workers?.controller?.scriptURL===target;
 let appStarted=false;
 const fail=error=>{banner.textContent=(appStarted?'LEXL FELTEST 2A appstart avbruten: ':'LEXL FELTEST 2A stoppad före lagringsåtkomst: ')+error.message+'. Stäng äldre TEST-flikar och öppna testadressen online igen. Radera inga äldre cacher eller data.'};
 async function load(){
  for(const stage of document.querySelectorAll('script[type="application/x-lexl-test"]')){
   const script=document.createElement('script');script.async=false;
   if(stage.dataset.src){
    await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(Error('Kunde inte läsa testmodulen'));script.src=stage.dataset.src;document.body.appendChild(script)});
    if(stage.dataset.src==='./test-bootstrap.js'&&globalThis.LEXL_FAULT_BOOT_READY)await globalThis.LEXL_FAULT_BOOT_READY;
    if(stage.dataset.src==='./test-bootstrap.js'&&!globalThis.LEXL_TEST_ALLOWED)throw Error('Testkällan eller lagringen kunde inte verifieras');
   }else{script.textContent=stage.textContent;document.body.appendChild(script)}
  }
 }
 (async()=>{
  if(workers?.controller&&!controlled()){
   banner.textContent='LEXL FELTEST 2A – 0.11.15: väntar på den nya test-workern. Äldre cacher och data bevaras.';
   await new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timer);workers.removeEventListener('controllerchange',changed);error?reject(error):resolve()};
    const changed=()=>{if(controlled())finish()};
    const timer=setTimeout(()=>finish(Error('En äldre service worker styr fortfarande sidan')),12000);
    workers.addEventListener('controllerchange',changed);
    workers.register(target,{scope:config.scope,updateViaCache:'none'}).then(changed).catch(finish);
   });
   // Start the entire document under the new controller, not just later scripts.
   location.reload();return;
  }
  if(workers)workers.register(target,{scope:config.scope,updateViaCache:'none'}).catch(error=>console.warn('TEST offline cache unavailable',error));
  appStarted=true;await load();
 })().catch(fail);
};
