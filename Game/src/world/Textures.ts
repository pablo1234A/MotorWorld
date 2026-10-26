import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace, Texture, LinearMipmapLinearFilter } from 'three';
import type { RoadKind } from './WorldDef';

/** Procedurally generated textures (no external assets). */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable multi-octave value noise into a Float32Array (0..1). */
export function tileNoise(size: number, seed: number, octaves = 5, base = 4): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let o = 0; o < octaves; o++) {
    const g = base << o;
    const grid = new Float32Array(g * g);
    for (let i = 0; i < g * g; i++) grid[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * g;
      const y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * g;
        const x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)];
        const c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

const cache = new Map<string, Texture>();

/** RGB detail texture: R fine grain, G medium patches, B coarse variation. Linear data. */
export function detailTexture(): Texture {
  const k = 'detail';
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const a = tileNoise(S, 11, 5, 16), b = tileNoise(S, 23, 4, 4), c = tileNoise(S, 37, 3, 2);
  const cv = canvas(S, S);
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    img.data[i * 4] = Math.min(255, a[i] * 255);
    img.data[i * 4 + 1] = Math.min(255, b[i] * 255);
    img.data[i * 4 + 2] = Math.min(255, c[i] * 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  cache.set(k, t);
  return t;
}

/** Period (m) of road textures along the length. */
export const ROAD_TEX_PERIOD = 24;
/** Shoulder width (m) baked into the road texture on each side. */
export const SHOULDER = 1.6;

export function roadTexture(kind: RoadKind, width: number, lanesPerDir: number, oneWay: boolean): Texture {
  const k = 'road_' + kind;
  if (cache.has(k)) return cache.get(k)!;
  const total = width + SHOULDER * 2;
  const PX = 24; // px per metre
  const W = Math.min(1024, Math.ceil((total * PX) / 4) * 4), H = 512;
  const sx = W / total, sy = H / ROAD_TEX_PERIOD;
  const cv = canvas(W, H);
  const g = cv.getContext('2d')!;
  const n = tileNoise(128, kind.length * 31 + 7, 4, 8);
  const asphalt = kind === 'strip' ? [150, 150, 146] : kind === 'dirt' ? [122, 100, 74] : kind === 'circuit' ? [52, 53, 56] : [62, 63, 66];
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const m = x / sx;
      const nv = n[(y % 128) * 128 + (x % 128)];
      let r = asphalt[0], gg = asphalt[1], b = asphalt[2];
      const inShoulder = m < SHOULDER || m > total - SHOULDER;
      if (inShoulder && kind !== 'circuit') {
        r = 112; gg = 104; b = 90;
      }
      // tyre-polished wheel tracks
      const lane = width / (oneWay ? lanesPerDir : lanesPerDir * 2);
      const lm = (m - SHOULDER) / lane;
      const fr = lm - Math.floor(lm);
      const track = Math.exp(-((fr - 0.28) ** 2) / 0.006) + Math.exp(-((fr - 0.72) ** 2) / 0.006);
      const dark = kind === 'dirt' ? 0.82 : 0.9;
      const f = (0.82 + nv * 0.36) * (1 - (inShoulder ? 0 : track * (1 - dark)));
      const speck = Math.random() < 0.04 ? 18 : 0;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, r * f + speck);
      img.data[i + 1] = Math.min(255, gg * f + speck);
      img.data[i + 2] = Math.min(255, b * f + speck);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const X = (m: number) => (m + SHOULDER) * sx;
  const line = (m: number, w: number, col: string, dash: number | null) => {
    g.fillStyle = col;
    if (dash === null) g.fillRect(X(m) - (w * sx) / 2, 0, w * sx, H);
    else for (let y = 0; y < H; y += dash * 2 * sy) g.fillRect(X(m) - (w * sx) / 2, y, w * sx, dash * sy);
  };
  const white = 'rgba(236,236,230,0.92)';
  const yellow = 'rgba(232,186,40,0.92)';
  if (kind === 'dirt') {
    // loose gravel stones
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${150 + Math.random() * 60},${130 + Math.random() * 50},${100 + Math.random() * 40},0.5)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
  } else if (kind === 'strip') {
    g.fillStyle = 'rgba(70,70,70,0.6)';
    for (let y = 0; y < H; y += 6 * sy) g.fillRect(X(0), y, width * sx, 2);
    g.fillRect(X(width / 2) - 1, 0, 2, H);
    line(0.3, 0.2, white, null);
    line(width - 0.3, 0.2, white, null);
    line(width / 2, 0.25, yellow, 3);
  } else {
    line(0.3, 0.18, white, null);
    line(width - 0.3, 0.18, white, null);
    if (kind === 'circuit') {
      // start-line-free circuit: just edge lines
    } else if (lanesPerDir === 1) {
      line(width / 2, 0.15, kind === 'mountain' ? yellow : white, 4);
    } else {
      line(width / 2 - 0.15, 0.13, white, null);
      line(width / 2 + 0.15, 0.13, white, null);
      const lw = width / 2 / lanesPerDir;
      for (let l = 1; l < lanesPerDir; l++) {
        line(width / 2 - lw * l, 0.15, white, 4);
        line(width / 2 + lw * l, 0.15, white, 4);
      }
    }
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  cache.set(k, t);
  return t;
}

/** Facade textures for buildings: map + emissive windows. style 0 glass, 1 office, 2 brick, 3 industrial. */
export function facadeTextures(style: number): { map: Texture; emissive: Texture } {
  const k = 'facade' + style;
  if (cache.has(k)) return { map: cache.get(k)!, emissive: cache.get(k + 'e')! };
  const S = 256; // one tile = 4 windows x 4 floors
  const cv = canvas(S, S), ce = canvas(S, S);
  const g = cv.getContext('2d')!, e = ce.getContext('2d')!;
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const wallCols = ['#5c6a78', '#b8b2a6', '#8a4f3c', '#8c9196'];
  g.fillStyle = wallCols[style];
  g.fillRect(0, 0, S, S);
  const noise = tileNoise(64, 100 + style, 3, 4);
  for (let y = 0; y < S; y += 4)
    for (let x = 0; x < S; x += 4) {
      g.fillStyle = `rgba(0,0,0,${noise[((y / 4) % 64) * 64 + ((x / 4) % 64)] * 0.18})`;
      g.fillRect(x, y, 4, 4);
    }
  const cell = S / 4;
  let seed = 7 + style * 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let fy = 0; fy < 4; fy++)
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * cell, y = fy * cell;
      if (style === 3) {
        // corrugated panels + high strip windows
        g.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k2 = 0; k2 < cell; k2 += 6) g.fillRect(x + k2, y, 2, cell);
        if (fy === 0) {
          g.fillStyle = '#2a3036';
          g.fillRect(x + 6, y + 10, cell - 12, 14);
        }
        continue;
      }
      const mx = style === 0 ? 3 : 12, my = style === 0 ? 4 : 14;
      const wx = x + mx, wy = y + my, ww = cell - mx * 2, wh = cell - my * 1.6;
      const glassC = style === 0 ? `rgb(${40 + rnd() * 20},${62 + rnd() * 25},${84 + rnd() * 30})` : `rgb(${30 + rnd() * 15},${38 + rnd() * 15},${48 + rnd() * 20})`;
      g.fillStyle = glassC;
      g.fillRect(wx, wy, ww, wh);
      // reflection gradient
      const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      grd.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.fillStyle = grd;
      g.fillRect(wx, wy, ww, wh);
      if (style !== 0) {
        g.fillStyle = style === 2 ? '#d8d0c0' : '#9a958c';
        g.fillRect(wx - 2, wy + wh, ww + 4, 3);
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      }
      if (rnd() < 0.42) {
        const warm = rnd();
        e.fillStyle = warm < 0.7 ? `rgb(255,${200 + rnd() * 30},${130 + rnd() * 40})` : `rgb(${190 + rnd() * 40},${220 + rnd() * 20},255)`;
        e.globalAlpha = 0.6 + rnd() * 0.4;
        e.fillRect(wx, wy, ww, wh);
        e.globalAlpha = 1;
      }
    }
  if (style === 0) {
    g.fillStyle = 'rgba(200,210,220,0.5)';
    for (let k2 = 0; k2 <= 4; k2++) g.fillRect(0, k2 * cell - 1, S, 2);
  }
  const map = new CanvasTexture(cv);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.anisotropy = 4;
  const em = new CanvasTexture(ce);
  em.colorSpace = SRGBColorSpace;
  em.wrapS = em.wrapT = RepeatWrapping;
  cache.set(k, map);
  cache.set(k + 'e', em);
  return { map, emissive: em };
}

/** Simple radial glow sprite texture. */
export function radialTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)'): Texture {
  const k = 'radial' + inner + mid;
  if (cache.has(k)) return cache.get(k)!;
  const cv = canvas(128, 128);
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, mid);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(cv);
  cache.set(k, t);
  return t;
}

/** Generic tiling texture for concrete/sidewalk with joints. */
export function concreteTexture(): Texture {
  const k = 'concrete';
  if (cache.has(k)) return cache.get(k)!;
  const S = 256;
  const cv = canvas(S, S);
  const g = cv.getContext('2d')!;
  const n = tileNoise(S, 5, 5, 8);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 150 + n[i] * 60;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v * 0.98;
    img.data[i * 4 + 2] = v * 0.94;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(60,60,60,0.5)';
  g.fillRect(0, 0, S, 2);
  g.fillRect(0, 0, 2, S);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  cache.set(k, t);
  return t;
}
