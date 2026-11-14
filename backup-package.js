/* Bounded, uncompressed ZIP transport for the rollback manifest and JSON files.
 * No executable content, external libraries, arbitrary paths or ZIP64/compression.
 */
(function(root){
 'use strict';
 const MAX=128*1024*1024,MAX_FILES=9;
 const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
 const fail=m=>{throw Error(m)};
 const nameOK=n=>typeof n==='string'&&/^[a-z0-9][a-z0-9.-]{0,90}$/.test(n)&&!n.includes('..');
 const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
 function encode(bundle){
  if(!bundle||typeof bundle.manifestText!=='string'||!bundle.files)fail('Ogiltigt återgångspaket.');
  const entries=Object.entries({ ...bundle.files,'manifest.json':bundle.manifestText });
  if(Object.prototype.hasOwnProperty.call(bundle.files,'manifest.json')||entries.length>MAX_FILES)fail('Ogiltig fillista.');
  let length=22;
  const files=entries.map(([name,text])=>{
   if(!nameOK(name)||typeof text!=='string')fail('Ogiltig fil i paketet.');
   const n=encoder.encode(name),data=encoder.encode(text);if(decoder.decode(data)!==text)fail('Texten kan inte exporteras förlustfritt som UTF-8.');
   length+=30+n.length+data.length+46+n.length;
   if(length>MAX)fail('Återgångspaketet är för stort. Inga data har ändrats.');
   return {n,data,crc:crc(data),offset:0};
  });
  const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);let pos=0;
  const u16=(at,v)=>view.setUint16(at,v,true),u32=(at,v)=>view.setUint32(at,v,true);
  for(const f of files){
   f.offset=pos;u32(pos,0x04034b50);u16(pos+4,20);u16(pos+6,0x800);u16(pos+8,0);u16(pos+12,0x21);u32(pos+14,f.crc);u32(pos+18,f.data.length);u32(pos+22,f.data.length);u16(pos+26,f.n.length);
   bytes.set(f.n,pos+30);bytes.set(f.data,pos+30+f.n.length);pos+=30+f.n.length+f.data.length;
  }
  const central=pos;
  for(const f of files){
   u32(pos,0x02014b50);u16(pos+4,20);u16(pos+6,20);u16(pos+8,0x800);u16(pos+10,0);u16(pos+14,0x21);u32(pos+16,f.crc);u32(pos+20,f.data.length);u32(pos+24,f.data.length);u16(pos+28,f.n.length);u32(pos+42,f.offset);bytes.set(f.n,pos+46);pos+=46+f.n.length;
  }
  u32(pos,0x06054b50);u16(pos+8,files.length);u16(pos+10,files.length);u32(pos+12,pos-central);u32(pos+16,central);
  return bytes;
 }
 function decode(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<22||bytes.length>MAX)fail('Ogiltig paketstorlek.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
  const u16=at=>view.getUint16(at,true),u32=at=>view.getUint32(at,true);
  if(u32(end)!==0x06054b50||u16(end+4)||u16(end+6)||u16(end+20))fail('Paketets slutpost är ogiltig.');
  const count=u16(end+10),central=u32(end+16),size=u32(end+12);
  if(!count||count>MAX_FILES||count!==u16(end+8)||central+size!==end)fail('Paketets fillista är ogiltig.');
  let pos=central,localEnd=0;const files=Object.create(null);
  for(let i=0;i<count;i++){
   if(pos+46>end||u32(pos)!==0x02014b50)fail('Skadad fillista.');
   const flags=u16(pos+8),method=u16(pos+10),checksum=u32(pos+16),length=u32(pos+24),nameLength=u16(pos+28),offset=u32(pos+42);
   if(flags!==0x800||method!==0||u32(pos+20)!==length||u16(pos+30)||u16(pos+32)||u16(pos+34)||pos+46+nameLength>end)fail('Paketet innehåller en filtyp som inte stöds.');
   const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLength));
   if(!nameOK(name)||Object.prototype.hasOwnProperty.call(files,name)||offset!==localEnd||offset+30>central||u32(offset)!==0x04034b50)fail('Ogiltigt eller dubbelt filnamn.');
   if(u16(offset+6)!==flags||u16(offset+8)!==method||u32(offset+14)!==checksum||u32(offset+18)!==length||u32(offset+22)!==length||u16(offset+26)!==nameLength||u16(offset+28))fail('Filhuvudet stämmer inte med manifestet.');
   const start=offset+30+nameLength,stop=start+length;
   if(stop>central||decoder.decode(bytes.subarray(offset+30,start))!==name)fail('Filgränserna är ogiltiga.');
   const data=bytes.subarray(start,stop);if(crc(data)!==checksum)fail('Paketet är skadat: kontrollsumman stämmer inte.');
   files[name]=decoder.decode(data);localEnd=stop;pos+=46+nameLength;
  }
  if(pos!==end||localEnd!==central||typeof files['manifest.json']!=='string')fail('Paketet är ofullständigt.');
  const manifestText=files['manifest.json'];delete files['manifest.json'];
  return {manifestText,files};
 }
 root.LEXLBackupPackage={encode,decode,MAX_BYTES:MAX};
})(globalThis);
