import { BufferGeometry, Float32BufferAttribute } from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtil';
import type { BodyStyle } from './BodyStyle';

/** Monotone cubic (Fritsch–Carlson) interpolation through sorted keys. */
export class MonoSpline {
  private xs: number[];
  private ys: number[];
  private ms: number[];
  constructor(keys: [number, number][]) {
    const k = keys.slice().sort((a, b) => a[0] - b[0]);
    const xs: number[] = [], ys: number[] = [];
    for (const [x, y] of k) {
      if (xs.length && x - xs[xs.length - 1] < 1e-4) {
        ys[ys.length - 1] = y;
        continue;
      }
      xs.push(x);
      ys.push(y);
    }
    const n = xs.length;
    const d: number[] = [], m: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0] ?? 0;
    m[n - 1] = d[n - 2] ?? 0;
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = m[i + 1] = 0;
        continue;
      }
      const a = m[i] / d[i], b = m[i + 1] / d[i];
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
    this.xs = xs;
    this.ys = ys;
    this.ms = m;
  }
  at(x: number): number {
    const xs = this.xs, ys = this.ys, ms = this.ms;
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * ms[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * ms[i + 1];
  }
}

export const SEC_POINTS = 15; // points per half-section
/** Segment roles inside a half section. */
export const SEG = { bottom: 0, lowerCorner: [1, 3], side: [4, 6], tumble: [7, 9], roofCorner: [10, 11], top: [12, 13] } as const;

/** Analytic description of the body surface used both to loft the mesh and to place details. */
export class BodyProfile {
  readonly topS: MonoSpline;
  readonly L: number;
  readonly noseZ: number;
  readonly axleF: number;
  readonly axleR: number;
  readonly archR: number;
  constructor(public readonly b: BodyStyle) {
    this.L = b.length;
    this.axleF = -b.wheelbase / 2;
    this.axleR = b.wheelbase / 2;
    this.noseZ = this.axleF - b.frontAxle;
    this.archR = b.wheelRadius + 0.045;
    const keys: [number, number][] = [
      [0, b.noseH * 0.86],
      [0.025, b.noseH],
      [b.cowlT * 0.6, lerp(b.noseH, b.hoodH, 0.72)],
      [b.cowlT, b.hoodH],
      [b.roofT0, b.roofH],
      [(b.roofT0 + b.roofT1) / 2, b.roofH + 0.012],
      [b.roofT1, b.roofH - 0.01],
      [b.deckT, b.deckH],
      [Math.max(b.deckT + 0.005, 0.985), b.tailH],
      [1, b.tailH - 0.06],
    ];
    if (b.kind === 'truck' || b.kind === 'bus' || b.kind === 'van') {
      keys[1] = [0.01, b.noseH];
      keys[8] = [Math.max(b.deckT + 0.002, 0.996), b.tailH];
      keys[9] = [1, b.tailH - 0.02];
    }
    this.topS = new MonoSpline(keys);
  }

  zAt(t: number) {
    return this.noseZ + t * this.L;
  }
  tAt(z: number) {
    return (z - this.noseZ) / this.L;
  }

  top(t: number) {
    return this.topS.at(clamp(t, 0, 1));
  }

  /** Underbody height including wheel arch cut-outs. */
  bottom(t: number, arches = true) {
    const b = this.b;
    let y = b.clearance + 0.16 * Math.pow(1 - smoothstep(0, 0.1, t), 1.5) + 0.2 * Math.pow(smoothstep(0.9, 1, t), 1.5);
    if (b.kind === 'truck' || b.kind === 'bus') y = b.clearance + 0.1 * (1 - smoothstep(0, 0.03, t));
    if (arches) {
      const z = this.zAt(t);
      const wc = b.wheelRadius;
      for (const az of [this.axleF, this.axleR]) {
        const dz = z - az;
        if (Math.abs(dz) < this.archR) y = Math.max(y, wc + Math.sqrt(this.archR * this.archR - dz * dz));
      }
      if (b.kind === 'bus' || b.kind === 'truck') {
        // rear tandem / extra axle
      }
    }
    return y;
  }

  halfWidth(t: number, withFlare = true) {
    const b = this.b;
    let w = b.width / 2;
    w *= 1 - b.noseTaper * Math.pow(1 - smoothstep(0, 0.22, t), 2);
    w *= 1 - b.tailTaper * Math.pow(smoothstep(0.8, 1, t), 2);
    // round the very ends in plan view
    w *= 1 - 0.06 * Math.pow(1 - smoothstep(0, 0.035, t), 2) - 0.04 * Math.pow(smoothstep(0.975, 1, t), 2);
    if (withFlare && b.flare > 0) {
      const z = this.zAt(t);
      for (const az of [this.axleF, this.axleR]) {
        const dz = (z - az) / (this.archR * 1.35);
        w += b.flare * Math.exp(-dz * dz * 1.6) * (az > 0 ? 1.15 : 0.9);
      }
    }
    return w;
  }

  /** Greenhouse amount (0 = no cabin at this station, 1 = full height cabin). */
  green(t: number) {
    return smoothstep(this.b.beltH + 0.01, this.b.beltH + 0.22, this.top(t));
  }

  /** Half cross-section points [x,y] (x >= 0) from bottom centre to top centre. */
  section(t: number, out: number[]): number[] {
    const b = this.b;
    const yb = this.bottom(t);
    const yt = this.top(t);
    const w = this.halfWidth(t);
    const g = this.green(t);
    const r = b.roundness;
    const belt = Math.min(b.beltH, yt - 0.03);
    const rtHood = clamp(0.03 + 0.09 * r, 0.02, Math.max(0.02, (yt - yb) * 0.3));
    const rtRoof = 0.04 + 0.11 * r;
    const rt = lerp(rtHood, rtRoof, g);
    let sideTop = lerp(yt - rt, belt, g);
    // fender bulges over the wheels: the shoulder rises above the arch even when the hood is low
    let fenderF = 0;
    const z = this.zAt(t);
    for (const az of [this.axleF, this.axleR]) {
      const f = smoothstep(1.75, 0.55, Math.abs(z - az) / this.archR);
      if (f > fenderF) fenderF = f;
    }
    // never a tall ridge above the bonnet, and fade out where the greenhouse starts
    const fenderY = Math.min(b.wheelRadius * 2 + 0.06, yt + 0.07);
    const raise = fenderF > 0 && fenderY > sideTop ? fenderF * (1 - smoothstep(0.0, 0.35, g)) : 0;
    if (raise > 0) sideTop = lerp(sideTop, Math.max(sideTop, fenderY), raise);
    const rb = clamp(0.05 + 0.11 * r, 0.02, Math.max(0.02, (sideTop - yb) * 0.45));
    let roofHalf = lerp(w - 0.012, w * b.roofW, g);
    if (raise > 0) roofHalf = lerp(roofHalf, Math.min(roofHalf, w * 0.78), raise * (1 - g));
    const crown = 0.015 + 0.025 * r;
    const bulge = 0.012 + 0.02 * r;
    out.length = 0;
    out.push(0, yb);
    out.push(w - rb, yb);
    for (const a of [-60, -30]) {
      const ar = (a * Math.PI) / 180;
      out.push(w - rb + rb * Math.cos(ar), yb + rb + rb * Math.sin(ar));
    }
    out.push(w, yb + rb);
    for (const f of [0.38, 0.72]) {
      const y = lerp(yb + rb, sideTop, f);
      out.push(w + bulge * Math.sin(Math.PI * f), y);
    }
    out.push(w, sideTop);
    // tumblehome to the roof corner
    const qx = roofHalf, qy = yt - rt;
    for (const f of [0.35, 0.7]) {
      const x = lerp(w, qx, f);
      const y = lerp(sideTop, qy, f);
      // slight convexity
      out.push(x + (w - qx) * 0.08 * Math.sin(Math.PI * f), y);
    }
    out.push(qx, qy);
    // corner arc
    const ccx = qx - rt, ccy = qy;
    out.push(ccx + rt * Math.cos(Math.PI / 4), ccy + rt * Math.sin(Math.PI / 4));
    out.push(ccx, yt);
    out.push(ccx * 0.5, yt + crown * 0.75);
    out.push(0, yt + crown);
    return out;
  }
}

export interface BodyGeoResult {
  geometry: BufferGeometry;
  profile: BodyProfile;
}

/** Station positions: dense near ends, arches, glass edges and pillars. */
function stations(p: BodyProfile): number[] {
  const b = p.b;
  const ts = new Set<number>();
  const add = (t: number) => {
    if (t >= 0 && t <= 1) ts.add(Math.round(t * 20000) / 20000);
  };
  for (let i = 0; i <= 90; i++) add(i / 90);
  for (const t of [0.004, 0.01, 0.018, 0.028, 0.04, 0.055, 0.96, 0.972, 0.982, 0.99, 0.996]) add(t);
  for (const az of [p.axleF, p.axleR]) {
    for (let i = -14; i <= 14; i++) add(p.tAt(az + (i / 14) * p.archR * 1.02));
    add(p.tAt(az - p.archR - 0.01));
    add(p.tAt(az + p.archR + 0.01));
  }
  const edges = glassRanges(b);
  for (const [a, c] of edges) {
    add(a);
    add(c);
  }
  for (const e of [b.cowlT, b.roofT0, b.roofT1, b.deckT]) {
    add(e - 0.004);
    add(e);
    add(e + 0.004);
  }
  return [...ts].sort((a, c) => a - c);
}

/** t-ranges of side glass (excluding pillars). */
export function glassRanges(b: BodyStyle): [number, number][] {
  const start = b.cowlT + 0.012;
  const midEngine = b.kind === 'mid' || b.kind === 'hyper';
  const end = (b.kind === 'truck' ? b.roofT1 : midEngine ? b.roofT1 + 0.035 : b.deckT) - 0.012;
  const pillars: number[] = [];
  if (b.bPillar > 0) pillars.push(lerp(b.roofT0, b.roofT1, b.bPillar));
  if (b.cPillar && b.cPillar > 0) pillars.push(lerp(b.roofT1, b.deckT, b.cPillar));
  if (b.kind === 'bus') for (let t = 0.1; t < 0.95; t += 0.11) pillars.push(t);
  if (b.kind === 'van') pillars.push(lerp(b.roofT0, b.roofT1, 0.35), lerp(b.roofT0, b.roofT1, 0.7));
  const ranges: [number, number][] = [];
  let a = start;
  for (const pl of pillars.sort((x, y) => x - y)) {
    const pw = b.kind === 'bus' ? 0.006 : 0.014;
    if (pl - pw > a) ranges.push([a, pl - pw]);
    a = pl + pw;
  }
  if (end > a) ranges.push([a, end]);
  return ranges;
}

/**
 * Loft the body surface. Two material groups: 0 = paint, 1 = glass.
 * UV: u = t along length, v = section index / (SEC_POINTS - 1) (0 bottom centre -> 1 top centre).
 */
export function buildBodyGeometry(b: BodyStyle): BodyGeoResult {
  const p = new BodyProfile(b);
  const ts = stations(p);
  const N = SEC_POINTS;
  const pos: number[] = [];
  const uv: number[] = [];
  const sec: number[] = [];
  for (const t of ts) {
    p.section(t, sec);
    const z = p.zAt(t);
    for (let i = 0; i < N; i++) {
      pos.push(sec[i * 2], sec[i * 2 + 1], z);
      uv.push(t, i / (N - 1));
    }
  }
  const S = ts.length;
  // Taubin smoothing of the parametric grid: removes creases between stations while keeping volume
  {
    const tmp = new Float32Array(pos.length);
    const pass = (k: number) => {
      tmp.set(pos);
      for (let s = 1; s < S - 1; s++)
        for (let i = 1; i < N - 1; i++) {
          const v = (s * N + i) * 3;
          const up = ((s - 1) * N + i) * 3, dn = ((s + 1) * N + i) * 3, l = (s * N + i - 1) * 3, r = (s * N + i + 1) * 3;
          // weight neighbours by inverse spacing along the length (stations are not uniform)
          const dzu = Math.max(1e-3, Math.abs(pos[v + 2] - pos[up + 2])), dzd = Math.max(1e-3, Math.abs(pos[dn + 2] - pos[v + 2]));
          const wu = 1 / dzu, wd = 1 / dzd;
          for (let c = 0; c < 2; c++) {
            const along = (pos[up + c] * wu + pos[dn + c] * wd) / (wu + wd);
            const across = (pos[l + c] + pos[r + c]) / 2;
            const avg = along * 0.6 + across * 0.4;
            tmp[v + c] = pos[v + c] + k * (avg - pos[v + c]);
          }
        }
      pos.splice(0, pos.length, ...tmp);
    };
    for (let it = 0; it < 3; it++) {
      pass(0.5);
      pass(-0.53);
    }
  }
  const glass = glassRanges(b);
  const inGlassSide = (t: number) => glass.some(([a, c]) => t > a && t < c);
  const ws0 = b.cowlT + 0.006, ws1 = b.roofT0 - 0.004;
  const rw0 = b.roofT1 + 0.006, rw1 = b.kind === 'mid' || b.kind === 'hyper' ? b.roofT1 + 0.09 : b.deckT - 0.008;
  const hasRearGlass = b.kind !== 'truck' && b.kind !== 'bus' && !(b.kind === 'van');
  const paintIdx: number[] = [];
  const glassIdx: number[] = [];
  // right half (x>0) geometry indices: vertex (s, i) = s*N + i ; left half mirrored after.
  const pushQuad = (arr: number[], a: number, bq: number, c: number, d: number, flip: boolean) => {
    if (flip) arr.push(a, c, bq, bq, c, d);
    else arr.push(a, bq, c, bq, d, c);
  };
  const nRight = S * N;
  // duplicate for left half
  for (let k = 0; k < nRight; k++) {
    pos.push(-pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    uv.push(uv[k * 2], uv[k * 2 + 1]);
  }
  for (let s = 0; s < S - 1; s++) {
    const tm = (ts[s] + ts[s + 1]) / 2;
    for (let i = 0; i < N - 1; i++) {
      let isGlass = false;
      if (i >= 7 && i <= 9 && inGlassSide(tm) && p.green(tm) > 0.6) isGlass = true;
      if (i >= 12 && tm > ws0 && tm < ws1) isGlass = true;
      if (i >= 12 && hasRearGlass && tm > rw0 && tm < rw1 && p.green(tm) > 0.5) isGlass = true;
      if (b.kind === 'bus' && i >= 12 && tm < b.roofT0) isGlass = true;
      const arr = isGlass ? glassIdx : paintIdx;
      const a = s * N + i, bq = s * N + i + 1, c = (s + 1) * N + i, d = (s + 1) * N + i + 1;
      pushQuad(arr, a, bq, c, d, false);
      pushQuad(arr, a + nRight, bq + nRight, c + nRight, d + nRight, true);
    }
  }
  // End caps (front fascia / rear panel) as fans
  const capCenter = (s: number) => {
    let cy = 0;
    for (let i = 0; i < N; i++) cy += pos[(s * N + i) * 3 + 1];
    return cy / N;
  };
  for (const [s, front] of [[0, true], [S - 1, false]] as [number, boolean][]) {
    const cIdx = pos.length / 3;
    pos.push(0, capCenter(s), pos[s * N * 3 + 2]);
    uv.push(front ? 0 : 1, 0.5);
    for (let i = 0; i < N - 1; i++) {
      const a = s * N + i, bq = s * N + i + 1;
      if (front) {
        paintIdx.push(cIdx, bq, a);
        paintIdx.push(cIdx, a + nRight, bq + nRight);
      } else {
        paintIdx.push(cIdx, a, bq);
        paintIdx.push(cIdx, bq + nRight, a + nRight);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex([...paintIdx, ...glassIdx]);
  geo.addGroup(0, paintIdx.length, 0);
  geo.addGroup(paintIdx.length, glassIdx.length, 1);
  geo.computeVertexNormals();
  // fix centre-line normals (symmetry plane)
  const n = geo.getAttribute('normal');
  for (let k = 0; k < n.count; k++) {
    if (Math.abs(pos[k * 3]) < 1e-5) {
      const ny = n.getY(k), nz = n.getZ(k);
      const l = Math.hypot(ny, nz) || 1;
      n.setXYZ(k, 0, ny / l, nz / l);
    }
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geometry: geo, profile: p };
}
