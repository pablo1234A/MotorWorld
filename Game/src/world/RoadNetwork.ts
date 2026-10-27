import { clamp, lerp, smoothstep } from '../core/MathUtil';
import type { Heightmap } from './Heightmap';
import type { TerrainGen } from './TerrainGen';
import { CITY_Y, HALF, RIVER, ROAD_KINDS, type RoadDef, type RoadKindInfo } from './WorldDef';

export const RF = { tunnel: 1, bridge: 2, railL: 4, railR: 8, lit: 16, junction: 32, city: 64 } as const;
const STEP = 2; // sample spacing (m)

/** A road sampled at fixed arc-length steps with an elevation profile. */
export class Road {
  readonly index: number;
  readonly def: RoadDef;
  readonly info: RoadKindInfo;
  readonly halfWidth: number;
  n = 0;
  length = 0;
  px!: Float32Array;
  pz!: Float32Array;
  py!: Float32Array;
  tx!: Float32Array;
  tz!: Float32Array;
  flags!: Uint8Array;
  /** Junctions: arc positions where other roads attach (for rails gaps / traffic). */
  junctions: { s: number; road: Road; otherS: number; end: boolean }[] = [];

  constructor(index: number, def: RoadDef) {
    this.index = index;
    this.def = def;
    this.info = ROAD_KINDS[def.kind];
    this.halfWidth = this.info.width / 2;
  }

  get loop() {
    return this.def.loop;
  }

  /** Index for arc length s (wrapping for loops). */
  sToI(s: number): number {
    if (this.loop) s = ((s % this.length) + this.length) % this.length;
    return clamp(s / STEP, 0, this.n - 1);
  }

  /** Interpolated centre point at arc length s. */
  pointAt(s: number, out: { x: number; y: number; z: number; tx: number; tz: number }) {
    const f = this.sToI(s);
    let i = Math.floor(f);
    let j = i + 1;
    if (j >= this.n) j = this.loop ? 0 : this.n - 1;
    if (i >= this.n) i = this.n - 1;
    const t = f - Math.floor(f);
    out.x = lerp(this.px[i], this.px[j], t);
    out.y = lerp(this.py[i], this.py[j], t);
    out.z = lerp(this.pz[i], this.pz[j], t);
    const tx = lerp(this.tx[i], this.tx[j], t), tz = lerp(this.tz[i], this.tz[j], t);
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    return out;
  }

  /** Lateral lane offset for lane index (0 = innermost) in direction dir (+1 along s, -1 against). */
  laneOffset(lane: number, dir: number): number {
    const lw = this.info.oneWay ? this.info.width / (this.info.lanesPerDir + 0) : this.info.width / 2 / this.info.lanesPerDir;
    if (this.info.oneWay) return (lane - (this.info.lanesPerDir - 1) / 2) * lw;
    // right-hand traffic: forward lanes on the right side of the tangent
    return dir * (lw * (lane + 0.5));
  }
}

export interface RoadHit {
  road: Road;
  i: number; // segment start index
  t: number;
  s: number;
  /** signed lateral offset (+ = right of tangent) */
  lateral: number;
  dist: number;
  y: number;
}

/**
 * All roads of the island, their elevation profiles, tunnels/bridges and a spatial hash for queries.
 */
export class RoadNetwork {
  readonly roads: Road[] = [];
  private grid = new Map<number, number[]>(); // cell -> packed (road<<20 | seg)
  private readonly cell = 32;

  constructor(defs: RoadDef[]) {
    defs.forEach((d, i) => this.roads.push(new Road(i, { ...d, pts: d.pts.map((p) => [p[0], p[1]] as [number, number]) })));
    for (const r of this.roads) this.sample(r);
    this.extendToJunctions();
  }

  /** Make T-junctions meet: extend road ends that stop short of another road onto its centre line. */
  private extendToJunctions() {
    for (const r of this.roads) {
      if (r.loop) continue;
      let changed = false;
      for (const atStart of [true, false]) {
        const i = atStart ? 0 : r.n - 1;
        const x = r.px[i], z = r.pz[i];
        let best: { x: number; z: number; d: number } | null = null;
        for (const o of this.roads) {
          if (o === r) continue;
          const h = this.closestOnRoad(o, x, z);
          if (h.d < 28 && h.d > 0.8 && (!best || h.d < best.d)) {
            const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
            o.pointAt(h.s, pt);
            best = { x: pt.x, z: pt.z, d: h.d };
          }
        }
        if (best) {
          const pts = r.def.pts;
          if (atStart) pts.unshift([best.x, best.z]);
          else pts.push([best.x, best.z]);
          changed = true;
        }
      }
      if (changed) this.sample(r);
    }
  }

  byId(id: string) {
    return this.roads.find((r) => r.def.id === id)!;
  }

  /** Centripetal Catmull-Rom sampling at fixed arc length. */
  private sample(r: Road) {
    const pts = r.def.pts;
    const loop = r.def.loop;
    const dense: [number, number][] = [];
    const n = pts.length;
    if (n === 2) {
      const [a, b] = pts;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.ceil(L / 0.5);
      for (let i = 0; i <= k; i++) dense.push([lerp(a[0], b[0], i / k), lerp(a[1], b[1], i / k)]);
    } else {
      const segs = loop ? n : n - 1;
      const get = (i: number) => (loop ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
      for (let s = 0; s < segs; s++) {
        let p0 = get(s - 1);
        const p1 = get(s), p2 = get(s + 1);
        let p3 = get(s + 2);
        if (!loop && s === 0) p0 = [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
        if (!loop && s === segs - 1) p3 = [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
        const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const k = Math.max(4, Math.ceil(L / 0.5));
        for (let i = 0; i < k; i++) dense.push(catmull(p0, p1, p2, p3, i / k));
      }
      dense.push(loop ? [...dense[0]] as [number, number] : [...pts[n - 1]] as [number, number]);
    }
    // resample at fixed arc length
    const xs: number[] = [dense[0][0]], zs: number[] = [dense[0][1]];
    let acc = 0, total = 0;
    for (let i = 1; i < dense.length; i++) {
      const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
      total += d;
      acc += d;
      while (acc >= STEP) {
        const over = acc - STEP;
        const t = d > 0 ? 1 - over / d : 0;
        xs.push(lerp(dense[i - 1][0], dense[i][0], t));
        zs.push(lerp(dense[i - 1][1], dense[i][1], t));
        acc = over;
      }
    }
    if (!loop && acc > 0.3) {
      xs.push(dense[dense.length - 1][0]);
      zs.push(dense[dense.length - 1][1]);
    }
    if (loop) {
      // drop the duplicate closing point
      const lx = xs[xs.length - 1], lz = zs[zs.length - 1];
      if (Math.hypot(lx - xs[0], lz - zs[0]) < STEP * 0.6) {
        xs.pop();
        zs.pop();
      }
    }
    r.n = xs.length;
    r.length = loop ? r.n * STEP : (r.n - 1) * STEP;
    r.px = new Float32Array(xs);
    r.pz = new Float32Array(zs);
    r.py = new Float32Array(r.n);
    r.tx = new Float32Array(r.n);
    r.tz = new Float32Array(r.n);
    r.flags = new Uint8Array(r.n);
    for (let i = 0; i < r.n; i++) {
      const a = i === 0 ? (loop ? r.n - 1 : 0) : i - 1;
      const b = i === r.n - 1 ? (loop ? 0 : r.n - 1) : i + 1;
      const dx = r.px[b] - r.px[a], dz = r.pz[b] - r.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      r.tx[i] = dx / l;
      r.tz[i] = dz / l;
    }
  }

  /** Find junctions (road endpoints touching other roads). */
  findJunctions() {
    for (const r of this.roads) r.junctions = [];
    for (const r of this.roads) {
      if (r.loop) continue;
      for (const end of [0, r.n - 1]) {
        const x = r.px[end], z = r.pz[end];
        let best: { road: Road; s: number; d: number } | null = null;
        for (const o of this.roads) {
          if (o === r) continue;
          const h = this.closestOnRoad(o, x, z);
          if (h.d < 28 && (!best || h.d < best.d)) best = { road: o, s: h.s, d: h.d };
        }
        if (best) {
          r.junctions.push({ s: end * STEP, road: best.road, otherS: best.s, end: true });
          best.road.junctions.push({ s: best.s, road: r, otherS: end * STEP, end: false });
        }
      }
    }
    // mid-road crossings (city grid & at-grade crossings)
    for (let a = 0; a < this.roads.length; a++)
      for (let b = a + 1; b < this.roads.length; b++) {
        const A = this.roads[a], B = this.roads[b];
        for (let i = 0; i < A.n - 1; i += 2) {
          const h = this.closestOnRoad(B, A.px[i], A.pz[i]);
          if (h.d < 2.2) {
            const sA = i * STEP;
            if (!A.junctions.some((j) => j.road === B && Math.abs(j.s - sA) < 30)) {
              A.junctions.push({ s: sA, road: B, otherS: h.s, end: false });
              B.junctions.push({ s: h.s, road: A, otherS: sA, end: false });
            }
          }
        }
      }
  }

  closestOnRoad(r: Road, x: number, z: number): { d: number; s: number } {
    let best = Infinity, bi = 0;
    for (let i = 0; i < r.n; i += 4) {
      const d = (r.px[i] - x) ** 2 + (r.pz[i] - z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const lo = Math.max(0, bi - 4), hi = Math.min(r.n - 1, bi + 4);
    let bs = bi * STEP;
    for (let i = lo; i < hi; i++) {
      const ax = r.px[i], az = r.pz[i], bx = r.px[i + 1], bz = r.pz[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2;
      if (d < best) {
        best = d;
        bs = (i + t) * STEP;
      }
    }
    return { d: Math.sqrt(best), s: bs };
  }

  /** Elevation profiles from the natural terrain, with junction pinning, grade limits, river clearance. */
  buildProfiles(gen: TerrainGen, natural: (x: number, z: number) => number) {
    this.findJunctions();
    const order = [...this.roads].sort((a, b) => prio(a) - prio(b));
    const done = new Set<Road>();
    for (const r of order) {
      const n = r.n;
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = natural(r.px[i], r.pz[i]);
      // moving average
      const W = Math.max(1, Math.round(r.info.smoothing / STEP / 2));
      const sm = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -W; k <= W; k += 2) {
          let j = i + k;
          if (r.loop) j = (j + n) % n;
          else if (j < 0 || j >= n) continue;
          sum += raw[j];
          c++;
        }
        sm[i] = sum / c;
      }
      // keep the road out of the sea and over the river
      for (let i = 0; i < n; i++) {
        sm[i] = Math.max(sm[i], 2.0);
        const rv = gen.river(r.px[i], r.pz[i]);
        if (rv.d < RIVER.width * 1.2) sm[i] = Math.max(sm[i], rv.water + 6);
      }
      // river clearance ramps (spread the raise along the road)
      const raised = Float32Array.from(sm);
      for (let i = 0; i < n; i++) {
        const rv = gen.river(r.px[i], r.pz[i]);
        if (rv.d < RIVER.width * 1.2) {
          const target = rv.water + 6;
          const R = 70;
          for (let k = -R; k <= R; k++) {
            let j = i + k;
            if (r.loop) j = (j + n) % n;
            else if (j < 0 || j >= n) continue;
            const w = 1 - Math.abs(k) / R;
            raised[j] = Math.max(raised[j], lerp(sm[j], target, smoothstep(0, 1, w)));
          }
        }
      }
      sm.set(raised);
      // grade limit (two passes)
      const g = r.info.maxGrade * STEP;
      for (let pass = 0; pass < 3; pass++) {
        const lo = r.loop ? 0 : 1;
        for (let k = lo; k < n + (r.loop ? n : 0); k++) {
          const i = k % n, p = (k - 1 + n) % n;
          sm[i] = clamp(sm[i], sm[p] - g, sm[p] + g);
        }
        for (let k = (r.loop ? 2 * n : n) - 2; k >= 0; k--) {
          const i = k % n, q = (k + 1) % n;
          if (!r.loop && k + 1 >= n) continue;
          sm[i] = clamp(sm[i], sm[q] - g, sm[q] + g);
        }
      }
      // limit vertical curvature (no launch ramps on crests at the design speed)
      const vd = r.info.speed * 1.6;
      const kMax = 9.81 / (vd * vd) * 0.7 * STEP * STEP;
      for (let it = 0; it < 60; it++) {
        let worst = 0;
        for (let i = 1; i < n - 1; i++) {
          const a = sm[i - 1], b = sm[i], c2 = sm[i + 1];
          const k2 = a - 2 * b + c2;
          if (Math.abs(k2) > kMax) {
            const corr = (k2 - Math.sign(k2) * kMax) / 6;
            sm[i] += corr * 2;
            sm[i - 1] -= corr;
            sm[i + 1] -= corr;
            worst = Math.max(worst, Math.abs(k2));
          }
        }
        if (worst === 0) break;
      }
      // final smoothing for ride quality
      const out = new Float32Array(n);
      const FW = r.def.kind === 'street' || r.def.kind === 'boulevard' ? 6 : 12;
      for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let k = -FW; k <= FW; k++) {
          let j = i + k;
          if (r.loop) j = (j + n) % n;
          else if (j < 0 || j >= n) continue;
          sum += sm[j];
          c++;
        }
        out[i] = sum / c;
      }
      // city roads are perfectly flat
      for (let i = 0; i < n; i++) {
        const cm = gen.cityMask(r.px[i], r.pz[i]);
        if (cm > 0.999) out[i] = CITY_Y + 0.05;
        else if (cm > 0) out[i] = lerp(out[i], CITY_Y + 0.05, smoothstep(0.6, 1, cm));
      }
      // pin junction heights to already-built host roads
      const pinned: number[] = [];
      for (const j of r.junctions) {
        if (!done.has(j.road)) continue;
        const host = j.road;
        const hi = Math.round(host.sToI(j.otherS));
        const pin = host.py[hi];
        const i0 = Math.round(r.sToI(j.s));
        const delta = pin - out[i0];
        pinned.push(i0);
        // grade-separated crossings (bridges, tunnels, big height differences) keep their own levels
        if (!j.end && !host.junctions.some((hj) => hj.road === r && hj.end)) {
          if (Math.abs(delta) > 3 || host.flags[hi] & (RF.tunnel | RF.bridge)) continue;
        }
        // blend length grows with the height difference so the grade stays drivable
        const R = Math.round(Math.max(160, (Math.abs(delta) / (r.info.maxGrade * 0.7)) * 1.2) / STEP);
        for (let k = -R; k <= R; k++) {
          let i = i0 + k;
          if (r.loop) i = (i + n) % n;
          else if (i < 0 || i >= n) continue;
          out[i] += delta * smoothstep(1, 0, Math.abs(k) / R);
        }
      }
      // re-limit the grade after pinning (interior samples only: junction ends stay pinned)
      {
        const g2 = r.info.maxGrade * 1.15 * STEP;
        const fixed = new Set<number>(pinned);
        if (!r.loop) {
          fixed.add(0);
          fixed.add(n - 1);
        }
        const span = r.loop ? 2 * n : n;
        for (let pass = 0; pass < 4; pass++) {
          for (let k = 1; k < span; k++) {
            const i = k % n, p = (k - 1) % n;
            if (!fixed.has(i)) out[i] = clamp(out[i], out[p] - g2, out[p] + g2);
          }
          for (let k = span - 2; k >= 0; k--) {
            const i = k % n, q = (k + 1) % n;
            if (!fixed.has(i)) out[i] = clamp(out[i], out[q] - g2, out[q] + g2);
          }
        }
      }
      r.py = out;
      done.add(r);
      // classify tunnels / bridges
      this.classify(r, raw, gen);
    }
  }

  private classify(r: Road, raw: Float32Array, gen: TerrainGen) {
    const n = r.n;
    const f = r.flags;
    for (let i = 0; i < n; i++) {
      const diff = raw[i] - r.py[i];
      const rv = gen.river(r.px[i], r.pz[i]);
      if ((r.def.kind === 'highway' || r.def.kind === 'road') && diff > 11) f[i] |= RF.tunnel;
      if (diff < -6 || rv.d < RIVER.width * 0.9) f[i] |= RF.bridge;
      if (r.info.lights) f[i] |= RF.lit;
      if (gen.cityMask(r.px[i], r.pz[i]) > 0.95) f[i] |= RF.city;
    }
    // remove short runs and fill short gaps
    cleanRuns(f, RF.tunnel, 60, 30);
    cleanRuns(f, RF.bridge, 16, 12);
    // tunnels don't need bridge flags
    for (let i = 0; i < n; i++) if (f[i] & RF.tunnel) f[i] &= ~RF.bridge;
    // junction markers (no rails there)
    for (const j of r.junctions) {
      const i0 = Math.round(r.sToI(j.s));
      const R = Math.round((j.road.halfWidth + 16) / STEP);
      for (let k = -R; k <= R; k++) {
        let i = i0 + k;
        if (r.loop) i = (i + n) % n;
        else if (i < 0 || i >= n) continue;
        f[i] |= RF.junction;
      }
    }
  }

  /** Decide guard rails (needs final terrain for drop detection). */
  buildRails(hm: Heightmap) {
    for (const r of this.roads) {
      const f = r.flags;
      for (let i = 0; i < r.n; i++) {
        if (f[i] & RF.junction || f[i] & RF.tunnel) continue;
        if (r.info.rails === 'always' || f[i] & RF.bridge) {
          f[i] |= RF.railL | RF.railR;
          continue;
        }
        if (r.info.rails === 'drop') {
          for (const side of [-1, 1]) {
            const off = r.halfWidth + 7;
            const x = r.px[i] - r.tz[i] * off * side, z = r.pz[i] + r.tx[i] * off * side;
            if (hm.heightAt(x, z) < r.py[i] - 3) f[i] |= side < 0 ? RF.railL : RF.railR;
          }
        }
      }
      cleanRuns(f, RF.railL, 10, 6);
      cleanRuns(f, RF.railR, 10, 6);
      for (let i = 0; i < r.n; i++) if (f[i] & RF.junction) f[i] &= ~(RF.railL | RF.railR);
    }
  }

  /** Flatten the heightmap under roads (embankments and cuttings). */
  flattenTerrain(hm: Heightmap) {
    const n = hm.n;
    const wMax = new Float32Array(n * n);
    const target = new Float32Array(n * n);
    const dMin = new Float32Array(n * n).fill(1e9);
    const res = (HALF * 2) / (n - 1);
    for (const r of this.roads) {
      for (let i = 0; i < r.n - 1; i += 2) {
        const fl = r.flags[i];
        if (fl & RF.tunnel) continue;
        const bridge = (fl & RF.bridge) !== 0;
        const ax = r.px[i], az = r.pz[i];
        const j2 = Math.min(i + 2, r.n - 1);
        const bx = r.px[j2], bz = r.pz[j2];
        const ay = r.py[i], by = r.py[j2];
        const nat = hm.heightAt(ax, az);
        const core = r.halfWidth + 2.5;
        const blend = clamp(10 + Math.abs(nat - ay) * 1.6, 10, 46);
        const R = bridge ? r.halfWidth : core + blend;
        const i0 = Math.floor((Math.min(ax, bx) - R + HALF) / res), i1 = Math.ceil((Math.max(ax, bx) + R + HALF) / res);
        const j0 = Math.floor((Math.min(az, bz) - R + HALF) / res), j1 = Math.ceil((Math.max(az, bz) + R + HALF) / res);
        const dx = bx - ax, dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        for (let gj = Math.max(0, j0); gj <= Math.min(n - 1, j1); gj++) {
          const z = gj * res - HALF;
          for (let gi = Math.max(0, i0); gi <= Math.min(n - 1, i1); gi++) {
            const x = gi * res - HALF;
            const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
            const ex = ax + dx * t - x, ez = az + dz * t - z;
            const d = Math.sqrt(ex * ex + ez * ez);
            if (d > R) continue;
            let w = d <= core ? 1 : 1 - smoothstep(core, core + blend, d);
            if (bridge) w *= 0; // bridges keep terrain below
            const k = gj * n + gi;
            if (w > wMax[k] + 1e-6 || (w > 0.999 && wMax[k] > 0.999 && d < dMin[k])) {
              wMax[k] = w;
              dMin[k] = d;
              target[k] = lerp(ay, by, t) - (d <= r.halfWidth + 0.5 ? 0.25 : 0.12);
            }
          }
        }
      }
    }
    for (let k = 0; k < n * n; k++) if (wMax[k] > 0) hm.h[k] = lerp(hm.h[k], target[k], wMax[k]);
  }

  buildIndex() {
    this.grid.clear();
    const c = this.cell;
    for (const r of this.roads) {
      const pad = r.halfWidth + 6;
      const segs = r.loop ? r.n : r.n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % r.n;
        const x0 = Math.min(r.px[i], r.px[j]) - pad, x1 = Math.max(r.px[i], r.px[j]) + pad;
        const z0 = Math.min(r.pz[i], r.pz[j]) - pad, z1 = Math.max(r.pz[i], r.pz[j]) + pad;
        for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++)
          for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
            const key = (cx + 1000) * 4096 + (cz + 1000);
            let arr = this.grid.get(key);
            if (!arr) this.grid.set(key, (arr = []));
            arr.push((r.index << 20) | i);
          }
      }
    }
  }

  /**
   * Roads covering (x,z) within their half width + margin. Calls fn for each candidate hit.
   */
  query(x: number, z: number, margin: number, fn: (h: RoadHit) => void, hit: RoadHit = { road: null as any, i: 0, t: 0, s: 0, lateral: 0, dist: 0, y: 0 }) {
    const c = this.cell;
    const arr = this.grid.get((Math.floor(x / c) + 1000) * 4096 + (Math.floor(z / c) + 1000));
    if (!arr) return;
    let lastRoad = -1;
    let bestD = Infinity;
    let best: { road: Road; i: number; t: number; d: number; lat: number } | null = null;
    const flush = () => {
      if (best) {
        const r = best.road;
        const j = (best.i + 1) % r.n;
        hit.road = r;
        hit.i = best.i;
        hit.t = best.t;
        hit.s = (best.i + best.t) * STEP;
        hit.lateral = best.lat;
        hit.dist = best.d;
        hit.y = lerp(r.py[best.i], r.py[j], best.t);
        fn(hit);
      }
      best = null;
      bestD = Infinity;
    };
    for (const packed of arr) {
      const ri = packed >> 20, i = packed & 0xfffff;
      if (ri !== lastRoad) {
        flush();
        lastRoad = ri;
      }
      const r = this.roads[ri];
      const j = (i + 1) % r.n;
      const ax = r.px[i], az = r.pz[i];
      const dx = r.px[j] - ax, dz = r.pz[j] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const ex = x - (ax + dx * t), ez = z - (az + dz * t);
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d > r.halfWidth + margin || d >= bestD) continue;
      // lateral sign: + to the right of travel direction (right = (-tz, tx) in XZ with -Z forward convention)
      const l = Math.sqrt(l2);
      const lat = (ex * -dz + ez * dx) / l;
      bestD = d;
      best = { road: r, i, t, d, lat };
    }
    flush();
  }

  /** Nearest road hit to a point within maxDist (any road). */
  nearest(x: number, z: number, maxDist: number): RoadHit | null {
    let res: RoadHit | null = null;
    this.query(x, z, maxDist, (h) => {
      if (!res || h.dist < res.dist) res = { ...h };
    });
    return res;
  }
}

function prio(r: Road) {
  return { highway: 0, circuit: 1, boulevard: 2, strip: 3, street: 4, road: 5, mountain: 6, dirt: 7 }[r.def.kind];
}

function catmull(p0: number[], p1: number[], p2: number[], p3: number[], t: number): [number, number] {
  // centripetal parameterisation
  const a = 0.5;
  const d = (p: number[], q: number[]) => Math.pow(Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-4, a);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  const out: number[] = [0, 0];
  for (let k = 0; k < 2; k++) {
    const A1 = ((t1 - tt) / (t1 - t0)) * p0[k] + ((tt - t0) / (t1 - t0)) * p1[k];
    const A2 = ((t2 - tt) / (t2 - t1)) * p1[k] + ((tt - t1) / (t2 - t1)) * p2[k];
    const A3 = ((t3 - tt) / (t3 - t2)) * p2[k] + ((tt - t2) / (t3 - t2)) * p3[k];
    const B1 = ((t2 - tt) / (t2 - t0)) * A1 + ((tt - t0) / (t2 - t0)) * A2;
    const B2 = ((t3 - tt) / (t3 - t1)) * A2 + ((tt - t1) / (t3 - t1)) * A3;
    out[k] = ((t2 - tt) / (t2 - t1)) * B1 + ((tt - t1) / (t2 - t1)) * B2;
  }
  return [out[0], out[1]];
}

/** Remove runs of a flag shorter than minRun and fill gaps shorter than maxGap. */
function cleanRuns(f: Uint8Array, bit: number, minRun: number, maxGap: number) {
  const n = f.length;
  // fill gaps
  let i = 0;
  while (i < n) {
    if (!(f[i] & bit)) {
      let j = i;
      while (j < n && !(f[j] & bit)) j++;
      if (i > 0 && j < n && j - i < maxGap) for (let k = i; k < j; k++) f[k] |= bit;
      i = j;
    } else i++;
  }
  i = 0;
  while (i < n) {
    if (f[i] & bit) {
      let j = i;
      while (j < n && f[j] & bit) j++;
      if (j - i < minRun) for (let k = i; k < j; k++) f[k] &= ~bit;
      i = j;
    } else i++;
  }
}

export { STEP as ROAD_STEP };
