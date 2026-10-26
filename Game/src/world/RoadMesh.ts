import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RF, ROAD_STEP, type Road } from './RoadNetwork';
import { ROAD_TEX_PERIOD, SHOULDER } from './Textures';
import type { WorldData } from './WorldGen';
import { CHUNK_SIZE, HALF, type RoadKind } from './WorldDef';

export interface ChunkRoadGeometry {
  roads: Map<RoadKind, BufferGeometry>;
  structures: BufferGeometry | null; // vertex coloured: rails, barriers, bridges, tunnels
  tunnelLights: BufferGeometry | null;
  /** Street light poles: x, y, z, heading */
  lights: number[];
  curbs: BufferGeometry | null;
}

const _c = new Color();

/** Sweep a 2D profile [lateral, height] along road samples i0..i1 (inclusive). */
function sweep(r: Road, i0: number, i1: number, profile: [number, number][], color: number | ((i: number) => number), closed = false): BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const P = profile.length;
  for (let k = i0; k <= i1; k++) {
    const i = ((k % r.n) + r.n) % r.n;
    const x = r.px[i], y = r.py[i], z = r.pz[i];
    const rx = -r.tz[i], rz = r.tx[i]; // right vector
    _c.setHex(typeof color === 'number' ? color : color(k));
    for (const [lat, h] of profile) {
      pos.push(x + rx * lat, y + h, z + rz * lat);
      col.push(_c.r, _c.g, _c.b);
    }
  }
  const idx: number[] = [];
  const rows = i1 - i0;
  const segs = closed ? P : P - 1;
  for (let k = 0; k < rows; k++)
    for (let p = 0; p < segs; p++) {
      const q = (p + 1) % P;
      const a = k * P + p, b = k * P + q, c = (k + 1) * P + p, d = (k + 1) * P + q;
      idx.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const m4 = new Matrix4();
const q = new Quaternion();
const up = new Vector3(0, 1, 0);

function box(w: number, h: number, d: number, x: number, y: number, z: number, heading: number, color: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  q.setFromAxisAngle(up, heading);
  m4.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  _c.setHex(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function runs(r: Road, cx: number, cz: number): [number, number][] {
  const out: [number, number][] = [];
  const x0 = cx * CHUNK_SIZE - HALF, z0 = cz * CHUNK_SIZE - HALF;
  const inChunk = (i: number) => r.px[i] >= x0 && r.px[i] < x0 + CHUNK_SIZE && r.pz[i] >= z0 && r.pz[i] < z0 + CHUNK_SIZE;
  let start = -1;
  for (let i = 0; i < r.n; i++) {
    const inside = inChunk(i);
    if (inside && start < 0) start = i;
    if (!inside && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, r.loop ? r.n : r.n - 1]);
  // extend backwards by one sample for continuity
  return out.map(([a, b]) => [a > 0 || r.loop ? a - 1 : a, b] as [number, number]);
}

/** Split [i0,i1] into sub-runs where flag bit state is constant. */
function splitBy(r: Road, i0: number, i1: number, bit: number): { a: number; b: number; on: boolean }[] {
  const out: { a: number; b: number; on: boolean }[] = [];
  const f = (k: number) => (r.flags[((k % r.n) + r.n) % r.n] & bit) !== 0;
  let a = i0;
  let on = f(i0);
  for (let k = i0 + 1; k <= i1; k++) {
    if (f(k) !== on || k === i1) {
      out.push({ a, b: k, on });
      a = k;
      on = f(k);
    }
  }
  return out;
}

export function buildChunkRoads(w: WorldData, cx: number, cz: number, quality: number): ChunkRoadGeometry {
  const byKind = new Map<RoadKind, BufferGeometry[]>();
  const structs: BufferGeometry[] = [];
  const tlights: BufferGeometry[] = [];
  const curbs: BufferGeometry[] = [];
  const lights: number[] = [];
  for (const r of w.roads.roads) {
    const hw = r.halfWidth;
    const kind = r.def.kind;
    for (const [i0, i1] of runs(r, cx, cz)) {
      // --- asphalt ribbon with skirts ---
      const W = hw + SHOULDER;
      const pos: number[] = [], uv: number[] = [], nor: number[] = [];
      for (let k = i0; k <= i1; k++) {
        const i = ((k % r.n) + r.n) % r.n;
        const x = r.px[i], y = r.py[i] + 0.02, z = r.pz[i];
        const rx = -r.tz[i], rz = r.tx[i];
        const v = (k * ROAD_STEP) / ROAD_TEX_PERIOD;
        const skirtD = r.flags[i] & (RF.bridge | RF.tunnel) ? 0.4 : 2.5;
        pos.push(x - rx * W, y - skirtD, z - rz * W, x - rx * W, y, z - rz * W, x + rx * W, y, z + rz * W, x + rx * W, y - skirtD, z + rz * W);
        uv.push(0, v, 0, v, 1, v, 1, v);
        nor.push(-rx, 0, -rz, 0, 1, 0, 0, 1, 0, rx, 0, rz);
      }
      const idx: number[] = [];
      for (let k = 0; k < i1 - i0; k++) {
        const a = k * 4;
        const b = a + 4;
        for (let p = 0; p < 3; p++) idx.push(a + p, a + p + 1, b + p, a + p + 1, b + p + 1, b + p);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push(g);

      // --- tunnels / bridges / rails ---
      for (const seg of splitBy(r, i0, i1, RF.tunnel)) {
        if (!seg.on) continue;
        const Wt = hw + 1.6;
        structs.push(
          sweep(r, seg.a, seg.b, [[Wt, -0.3], [Wt, 5.2], [Wt * 0.72, 7.2], [0, 8.0], [-Wt * 0.72, 7.2], [-Wt, 5.2], [-Wt, -0.3]], (k) => (Math.floor(k / 3) % 2 ? 0x8d8c88 : 0x96958f)),
        );
        // outer shell (seen from outside the hill if terrain is thin)
        structs.push(sweep(r, seg.a, seg.b, [[-Wt - 0.8, -0.3], [-Wt - 0.8, 5.6], [0, 9.0], [Wt + 0.8, 5.6], [Wt + 0.8, -0.3]], 0x6f6d68));
        for (let k = seg.a; k <= seg.b; k += 6) {
          const i = ((k % r.n) + r.n) % r.n;
          const hd = Math.atan2(-r.tx[i], -r.tz[i]);
          for (const s of [-1, 1]) {
            const lx = r.px[i] - r.tz[i] * Wt * 0.62 * s, lz = r.pz[i] + r.tx[i] * Wt * 0.62 * s;
            tlights.push(box(0.3, 0.12, 1.4, lx, r.py[i] + 7.35, lz, hd, 0xffffff));
          }
        }
        // portals
        for (const end of [seg.a, seg.b]) {
          if ((end === seg.a && end === i0 && i0 !== 0) || (end === seg.b && end === i1)) {
            // only build portal where the tunnel actually starts/ends
            const prev = ((end + (end === seg.a ? -1 : 1)) % r.n + r.n) % r.n;
            if (r.flags[prev] & RF.tunnel) continue;
          }
          const i = ((end % r.n) + r.n) % r.n;
          const hd = Math.atan2(-r.tx[i], -r.tz[i]);
          const cxp = r.px[i], czp = r.pz[i], cy = r.py[i];
          const rx = -r.tz[i], rz = r.tx[i];
          for (const s of [-1, 1]) structs.push(box(10, 18, 2.2, cxp + rx * s * (Wt + 5), cy + 7, czp + rz * s * (Wt + 5), hd, 0x7b7a74));
          structs.push(box(Wt * 2 + 20, 10, 2.2, cxp, cy + 13, czp, hd, 0x7b7a74));
        }
      }
      for (const seg of splitBy(r, i0, i1, RF.bridge)) {
        if (!seg.on) continue;
        structs.push(sweep(r, seg.a, seg.b, [[-hw - 1.2, -0.05], [-hw - 1.2, -1.6], [hw + 1.2, -1.6], [hw + 1.2, -0.05]], 0x8a8984));
        for (let k = seg.a; k <= seg.b; k += 15) {
          const i = ((k % r.n) + r.n) % r.n;
          const ground = Math.min(w.hm.heightAt(r.px[i], r.pz[i]), 0.5 + w.gen.river(r.px[i], r.pz[i]).water - 3);
          const top = r.py[i] - 1.5;
          const h = top - ground + 2;
          if (h < 1) continue;
          const hd = Math.atan2(-r.tx[i], -r.tz[i]);
          const cols = hw > 6 ? [-hw * 0.5, hw * 0.5] : [0];
          for (const off of cols) structs.push(box(1.6, h, 2.2, r.px[i] - r.tz[i] * off, ground + h / 2 - 1, r.pz[i] + r.tx[i] * off, hd, 0x8f8e88));
        }
      }
      // rails: highway/circuit get concrete barriers, others metal guard rails
      const concrete = kind === 'highway' || kind === 'circuit';
      for (const [bit, side] of [[RF.railL, -1], [RF.railR, 1]] as [number, number][]) {
        for (const seg of splitBy(r, i0, i1, bit)) {
          if (!seg.on) continue;
          const o = (hw + 0.55) * side;
          if (concrete) {
            const p: [number, number][] = [[o - 0.3 * side, 0], [o - 0.12 * side, 0.3], [o - 0.08 * side, 0.85], [o + 0.08 * side, 0.85], [o + 0.12 * side, 0.3], [o + 0.3 * side, 0]];
            structs.push(sweep(r, seg.a, seg.b, side > 0 ? p : p.slice().reverse(), kind === 'circuit' ? ((k: number) => (Math.floor(k / 4) % 2 ? 0xd8d8d8 : 0xc0392b)) : 0xb9b6ae));
          } else {
            const p: [number, number][] = [[o, 0.45], [o + 0.04 * side, 0.6], [o, 0.75]];
            structs.push(sweep(r, seg.a, seg.b, side > 0 ? p.slice().reverse() : p, 0xb8bcc0));
            if (quality >= 1)
              for (let k = seg.a; k <= seg.b; k += 2) {
                const i = ((k % r.n) + r.n) % r.n;
                structs.push(box(0.1, 0.75, 0.1, r.px[i] - r.tz[i] * (o + 0.12 * side), r.py[i] + 0.37, r.pz[i] + r.tx[i] * (o + 0.12 * side), 0, 0x6c7075));
              }
          }
        }
      }
      // circuit curbs (red/white) on corners
      if (kind === 'circuit') {
        for (const side of [-1, 1]) {
          const o = hw * side;
          const p: [number, number][] = side > 0 ? [[o - 1.0, 0.03], [o, 0.1]] : [[o, 0.1], [o + 1.0, 0.03]];
          curbs.push(sweep(r, i0, i1, side > 0 ? p : p, (k) => (Math.floor(k / 2) % 2 ? 0xe8e8e8 : 0xc8102e)));
        }
      }
      // street lights
      if (r.info.lights) {
        const spacing = kind === 'street' ? 18 : kind === 'boulevard' ? 20 : 24; // in samples (x2 m)
        for (let k = i0 + 1; k <= i1; k++) {
          const i = ((k % r.n) + r.n) % r.n;
          if (i % spacing !== 0 || r.flags[i] & (RF.tunnel | RF.junction)) continue;
          const side = (i / spacing) % 2 ? 1 : -1;
          const o = (hw + (kind === 'street' || kind === 'boulevard' ? 2.6 : 1.4)) * side;
          lights.push(r.px[i] - r.tz[i] * o, r.py[i], r.pz[i] + r.tx[i] * o, Math.atan2(-r.tx[i], -r.tz[i]) + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
        }
      }
    }
  }
  const roads = new Map<RoadKind, BufferGeometry>();
  for (const [k, list] of byKind) roads.set(k, mergeGeometries(list, false)!);
  return {
    roads,
    structures: structs.length ? mergeGeometries(structs.map(nonIndexedColor), false) : null,
    tunnelLights: tlights.length ? mergeGeometries(tlights.map(nonIndexedColor), false) : null,
    lights,
    curbs: curbs.length ? mergeGeometries(curbs.map(nonIndexedColor), false) : null,
  };
}

function nonIndexedColor(g: BufferGeometry): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
  return n;
}
