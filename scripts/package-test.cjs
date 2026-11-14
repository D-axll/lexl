'use strict';
// Package only the manifest-verified website contents, never the parent folder.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
async function packageTestRelease(out){
 out=path.resolve(out);const site=path.join(out,'site'),manifest=JSON.parse(await fs.readFile(path.join(out,'release-manifest.json'),'utf8'));
 if(manifest.format!=='lexl-static-test-release-v1'||manifest.origin!=='https://lexl-01115-feltest-2a.pages.dev')throw Error('Unexpected test release/origin');
 const names=manifest.files.map(f=>f.path);
 if(new Set(names).size!==names.length||names.some(n=>!n||n.startsWith('/')||n.includes('..')||n.includes('\\')))throw Error('Unsafe file list');
 const actual=[];for(const name of await fs.readdir(site,{recursive:true})){const info=await fs.lstat(path.join(site,name));if(info.isSymbolicLink())throw Error('Symlinks are not allowed');if(info.isFile())actual.push(name)}
 if(JSON.stringify(actual.sort())!==JSON.stringify([...names].sort()))throw Error('Website contains missing or unlisted files');
 for(const file of manifest.files){const bytes=await fs.readFile(path.join(site,file.path));if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Checksum mismatch: '+file.path)}
 const archive=path.join(out,'lexl-feltest-01115-2a-upload.zip');
 const result=JSON.parse(execFileSync('python3',['-c',`
import sys,json,pathlib,zipfile,hashlib,os
root=pathlib.Path(sys.argv[1]); manifest=json.loads((root/'release-manifest.json').read_text()); target=root/'lexl-feltest-01115-2a-upload.zip'; scratch=root/'lexl-feltest-01115-2a-upload.zip.tmp'
if target.exists(): raise FileExistsError('Archive already exists')
created=False
try:
 with zipfile.ZipFile(scratch,'x',compression=zipfile.ZIP_DEFLATED) as z:
  created=True
  for entry in sorted(manifest['files'],key=lambda f:f['path']):
   name=entry['path']; data=(root/'site'/name).read_bytes()
   if hashlib.sha256(data).hexdigest()!=entry['sha256']: raise ValueError('File changed during packaging')
   item=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0)); item.compress_type=zipfile.ZIP_DEFLATED; item.external_attr=0o100644<<16; z.writestr(item,data)
 with zipfile.ZipFile(scratch) as z:
  if z.testzip() is not None: raise ValueError('CRC verification failed')
  if sorted(z.namelist())!=sorted(f['path'] for f in manifest['files']): raise ValueError('Unexpected ZIP structure')
  for entry in manifest['files']:
   if hashlib.sha256(z.read(entry['path'])).hexdigest()!=entry['sha256']: raise ValueError('ZIP content verification failed')
 os.link(scratch,target) # Publish a complete verified archive without overwriting.
finally:
 if created: scratch.unlink(missing_ok=True)
print(json.dumps({'file':target.name,'files':len(manifest['files']),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
`,out],{encoding:'utf8'}));
 await fs.writeFile(archive+'.sha256',result.sha256+'  '+path.basename(archive)+'\n');await fs.writeFile(path.join(out,'archive-info.json'),JSON.stringify(result,null,2)+'\n');return result;
}
module.exports={packageTestRelease};
if(require.main===module)packageTestRelease(process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1});
