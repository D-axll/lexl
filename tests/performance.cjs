'use strict';
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
// Prepare baseline.html and before/ from the documented Git refs first.
const ROOT=path.resolve(__dirname,'..');
if(!process.argv[2])throw Error('Usage: node tests/performance.cjs <synthetic-output-directory>');
const OUT=path.resolve(process.argv[2]);
function fixture(count){
 const exercises=Array.from({length:4},(_,i)=>({id:'synthetic-x'+i,name:'Synthetic exercise '+i,sets:3,reps:'10',note:'',circleGroup:i<2?'A':''}));
 const programs=[{id:'synthetic-p',name:'Synthetic programme',type:'vanligt',rounds:1,pages:[],exercises}];
 const history=Array.from({length:count},(_,i)=>({id:'synthetic-p',name:'Synthetic programme',date:new Date(Date.UTC(2025,0,1+i,10)).toISOString(),workoutDate:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),workoutClock:'10:00',timeKnown:true,totalMinutes:45,warmupMinutes:5,warmup:[{activity:'Synthetic rowing',minutes:5,seconds:0}],comments:{'synthetic-x0':'Synthetic session note '+i},circleGroups:{'synthetic-x0':'A','synthetic-x1':'A'},rows:exercises.flatMap(e=>[1,2,3].map(set=>({id:e.id,name:e.name,set,weight:'10',reps:'10',target:'10',note:'Synthetic note',done:true})))}));
 return {programs,history,draft:null,lexlWarmTimeVersion:1};
}
function serve(version){return http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/blank'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic setup</title>');return}let file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(file.includes('..'))throw Error('bad path');if(version==='old'&&file==='index.html')file=OUT+'/baseline.html';else file=path.join(version==='before'?OUT+'/before':ROOT,file);const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)}catch(e){res.writeHead(404);res.end()}})}
async function settle(page,target){await page.waitForFunction(target=>view===target&&!lexlPendingHome&&!lexlRestoringNavigation,target)}
(async()=>{
 const servers=[serve('old'),serve('before'),serve('new')];for(const s of servers)await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const urls=servers.map(s=>'http://localhost:'+s.address().port);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const count of [0,100,500]){
   const data=fixture(count);await fs.writeFile(OUT+'/fixture-'+count+'.json',JSON.stringify(data));
   // Run sequentially: no competing benchmark/test browser workload.
   for(const [version,url]of [['0.11.14',urls[0]],['0.11.15-before',urls[1]],['0.11.15-after',urls[2]]]){
    const context=await browser.newContext({serviceWorkers:'block',timezoneId:'Europe/Stockholm',viewport:{width:390,height:844}});
    const page=await context.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__readyTime=null;document.addEventListener('DOMContentLoaded',()=>{if(typeof lexlStore!=='undefined')lexlStore.ready.then(()=>{window.__readyTime=performance.now()});else window.__readyTime=performance.now()},{once:true})});
    await page.goto(url+'/blank');await page.evaluate(data=>localStorage.setItem('min-traning-v1',JSON.stringify(data)),data);
    await page.goto(url);await page.waitForFunction(()=>__readyTime!==null);
    let migrationMs=null;
    if(version!=='0.11.14'){
     migrationMs=await page.evaluate(async()=>{const t=performance.now();await lexlPrepareTransition();if(!lexlMigrationSummary)throw Error(document.getElementById('data-error').textContent);lexlMigrationConsent=true;document.getElementById('transition-consent').checked=true;if(!await lexlApproveTransition())throw Error(document.getElementById('data-error').textContent);return performance.now()-t});
    }
    const samples=[];
    // One warmup round, then seven measured repetitions in each isolated profile.
    for(let i=0;i<8;i++){
     await page.evaluate(()=>go('home'));await settle(page,'home');await page.reload();await page.waitForFunction(()=>__readyTime!==null);await settle(page,'home');
     const startup=await page.evaluate(()=>__readyTime);
     const nav=await page.evaluate(async()=>{const t=performance.now();go('program','synthetic-p');while(view!=='program'||lexlPendingHome||lexlRestoringNavigation)await new Promise(requestAnimationFrame);return performance.now()-t});
     await page.evaluate(()=>go('home'));await settle(page,'home');
     const history=await page.evaluate(async()=>{const t=performance.now();go('history');while(view!=='history'||lexlPendingHome||lexlRestoringNavigation)await new Promise(requestAnimationFrame);return performance.now()-t});
     await page.evaluate(()=>go('home'));await settle(page,'home');
     const start=await page.evaluate(async()=>{const t=performance.now();await start('synthetic-p');if(!state.draft)throw Error('No draft: '+document.getElementById('data-error')?.textContent);return performance.now()-t});
     await settle(page,'workout');
     const saveSet=await page.evaluate(async()=>{const t=performance.now();await upd(0,'weight','25.5');if(state.draft.rows[0].weight!=='25.5')throw Error('Set not saved');return performance.now()-t});
     await page.evaluate(()=>cancelWorkout());await settle(page,'home');
     if(i)samples.push({startup,nav,history,start,saveSet});
    }
    const rawBytes=Buffer.byteLength(JSON.stringify(data));
    const nativeBytes=version!=='0.11.14'?await page.evaluate(async()=>new TextEncoder().encode(await lexlStore.readPrimaryRaw()).byteLength):await page.evaluate(()=>new TextEncoder().encode(localStorage.getItem('min-traning-v1')).byteLength);
    const summary={};for(const metric of ['startup','nav','history','start','saveSet']){const values=samples.map(s=>s[metric]).sort((a,b)=>a-b);summary[metric]={median:values[3],min:values[0],max:values[6]}}
    const record={version,count,rows:count*12,rawBytes,nativeBytes,migrationMs,samples,summary,errors};results.push(record);await fs.writeFile(OUT+'/performance.json',JSON.stringify({environment:{browser:await browser.version(),node:process.version,viewport:'390x844',timezone:'Europe/Stockholm',serviceWorker:'blocked',repetitions:7,warmup:1},results},null,2));
    console.log(JSON.stringify({version,count,summary,migrationMs,errors}));await context.close();
   }
  }
 }finally{await browser.close();for(const s of servers)await new Promise(r=>s.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
