/* UI for synthetic recovery only; never accepts a user-provided file. */
(function(){
'use strict';
const E=LEXLRestore,cfg=LEXL_RESTORE_CONFIG,$=id=>document.getElementById(id);
let busy=false,ready=false,healthy=false,reviewed=null,last=null;
const say=text=>{$('message').textContent=text};
function reset(){reviewed=null;$('consent').checked=false;$('legacy-consent').checked=false;$('review-status').textContent='Kopian måste granskas på nytt.';guard();}
function guard(){
 for(const e of document.querySelectorAll('button,select,input'))e.disabled=busy||!ready;
 $('controls').disabled=busy||!ready||!E.database||!healthy;
 $('restore').disabled=busy||!reviewed||!$('consent').checked||(reviewed.kind==='legacy'&&!$('legacy-consent').checked);
}
function view(diag){
 last=diag;healthy=true;const {state,...summary}=diag;$('diagnostics').textContent=JSON.stringify(summary,null,2);$('data-view').replaceChildren();
 if(state){const title=document.createElement('h2');title.textContent='Verifierade återställda träningsuppgifter';$('data-view').append(title);for(const [label,value]of [['Program',state.programs],['Historik med set, tider, cirklar och anteckningar',state.history],['Pågående pass',state.draft]]){const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=label;p.textContent=JSON.stringify(value,null,2);d.append(s,p);$('data-view').append(d)}}
}
async function refresh(){const diag=await E.inspect({simulate:$('simulation').value});view(diag);return diag;}
async function task(fn){if(busy||!ready)return;busy=true;guard();try{await fn()}catch(e){say('STOPPAD: '+e.message);$('data-view').replaceChildren();try{await refresh()}catch(error){$('diagnostics').textContent='Kan inte verifiera lagringen: '+error.message;healthy=false;ready=E.safeForNewTarget;}}finally{busy=false;guard()}}
$('new-target').onclick=()=>task(async()=>{reset();const diag=await E.newTarget();$('simulation').value='none';sessionStorage.setItem(cfg.namespace+'-simulation','none');view(diag);say('Ny tom testyta skapad. Alla tidigare testytor och originalet finns kvar.');});
$('review').onclick=()=>task(async()=>{reset();const c=await E.candidate($('backup').value),target=await E.inspect();reviewed={asset:c.asset,kind:c.kind,target:E.database};$('review-status').textContent=JSON.stringify({sha256:c.sha256,revision:c.revision,targetAlreadyActive:target.activationPresent,existingRevision:target.revision,createdAt:c.createdAt,programs:c.state.programs.length,sessions:c.state.history.length,draft:!!c.state.draft,warning:c.kind==='legacy'?'Originalkopia: senare IndexedDB-pass och utkaständringar saknas.':'IndexedDB-export: innehåller senare syntetiska data.'},null,2);say('Kopian är verifierad. Inga träningsdata har skrivits. Granska och godkänn uttryckligen.');});
$('restore').onclick=()=>task(async()=>{const review=reviewed,approved=$('consent').checked,legacy=$('legacy-consent').checked;reset();if(!review||review.asset!==$('backup').value||review.target!==E.database)throw Error('Granskningen är inaktuell.');const diag=await E.restore({asset:review.asset,approved,acknowledgeLegacy:legacy,fault:$('fault').value});view(diag);say('Återställt och verifierat i separat IndexedDB. Aktiveringsmarkören är återläst. Originalet är oförändrat.');});
for(const id of ['backup','fault'])$(id).onchange=reset;
for(const id of ['consent','legacy-consent'])$(id).onchange=guard;
$('simulation').onchange=()=>task(async()=>{reset();sessionStorage.setItem(cfg.namespace+'-simulation',$('simulation').value);await refresh();say($('simulation').value==='none'?'Simulering avstängd.':'Aktiv källa simuleras som otillgänglig. Sparade data finns kvar. Skapa en ny tom testyta för återställning; den gamla bevaras.');});
$('refresh').onclick=()=>task(async()=>{await refresh();say('Lagringen kontrollerad utan ändringar.');});
$('restart').onclick=()=>location.reload();
addEventListener('storage',e=>{if(e.key===cfg.namespace+'-selected'||e.key===cfg.namespace+'-original'){reset();ready=false;guard();say('Lagringsvalet eller originalet ändrades i ett annat fönster. Ladda om innan du fortsätter.');$('data-view').replaceChildren();}});
rootStart();async function rootStart(){try{const sim=sessionStorage.getItem(cfg.namespace+'-simulation')||'none';if(!['none','missing','corrupt','unavailable'].includes(sim))throw Error('Okänd sparad simulering.');$('simulation').value=sim;const diag=await E.init();view(diag);ready=true;if(E.database)await refresh();say(diag.source==='no-target'?'Originalet verifierat. Skapa en ny tom testyta för ett manuellt återställningsförsök.':'Omstart: vald testyta och aktiveringsbevis har kontrollerats. Ingen automatisk återställning har gjorts.');}catch(e){say('STOPPAD: '+e.message+(E.safeForNewTarget?' Originalet är verifierat. En ny tom testyta kan skapas utan att den skadade ändras.':''));healthy=false;ready=E.safeForNewTarget;}guard();globalThis.LEXL_RESTORE_UI={get ready(){return ready},get last(){return last},get busy(){return busy}};}
})();
