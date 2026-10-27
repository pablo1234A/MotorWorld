import { clamp } from '../core/MathUtil';
import type { RoadNetwork } from '../world/RoadNetwork';

export interface RouteLeg {
  road: string;
  from: [number, number];
  to: [number, number];
  /** For loops: travel the long way round / force direction. */
  dir?: 1 | -1;
}

/**
 * A race route: dense polyline (2 m) following road centre lines, with
 * cumulative distance, widths, curvature and checkpoints.
 */
export class Route {
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  tx: number[] = [];
  tz: number[] = [];
  hw: number[] = [];
  d: number[] = [];
  curv: number[] = [];
  length = 0;
  closed: boolean;
  checkpoints: number[] = []; // indices

  constructor(net: RoadNetwork, legs: RouteLeg[], closed: boolean, cpSpacing = 250) {
    this.closed = closed;
    for (const leg of legs) {
      const r = net.byId(leg.road);
      const a = net.closestOnRoad(r, leg.from[0], leg.from[1]).s;
      const b = net.closestOnRoad(r, leg.to[0], leg.to[1]).s;
      let dir = leg.dir ?? (b >= a ? 1 : -1);
      let dist = (b - a) * dir;
      if (r.loop) dist = (((b - a) * dir) % r.length + r.length) % r.length;
      if (r.loop && dist < 1) dist = r.length; // full lap
      if (!r.loop && dist < 0) {
        dir = -dir as 1 | -1;
        dist = -dist;
      }
      const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
      for (let s = 0; s < dist; s += 2) {
        r.pointAt(a + s * dir, pt);
        // skip points too close to the previous leg's tail
        const n = this.x.length;
        if (n && Math.hypot(this.x[n - 1] - pt.x, this.z[n - 1] - pt.z) < 1.2) continue;
        this.x.push(pt.x);
        this.y.push(pt.y);
        this.z.push(pt.z);
        this.tx.push(pt.tx * dir);
        this.tz.push(pt.tz * dir);
        this.hw.push(r.halfWidth);
      }
    }
    const n = this.x.length;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
      this.d.push(acc);
    }
    this.length = closed ? acc + Math.hypot(this.x[0] - this.x[n - 1], this.z[0] - this.z[n - 1]) : acc;
    // recompute tangents from geometry (legs may join at angles)
    for (let i = 0; i < n; i++) {
      const a = this.idx(i - 1), b = this.idx(i + 1);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    for (let i = 0; i < n; i++) {
      const a = this.idx(i - 4), b = this.idx(i + 4);
      const cross = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b];
      const dot = this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b];
      this.curv.push(Math.atan2(cross, dot) / 16);
    }
    const count = Math.max(2, Math.round(this.length / cpSpacing));
    for (let k = 1; k <= count; k++) {
      const target = (this.length * k) / count - (closed ? 0 : 0.5);
      this.checkpoints.push(this.indexAtDist(Math.min(target, this.d[n - 1])));
    }
  }

  get n() {
    return this.x.length;
  }

  idx(i: number) {
    const n = this.x.length;
    return this.closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
  }

  indexAtDist(dist: number): number {
    const n = this.n;
    if (this.closed) dist = ((dist % this.length) + this.length) % this.length;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.d[m] <= dist) lo = m;
      else hi = m - 1;
    }
    return lo;
  }

  /** Project a point near index hint: returns index, distance along route, signed lateral offset. */
  project(x: number, z: number, hint: number, window = 40): { i: number; dist: number; lat: number; err: number } {
    let best = Infinity, bi = hint;
    const n = this.n;
    const range = hint < 0 ? n : window;
    const start = hint < 0 ? 0 : hint - range;
    for (let k = start; k <= (hint < 0 ? n - 1 : hint + range); k++) {
      const i = this.idx(k);
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const rx = -this.tz[bi], rz = this.tx[bi];
    const lat = (x - this.x[bi]) * rx + (z - this.z[bi]) * rz;
    const along = (x - this.x[bi]) * this.tx[bi] + (z - this.z[bi]) * this.tz[bi];
    return { i: bi, dist: this.d[bi] + along, lat, err: Math.sqrt(best) };
  }

  heading(i: number) {
    return Math.atan2(-this.tx[i], -this.tz[i]);
  }
}
