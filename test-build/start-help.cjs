'use strict';
// Test-build-only guidance. The storage gate and consent protocol stay intact.
module.exports=function lexlTestStartHelp(){
 if(view!=='program'||lexlStore.source!=='legacy-readonly'||lexlStore.blocked)return;
 const start=el.querySelector('button[onclick^="start("]');if(!start||!start.disabled)return;
 const help=document.createElement('section');help.id='lexl-test-start-help';help.className='card';help.setAttribute('aria-label','Aktivera syntetisk testlagring');
 const reason=document.createElement('p');reason.id='lexl-test-start-reason';reason.textContent='Starta pass är låst tills du har godkänt lagringen av den syntetiska testkopian. Inga data från 0.11.14 behöver importeras.';help.appendChild(reason);start.setAttribute('aria-describedby',reason.id);
 const link=document.createElement('button');link.type='button';link.id='lexl-test-storage-guide';link.textContent='Gå till godkännandet av testlagringen';
 link.addEventListener('click',()=>{const panel=document.getElementById('transition-panel');if(!panel||panel.hidden)return;panel.scrollIntoView({block:'start'});(panel.querySelector('#transition-consent')||panel.querySelector('#transition-prepare'))?.focus({preventScroll:true})});help.appendChild(link);
 (start.closest('.lexl-program-main-action')||start).insertAdjacentElement('afterend',help);
};
