'use strict';
function png(size){
 // New generated TEST icon, no production branding or image edits.
 const zlib=require('node:zlib'),pixels=Buffer.alloc(size*(1+size*4));
 const glyphs={T:['11111','00100','00100','00100','00100','00100','00100'],E:['11111','10000','10000','11110','10000','10000','11111'],S:['11111','10000','10000','11111','00001','00001','11111']};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let dark=x<size*.12||x>=size*.88||y<size*.12||y>=size*.88;const gx=Math.floor((x-size*.18)/(size*.027)),gy=Math.floor((y-size*.39)/(size*.032));if(gy>=0&&gy<7&&gx>=0&&gx<23){const letter='TEST'[Math.floor(gx/6)],column=gx%6;if(column<5&&glyphs[letter]?.[gy]?.[column]==='1')dark=true}const i=y*(1+size*4)+1+x*4;pixels.set(dark?[25,20,12,255]:[255,203,58,255],i)}
 const crc=b=>{let n=0xffffffff;for(const v of b){n^=v;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0};
 const chunk=(type,data)=>{const t=Buffer.from(type),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([head,t,data,tail])};
 const h=Buffer.alloc(13);h.writeUInt32BE(size,0);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

module.exports=png;
