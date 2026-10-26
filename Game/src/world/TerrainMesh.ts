import { BufferGeometry, Color, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtil';
import { Surface } from '../physics/Surface';
import type { WorldData } from './WorldGen';
import { CHUNK_SIZE, GRID_RES, HALF } from './WorldDef';

const _n = new Vector3();
const _c = new Color();

const COLORS: Record<number, [number, number, number]> = {
  [Surface.Grass]: [0.25, 0.36, 0.13],
  [Surface.Dirt]: [0.36, 0.27, 0.17],
  [Surface.Rock]: [0.42, 0.4, 0.37],
  [Surface.Sand]: [0.72, 0.64, 0.46],
  [Surface.Concrete]: [0.5, 0.5, 0.48],
  [Surface.Gravel]: [0.48, 0.43, 0.35],
};

/** Biome colour for a terrain vertex (linear RGB). */
export function terrainColor(w: WorldData, x: number, z: number, h: number, ny: number, surf: Surface, out: Color): Color {
  const g = w.gen;
  const base = COLORS[surf] ?? COLORS[Surface.Grass];
  let r = base[0], gg = base[1], b = base[2];
  const v = g.n1.noise(x / 75, z / 75) * 0.5 + g.n2.noise(x / 23, z / 23) * 0.25;
  if (surf === Surface.Grass) {
    // dry fields vs lush valleys vs alpine meadows
    const dry = smoothstep(0.1, 0.6, g.n3.noise(x / 420, z / 420)) * (1 - g.forestMask(x, z));
    r = lerp(r, 0.5, dry * 0.6);
    gg = lerp(gg, 0.45, dry * 0.45);
    b = lerp(b, 0.18, dry * 0.5);
    if (g.forestMask(x, z) > 0.3) {
      r *= 0.75;
      gg *= 0.85;
      b *= 0.7;
    }
    const alp = smoothstep(120, 260, h);
    r = lerp(r, 0.34, alp * 0.5);
    gg = lerp(gg, 0.36, alp * 0.4);
  }
  if (surf === Surface.Rock) {
    const t = smoothstep(0.6, 0.95, ny);
    r = lerp(r, 0.3, t * 0.3);
  }
  if (h > 315 && ny > 0.75) {
    const snow = smoothstep(315, 345, h + v * 20);
    r = lerp(r, 0.9, snow);
    gg = lerp(gg, 0.92, snow);
    b = lerp(b, 0.95, snow);
  }
  if (h < 0) {
    const d = smoothstep(0, -12, h);
    r = lerp(r, 0.35, d);
    gg = lerp(gg, 0.36, d);
    b = lerp(b, 0.3, d);
  }
  const k = 1 + v * 0.22;
  return out.setRGB(clamp(r * k, 0, 1), clamp(gg * k, 0, 1), clamp(b * k, 0, 1));
}

/**
 * Terrain chunk geometry at a given LOD (cell step multiplier: 1, 2, 4, ...), with skirts.
 */
export function buildTerrainChunk(w: WorldData, cx: number, cz: number, step: number): BufferGeometry {
  const hm = w.hm;
  const cells = CHUNK_SIZE / GRID_RES / step;
  const i0 = cx * (CHUNK_SIZE / GRID_RES), j0 = cz * (CHUNK_SIZE / GRID_RES);
  const N = cells + 1;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const gi = i0 + i * step, gj = j0 + j * step;
      const x = gi * GRID_RES - HALF, z = gj * GRID_RES - HALF;
      const h = hm.get(gi, gj);
      hm.smoothNormal(gi, gj, _n);
      pos.push(x, h, z);
      nor.push(_n.x, _n.y, _n.z);
      const s = hm.surf[Math.min(hm.n - 1, gj) * hm.n + Math.min(hm.n - 1, gi)] as Surface;
      terrainColor(w, x, z, h, _n.y, s, _c);
      // road shoulders: dusty fringe
      if (step === 1) {
        const rh = w.roads.nearest(x, z, 7);
        if (rh && rh.dist > rh.road.halfWidth) {
          const f = 1 - smoothstep(rh.road.halfWidth, rh.road.halfWidth + 7, rh.dist);
          _c.r = lerp(_c.r, 0.42, f * 0.6);
          _c.g = lerp(_c.g, 0.38, f * 0.6);
          _c.b = lerp(_c.b, 0.3, f * 0.6);
        }
      }
      col.push(_c.r, _c.g, _c.b);
    }
  const idx: number[] = [];
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      // split along (0,0)-(1,1) to match Heightmap.heightAt
      idx.push(a, c, d, a, d, b);
    }
  // skirts around the border
  const skirt = 6 * step;
  const addSkirt = (ids: number[], flip: boolean) => {
    const start = pos.length / 3;
    for (const k of ids) {
      pos.push(pos[k * 3], pos[k * 3 + 1] - skirt, pos[k * 3 + 2]);
      nor.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]);
      col.push(col[k * 3] * 0.8, col[k * 3 + 1] * 0.8, col[k * 3 + 2] * 0.8);
    }
    for (let k = 0; k < ids.length - 1; k++) {
      const a = ids[k], b = ids[k + 1], c = start + k, d = start + k + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  };
  const top: number[] = [], bottom: number[] = [], left: number[] = [], right: number[] = [];
  for (let i = 0; i < N; i++) {
    top.push(i);
    bottom.push((N - 1) * N + i);
    left.push(i * N);
    right.push(i * N + N - 1);
  }
  addSkirt(top, false);
  addSkirt(bottom, true);
  addSkirt(left, true);
  addSkirt(right, false);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(new Uint32BufferAttribute(idx, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Low-resolution terrain for the whole island, slightly sunk so streamed chunks always win. */
export function buildFarTerrain(w: WorldData, cellM = 32): BufferGeometry {
  const hm = w.hm;
  const step = cellM / GRID_RES;
  const N = Math.floor((hm.n - 1) / step) + 1;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const gi = i * step, gj = j * step;
      let mn = Infinity;
      for (let dj = -step / 2; dj <= step / 2; dj += step / 4) for (let di = -step / 2; di <= step / 2; di += step / 4) mn = Math.min(mn, hm.get(gi + di, gj + dj));
      const x = gi * GRID_RES - HALF, z = gj * GRID_RES - HALF;
      const h = mn - 1.5;
      hm.smoothNormal(gi, gj, _n);
      pos.push(x, h, z);
      nor.push(_n.x, _n.y, _n.z);
      const s = hm.surf[Math.min(hm.n - 1, gj) * hm.n + Math.min(hm.n - 1, gi)] as Surface;
      terrainColor(w, x, z, hm.get(gi, gj), _n.y, s, _c);
      // forests look darker from afar (trees are not streamed this far)
      const forest = Math.max(w.gen.forestMask(x, z), w.gen.mountainMask(x, z) * smoothstep(250, 120, h) * 0.8);
      if (s === Surface.Grass || s === Surface.Dirt) _c.multiplyScalar(1 - forest * 0.45);
      col.push(_c.r, _c.g, _c.b);
    }
  const idx: number[] = [];
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(new Uint32BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
