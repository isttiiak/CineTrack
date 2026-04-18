import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function encodePNG(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * 4 + 1) + 1 + x * 4;
      raw[dst] = pixels[src]; raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2]; raw[dst+3] = pixels[src+3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function makeCanvas(size) {
  return new Uint8Array(size * size * 4);
}

function sp(px, x, y, size, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  if (a >= 255) {
    px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=255;
  } else {
    const fa = a/255, ea = px[i+3]/255, oa = fa + ea*(1-fa);
    if (oa > 0) {
      px[i]   = Math.round((r*fa + px[i]  *ea*(1-fa))/oa);
      px[i+1] = Math.round((g*fa + px[i+1]*ea*(1-fa))/oa);
      px[i+2] = Math.round((b*fa + px[i+2]*ea*(1-fa))/oa);
      px[i+3] = Math.round(oa*255);
    }
  }
}

function fillRR(px, size, s, x1,y1,x2,y2, rx, r,g,b, a=255) {
  const [px1,py1,px2,py2,pr] = [x1,y1,x2,y2,rx].map(v=>Math.round(v*s));
  for (let y=py1;y<=py2;y++) for (let x=px1;x<=px2;x++) {
    let skip=false;
    if(x<px1+pr&&y<py1+pr&&(px1+pr-x)**2+(py1+pr-y)**2>pr**2)skip=true;
    if(x>px2-pr&&y<py1+pr&&(x-px2+pr)**2+(py1+pr-y)**2>pr**2)skip=true;
    if(x<px1+pr&&y>py2-pr&&(px1+pr-x)**2+(y-py2+pr)**2>pr**2)skip=true;
    if(x>px2-pr&&y>py2-pr&&(x-px2+pr)**2+(y-py2+pr)**2>pr**2)skip=true;
    if(!skip) sp(px,x,y,size,r,g,b,a);
  }
}

function fillCircle(px, size, s, cx,cy,radius, r,g,b, a=255) {
  const [pcx,pcy,pr] = [cx*s, cy*s, radius*s];
  for (let y=Math.round(pcy-pr);y<=Math.round(pcy+pr);y++)
    for (let x=Math.round(pcx-pr);x<=Math.round(pcx+pr);x++)
      if ((x-pcx)**2+(y-pcy)**2<=pr**2) sp(px,x,y,size,r,g,b,a);
}

function fillTri(px, size, s, x1,y1,x2,y2,x3,y3, r,g,b,a=255) {
  [x1,y1,x2,y2,x3,y3]=[x1*s,y1*s,x2*s,y2*s,x3*s,y3*s];
  const [mnX,mxX]=[Math.floor(Math.min(x1,x2,x3)),Math.ceil(Math.max(x1,x2,x3))];
  const [mnY,mxY]=[Math.floor(Math.min(y1,y2,y3)),Math.ceil(Math.max(y1,y2,y3))];
  const sgn=(px,py,ax,ay,bx,by)=>(px-bx)*(ay-by)-(ax-bx)*(py-by);
  for (let y=mnY;y<=mxY;y++) for (let x=mnX;x<=mxX;x++) {
    const d1=sgn(x,y,x1,y1,x2,y2),d2=sgn(x,y,x2,y2,x3,y3),d3=sgn(x,y,x3,y3,x1,y1);
    if (!((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))) sp(px,x,y,size,r,g,b,a);
  }
}

// ── Draw clapperboard icon ────────────────────────────────────────────────────

function generateIcon(size) {
  const pixels = makeCanvas(size);
  const s = size / 100; // design space is 0-100

  // 1. Background dark rounded square
  fillRR(pixels, size, s, 0,0,99,99, 22, 7,7,15);

  // Top-left purple tint
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const i=(y*size+x)*4;
    if (!pixels[i+3]) continue;
    const d=Math.sqrt((x/size)**2+(y/size)**2);
    if (d<0.65) {
      const t=Math.max(0,(0.65-d)/0.65)*0.45;
      pixels[i]  =Math.min(255,pixels[i]  +Math.round(t*28));
      pixels[i+2]=Math.min(255,pixels[i+2]+Math.round(t*65));
    }
  }

  // 2. Clapperboard body (#0f172a)
  fillRR(pixels,size,s, 14,44, 86,86, 5, 15,23,42);

  // Body border lines (indigo, low opacity)
  const [bx1,by1,bx2,by2]=[14,44,86,86].map(v=>Math.round(v*s));
  for (let x=bx1;x<=bx2;x++) { sp(pixels,x,by1,size,129,140,248,50); sp(pixels,x,by2,size,129,140,248,50); }
  for (let y=by1;y<=by2;y++) { sp(pixels,bx1,y,size,129,140,248,50); sp(pixels,bx2,y,size,129,140,248,50); }

  // 3. Clapper top bar with horizontal gradient (#818cf8 → #4f46e5)
  fillRR(pixels,size,s, 14,17, 86,43, 5, 99,102,241);
  const [cy1,cy2,cx1,cx2]=[17,43,14,86].map(v=>Math.round(v*s));
  for (let y=cy1;y<=cy2;y++) for (let x=cx1;x<=cx2;x++) {
    const i=(y*size+x)*4;
    if (!pixels[i+3]) continue;
    const t=(x-cx1)/(cx2-cx1);
    pixels[i]  =Math.round(129+(79-129)*t);
    pixels[i+1]=Math.round(140+(70-140)*t);
    pixels[i+2]=Math.round(248+(229-248)*t);
    pixels[i+3]=255;
  }

  // 4. Diagonal stripes on clapper bar
  const sw=Math.round(12*s);
  for (let y=cy1;y<=cy2;y++) for (let x=cx1;x<=cx2;x++)
    if (Math.floor((x+y)/sw)%2===0) sp(pixels,x,y,size,30,27,75,75);

  // 5. Hinge pins
  fillCircle(pixels,size,s, 23,44, 5,   7,7,15);
  fillCircle(pixels,size,s, 23,44, 2.4, 129,140,248,145);
  fillCircle(pixels,size,s, 77,44, 5,   7,7,15);
  fillCircle(pixels,size,s, 77,44, 2.4, 129,140,248,145);

  // 6. Sprocket holes in body corners
  for (const [hx,hy] of [[17,49],[17,72],[77,49],[77,72]])
    fillRR(pixels,size,s, hx,hy, hx+6,hy+6, 1.5, 129,140,248,42);

  // 7. Play triangle (indigo)
  fillTri(pixels,size,s, 37,52, 37,74, 63,63, 129,140,248,250);

  return pixels;
}

// ── Generate & write ──────────────────────────────────────────────────────────
for (const size of [192, 512]) {
  const pixels = generateIcon(size);
  const png = encodePNG(pixels, size);
  writeFileSync(`public/icon-${size}.png`, png);
  console.log(`✓ public/icon-${size}.png  (${(png.length/1024).toFixed(1)} KB)`);
}
