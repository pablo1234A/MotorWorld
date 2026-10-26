import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Random';
import type { BoxCollider } from '../physics/PhysicsWorld';
import type { WorldData } from './WorldGen';
import { CHUNK_SIZE, CITY, CITY_Y, HALF, POIS, PORT, PORT_Y, ROAD_KINDS } from './WorldDef';

export type StructKind = 'building' | 'warehouse' | 'container' | 'crane' | 'stand' | 'pit' | 'shop' | 'canopy' | 'garage';

/** A box-shaped structure: footprint centre, size, rotation, base height. */
export interface Struct {
  kind: StructKind;
  x: number;
  z: number;
  w: number; // along local X
  d: number; // along local Z
  h: number;
  y: number;
  rot: number;
  style: number; // facade style or colour index
  tiers?: number;
  collide: boolean;
}

export interface CityBlock {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  park: boolean;
}

export const SIDEWALK = 3.2;
export const CURB_H = 0.16;

/** Generates every man-made structure on the island (deterministic). */
export class Structures {
  readonly list: Struct[] = [];
  readonly blocks: CityBlock[] = [];
  readonly treeSpots: [number, number][] = [];
  readonly colliders: BoxCollider[] = [];

  constructor(private w: WorldData) {
    this.city();
    this.port();
    this.raceway();
    this.pois();
    for (const s of this.list) {
      if (!s.collide) continue;
      this.colliders.push({ kind: 'box', x: s.x, z: s.z, hx: s.w / 2, hz: s.d / 2, rot: s.rot, yMin: s.y - 1, yMax: s.y + s.h });
    }
  }

  /** Is (x,z) on a raised city sidewalk block? Returns the block or null. */
  blockAt(x: number, z: number): CityBlock | null {
    const { x0, x1, z0, z1, cols, rows } = CITY;
    if (x < x0 || x > x1 || z < z0 || z > z1) return null;
    const i = Math.min(cols - 1, Math.floor(((x - x0) / (x1 - x0)) * cols));
    const j = Math.min(rows - 1, Math.floor(((z - z0) / (z1 - z0)) * rows));
    const b = this.blocks[j * cols + i];
    return b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? b : null;
  }

  private city() {
    const rng = new Rng(9001);
    const { x0, x1, z0, z1, cols, rows } = CITY;
    const dx = (x1 - x0) / cols, dz = (z1 - z0) / rows;
    const hwB = ROAD_KINDS.boulevard.width / 2, hwS = ROAD_KINDS.street.width / 2;
    const garage = POIS.find((p) => p.id === 'garage_city')!;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const bx0 = x0 + i * dx + (i === 0 ? hwB : hwS) + 0.6;
        const bx1 = x0 + (i + 1) * dx - (i === cols - 1 ? hwB : hwS) - 0.6;
        const bz0 = z0 + j * dz + (j === 0 ? hwB : hwS) + 0.6;
        const bz1 = z0 + (j + 1) * dz - (j === rows - 1 ? hwB : hwS) - 0.6;
        // keep the rounded boulevard corners clear
        const corner = (i === 0 || i === cols - 1) && (j === 0 || j === rows - 1);
        const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
        const dist = Math.hypot(cx - 650, cz);
        const park = !corner && rng.chance(dist > 380 ? 0.16 : 0.06);
        const blk: CityBlock = { x0: bx0, z0: bz0, x1: bx1, z1: bz1, park };
        this.blocks.push(blk);
        const ix0 = bx0 + SIDEWALK + 1, ix1 = bx1 - SIDEWALK - 1, iz0 = bz0 + SIDEWALK + 1, iz1 = bz1 - SIDEWALK - 1;
        if (corner) {
          // trim lots for the rounded corner
        }
        if (garage.x > bx0 && garage.x < bx1 && garage.z > bz0 && garage.z < bz1) {
          this.list.push({ kind: 'garage', x: garage.x, z: garage.z - 10, w: 34, d: 24, h: 9, y: CITY_Y + CURB_H, rot: 0, style: 0, collide: true });
          this.list.push({ kind: 'building', x: (ix0 + ix1) / 2 + 30, z: (iz0 + iz1) / 2 + 30, w: 40, d: 40, h: 24, y: CITY_Y + CURB_H, rot: 0, style: 1, collide: true });
          continue;
        }
        if (park) {
          for (let k = 0; k < 26; k++) this.treeSpots.push([rng.range(ix0 + 4, ix1 - 4), rng.range(iz0 + 4, iz1 - 4)]);
          continue;
        }
        const downtown = 1 - Math.min(1, dist / 520);
        const nx = rng.chance(0.5) ? 2 : 3, nz = rng.chance(0.5) ? 2 : 3;
        const lw = (ix1 - ix0) / nx, ld = (iz1 - iz0) / nz;
        for (let a = 0; a < nx; a++)
          for (let b = 0; b < nz; b++) {
            if (corner && ((i === 0 && a === 0) || (i === cols - 1 && a === nx - 1)) && ((j === 0 && b === 0) || (j === rows - 1 && b === nz - 1))) continue;
            if (rng.chance(0.08)) continue; // small plaza / gap
            const gap = rng.range(3, 7);
            const w = lw - gap, d = ld - gap;
            const lx = ix0 + lw * (a + 0.5), lz = iz0 + ld * (b + 0.5);
            let h: number, style: number;
            if (rng.next() < downtown * 0.85) {
              h = 30 + Math.pow(rng.next(), 1.6) * 140 * downtown + 20;
              style = rng.chance(0.6) ? 0 : 1;
            } else {
              h = 9 + rng.next() * 24;
              style = rng.chance(0.55) ? 2 : 1;
            }
            const tiers = h > 70 ? rng.int(1, 3) : 1;
            this.list.push({ kind: 'building', x: lx, z: lz, w, d, h, y: CITY_Y + CURB_H, rot: 0, style, tiers, collide: true });
          }
      }
  }

  private port() {
    const rng = new Rng(4040);
    // warehouses along the north edge of the docks
    for (let k = 0; k < 5; k++) {
      const x = PORT.x0 + 90 + k * 150;
      if (Math.abs(x - 930) < 70) continue; // dockside workshop
      this.list.push({ kind: 'warehouse', x, z: 820, w: 110, d: 46, h: 13 + rng.range(0, 5), y: PORT_Y, rot: 0, style: 3, collide: true });
    }
    // container stacks in a grid with lanes between
    const colors = [0xb03a2e, 0x1f618d, 0x117a65, 0xd4ac0d, 0x7d3c98, 0xca6f1e, 0x566573];
    for (let gx = 0; gx < 6; gx++)
      for (let gz = 0; gz < 4; gz++) {
        const x = PORT.x0 + 110 + gx * 105, z = 930 + gz * 52;
        if (rng.chance(0.15)) continue;
        const rowsN = rng.int(2, 4);
        for (let r = 0; r < rowsN; r++) {
          const stack = rng.int(1, 4);
          this.list.push({ kind: 'container', x, z: z + r * 2.8, w: 12.2, d: 2.5, h: 2.6 * stack, y: PORT_Y, rot: 0, style: colors[rng.int(0, colors.length - 1)], collide: true });
        }
      }
    // gantry cranes on the waterfront (east)
    for (let k = 0; k < 3; k++) this.list.push({ kind: 'crane', x: 1170, z: 820 + k * 140, w: 20, d: 30, h: 48, y: PORT_Y, rot: 0, style: 0, collide: false });
  }

  private raceway() {
    const ring = this.w.roads.byId('ring');
    // grandstand along the longest straight near the start of the loop
    const i = Math.floor(ring.n * 0.02);
    const hd = Math.atan2(-ring.tx[i], -ring.tz[i]);
    const off = ring.halfWidth + 14;
    const x = ring.px[i] + ring.tz[i] * off, z = ring.pz[i] - ring.tx[i] * off;
    this.list.push({ kind: 'stand', x, z, w: 16, d: 120, h: 12, y: ring.py[i], rot: hd, style: 0, collide: true });
    const x2 = ring.px[i] - ring.tz[i] * off, z2 = ring.pz[i] + ring.tx[i] * off;
    this.list.push({ kind: 'pit', x: x2, z: z2, w: 14, d: 110, h: 8, y: ring.py[i], rot: hd, style: 1, collide: true });
  }

  private pois() {
    for (const p of POIS) {
      const y = this.w.hm.heightAt(p.x, p.z);
      if (p.kind === 'gas') {
        this.list.push({ kind: 'canopy', x: p.x, z: p.z, w: 18, d: 12, h: 5.5, y, rot: 0, style: 0, collide: false });
        this.list.push({ kind: 'shop', x: p.x + 16, z: p.z, w: 10, d: 12, h: 4.5, y, rot: 0, style: 1, collide: true });
      } else if (p.kind === 'garage' && p.id !== 'garage_city') {
        this.list.push({ kind: 'garage', x: p.x, z: p.z - 14, w: 26, d: 16, h: 8, y, rot: 0, style: 0, collide: true });
      }
    }
  }

  inChunk(cx: number, cz: number): Struct[] {
    const x0 = cx * CHUNK_SIZE - HALF, z0 = cz * CHUNK_SIZE - HALF;
    return this.list.filter((s) => s.x >= x0 && s.x < x0 + CHUNK_SIZE && s.z >= z0 && s.z < z0 + CHUNK_SIZE);
  }
}

const m4 = new Matrix4();
const qq = new Quaternion();
const UP = new Vector3(0, 1, 0);
const _col = new Color();

/** Box with facade UVs (metres / tile) on the side faces, no top/bottom. */
function facadeBox(s: Struct, w: number, d: number, h: number, y0: number, tileW = 16, tileH = 14): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const vi = f * 4 + k;
      const px = pos.getX(vi), py = pos.getY(vi), pz = pos.getZ(vi);
      const horiz = f < 2 ? pz : px;
      uv.setXY(vi, (horiz + 1000) / tileW, (py + h / 2 + y0 * 0) / tileH);
    }
  }
  // drop top and bottom faces (indices 12..23 of the index buffer per face: each face 6 indices)
  const idx = g.getIndex()!;
  const keep: number[] = [];
  for (let f = 0; f < 6; f++) if (f !== 2 && f !== 3) for (let k = 0; k < 6; k++) keep.push(idx.getX(f * 6 + k));
  g.setIndex(keep);
  qq.setFromAxisAngle(UP, s.rot);
  m4.compose(new Vector3(s.x, s.y + y0 + h / 2, s.z), qq, new Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  return g.toNonIndexed();
}

function colorBox(w: number, h: number, d: number, x: number, y: number, z: number, rot: number, color: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d).toNonIndexed();
  qq.setFromAxisAngle(UP, rot);
  m4.compose(new Vector3(x, y, z), qq, new Vector3(1, 1, 1));
  g.applyMatrix4(m4);
  _col.setHex(color);
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([_col.r, _col.g, _col.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Rotate a local offset by the struct rotation and add its position. */
function local(s: Struct, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
}

export interface ChunkStructGeometry {
  facades: (BufferGeometry | null)[]; // per facade style 0..3
  colored: BufferGeometry | null; // roofs, containers, cranes, stands
  sidewalks: BufferGeometry | null; // concrete material (uv in metres)
  neon: BufferGeometry | null; // emissive signs
}

export function buildChunkStructures(st: Structures, cx: number, cz: number, quality: number): ChunkStructGeometry {
  const fac: BufferGeometry[][] = [[], [], [], []];
  const col: BufferGeometry[] = [];
  const neon: BufferGeometry[] = [];
  for (const s of st.inChunk(cx, cz)) {
    switch (s.kind) {
      case 'building': {
        const tiers = s.tiers ?? 1;
        let w = s.w, d = s.d, y0 = 0;
        for (let t = 0; t < tiers; t++) {
          const h = t === tiers - 1 ? s.h - y0 : s.h * (t === 0 ? 0.55 : 0.25);
          fac[s.style].push(facadeBox(s, w, d, h, y0));
          col.push(colorBox(w + 0.6, 0.5, d + 0.6, s.x, s.y + y0 + h + 0.25, s.z, s.rot, 0x55595e));
          y0 += h;
          w *= 0.78;
          d *= 0.78;
        }
        if (quality >= 1) {
          // rooftop units
          const k = Math.floor((s.x * 7 + s.z * 3) % 3);
          for (let u = 0; u <= k; u++) {
            const [ux, uz] = local(s, (u - 1) * w * 0.25, d * 0.15);
            col.push(colorBox(3 + u, 2.2, 3, ux, s.y + y0 + 1.6, uz, s.rot, 0x8b8f94));
          }
          if (s.h > 120) col.push(colorBox(1, 18, 1, s.x, s.y + s.h + 9.5, s.z, 0, 0xb8bcc0));
        }
        break;
      }
      case 'warehouse':
        fac[3].push(facadeBox(s, s.w, s.d, s.h, 0, 16, 14));
        col.push(colorBox(s.w + 1, 1.2, s.d + 1, s.x, s.y + s.h + 0.3, s.z, s.rot, 0x6d7378));
        break;
      case 'container':
        col.push(colorBox(s.w, s.h, s.d, s.x, s.y + s.h / 2, s.z, s.rot, s.style));
        break;
      case 'crane': {
        const legs = [[-s.w / 2, -s.d / 2], [s.w / 2, -s.d / 2], [-s.w / 2, s.d / 2], [s.w / 2, s.d / 2]];
        for (const [lx, lz] of legs) col.push(colorBox(1.6, s.h, 1.6, s.x + lx, s.y + s.h / 2, s.z + lz, 0, 0xc0392b));
        col.push(colorBox(70, 3, 4, s.x + 20, s.y + s.h + 1.5, s.z, 0, 0xd0d3d4));
        col.push(colorBox(s.w + 2, 2, s.d + 2, s.x, s.y + s.h * 0.75, s.z, 0, 0xc0392b));
        col.push(colorBox(8, 5, 6, s.x - 4, s.y + s.h - 2.5, s.z, 0, 0xf4d03f));
        break;
      }
      case 'stand': {
        for (let r = 0; r < 6; r++) {
          const [ux, uz] = local(s, -s.w / 2 + r * 2.6 + 1.3, 0);
          col.push(colorBox(2.6, 1 + r * 1.8, s.d, ux, s.y + (1 + r * 1.8) / 2, uz, s.rot, r % 2 ? 0x2e86c1 : 0x5d6d7e));
        }
        const [rx, rz] = local(s, 2, 0);
        col.push(colorBox(s.w + 4, 0.5, s.d, rx, s.y + s.h + 2, rz, s.rot, 0xecf0f1));
        break;
      }
      case 'pit':
        fac[1].push(facadeBox(s, s.w, s.d, s.h, 0));
        col.push(colorBox(s.w + 0.6, 0.6, s.d + 0.6, s.x, s.y + s.h + 0.3, s.z, s.rot, 0xc8102e));
        break;
      case 'canopy': {
        col.push(colorBox(s.w, 0.9, s.d, s.x, s.y + s.h, s.z, s.rot, 0xf2f3f4));
        neon.push(colorBox(s.w + 0.1, 0.25, s.d + 0.1, s.x, s.y + s.h - 0.3, s.z, s.rot, 0xe01a2b));
        for (const [lx, lz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) col.push(colorBox(0.5, s.h, 0.5, s.x + lx, s.y + s.h / 2, s.z + lz, 0, 0xbdc3c7));
        for (const lx of [-4, 0, 4]) col.push(colorBox(0.8, 1.6, 1.2, s.x + lx, s.y + 0.8, s.z, 0, 0xe01a2b));
        break;
      }
      case 'shop':
        fac[1].push(facadeBox(s, s.w, s.d, s.h, 0, 10, 14));
        col.push(colorBox(s.w + 0.4, 0.4, s.d + 0.4, s.x, s.y + s.h + 0.2, s.z, 0, 0x34495e));
        break;
      case 'garage': {
        fac[1].push(facadeBox(s, s.w, s.d, s.h, 0, 12, 14));
        col.push(colorBox(s.w + 0.6, 0.6, s.d + 0.6, s.x, s.y + s.h + 0.3, s.z, s.rot, 0x1b1b1f));
        // big roller door facing south (+z) and neon sign
        col.push(colorBox(s.w * 0.6, s.h * 0.62, 0.3, s.x, s.y + s.h * 0.31, s.z + s.d / 2 + 0.1, 0, 0x2b2f33));
        neon.push(colorBox(s.w * 0.7, 1.1, 0.3, s.x, s.y + s.h * 0.82, s.z + s.d / 2 + 0.2, 0, 0xe01a2b));
        break;
      }
    }
  }
  // city sidewalks (raised blocks)
  const sw: BufferGeometry[] = [];
  const x0 = cx * CHUNK_SIZE - HALF, z0 = cz * CHUNK_SIZE - HALF;
  for (const b of st.blocks) {
    const bcx = (b.x0 + b.x1) / 2, bcz = (b.z0 + b.z1) / 2;
    if (bcx < x0 || bcx >= x0 + CHUNK_SIZE || bcz < z0 || bcz >= z0 + CHUNK_SIZE) continue;
    const g = new BoxGeometry(b.x1 - b.x0, CURB_H + 0.6, b.z1 - b.z0).toNonIndexed();
    g.translate(bcx, CITY_Y + CURB_H / 2 - 0.3, bcz);
    const uv = g.getAttribute('uv');
    const pos = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3.2, pos.getZ(i) / 3.2 + pos.getY(i) / 3.2);
    sw.push(g);
    if (b.park) col.push(colorBox(b.x1 - b.x0 - SIDEWALK * 2, 0.1, b.z1 - b.z0 - SIDEWALK * 2, bcx, CITY_Y + CURB_H + 0.02, bcz, 0, 0x3f6b2a));
  }
  const merge = (l: BufferGeometry[]) => (l.length ? mergeGeometries(l, false) : null);
  return { facades: fac.map(merge), colored: merge(col), sidewalks: merge(sw), neon: merge(neon) };
}

/** Whole-island low-detail skyline (boxes slightly inset) for distant views. */
export function buildSkyline(st: Structures): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const s of st.list) {
    if (s.kind !== 'building' && s.kind !== 'warehouse' && s.kind !== 'crane') continue;
    if (s.kind === 'crane') {
      parts.push(colorBox(s.w, s.h, s.d * 0.2, s.x, s.y + s.h / 2, s.z, 0, 0x8c3a30));
      continue;
    }
    const col = s.style === 0 ? 0x3d4a57 : s.style === 2 ? 0x6b4436 : 0x8a8780;
    parts.push(colorBox(s.w - 0.8, s.h - 0.4, s.d - 0.8, s.x, s.y + (s.h - 0.4) / 2, s.z, s.rot, col));
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}
