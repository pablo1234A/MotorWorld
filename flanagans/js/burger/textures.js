// Procedural food textures, painted once into canvases and cached.
// Every texture is generated from noise so there are no image downloads
// and the burger still looks organic up close.
import * as THREE from 'three';
import { fbm2, noise3, rng } from './noise.js';

const cache = new Map();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function paint(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out);
      const i = (y * size + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(canvas, color = true, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---------------------------------------------------------------- bun crust
// Lathe UVs: u wraps around, v runs from the rim (0) to the crown (1).
export function bunCrust() {
  return cached('bunCrust', () => {
    const rim = hex(0xdcaa62), shoulder = hex(0x9a4712), crown = hex(0x652607), burnt = hex(0x3a1303);
    const map = paint(512, (u, vv, o) => {
      const v = 1 - vv; // canvas top row is v = 1
      const n = fbm2(u * 9, v * 6, 4, 1);
      const fine = fbm2(u * 60, v * 40, 2, 2);
      let c = mixRGB(rim, shoulder, smooth(0.0, 0.2, v + n * 0.05));
      c = mixRGB(c, crown, smooth(0.18, 0.75, v + n * 0.14));
      c = mixRGB(c, burnt, smooth(0.15, 0.7, n) * 0.4 * smooth(0.25, 0.9, v));
      const k = 1 + fine * 0.07;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    });
    const bump = paint(256, (u, v, o) => {
      const b = 128 + fbm2(u * 40, v * 30, 3, 3) * 60;
      o[0] = o[1] = o[2] = b;
    });
    return { map: toTexture(map), bump: toTexture(bump, false) };
  });
}

// ---------------------------------------------------------------- crumb
export function crumb() {
  return cached('crumb', () => {
    const base = hex(0xf2dcb0), shade = hex(0xc99a5e), toast = hex(0xb47a3c);
    const map = paint(512, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const pores = fbm2(u * 70, v * 70, 3, 5);
      const large = fbm2(u * 8, v * 8, 3, 6);
      let c = mixRGB(base, shade, smooth(0.15, 0.55, pores) * 0.55);
      c = mixRGB(c, toast, smooth(0.78, 1.0, r + large * 0.08) * 0.85);
      const k = 0.96 + large * 0.08;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    });
    const bump = paint(256, (u, v, o) => {
      const p = fbm2(u * 70, v * 70, 3, 5);
      o[0] = o[1] = o[2] = 150 - smooth(0.1, 0.5, p) * 110;
    });
    return { map: toTexture(map), bump: toTexture(bump, false) };
  });
}

// ---------------------------------------------------------------- meat
export function meat(kind = 'beef') {
  return cached('meat:' + kind, () => {
    const palettes = {
      beef: [0x5a2d17, 0x2a1209, 0x8b4a25, 0x140804],
      smash: [0x4d250f, 0x1f0c05, 0x93501f, 0x0d0603],
      plant: [0x6a3220, 0x351409, 0x8f4b2c, 0x1e0b05],
      chicken: [0xc8822f, 0x8a4c15, 0xe5ad55, 0x5c2e0c],
    };
    const [baseH, darkH, lightH, charH] = palettes[kind] || palettes.beef;
    const base = hex(baseH), dark = hex(darkH), light = hex(lightH), char = hex(charH);
    const seed = kind.length;
    const map = paint(512, (u, v, o) => {
      const n = fbm2(u * 14, v * 14, 4, seed);
      const grain = fbm2(u * 90, v * 90, 2, seed + 2);
      const sear = fbm2(u * 4, v * 4, 3, seed + 4);
      let c = mixRGB(base, dark, smooth(-0.1, 0.4, n));
      c = mixRGB(c, light, smooth(0.25, 0.6, grain) * 0.5);
      c = mixRGB(c, char, smooth(0.05, 0.45, sear) * (kind === 'chicken' ? 0.25 : 0.65));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
    const bump = paint(256, (u, v, o) => {
      const b = 128 + fbm2(u * 50, v * 50, 3, seed + 7) * 120 + fbm2(u * 12, v * 12, 2, seed) * 40;
      o[0] = o[1] = o[2] = b;
    });
    return { map: toTexture(map), bump: toTexture(bump, false) };
  });
}

// ---------------------------------------------------------------- cheese
export function cheese(kind = 'cheddar') {
  return cached('cheese:' + kind, () => {
    const cols = {
      cheddar: [0xf3a321, 0xe0861a],
      goat: [0xf4efe4, 0xd9cfbd],
    }[kind];
    const a = hex(cols[0]), b = hex(cols[1]);
    const brown = hex(0xb36a2a);
    const map = paint(256, (u, v, o) => {
      const n = fbm2(u * 6, v * 6, 3, 9);
      let c = mixRGB(a, b, smooth(-0.2, 0.5, n));
      if (kind === 'goat') c = mixRGB(c, brown, smooth(0.25, 0.55, fbm2(u * 9, v * 9, 3, 12)) * 0.55);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
    const bump = paint(128, (u, v, o) => {
      o[0] = o[1] = o[2] = 128 + fbm2(u * 18, v * 18, 3, 10) * 90;
    });
    return { map: toTexture(map), bump: toTexture(bump, false) };
  });
}

// ---------------------------------------------------------------- tomato
export function tomatoFlesh() {
  return cached('tomato', () => {
    const wall = hex(0xd2281a), inner = hex(0xe8452c), gel = hex(0xf08a3c), seed = hex(0xf6d38a), core = hex(0xf26a4a);
    const R = rng(4);
    const seeds = [];
    const lobes = 5;
    for (let l = 0; l < lobes; l++) {
      for (let s = 0; s < 7; s++) {
        const a = (l / lobes) * Math.PI * 2 + (R() - 0.5) * 0.6;
        const r = 0.24 + R() * 0.16;
        seeds.push([0.5 + Math.cos(a) * r * 0.5, 0.5 + Math.sin(a) * r * 0.5, R() * Math.PI]);
      }
    }
    const map = paint(512, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.atan2(dy, dx);
      const lobe = Math.cos(a * lobes) * 0.5 + 0.5;
      const n = fbm2(u * 20, v * 20, 3, 13) * 0.04;
      let c = mixRGB(inner, wall, smooth(0.78, 0.9, r + n));
      // jelly chambers between the septa
      const chamber = smooth(0.18, 0.28, r + n) * (1 - smooth(0.62, 0.74, r + n)) * smooth(0.25, 0.55, lobe);
      c = mixRGB(c, gel, chamber * 0.85);
      c = mixRGB(c, core, (1 - smooth(0.0, 0.2, r)) * 0.6);
      for (const [sx, sy, rot] of seeds) {
        const ex = u - sx, ey = v - sy;
        const cx = ex * Math.cos(rot) - ey * Math.sin(rot);
        const cy = ex * Math.sin(rot) + ey * Math.cos(rot);
        const d = (cx * cx) / 0.00012 + (cy * cy) / 0.00004;
        if (d < 1) c = mixRGB(c, seed, (1 - d) * 0.9);
      }
      const k = 1 + fbm2(u * 40, v * 40, 2, 14) * 0.08;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    });
    return { map: toTexture(map) };
  });
}

// ---------------------------------------------------------------- lettuce
export function leaf(kind = 'iceberg') {
  return cached('leaf:' + kind, () => {
    const pal = {
      iceberg: [0xe2efa0, 0x8cc04a, 0x3f7f22],
      mixed: [0xb9d77a, 0x4f8f2a, 0x6b2338],
    }[kind];
    const pale = hex(pal[0]), mid = hex(pal[1]), edge = hex(pal[2]);
    const map = paint(512, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.atan2(dy, dx);
      const n = fbm2(u * 7, v * 7, 4, 21);
      let c = mixRGB(pale, mid, smooth(0.1, 0.75, r + n * 0.25));
      c = mixRGB(c, edge, smooth(0.7, 1.05, r + n * 0.2) * (kind === 'mixed' ? 0.75 : 0.6));
      // veins: radial ridges with branching wobble
      const vein = Math.abs(Math.sin(a * 11 + n * 3 + r * 4));
      const veinMask = (1 - smooth(0.0, 0.08, vein)) * smooth(0.12, 0.3, r);
      c = mixRGB(c, pale, veinMask * 0.75);
      const k = 1 + fbm2(u * 50, v * 50, 2, 22) * 0.06;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    });
    return { map: toTexture(map) };
  });
}

// ---------------------------------------------------------------- bacon
// u runs along the strip length, v across it.
export function bacon() {
  return cached('bacon', () => {
    const meatC = hex(0x8e2a17), deep = hex(0x4e1408), fat = hex(0xf0c9a0), crisp = hex(0x3a1206);
    const map = paint(512, (u, v, o) => {
      const w = fbm2(u * 6, v * 2, 3, 31) * 0.12;
      const band = Math.sin((v + w) * Math.PI * 5.2);
      const fatMask = smooth(0.45, 0.75, band);
      let c = mixRGB(meatC, deep, smooth(-0.2, 0.6, fbm2(u * 20, v * 12, 3, 32)));
      c = mixRGB(c, fat, fatMask * 0.85);
      const edge = Math.min(v, 1 - v);
      c = mixRGB(c, crisp, (1 - smooth(0.0, 0.12, edge + fbm2(u * 30, v, 2, 33) * 0.05)) * 0.8);
      c = mixRGB(c, crisp, smooth(0.25, 0.6, fbm2(u * 9, v * 9, 3, 34)) * 0.4);
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
    const bump = paint(256, (u, v, o) => {
      o[0] = o[1] = o[2] = 128 + fbm2(u * 40, v * 16, 3, 35) * 110;
    });
    return { map: toTexture(map), bump: toTexture(bump, false) };
  });
}

// ---------------------------------------------------------------- zucchini
export function zucchiniFlesh() {
  return cached('zucchini', () => {
    const skin = hex(0x2f5a1c), flesh = hex(0xe8ecc0), core = hex(0xd5dc9c), grill = hex(0x6f5a2a);
    const map = paint(256, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      let c = mixRGB(flesh, skin, smooth(0.86, 0.94, r));
      c = mixRGB(c, core, (1 - smooth(0.3, 0.5, r)) * 0.6);
      const stripe = Math.abs(Math.sin((u + v) * 22));
      c = mixRGB(c, grill, (1 - smooth(0.0, 0.18, stripe)) * 0.55 * (1 - smooth(0.85, 0.9, r)));
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
    });
    return { map: toTexture(map) };
  });
}

// ---------------------------------------------------------------- contact shadow
export function softShadow() {
  return cached('shadow', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return toTexture(c);
  });
}

export { noise3 };
