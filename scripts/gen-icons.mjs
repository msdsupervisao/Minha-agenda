// Gera ícones PNG do PWA sem dependências (encoder PNG próprio).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filtro none
    rgba.subarray(y * width * 4, (y + 1) * width * 4).copy(raw, y * (1 + width * 4) + 1);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

function render(size, { coreRatio, ringRatio }) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const rc = size * coreRatio;
  const rr = size * ringRatio;
  const thickness = size * 0.02;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c + 0.5, dy = y - c + 0.5;
      const d = Math.hypot(dx, dy);
      // fundo com leve gradiente radial
      const t = clamp(d / (size * 0.62), 0, 1);
      let r = lerp(13, 2, t), g = lerp(45, 6, t), b = lerp(62, 8, t);
      // brilho azul
      const gl = clamp(1 - d / (size * 0.44), 0, 1) ** 2 * 0.75;
      r = lerp(r, 10, gl); g = lerp(g, 120, gl); b = lerp(b, 190, gl);
      // anel metálico
      const ringA = 1 - smooth(thickness * 0.5, thickness * 0.5 + 1.5, Math.abs(d - rr));
      r = lerp(r, 150, ringA); g = lerp(g, 160, ringA); b = lerp(b, 172, ringA);
      // núcleo azul com destaque
      const coreA = 1 - smooth(rc - 1.5, rc + 1.5, d);
      const shade = clamp(d / rc, 0, 1);
      const cr = lerp(150, 8, shade), cg = lerp(220, 121, shade), cb = lerp(255, 181, shade);
      r = lerp(r, cr, coreA); g = lerp(g, cg, coreA); b = lerp(b, cb, coreA);
      const i = (y * size + x) * 4;
      buf[i] = clamp(Math.round(r), 0, 255);
      buf[i + 1] = clamp(Math.round(g), 0, 255);
      buf[i + 2] = clamp(Math.round(b), 0, 255);
      buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

const any = { coreRatio: 0.24, ringRatio: 0.40 };
const maskable = { coreRatio: 0.20, ringRatio: 0.34 };

writeFileSync('public/icon-192.png', render(192, any));
writeFileSync('public/icon-512.png', render(512, any));
writeFileSync('public/icon-512-maskable.png', render(512, maskable));
writeFileSync('public/apple-touch-icon.png', render(180, any));
console.log('ícones gerados: 192, 512, 512-maskable, apple-touch (180)');
