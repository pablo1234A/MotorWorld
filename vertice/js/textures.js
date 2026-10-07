// Texturas procedurales (PBR: color + normal) generadas en tiempo de carga. 100 % originales.
import * as THREE from 'three';
import { mulberry32, nextFrame } from './util.js';

let ANISO = 4;
export function setAniso(a) { ANISO = a; }

// ------------------------------------------------------------ ruido tileable
function lattice(cells, rnd) { const a = new Float32Array(cells * cells); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; }
function fbm(size, baseCells, octaves, persist, seed) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells << o;
    const L = lattice(cells, rnd);
    const k = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * k, iy = Math.floor(fy), ty0 = fy - iy, ty = ty0 * ty0 * (3 - 2 * ty0);
      const y0 = (iy % cells) * cells, y1 = ((iy + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const fx = x * k, ix = Math.floor(fx), tx0 = fx - ix, tx = tx0 * tx0 * (3 - 2 * tx0);
        const x0 = ix % cells, x1 = (ix + 1) % cells;
        const a = L[y0 + x0], b = L[y0 + x1], c = L[y1 + x0], d = L[y1 + x1];
        out[y * size + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp; amp *= persist;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(size, h = size) { const c = document.createElement('canvas'); c.width = size; c.height = h; return c; }

function normalCanvas(height, size, strength) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yr = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (height[yr + xp] - height[yr + xm]) * strength;
      const dy = (height[yp + x] - height[ym + x]) * strength;
      const l = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yr + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function colorCanvas(size, fn) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size); const d = img.data;
  const col = [0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x, y, y * size + x, col);
    const i = (y * size + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ------------------------------------------------------------ materiales base
function genConcrete(S, seed = 1) {
  const n1 = fbm(S, 4, 6, 0.55, seed), n2 = fbm(S, 2, 3, 0.5, seed + 7), n3 = fbm(S, 32, 2, 0.5, seed + 3);
  const h = new Float32Array(S * S);
  const color = colorCanvas(S, (x, y, i, c) => {
    const stain = Math.max(0, n2[i] - 0.55) * 1.6;
    const pit = n3[i] > 0.78 ? -0.18 : 0;
    const v = 0.5 + (n1[i] - 0.5) * 0.45 - stain * 0.35 + pit + (Math.random() - 0.5) * 0.05;
    h[i] = n1[i] * 0.6 + n3[i] * 0.4 + pit;
    c[0] = v * 178; c[1] = v * 176; c[2] = v * 170;
  });
  return { map: tex(color), normalMap: tex(normalCanvas(h, S, S / 64), false) };
}

function genAsphalt(S, seed = 2) {
  const n1 = fbm(S, 4, 5, 0.55, seed), n3 = fbm(S, 2, 3, 0.5, seed + 5);
  const h = new Float32Array(S * S);
  const c0 = colorCanvas(S, (x, y, i, c) => {
    const grain = Math.random();
    const speck = Math.random() < 0.025 ? 0.18 : 0;
    const patch = n3[i] > 0.64 ? -0.035 : 0;
    const v = 0.25 + (n1[i] - 0.5) * 0.07 + (grain - 0.5) * 0.07 + speck + patch;
    h[i] = grain * 0.5 + n1[i] * 0.5;
    c[0] = v * 252; c[1] = v * 252; c[2] = v * 255;
  });
  // grietas
  const ctx = c0.getContext('2d'); const rnd = mulberry32(seed + 99);
  ctx.strokeStyle = 'rgba(10,10,10,0.75)';
  for (let k = 0; k < 6; k++) {
    ctx.lineWidth = 1 + rnd() * S / 400;
    let x = rnd() * S, y = rnd() * S; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 30; s++) { x += (rnd() - 0.5) * S / 18; y += (rnd() - 0.3) * S / 22; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return { map: tex(c0), normalMap: tex(normalCanvas(h, S, S / 160), false) };
}

function genTiles(S, seed = 3) {
  const n1 = fbm(S, 4, 5, 0.5, seed); const rnd = mulberry32(seed);
  const tiles = 4, ts = S / tiles; const tint = []; for (let i = 0; i < tiles * tiles; i++) tint.push(0.9 + rnd() * 0.18);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
    const lx = x - tx * ts, ly = y - ty * ts;
    const grout = lx < ts * 0.04 || ly < ts * 0.04;
    const v = grout ? 0.3 : (0.55 + (n1[i] - 0.5) * 0.25) * tint[ty * tiles + tx];
    h[i] = grout ? 0 : 0.6 + n1[i] * 0.4;
    col[0] = v * 190; col[1] = v * 184; col[2] = v * 176;
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 40), false) };
}

function genBrick(S, seed = 4) {
  const n1 = fbm(S, 8, 4, 0.5, seed); const rnd = mulberry32(seed);
  const rows = 16, bh = S / rows, bw = bh * 2.1;
  const cols = Math.round(S / bw); const bwr = S / cols;
  const tint = []; for (let i = 0; i < rows * (cols + 1); i++) tint.push([0.75 + rnd() * 0.3, rnd()]);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const r = Math.floor(y / bh); const off = (r % 2) * bwr * 0.5;
    const xx = (x + off) % S; const b = Math.floor(xx / bwr);
    const lx = xx - b * bwr, ly = y - r * bh;
    const mortar = lx < bh * 0.12 || ly < bh * 0.12;
    const t = tint[r * (cols + 1) + b];
    if (mortar) { const v = 0.55 + n1[i] * 0.15; col[0] = v * 170; col[1] = v * 165; col[2] = v * 155; h[i] = 0.1; }
    else {
      const v = t[0] * (0.85 + n1[i] * 0.3);
      col[0] = v * (150 + t[1] * 30); col[1] = v * (68 + t[1] * 18); col[2] = v * 52; h[i] = 0.7 + n1[i] * 0.3;
    }
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 36), false) };
}

// Fachada con ventanas: 4 vanos x 4 plantas por tile
function genFacade(S, seed, style) {
  const n1 = fbm(S, 4, 5, 0.55, seed), n2 = fbm(S, 8, 2, 0.5, seed + 2);
  const rnd = mulberry32(seed);
  const bays = 4, floors = 4, bw = S / bays, fh = S / floors;
  const h = new Float32Array(S * S);
  const win = []; for (let i = 0; i < bays * floors; i++) win.push({ broken: rnd() < 0.18, board: rnd() < 0.1, lit: rnd() < 0.08, shade: rnd() });
  const base = style === 0 ? [214, 206, 190] : style === 1 ? [182, 170, 150] : [150, 152, 150];
  const c = colorCanvas(S, (x, y, i, col) => {
    const bx = Math.floor(x / bw), fy = Math.floor(y / fh);
    const lx = (x - bx * bw) / bw, ly = (y - fy * fh) / fh;
    const w = win[fy * bays + bx];
    const inWin = lx > 0.22 && lx < 0.78 && ly > 0.22 && ly < 0.82;
    const frame = lx > 0.19 && lx < 0.81 && ly > 0.19 && ly < 0.85 && !inWin;
    const sill = ly >= 0.85 && ly < 0.9 && lx > 0.15 && lx < 0.85;
    const band = style === 2 && ly > 0.92;
    const streak = Math.max(0, n2[i] - 0.5) * (ly > 0.82 ? 1.4 : 0.6);
    if (inWin) {
      h[i] = 0.0;
      if (w.board) { const v = 0.35 + n1[i] * 0.2 + ((Math.floor(ly * 10) % 2) ? 0.05 : 0); col[0] = v * 160; col[1] = v * 130; col[2] = v * 90; return; }
      const grad = 1 - ly; // reflejo del cielo
      const mull = Math.abs(lx - 0.5) < 0.012 || Math.abs(ly - 0.45) < 0.012;
      if (mull) { col[0] = 40; col[1] = 42; col[2] = 44; h[i] = 0.25; return; }
      if (w.broken && n1[i] > 0.45) { col[0] = 12; col[1] = 12; col[2] = 14; return; }
      const v = 0.12 + grad * 0.22 + w.shade * 0.08;
      if (w.lit) { col[0] = 230; col[1] = 190; col[2] = 120; return; }
      col[0] = v * 150; col[1] = v * 175; col[2] = v * 200;
      return;
    }
    if (frame) { h[i] = 0.35; const v = 0.25 + n1[i] * 0.08; col[0] = v * 255; col[1] = v * 255; col[2] = v * 255; return; }
    if (sill || band) { h[i] = 0.95; const v = 0.75 + n1[i] * 0.2; col[0] = v * 200; col[1] = v * 196; col[2] = v * 188; return; }
    h[i] = 0.6 + n1[i] * 0.25;
    const v = 0.78 + (n1[i] - 0.5) * 0.35 - streak * 0.45;
    col[0] = v * base[0]; col[1] = v * base[1]; col[2] = v * base[2];
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 28), false) };
}

function genCorrugated(S, seed = 6) {
  const n1 = fbm(S, 4, 5, 0.55, seed), n2 = fbm(S, 2, 4, 0.5, seed + 4);
  const ribs = 24; const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const r = Math.sin((x / S) * ribs * Math.PI * 2) * 0.5 + 0.5;
    const rust = Math.max(0, n2[i] - 0.55) * 2.2 + (y / S > 0.85 ? (n1[i] - 0.3) * 0.6 : 0);
    const v = 0.55 + r * 0.15 + (n1[i] - 0.5) * 0.15;
    h[i] = r;
    const rr = Math.min(1, Math.max(0, rust));
    col[0] = (v * 150) * (1 - rr) + rr * 120; col[1] = (v * 160) * (1 - rr) + rr * 62; col[2] = (v * 165) * (1 - rr) + rr * 30;
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 30), false) };
}

function genContainer(S, seed = 7) {
  const n1 = fbm(S, 4, 5, 0.55, seed), n2 = fbm(S, 4, 3, 0.5, seed + 9);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const u = (x / S) * 16; const fr = u - Math.floor(u);
    const rib = fr < 0.5 ? 1 : 0.4;
    const edge = y < S * 0.04 || y > S * 0.96;
    const rust = Math.max(0, n2[i] - 0.6) * 2.5;
    let v = 0.82 + (n1[i] - 0.5) * 0.25 - (y / S) * 0.12;
    if (edge) v *= 0.55;
    h[i] = edge ? 0.2 : rib;
    const rr = Math.min(1, rust);
    col[0] = (v * 235) * (1 - rr) + rr * 110; col[1] = (v * 235) * (1 - rr) + rr * 58; col[2] = (v * 235) * (1 - rr) + rr * 32;
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 30), false) };
}

function genWood(S, seed = 8) {
  const n1 = fbm(S, 4, 4, 0.5, seed); const rnd = mulberry32(seed);
  const planks = 5, pw = S / planks; const tint = []; for (let i = 0; i < planks; i++) tint.push(0.8 + rnd() * 0.35);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const p = Math.floor(y / pw); const ly = (y - p * pw) / pw;
    const gap = ly < 0.04;
    const grain = Math.sin((x / S) * 30 + n1[i] * 14 + p * 3) * 0.5 + 0.5;
    const v = gap ? 0.2 : tint[p] * (0.62 + grain * 0.2 + (n1[i] - 0.5) * 0.2);
    h[i] = gap ? 0 : 0.5 + grain * 0.2;
    col[0] = v * 172; col[1] = v * 128; col[2] = v * 84;
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 40), false) };
}

function genDirt(S, seed = 9) {
  const n1 = fbm(S, 4, 6, 0.55, seed), n2 = fbm(S, 32, 2, 0.5, seed + 1), n3 = fbm(S, 3, 3, 0.5, seed + 2);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const pebble = n2[i] > 0.7 ? 0.15 : 0;
    const green = Math.max(0, n3[i] - 0.58) * 2.5;
    const v = 0.45 + (n1[i] - 0.5) * 0.4 + pebble;
    h[i] = n1[i] * 0.5 + n2[i] * 0.5;
    col[0] = v * (150 - green * 60); col[1] = v * (128 + green * 10); col[2] = v * (98 - green * 30);
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 30), false) };
}

function genGrass(S, seed = 10) {
  const n1 = fbm(S, 4, 6, 0.6, seed), n2 = fbm(S, 64, 1, 0.5, seed + 3);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const v = 0.4 + (n1[i] - 0.5) * 0.4 + (n2[i] - 0.5) * 0.3;
    const dry = Math.max(0, n1[i] - 0.6) * 2;
    h[i] = n2[i];
    col[0] = v * (95 + dry * 70); col[1] = v * (125 + dry * 20); col[2] = v * (60 + dry * 10);
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 30), false) };
}

function genMetal(S, seed = 11) {
  const n1 = fbm(S, 4, 5, 0.5, seed), n2 = fbm(S, 128, 1, 0.5, seed + 1);
  const h = new Float32Array(S * S);
  const c = colorCanvas(S, (x, y, i, col) => {
    const brushed = n2[(y * S + ((x * 7) % S))] * 0.08;
    const v = 0.5 + (n1[i] - 0.5) * 0.2 + brushed;
    h[i] = n1[i] * 0.3;
    col[0] = v * 200; col[1] = v * 202; col[2] = v * 205;
  });
  return { map: tex(c), normalMap: tex(normalCanvas(h, S, S / 80), false) };
}

// ------------------------------------------------------------ camuflajes
const camoCache = new Map();
export function camoTexture(def, size = 256) {
  const key = def.id + size;
  if (camoCache.has(key)) return camoCache.get(key);
  const S = size; const cols = def.colors.map(hexRgb);
  const seed = def.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const n1 = fbm(S, 4, 4, 0.55, seed), n2 = fbm(S, 6, 3, 0.5, seed + 5), n3 = fbm(S, 3, 3, 0.5, seed + 9);
  const rnd = mulberry32(seed);
  const pat = def.pattern;
  const dig = 16; const digLat = []; for (let i = 0; i < dig * dig; i++) digLat.push(rnd());
  const c = colorCanvas(S, (x, y, i, col) => {
    let idx = 0; let shade = 1;
    if (pat === 'plain') { idx = n1[i] > 0.62 ? 1 : 0; shade = 0.92 + n1[i] * 0.16; }
    else if (pat === 'blotch' || pat === 'woodland') {
      const v = n1[i]; const w = n2[i];
      idx = v < 0.42 ? 1 : v < 0.55 ? 0 : 2; if (cols.length > 3 && w > 0.66) idx = 3;
      if (pat === 'woodland' && n3[i] > 0.64) idx = Math.min(cols.length - 1, 3);
    } else if (pat === 'digital') {
      const cx = Math.floor(x / S * dig * 2) % (dig * 2), cy = Math.floor(y / S * dig * 2) % (dig * 2);
      const gi = Math.floor(cy / 2) * dig + Math.floor(cx / 2);
      const v = n1[Math.floor(cy * S / (dig * 2)) * S + Math.floor(cx * S / (dig * 2))] * 0.7 + digLat[gi] * 0.3;
      idx = Math.min(cols.length - 1, Math.floor(v * cols.length * 1.15));
    } else if (pat === 'tiger') {
      const s = Math.sin((y / S) * Math.PI * 10 + n1[i] * 9 + (x / S) * 3);
      idx = s > 0.55 ? 1 : s < -0.7 ? (cols.length > 2 ? 2 : 0) : 0; if (cols.length > 3 && n2[i] > 0.7) idx = 3;
    } else if (pat === 'weave') {
      const a = Math.floor(x / (S / 32)), b = Math.floor(y / (S / 32));
      idx = (a + b) % 2; shade = 0.8 + ((x + y) % 8) / 30;
    } else if (pat === 'metal') {
      idx = n1[i] > 0.6 ? 1 : n1[i] < 0.35 ? 2 : 0; shade = 0.9 + n2[i] * 0.25;
    }
    const cc = cols[Math.min(idx, cols.length - 1)];
    const g = shade * (0.94 + Math.random() * 0.06);
    col[0] = Math.min(255, cc[0] * g); col[1] = Math.min(255, cc[1] * g); col[2] = Math.min(255, cc[2] * g);
  });
  const t = tex(c);
  camoCache.set(key, t);
  return t;
}

// ------------------------------------------------------------ sprites
function radial(size, stops) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); return c;
}
function genSmokeSprite(size = 128) {
  const n = fbm(size, 4, 4, 0.55, 77);
  const c = canvas(size); const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + n[y * size + x] * 0.9);
    const i = (y * size + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
  }
  ctx.putImageData(img, 0, 0); return c;
}
function genFlash(size = 128) {
  const c = canvas(size); const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
  g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.15, 'rgba(255,210,120,0.95)'); g.addColorStop(0.45, 'rgba(255,140,40,0.35)'); g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  for (let k = 0; k < 6; k++) {
    ctx.save(); ctx.rotate((k / 6) * Math.PI * 2 + Math.random() * 0.3);
    ctx.beginPath(); ctx.moveTo(0, -size * 0.05); ctx.lineTo(size * (0.35 + Math.random() * 0.15), 0); ctx.lineTo(0, size * 0.05); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2); ctx.fill();
  return c;
}
function genDecal(size, kind) {
  const c = canvas(size); const ctx = c.getContext('2d');
  if (kind === 'hole') {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(5,5,5,1)'); g.addColorStop(0.18, 'rgba(15,14,12,0.95)'); g.addColorStop(0.3, 'rgba(60,58,55,0.6)'); g.addColorStop(0.55, 'rgba(90,88,82,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const a = Math.random() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(size / 2, size / 2); ctx.lineTo(size / 2 + Math.cos(a) * size * 0.42, size / 2 + Math.sin(a) * size * 0.42); ctx.stroke(); }
  } else {
    const n = fbm(size, 4, 4, 0.55, 31); const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2), dy = (y - size / 2) / (size / 2); const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.max(0, 1 - r * (0.8 + n[y * size + x] * 0.5)) * 0.9;
      const i = (y * size + x) * 4; img.data[i] = 12; img.data[i + 1] = 10; img.data[i + 2] = 8; img.data[i + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

export function textSign(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#1f3b2c'; ctx.fillRect(0, 0, w, h);
  if (opts.border !== false) { ctx.strokeStyle = opts.fg || '#f1efe6'; ctx.lineWidth = h * 0.05; ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16); }
  ctx.fillStyle = opts.fg || '#f1efe6';
  ctx.font = `700 ${Math.floor(h * (opts.size || 0.5))}px ${opts.font || 'Rajdhani, Arial Narrow, sans-serif'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.9);
  // desgaste
  for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  const t = tex(c, true, false); return t;
}

// ------------------------------------------------------------ construcción global
let cache = null;
export async function buildTextures(size, progress) {
  if (cache && cache.size === size) return cache.T;
  const S = size; const T = {};
  const jobs = [
    ['concrete', () => genConcrete(S)], ['asphalt', () => genAsphalt(S)], ['tiles', () => genTiles(S)],
    ['brick', () => genBrick(S)], ['facadeA', () => genFacade(S, 21, 0)], ['facadeB', () => genFacade(S, 33, 1)],
    ['facadeC', () => genFacade(S, 45, 2)], ['corrugated', () => genCorrugated(S)], ['container', () => genContainer(S)],
    ['wood', () => genWood(Math.min(S, 512))], ['dirt', () => genDirt(S)], ['grass', () => genGrass(Math.min(S, 512))],
    ['metal', () => genMetal(Math.min(S, 512))],
  ];
  let i = 0;
  for (const [k, fn] of jobs) {
    T[k] = fn(); i++;
    if (progress) progress(i / (jobs.length + 1));
    await nextFrame();
  }
  T.smoke = tex(genSmokeSprite(128), true, false);
  T.flash = tex(genFlash(128), true, false);
  T.glow = tex(radial(64, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]), true, false);
  T.fire = tex(radial(64, [[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,170,60,0.9)'], [0.6, 'rgba(220,70,10,0.35)'], [1, 'rgba(120,20,0,0)']]), true, false);
  T.hole = tex(genDecal(64, 'hole'), true, false);
  T.scorch = tex(genDecal(128, 'scorch'), true, false);
  if (progress) progress(1);
  cache = { size, T };
  return T;
}
