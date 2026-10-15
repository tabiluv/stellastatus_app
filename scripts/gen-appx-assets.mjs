// Microsoft Store(MSIX/appx) 타일 아이콘 생성 — 의존성 없음.
//  gen-icon.mjs 와 같은 방식으로, 벨 로고(src/renderer/assets/logo.png)를
//  다크 타일 위에 합성해 electron-builder 가 요구하는 appx 에셋들을 build/appx/ 에 만든다.
//  (파일명이 electron-builder 규약과 정확히 일치해야 기본 일렉트론 로고 대신 이걸 쓴다.)
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'appx');
const SRC = join(ROOT, 'src', 'renderer', 'assets', 'logo.png');
mkdirSync(OUT, { recursive: true });

const BG = [42, 33, 46]; // #2a212e — 타일 배경(앱 아이콘과 동일)

// ── PNG 디코더(8bit, colorType 0/2/6) ─────────
function decodePNG(buf) {
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bd: data[8], ct: data[9] };
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { w, h, ct } = ihdr;
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ch === 4) { out[o] = cur[x*4]; out[o+1] = cur[x*4+1]; out[o+2] = cur[x*4+2]; out[o+3] = cur[x*4+3]; }
      else if (ch === 3) { out[o] = cur[x*3]; out[o+1] = cur[x*3+1]; out[o+2] = cur[x*3+2]; out[o+3] = 255; }
      else { out[o] = out[o+1] = out[o+2] = cur[x]; out[o+3] = 255; }
    }
    prev = cur;
  }
  return { w, h, data: out };
}

function sampleBilinear(img, sx, sy) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, img.w - 1), y1 = Math.min(y0 + 1, img.h - 1);
  const fx = sx - x0, fy = sy - y0;
  const px = (x, y) => { const o = (y * img.w + x) * 4; return [img.data[o], img.data[o+1], img.data[o+2], img.data[o+3]]; };
  const a = px(Math.max(0,x0), Math.max(0,y0)), b = px(x1, Math.max(0,y0));
  const c = px(Math.max(0,x0), y1), d = px(x1, y1);
  const lerp = (p, q, t) => p + (q - p) * t;
  const out = [];
  for (let i = 0; i < 4; i++) out[i] = lerp(lerp(a[i], b[i], fx), lerp(c[i], d[i], fx), fy);
  return out;
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// ── 타일 렌더: 불투명 다크 배경(모서리 각짐 — Windows 타일 규격) + 중앙 벨 ──
function renderTile(w, h, bell, bellFrac) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i*4] = BG[0]; buf[i*4+1] = BG[1]; buf[i*4+2] = BG[2]; buf[i*4+3] = 255; }
  const targetH = Math.round(Math.min(w, h) * bellFrac);
  const scale = targetH / bell.h;
  const dw = Math.round(bell.w * scale), dh = targetH;
  const ox = Math.round((w - dw) / 2), oy = Math.round((h - dh) / 2);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const [r, g, b, a] = sampleBilinear(bell, x / scale, y / scale);
      if (a <= 1) continue;
      const dx = ox + x, dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const o = (dy * w + dx) * 4;
      const af = a / 255;
      buf[o]   = clamp(buf[o]   * (1 - af) + r * af);
      buf[o+1] = clamp(buf[o+1] * (1 - af) + g * af);
      buf[o+2] = clamp(buf[o+2] * (1 - af) + b * af);
      buf[o+3] = 255;
    }
  }
  return buf;
}

// ── PNG 인코더(임의 w×h) ───────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── 실행 ─────────────────────────────────────
// electron-builder appx 규약 파일명. 정사각 타일은 벨을 꽉 차지 않게(여백) 둔다.
const TILES = [
  ['StoreLogo.png',         50,  50,  0.62],
  ['Square44x44Logo.png',   44,  44,  0.64],
  ['Square71x71Logo.png',   71,  71,  0.60],
  ['Square150x150Logo.png', 150, 150, 0.58],
  ['Square310x310Logo.png', 310, 310, 0.56],
  ['Wide310x150Logo.png',   310, 150, 0.62],
  ['SplashScreen.png',      620, 300, 0.55],
];

const bell = decodePNG(readFileSync(SRC));
for (const [name, w, h, frac] of TILES) {
  writeFileSync(join(OUT, name), encodePNG(renderTile(w, h, bell, frac), w, h));
}
console.log('생성 완료: build/appx/ — ' + TILES.map((t) => t[0]).join(', '));
