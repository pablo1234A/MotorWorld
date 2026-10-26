import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, Object3D, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from '../core/Random';
import { Surface } from '../physics/Surface';
import { vcMaterial } from './Materials';
import type { WorldData } from './WorldGen';
import { CHUNK_SIZE, HALF } from './WorldDef';

export type TreeType = 0 | 1 | 2 | 3; // conifer, broadleaf, palm, rock

function colored(g: BufferGeometry, hex: number, jitter = 0.08): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = 1 + (((i * 7919) % 97) / 97 - 0.5) * jitter;
    col.set([c.r * j, c.g * j, c.b * j], i * 3);
  }
  ng.setAttribute('color', new Float32BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  return ng;
}

let models: BufferGeometry[] | null = null;
/** Low-poly tree models, unit-sized (height ~1 maps to scale). */
export function treeModels(): BufferGeometry[] {
  if (models) return models;
  const conifer = mergeGeometries([
    colored(new CylinderGeometry(0.025, 0.04, 0.25, 5).translate(0, 0.125, 0), 0x4a3424),
    colored(new ConeGeometry(0.26, 0.42, 7).translate(0, 0.38, 0), 0x1f3d22),
    colored(new ConeGeometry(0.21, 0.36, 7).translate(0, 0.6, 0), 0x234526),
    colored(new ConeGeometry(0.14, 0.3, 7).translate(0, 0.82, 0), 0x28502b),
  ])!;
  const broad = mergeGeometries([
    colored(new CylinderGeometry(0.03, 0.05, 0.45, 5).translate(0, 0.225, 0), 0x5a4030),
    colored(new IcosahedronGeometry(0.3, 0).translate(0, 0.62, 0), 0x3d6b2a, 0.2),
    colored(new IcosahedronGeometry(0.22, 0).translate(0.16, 0.5, 0.05), 0x46762f, 0.2),
    colored(new IcosahedronGeometry(0.2, 0).translate(-0.14, 0.55, -0.08), 0x37622a, 0.2),
  ])!;
  const fronds: BufferGeometry[] = [colored(new CylinderGeometry(0.025, 0.04, 0.85, 5).translate(0, 0.425, 0).rotateZ(0.08), 0x7a6248)];
  for (let k = 0; k < 7; k++) {
    const f = new ConeGeometry(0.06, 0.45, 3);
    f.rotateZ(Math.PI / 2 + 0.5).translate(0.2, 0.85, 0).rotateY((k / 7) * Math.PI * 2);
    fronds.push(colored(f, 0x3b7a2e));
  }
  const palm = mergeGeometries(fronds)!;
  const rock = colored(new DodecahedronGeometry(0.5, 0).scale(1, 0.6, 0.8).translate(0, 0.15, 0), 0x77736c, 0.25);
  models = [conifer, broad, palm, rock];
  for (const m of models) m.computeVertexNormals();
  return models;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);

export interface TreeInstance {
  type: TreeType;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

/** Deterministic vegetation scatter for a chunk. Avoids roads, water and city. */
export function scatterChunk(w: WorldData, cx: number, cz: number, density: number, extraSpots: [number, number][]): TreeInstance[] {
  const out: TreeInstance[] = [];
  const x0 = cx * CHUNK_SIZE - HALF, z0 = cz * CHUNK_SIZE - HALF;
  const cell = 9 / Math.sqrt(density);
  const n = Math.floor(CHUNK_SIZE / cell);
  const g = w.gen;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const hx = hash2(cx * 1000 + i, cz * 1000 + j, 17);
      const hz = hash2(cx * 1000 + i, cz * 1000 + j, 29);
      const x = x0 + (i + hx) * cell, z = z0 + (j + hz) * cell;
      const h = w.hm.heightAt(x, z);
      if (h < 2.5) continue;
      const surf = w.hm.surfaceAt(x, z);
      if (surf === Surface.Concrete || surf === Surface.Sand) continue;
      const forest = g.forestMask(x, z);
      const mount = g.mountainMask(x, z);
      const city = Math.max(g.cityMask(x, z), g.portMask(x, z), g.racewayMask(x, z), g.stripMask(x, z));
      if (city > 0.3) continue;
      let p = 0.035 + forest * 0.75 + mount * smoothTree(h) * 0.55;
      const clump = g.n2.noise(x / 180, z / 180);
      p *= 0.6 + clump * 0.8;
      if (surf === Surface.Rock) p *= 0.25;
      const pick = hash2(cx * 1000 + i, cz * 1000 + j, 41);
      if (pick > p) {
        // occasional boulders in the mountains
        if (mount > 0.4 && pick < p + 0.03) out.push({ type: 3, x, y: h, z, scale: 1 + hx * 2.5, rot: hz * 6.28 });
        continue;
      }
      if (w.roads.nearest(x, z, 5)) continue;
      if (g.river(x, z).d < 22) continue;
      const nearCoast = x > 1350 || h < 6;
      const type: TreeType = nearCoast && hx < 0.6 ? 2 : forest > 0.3 || mount > 0.3 || h > 90 ? (hx < 0.85 ? 0 : 1) : hx < 0.25 ? 0 : 1;
      out.push({ type, x, y: h - 0.2, z, scale: (type === 0 ? 13 : type === 2 ? 10 : 10) * (0.7 + hz * 0.6), rot: hx * 6.28 });
    }
  for (const [x, z] of extraSpots) {
    if (x < x0 || x >= x0 + CHUNK_SIZE || z < z0 || z >= z0 + CHUNK_SIZE) continue;
    const r = hash2(Math.floor(x), Math.floor(z), 3);
    out.push({ type: 1, x, y: w.hm.heightAt(x, z) + 0.15, z, scale: 8 + r * 4, rot: r * 6 });
  }
  return out;
}

function smoothTree(h: number) {
  // treeline: dense below 150 m, none above 260 m
  return h < 150 ? 1 : h > 260 ? 0 : 1 - (h - 150) / 110;
}

/** Build instanced meshes (one per tree type) for a list of instances. */
export function buildTreeMeshes(list: TreeInstance[], shadows: boolean): InstancedMesh[] {
  const ms = treeModels();
  const out: InstancedMesh[] = [];
  for (let t = 0; t < 4; t++) {
    const items = list.filter((i) => i.type === t);
    if (!items.length) continue;
    const im = new InstancedMesh(ms[t], vcMaterial(0.9), items.length);
    items.forEach((it, k) => {
      _q.setFromAxisAngle(UP, it.rot);
      _p.set(it.x, it.y, it.z);
      const sy = it.scale * (t === 3 ? 0.7 : 1);
      _s.set(it.scale, sy, it.scale);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(k, _m);
    });
    im.castShadow = shadows && t !== 3;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}

export const _obj = new Object3D();
