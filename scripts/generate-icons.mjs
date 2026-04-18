import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9); // RGBA

  // Draw a simple clapperboard-style icon: indigo bg + white film strip
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = size / 2, cy = size / 2, r = size * 0.45;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > r) {
        // Transparent outside circle
        pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0;
      } else {
        // Indigo background
        const inner = dist < r * 0.85;
        pixels[i]   = inner ? 79  : 99;
        pixels[i+1] = inner ? 70  : 102;
        pixels[i+2] = inner ? 229 : 241;
        pixels[i+3] = 255;
        // White circle center
        if (dist < r * 0.35) {
          pixels[i] = 255; pixels[i+1] = 255; pixels[i+2] = 255; pixels[i+3] = 230;
        }
      }
    }
  }

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0])); // filter none
    rows.push(pixels.slice(y * size * 4, (y + 1) * size * 4));
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon-192.png', createPNG(192));
writeFileSync('public/icon-512.png', createPNG(512));
console.log('Icons generated: public/icon-192.png and public/icon-512.png');
