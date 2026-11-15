'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {ORIGIN}=require('./build-etapp3c.cjs');
async function packageBeta(out){
 out=path.resolve(out);const manifest=JSON.parse(await fs.readFile(path.join(out,'release-manifest.json'),'utf8'));
 if(manifest.format!=='lexl-integration-beta-v1'||manifest.origin!==ORIGIN||!manifest.syntheticOnly||manifest.sourceDirty)throw Error('Only a clean, isolated synthetic build may be packaged');
 const names=manifest.files.map(f=>f.path);if(new Set(names).size!==names.length||names.some(n=>n.startsWith('/')||n.includes('..')||n.includes('\\')))throw Error('Unsafe file list');
 const actual=[];for(const name of await fs.readdir(path.join(out,'site'),{recursive:true})){const st=await fs.lstat(path.join(out,'site',name));if(st.isSymbolicLink())throw Error('Symlink');if(st.isFile())actual.push(name)}if(JSON.stringify(actual.sort())!==JSON.stringify([...names].sort()))throw Error('Unlisted files');
 for(const f of manifest.files){const bytes=await fs.readFile(path.join(out,'site',f.path));if(bytes.length!==f.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Checksum mismatch')}
 const archive=path.join(out,'lexl-01115-etapp3c-cloudflare-upload.zip');
 execFileSync('python3',['-c',`import sys,pathlib,json,zipfile,hashlib
root=pathlib.Path(sys.argv[1]); manifest=json.loads((root/'release-manifest.json').read_text()); target=root/'lexl-01115-etapp3c-cloudflare-upload.zip'
with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED) as z:
 for f in manifest['files']:
  data=(root/'site'/f['path']).read_bytes()
  if hashlib.sha256(data).hexdigest()!=f['sha256']: raise ValueError('Changed source')
  z.writestr(f['path'],data)
with zipfile.ZipFile(target) as z:
 if z.testzip(): raise ValueError('Invalid ZIP')
 if sorted(z.namelist())!=sorted(f['path'] for f in manifest['files']): raise ValueError('Wrong entries')
 for f in manifest['files']:
  if hashlib.sha256(z.read(f['path'])).hexdigest()!=f['sha256']: raise ValueError('Invalid bytes')
`,out]);const bytes=await fs.readFile(archive),sha256=crypto.createHash('sha256').update(bytes).digest('hex');await fs.writeFile(archive+'.sha256',sha256+'  '+path.basename(archive)+'\n');return {archive,bytes:bytes.length,sha256};
}
module.exports={packageBeta};if(require.main===module)packageBeta(process.argv[2]).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1});
