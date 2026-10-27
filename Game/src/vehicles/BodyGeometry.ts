import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
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

export const SEC_POINTS = 15; // control points per half-section
/** Catmull-Rom resampling factor of a half-section (fine points between two control points). */
export const SUB = 4;
export const FINE_POINTS = (SEC_POINTS - 1) * SUB + 1;
/** Segment roles inside a half section. */
export const SEG = { bottom: 0, lowerCorner: [1, 3], side: [4, 6], tumble: [7, 9], roofCorner: [10, 11], top: [12, 13] } as const;

export interface SurfacePoint {
  p: Vector3;
  n: Vector3;
}

/** Analytic description of the body surface used both to loft the mesh and to place details. */
export class BodyProfile {
  readonly topS: MonoSpline;
  readonly L: number;
  readonly noseZ: number;
  readonly axleF: number;
  readonly axleR: number;
  readonly archR: number;
  /** Length (fraction of L) of the rounded nose / tail caps. */
  readonly noseR: number;
  readonly tailR: number;
  private fineCache = new Map<number, Float64Array>();
  constructor(public readonly b: BodyStyle) {
    this.L = b.length;
    this.axleF = -b.wheelbase / 2;
    this.axleR = b.wheelbase / 2;
    this.noseZ = this.axleF - b.frontAxle;
    this.archR = b.wheelRadius + 0.045;
    const boxy = b.kind === 'truck' || b.kind === 'bus' || b.kind === 'van';
    // rounded bumpers: ~8..20 cm depending on the style
    this.noseR = (boxy ? 0.05 : 0.09 + 0.11 * b.roundness) / this.L;
    this.tailR = (boxy ? 0.04 : 0.07 + 0.08 * b.roundness) / this.L;
    const keys: [number, number][] = [
      [0, b.noseH * 0.9],
      [0.025, b.noseH],
      [b.cowlT * 0.6, lerp(b.noseH, b.hoodH, 0.72)],
      [b.cowlT, b.hoodH],
      [b.roofT0, b.roofH],
      [(b.roofT0 + b.roofT1) / 2, b.roofH + 0.012],
      [b.roofT1, b.roofH - 0.01],
      [b.deckT, b.deckH],
      [Math.max(b.deckT + 0.005, 0.985), b.tailH],
      [1, b.tailH - 0.04],
    ];
    if (boxy) {
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
    let y = b.clearance + 0.09 * Math.pow(1 - smoothstep(0, 0.08, t), 1.5) + 0.16 * Math.pow(smoothstep(0.92, 1, t), 1.5);
    if (b.kind === 'truck' || b.kind === 'bus') y = b.clearance + 0.1 * (1 - smoothstep(0, 0.03, t));
    if (arches) {
      const z = this.zAt(t);
      const wc = b.wheelRadius;
      for (const az of [this.axleF, this.axleR]) {
        const dz = z - az;
        if (Math.abs(dz) < this.archR) y = Math.max(y, wc + Math.sqrt(this.archR * this.archR - dz * dz));
      }
    }
    return y;
  }

  halfWidth(t: number, withFlare = true) {
    const b = this.b;
    let w = b.width / 2;
    w *= 1 - b.noseTaper * Math.pow(1 - smoothstep(0, 0.22, t), 2);
    w *= 1 - b.tailTaper * Math.pow(smoothstep(0.8, 1, t), 2);
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

  /** Elliptical closing factor of the nose / tail caps (1 = full section, ->0 at the very ends). */
  endScale(t: number) {
    const ell = (u: number) => Math.sqrt(Math.max(0, 1 - (1 - clamp(u, 0, 1)) ** 2));
    return Math.max(0.035, Math.min(ell(t / this.noseR), ell((1 - t) / this.tailR)));
  }

  /** Half cross-section control points [x,y] (x >= 0) from bottom centre to top centre. */
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
      out.push(x + (w - qx) * 0.08 * Math.sin(Math.PI * f), y);
    }
    out.push(qx, qy);
    // corner arc
    const ccx = qx - rt, ccy = qy;
    out.push(ccx + rt * Math.cos(Math.PI / 4), ccy + rt * Math.sin(Math.PI / 4));
    out.push(ccx, yt);
    out.push(ccx * 0.5, yt + crown * 0.75);
    out.push(0, yt + crown);
    // rounded nose / tail: shrink the section towards its middle
    const e = this.endScale(t);
    if (e < 1) {
      const cy = lerp(yb, yt, 0.5);
      const ev = Math.pow(e, 0.3); // much flatter vertically: the bumper face stays tall, only its edges roll
      for (let i = 0; i < out.length; i += 2) {
        out[i] *= e;
        out[i + 1] = cy + (out[i + 1] - cy) * ev;
      }
    }
    return out;
  }

  /** Fine half-section (FINE_POINTS points, centripetal Catmull-Rom through the control points). Cached. */
  fine(t: number): Float64Array {
    const key = Math.round(t * 1e6);
    let f = this.fineCache.get(key);
    if (f) return f;
    const c = this.section(t, []);
    const n = c.length / 2;
    f = new Float64Array(FINE_POINTS * 2);
    const P = (i: number) => {
      const k = clamp(i, 0, n - 1);
      // mirror the end points across the centre line so the curve meets x=0 perpendicularly
      if (i < 0) return [-c[2], c[3]];
      if (i > n - 1) return [-c[(n - 2) * 2], c[(n - 2) * 2 + 1]];
      return [c[k * 2], c[k * 2 + 1]];
    };
    let o = 0;
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const d = (a: number[], b: number[]) => Math.max(1e-5, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
      const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
      for (let s = 0; s < SUB; s++) {
        const u = t1 + ((t2 - t1) * s) / SUB;
        const pt = [0, 0];
        for (let k = 0; k < 2; k++) {
          const a1 = ((t1 - u) * p0[k] + (u - t0) * p1[k]) / (t1 - t0);
          const a2 = ((t2 - u) * p1[k] + (u - t1) * p2[k]) / (t2 - t1);
          const a3 = ((t3 - u) * p2[k] + (u - t2) * p3[k]) / (t3 - t2);
          const b1 = ((t2 - u) * a1 + (u - t0) * a2) / (t2 - t0);
          const b2 = ((t3 - u) * a2 + (u - t1) * a3) / (t3 - t1);
          pt[k] = ((t2 - u) * b1 + (u - t1) * b2) / (t2 - t1);
        }
        f[o++] = Math.max(0, pt[0]);
        f[o++] = pt[1];
      }
    }
    f[o++] = c[(n - 1) * 2];
    f[o++] = c[(n - 1) * 2 + 1];
    if (this.fineCache.size > 4000) this.fineCache.clear();
    this.fineCache.set(key, f);
    return f;
  }

  /** Is (|x|, y) inside the cross-section at t? */
  inside(t: number, x: number, y: number): boolean {
    const f = this.fine(t);
    const n = f.length / 2;
    x = Math.abs(x);
    let c = false;
    // polygon: fine points, closed along the centre line (x = 0)
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = f[i * 2], yi = f[i * 2 + 1], xj = f[j * 2], yj = f[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /** Surface point seen from the front (x, y): the first station whose section contains the point. */
  frontAt(x: number, y: number, out?: SurfacePoint): SurfacePoint | null {
    return this.endPoint(x, y, true, out);
  }

  /** Surface point seen from the rear (x, y). */
  rearAt(x: number, y: number, out?: SurfacePoint): SurfacePoint | null {
    return this.endPoint(x, y, false, out);
  }

  private endPoint(x: number, y: number, front: boolean, out?: SurfacePoint): SurfacePoint | null {
    const t = this.endSearch(x, y, front);
    if (t === null) return null;
    const h = 0.006;
    // surface z(x, y); one-sided differences towards whichever neighbour is still on the body
    const tx1 = this.endSearch(x + h, y, front), tx0 = tx1 === null ? this.endSearch(x - h, y, front) : null;
    const ty1 = this.endSearch(x, y + h, front), ty0 = ty1 === null ? this.endSearch(x, y - h, front) : null;
    const dzdx = tx1 !== null ? ((tx1 - t) * this.L) / h : tx0 !== null ? ((t - tx0) * this.L) / h : 0;
    const dzdy = ty1 !== null ? ((ty1 - t) * this.L) / h : ty0 !== null ? ((t - ty0) * this.L) / h : 0;
    const r = out ?? { p: new Vector3(), n: new Vector3() };
    r.p.set(x, y, this.zAt(t));
    if (front) r.n.set(dzdx, dzdy, -1);
    else r.n.set(-dzdx, -dzdy, 1);
    r.n.normalize();
    return r;
  }

  /**
   * Outermost station (from the nose or the tail) whose section contains (x, y). The section is not monotonic
   * along the car (wheel arches), so march in small steps, then refine by bisection.
   */
  private endSearch(x: number, y: number, fromFront: boolean): number | null {
    const span = 0.36, step = 0.006;
    let prev = fromFront ? 0 : 1;
    if (this.inside(prev, x, y)) return prev;
    for (let k = 1; k * step <= span; k++) {
      const t = fromFront ? k * step : 1 - k * step;
      if (this.inside(t, x, y)) {
        let lo = prev, hi = t;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) / 2;
          if (this.inside(m, x, y)) hi = m;
          else lo = m;
        }
        return hi;
      }
      prev = t;
    }
    return null;
  }

  /** Point on the outer (right) side surface at longitudinal position z and height y. */
  sideAt(z: number, y: number, out?: SurfacePoint): SurfacePoint {
    const t = clamp(this.tAt(z), 0, 1);
    const r = out ?? { p: new Vector3(), n: new Vector3() };
    const x = this.sideX(t, y);
    const h = 0.01;
    const xz = this.sideX(clamp(t + h / this.L, 0, 1), y) - this.sideX(clamp(t - h / this.L, 0, 1), y);
    const xy = this.sideX(t, y + h) - this.sideX(t, y - h);
    r.p.set(x, y, z);
    // surface x(z, y): outward normal = (1, -dx/dy, -dx/dz)
    r.n.set(1, -xy / (2 * h), -xz / (2 * h)).normalize();
    return r;
  }

  /** x of the outer side at height y (walking the section from the lower side up to the roof corner). */
  sideX(t: number, y: number): number {
    const f = this.fine(t);
    const a = 2 * SUB, bnd = 11 * SUB; // from the lower corner up to the roof corner arc
    let best = 0, bestD = Infinity;
    for (let i = a; i < bnd; i++) {
      const y0 = f[i * 2 + 1], y1 = f[i * 2 + 3];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) {
        const u = (y - y0) / (y1 - y0);
        return lerp(f[i * 2], f[i * 2 + 2], u);
      }
      const d = Math.abs(y0 - y);
      if (d < bestD) {
        bestD = d;
        best = f[i * 2];
      }
    }
    return best;
  }

  /** Point on the upper surface (hood / roof / deck) at lateral x and longitudinal z. */
  topAt(x: number, z: number, out?: SurfacePoint): SurfacePoint {
    const t = clamp(this.tAt(z), 0, 1);
    const r = out ?? { p: new Vector3(), n: new Vector3() };
    const y = this.topY(t, x);
    const h = 0.01;
    const yx = this.topY(t, x + h) - this.topY(t, x - h);
    const yz = this.topY(clamp(t + h / this.L, 0, 1), x) - this.topY(clamp(t - h / this.L, 0, 1), x);
    r.p.set(x, y, z);
    r.n.set(-yx / (2 * h), 1, -yz / (2 * h)).normalize();
    return r;
  }

  topY(t: number, x: number): number {
    const f = this.fine(t);
    const n = f.length / 2;
    x = Math.abs(x);
    // walk from the top centre outwards
    for (let i = n - 1; i > 6 * SUB; i--) {
      const x0 = f[i * 2], x1 = f[i * 2 - 2];
      if (x >= x0 && x <= x1 && x1 !== x0) return lerp(f[i * 2 + 1], f[i * 2 - 1], (x - x0) / (x1 - x0));
    }
    return f[(6 * SUB) * 2 + 1];
  }
}

export interface BodyGeoResult {
  geometry: BufferGeometry;
  profile: BodyProfile;
}

/** Station positions: dense near ends, arches, glass edges and pillars. */
function stations(p: BodyProfile, detail: number): number[] {
  const b = p.b;
  const ts = new Set<number>();
  const add = (t: number) => {
    if (t >= 0 && t <= 1) ts.add(Math.round(t * 20000) / 20000);
  };
  const base = Math.round(60 + 60 * detail);
  for (let i = 0; i <= base; i++) add(i / base);
  // rounded caps: dense, quadratic spacing towards the very ends
  const capN = Math.round(6 + 6 * detail);
  for (let i = 0; i <= capN; i++) {
    const u = (i / capN) ** 2;
    add(u * p.noseR * 1.3);
    add(1 - u * p.tailR * 1.3);
  }
  for (const az of [p.axleF, p.axleR]) {
    const k = Math.round(8 + 6 * detail);
    for (let i = -k; i <= k; i++) add(p.tAt(az + (i / k) * p.archR * 1.02));
    add(p.tAt(az - p.archR - 0.01));
    add(p.tAt(az + p.archR + 0.01));
  }
  for (const [a, c] of glassRanges(b)) {
    for (const d of [-0.008, 0, 0.008]) {
      add(a + d);
      add(c + d);
    }
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
 * Loft the body surface. Material groups: 0 = paint, 1 = glass, 2 = black trim (window frames, pillars).
 * UV: u = t along length, v = position around the half section (0 bottom centre -> 1 top centre).
 * @param detail 0 (traffic) .. 1 (hero cars)
 */
export function buildBodyGeometry(b: BodyStyle, detail = 1): BodyGeoResult {
  const p = new BodyProfile(b);
  const ts = stations(p, detail);
  const N = FINE_POINTS;
  const pos: number[] = [];
  const uv: number[] = [];
  for (const t of ts) {
    const f = p.fine(t);
    const z = p.zAt(t);
    for (let i = 0; i < N; i++) {
      pos.push(f[i * 2], f[i * 2 + 1], z);
      uv.push(t, i / (N - 1));
    }
  }
  const S = ts.length;
  const glass = glassRanges(b);
  const inGlassSide = (t: number) => glass.some(([a, c]) => t > a && t < c);
  const nearGlassEdge = (t: number) => glass.some(([a, c]) => (t > a - 0.009 && t <= a + 0.0005) || (t >= c - 0.0005 && t < c + 0.009));
  const ws0 = b.cowlT + 0.006, ws1 = b.roofT0 - 0.004;
  const midEngine = b.kind === 'mid' || b.kind === 'hyper';
  const rw0 = b.roofT1 + 0.006, rw1 = midEngine ? b.roofT1 + 0.09 : b.deckT - 0.008;
  const hasRearGlass = b.kind !== 'truck' && b.kind !== 'bus' && !(b.kind === 'van');
  const sideLo = 7 * SUB, sideHi = 10 * SUB; // fine rows of the side glass band
  const paintIdx: number[] = [];
  const glassIdx: number[] = [];
  const trimIdx: number[] = [];
  const pushQuad = (arr: number[], a: number, bq: number, c: number, d: number, flip: boolean) => {
    if (flip) arr.push(a, c, bq, bq, c, d);
    else arr.push(a, bq, c, bq, d, c);
  };
  const nRight = S * N;
  for (let k = 0; k < nRight; k++) {
    pos.push(-pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    uv.push(uv[k * 2], uv[k * 2 + 1]);
  }
  const cabin = b.kind !== 'bus' && b.kind !== 'truck';
  for (let s = 0; s < S - 1; s++) {
    const tm = (ts[s] + ts[s + 1]) / 2;
    const gr = p.green(tm);
    for (let j = 0; j < N - 1; j++) {
      const i = Math.floor(j / SUB);
      let arr = paintIdx;
      const sideBand = j >= sideLo && j < sideHi && gr > 0.6;
      if (sideBand && inGlassSide(tm)) {
        // one fine row of black frame around the side windows
        arr = j === sideLo || j === sideHi - 1 ? trimIdx : glassIdx;
      } else if (sideBand && cabin && (nearGlassEdge(tm) || (tm > glass[0]?.[0] && tm < glass[glass.length - 1]?.[1]))) {
        arr = trimIdx; // blacked-out B/C pillars and window frame ends
      }
      if (i >= 12 && tm > ws0 && tm < ws1) arr = tm < ws0 + 0.006 || tm > ws1 - 0.004 || j === 12 * SUB ? trimIdx : glassIdx;
      if (i >= 12 && hasRearGlass && tm > rw0 && tm < rw1 && gr > 0.5) arr = tm < rw0 + 0.005 || tm > rw1 - 0.005 || j === 12 * SUB ? trimIdx : glassIdx;
      if (b.kind === 'bus' && i >= 12 && tm < b.roofT0) arr = glassIdx;
      const a = s * N + j, bq = s * N + j + 1, c = (s + 1) * N + j, d = (s + 1) * N + j + 1;
      pushQuad(arr, a, bq, c, d, false);
      pushQuad(arr, a + nRight, bq + nRight, c + nRight, d + nRight, true);
    }
  }
  // tiny end caps (the rounded ends already almost close the surface)
  const capCenter = (s: number) => {
    let cy = 0;
    for (let i = 0; i < N; i++) cy += pos[(s * N + i) * 3 + 1];
    return cy / N;
  };
  for (const [s, front] of [[0, true], [S - 1, false]] as [number, boolean][]) {
    const cIdx = pos.length / 3;
    pos.push(0, capCenter(s), pos[s * N * 3 + 2] + (front ? -0.002 : 0.002));
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
  geo.setIndex([...paintIdx, ...glassIdx, ...trimIdx]);
  geo.addGroup(0, paintIdx.length, 0);
  geo.addGroup(paintIdx.length, glassIdx.length, 1);
  geo.addGroup(paintIdx.length + glassIdx.length, trimIdx.length, 2);
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
