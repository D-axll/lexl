'use strict';
// Offline-only build. Never deploys, calls a hosting API, or edits app sources.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fixture=require('../test-build/synthetic-fixture.cjs');
const launchTest=require('../test-build/launcher.cjs');
const startHelp=require('../test-build/start-help.cjs');
const faultHarness=require('../test-build/fault-harness.cjs');
const ROOT=path.resolve(__dirname,'..'),APP='lexl-feltest-01115-2a',NAMESPACE='lexl-test-01115-2a-fault',DB=NAMESPACE+'-training-schema1';
const DEFAULT_ORIGIN='https://lexl-01115-feltest-2a.pages.dev';
const APPROVED_BASE='2b9cbc12e217963635f761618fbb42255433d772';
function once(text,pattern,replacement){let count=0;const result=text.replace(pattern,(...args)=>{count++;return typeof replacement==='function'?replacement(...args):replacement});if(count!==1)throw Error('Build anchor changed: '+pattern+' ('+count+')');return result}
function png(size){
 // New generated TEST icon, no production branding or image edits.
 const zlib=require('node:zlib'),pixels=Buffer.alloc(size*(1+size*4));
 const glyphs={T:['11111','00100','00100','00100','00100','00100','00100'],E:['11111','10000','10000','11110','10000','10000','11111'],S:['11111','10000','10000','11111','00001','00001','11111']};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let dark=x<size*.12||x>=size*.88||y<size*.12||y>=size*.88;const gx=Math.floor((x-size*.18)/(size*.027)),gy=Math.floor((y-size*.39)/(size*.032));if(gy>=0&&gy<7&&gx>=0&&gx<23){const letter='TEST'[Math.floor(gx/6)],column=gx%6;if(column<5&&glyphs[letter]?.[gy]?.[column]==='1')dark=true}const i=y*(1+size*4)+1+x*4;pixels.set(dark?[25,20,12,255]:[255,203,58,255],i)}
 const crc=b=>{let n=0xffffffff;for(const v of b){n^=v;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0};
 const chunk=(type,data)=>{const t=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([head,t,data,tail])};
 const h=Buffer.alloc(13);h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
async function buildTestRelease({out,origin=DEFAULT_ORIGIN}){
 if(origin!==DEFAULT_ORIGIN)throw Error('Only the approved dedicated test origin '+DEFAULT_ORIGIN+' is allowed.');
 out=path.resolve(out);if(out===ROOT||out.startsWith(ROOT+path.sep))throw Error('Output must be outside the repository.');
 try{await fs.access(out);throw Error('Output already exists; choose a new empty release path.')}catch(error){if(error.code!=='ENOENT')throw error}
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 const sourceDirty=!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim();
 for(const name of ['index.html','data-layer.js','storage-session.js','storage-transition.js','backup-package.js','sw.js','manifest.webmanifest']){
  const approved=execFileSync('git',['show',APPROVED_BASE+':'+name],{cwd:ROOT,maxBuffer:8*1024*1024});
  if(!approved.equals(await fs.readFile(path.join(ROOT,name))))throw Error('Godkänd appkälla har ändrats: '+name+'. Feltestbygget stoppas.');
 }
 const build={format:'lexl-static-test-build-v1',name:'LEXL FELTEST – 0.11.15 ETAPP 2A',version:'0.11.15',stage:'2A',approvedBase:APPROVED_BASE,faultTest:true,faultPoint:'after-verified-copy-before-activation',sourceCommit,sourceDirty,origin,scope:'/'+APP+'/',database:DB,legacyKey:NAMESPACE+'-v1',syntheticOnly:true,importEnabled:false};
 const data=fixture(),raw=JSON.stringify(data),files=new Map();
 let html=await fs.readFile(path.join(ROOT,'index.html'),'utf8');
 html=once(html,/^const ORIGINAL=.*$/m,'const ORIGINAL='+JSON.stringify(data.programs)+", PAGES=[], K='"+NAMESPACE+"-v1';");
 html=once(html,/^const EXERCISE_IMAGES=.*$/m,'const EXERCISE_IMAGES={};');
 html=html.replaceAll('min-traning',NAMESPACE).replaceAll('lexl-current-view-095',NAMESPACE+'-view').replaceAll('lexl-stats-prefs',NAMESPACE+'-stats-prefs').replaceAll('lexl-transition-declined-v1',NAMESPACE+'-transition-declined-v1');
 html=once(html,'function lexlApplyWriteGuard(){',startHelp.toString()+'\nfunction lexlApplyWriteGuard(){');
 html=once(html,"document.getElementById('app').inert=lexlMigrationBusy||lexlExportBusy;","document.getElementById('app').inert=lexlMigrationBusy||lexlExportBusy;globalThis.LEXL2AFault?.render();");
 html=once(html,'lexlApplyWriteGuard();lexlRestoreInputs(inputFocus);','lexlApplyWriteGuard();lexlTestStartHelp();globalThis.LEXL2AFault?.render();lexlRestoreInputs(inputFocus);');
 html=html.replaceAll('lexl-current-view-095',NAMESPACE+'-view');
 html=once(html,/<title>.*?<\/title>/,'<title>'+build.name+'</title>');
 html=html.replace('name="theme-color" content="#001c16"','name="theme-color" content="#ffcb3a"');
 html=html.replace('<body>','<body><aside id="lexl-test-banner"><strong>LEXL TEST – 0.11.15</strong><br>Endast syntetiska data · Import avstängd</aside>');
 html=html.replace('>LEXL</button>','>LEXL TEST<small>0.11.15</small></button>').replace('aria-label="LEXL – Till startsidan"','aria-label="LEXL TEST – 0.11.15 – Till startsidan"');
 html=html.replace('</style>','#fault-status{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem}#transition-panel{scroll-margin-top:7rem}#lexl-test-banner{position:sticky;top:0;z-index:2000;background:#7f1d1d;color:#fff;text-align:center;padding:.8rem;font-size:1rem;border-bottom:4px solid #19140c}body.on-home header #lexl-home-link{visibility:visible;pointer-events:auto}header #lexl-home-link{font-size:1rem;color:#ffcb3a!important}#lexl-home-link small{display:block;font-size:.7rem}:root[data-theme=light] #lexl-home-link{color:#6b4200!important}</style>');
 html=html.replaceAll('./logo-dark.png','./test-logo.svg').replaceAll('./logo-light.png','./test-logo.svg').replaceAll('alt="LEXL – EVERY REP COUNTS"','alt="LEXL TEST – 0.11.15"');
 html=once(html,/^function lexlAboutView\(\).*$/m,`function lexlAboutView(){return '<h1>LEXL TEST – 0.11.15</h1><p>Etapp 1B · Endast syntetiska data · Import avstängd</p><p>Testversionen är skild från produktionen. Registrera inte verkliga träningsuppgifter.</p><p>Byggd från commit '+esc(globalThis.LEXL_TEST_BUILD.sourceCommit)+'</p>'}`);
 const settings=`function settingsView(){return \`<h2>LEXL TEST – Inställningar</h2><p>Version 0.11.15 · Endast syntetiska data. Import och inläsning av externa filer är avstängda.</p><div class="card"><label for="theme-choice">Färgtema</label><select id="theme-choice" onchange="setTheme(this.value)"><option value="system" \${themeChoice==='system'?'selected':''}>Följ telefonen</option><option value="light" \${themeChoice==='light'?'selected':''}>Ljust</option><option value="dark" \${themeChoice==='dark'?'selected':''}>Mörkt</option></select></div>\${fontSettings()}<div class="card"><h3>Syntetiska säkerhetskopior</h3>\${button('Exportera TEST-data (JSON)','exportData()')}\${button('Exportera TEST-paket (ZIP)','exportRollbackPackage()')}<p id="rollback-verification" role="status">\${esc(lexlRollbackMessage)}</p><p>Import är avstängd. Importera aldrig TEST-filer i produktionsappen.</p></div>\`}`;
 html=once(html,/^function settingsView\(\).*$/m,settings);
 let a=html.indexOf('async function importData(file){'),b=html.indexOf('\nrender();',a);if(a<0||b<0)throw Error('Import anchor changed');
 html=html.slice(0,a)+"async function importData(){lexlDataError('Import är avstängd i LEXL TEST. Ingen fil har lästs.');return false}\n"+html.slice(b);
 a=html.indexOf('async function verifyRollbackFile(file){');b=html.indexOf('\nlet lexlWriteQueue',a);if(a<0||b<0)throw Error('File verifier anchor changed');
 html=html.slice(0,a)+"async function verifyRollbackFile(){lexlSetRollbackMessage('Inläsning av externa filer är avstängd i LEXL TEST.');return false}\n"+html.slice(b);
 html=html.replaceAll("'lexl-01115-atergang-","'lexl-test-01115-atergang-").replaceAll("'lexl-original-raw.json'","'lexl-test-original-raw.json'");
 html=once(html,/<script src="\.\/data-layer.js">/,'<script src="./test-bootstrap.js"></script><script src="./data-layer.js">');
 html=once(html,/'use strict';/,"'use strict';\nif(!globalThis.LEXL_TEST_ALLOWED)throw Error('LEXL TEST blocked before storage access: wrong origin.');");
 html=html.replace('if("serviceWorker" in navigator &&','if(globalThis.LEXL_TEST_ALLOWED && "serviceWorker" in navigator &&');
 // No input that can read an external file remains in the generated document.
 if(/type=["']file["']/.test(html)||/await file\.(text|arrayBuffer)\(/.test(html))throw Error('External file read survived test build');
 // Keep every application script inert until origin/controller preflight succeeds.
 html=html.replace(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g,(_all,src,body)=>{
  if(body.includes('navigator.serviceWorker.register'))return ''; // launcher owns registration
  return '<script type="application/x-lexl-test"'+(src?' data-src="'+src+'"':'')+'>'+body+'</script>';
 });
 if((html.match(/type="application\/x-lexl-test"/g)||[]).length!==6)throw Error('Unexpected application script layout');
 html=html.replace('</body>','<script>('+launchTest.toString()+')('+JSON.stringify({origin,scope:build.scope,sourceCommit})+');</script></body>');
 html=html.replaceAll('LEXL TEST','LEXL FELTEST 2A').replaceAll('etapp 1B','etapp 2A').replaceAll('Etapp 1B','Etapp 2A').replaceAll('LEX L TEST','LEXL FELTEST 2A');
 files.set(APP+'/index.html',html);
 const boot=`'use strict';
 globalThis.LEXL_TEST_BUILD=Object.freeze(${JSON.stringify(build)});
 globalThis.LEXL_TEST_ALLOWED=false;
 globalThis.LEXL_FAULT_BOOT_READY=(async()=>{
  const cfg=globalThis.LEXL_TEST_BUILD,local=['localhost','127.0.0.1'].includes(location.hostname)&&location.protocol==='http:';
  if(!(location.origin===cfg.origin||local)||!location.pathname.startsWith(cfg.scope))throw Error('Fel adress; ingen lagringsåtkomst tillåts.');
  const key=cfg.legacyKey,marker=key+'-fixture-created',raw=${JSON.stringify(raw)};
  const existing=localStorage.getItem(key),created=localStorage.getItem(marker);
  if(typeof indexedDB?.databases!=='function')throw Error('Säker kontroll av befintlig testdatabas saknas. Originalet lämnas orört.');
  const databases=await indexedDB.databases(),hasDB=databases.some(db=>db.name===cfg.database);
  if(existing===null){
   if(created!==null||hasDB)throw Error('Originalkällan saknas efter tidigare start. Ingen automatisk återställning görs.');
   localStorage.setItem(key,raw);
   if(localStorage.getItem(key)!==raw)throw Error('Den syntetiska första källan kunde inte verifieras.');
   localStorage.setItem(marker,'created-v1');
  }else{
   if(existing!==raw)throw Error('Testoriginalet har ändrats. Stoppa och granska; inget ersätts eller raderas.');
   if(created!=='created-v1')throw Error('Testets ursprungsmarkör saknas. Ingen källa skrivs om.');
  }
  if(localStorage.getItem(marker)!=='created-v1')throw Error('Ursprungsmarkören kunde inte verifieras.');
  globalThis.LEXL_TEST_ALLOWED=true;
  (${faultHarness.toString()})(${JSON.stringify({namespace:NAMESPACE,database:DB})});
 })();
 `;
 files.set(APP+'/test-bootstrap.js',boot);
 for(const name of ['data-layer.js','storage-transition.js','storage-session.js','backup-package.js']){
  let text=await fs.readFile(path.join(ROOT,name),'utf8');text=text.replaceAll('lexl-training-schema1',DB).replaceAll('min-traning',NAMESPACE);
  if(name==='storage-transition.js'){
   text=once(text,"  async function confirm(id, { approved, backupSha256 } = {}) {","  async function confirm(id, { approved, backupSha256 } = {}) {\n   if (!root.LEXL2AFault || root.LEXL_TEST_BUILD?.faultTest !== true) fail('FELTEST: försökets kontroll saknas.');\n   const faultAttempt=root.LEXL2AFault.beginAttempt();");
   const anchor="    const activation = { format: 'lexl-transition-activation-v1'";
   text=once(text,anchor,"    if (!root.LEXL2AFault || root.LEXL_TEST_BUILD?.faultTest !== true || dbName !== "+JSON.stringify(DB)+") fail('FELTEST: säker testkontroll saknas. Ingen aktivering.');\n    await root.LEXL2AFault.afterVerifiedCopy({proposalId:id,copySha256:p.copySha256,revision:1},faultAttempt);\n"+anchor);
  }
  files.set(APP+'/'+name,text);
 }
 let worker=await fs.readFile(path.join(ROOT,'sw.js'),'utf8');worker=worker.replace("'lexl-scope:'","'lexlfault01115-2a-scope:'").replace("'01115-stage1b-v1'","'01115-fault2a-'+"+JSON.stringify(sourceCommit.slice(0,12))+"+'-v1'");
 worker=worker.replace("'./logo-dark.png', './logo-light.png'","'./test-logo.svg', './test-bootstrap.js', './build-info.json'");// Preserve all prior caches. The 0.11.14 worker deletes broad `lexl-` names;
 // our new prefix intentionally does not match that older cleanup rule.
 worker=once(worker,/self\.addEventListener\('activate',[\s\S]*?\n\}\);/,"self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });");
 files.set(APP+'/sw.js',worker);
 files.set(APP+'/manifest.webmanifest',JSON.stringify({id:'/'+APP+'/pwa',name:build.name,short_name:'FELTEST 2A',description:'FELTEST ETAPP 2A – avsiktligt migreringsavbrott. Syntetiska data, import avstängd.',start_url:'/'+APP+'/index.html',scope:'/'+APP+'/',display:'standalone',background_color:'#19140c',theme_color:'#ffcb3a',lang:'sv',version:'0.11.15',icons:[192,512].map(size=>({src:'icon-'+size+'.png',sizes:size+'x'+size,type:'image/png',purpose:'any maskable'}))},null,2)+'\n');
 for(const size of [192,512])files.set(APP+'/icon-'+size+'.png',png(size));
 files.set(APP+'/test-logo.svg','<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><rect width="800" height="240" rx="24" fill="#19140c"/><text x="400" y="115" text-anchor="middle" font-family="sans-serif" font-size="68" font-weight="bold" fill="#ffcb3a">LEXL FELTEST 2A</text><text x="400" y="180" text-anchor="middle" font-family="sans-serif" font-size="36" fill="white">0.11.15 · AVSIKTLIGT MIGRERINGSAVBROTT</text></svg>');
 for(const name of ['program-1.webp','program-2.webp','program-3.webp'])files.set(APP+'/'+name,await fs.readFile(path.join(ROOT,name)));
 files.set(APP+'/build-info.json',JSON.stringify(build,null,2)+'\n');
 files.set('index.html','<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LEXL FELTEST – 0.11.15 ETAPP 2A</title><h1>LEXL FELTEST – 0.11.15 ETAPP 2A</h1><p>Endast syntetiska data. Detta är inte produktionsappen.</p><a href="./'+APP+'/">Öppna testappen</a></html>');
 files.set('_headers',"/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Cache-Control: no-store\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n");
 const hashes=[];
 for(const [name,content]of [...files].sort(([a],[b])=>a.localeCompare(b))){const bytes=Buffer.from(content),target=path.join(out,'site',name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);hashes.push({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}
 const manifest={format:'lexl-static-test-release-v1',...build,publishDirectory:'site',files:hashes};manifest.format='lexl-static-test-release-v1';
 await fs.writeFile(path.join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(out,'SHA256SUMS'),hashes.map(file=>file.sha256+'  '+file.path).join('\n')+'\n');return manifest;
}
module.exports={buildTestRelease,DEFAULT_ORIGIN,APP,DB,NAMESPACE};
if(require.main===module){const args=process.argv.slice(2),get=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]};const out=get('--out');if(!out){console.error('Usage: node scripts/build-test.cjs --out <new-directory-outside-repo> [--origin https://lexl-01115-feltest-2a.pages.dev]');process.exitCode=1}else buildTestRelease({out,origin:get('--origin')}).then(result=>console.log(JSON.stringify({out:path.resolve(out),sourceCommit:result.sourceCommit,sourceDirty:result.sourceDirty,origin:result.origin,files:result.files.length}))).catch(error=>{console.error(error.message);process.exitCode=1})}
