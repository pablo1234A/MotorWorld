import { Vector3 } from 'three';
import { clamp, lerp } from '../core/MathUtil';
import type { Route } from '../race/Route';
import type { VehicleSim } from '../physics/VehicleSim';
import { lateralG } from '../vehicles/Performance';

export type DriverStyle = 'clean' | 'aggressive' | 'defensive' | 'erratic';

export interface DriverProfile {
  name: string;
  /** 0.8 (rookie) .. 1.05 (alien): fraction of the physical limit used. */
  skill: number;
  style: DriverStyle;
  /** Mistakes per kilometre. */
  mistakes: number;
}

const NAMES = ['Vega', 'Ortiz', 'Kowalski', 'Marchetti', 'Okafor', 'Lindqvist', 'Tanaka', 'Duarte', 'Moreau', 'Haddad', 'Sorensen', 'Ibarra', 'Novak', 'Reyes', 'Castell', 'Nakamura'];

export function makeProfiles(n: number, difficulty: number, seed: number): DriverProfile[] {
  const out: DriverProfile[] = [];
  const styles: DriverStyle[] = ['clean', 'aggressive', 'defensive', 'erratic'];
  for (let i = 0; i < n; i++) {
    const r = Math.abs(Math.sin(seed * 31 + i * 17.3)) % 1;
    const base = [0, 0.83, 0.88, 0.93, 0.975][difficulty];
    out.push({
      name: NAMES[(seed + i * 5) % NAMES.length],
      skill: base + (r - 0.5) * 0.06 + (i === 0 ? 0.02 : 0),
      style: styles[(seed + i) % styles.length],
      mistakes: [0, 0.9, 0.6, 0.35, 0.18][difficulty] * (styles[(seed + i) % 4] === 'erratic' ? 2 : 1),
    });
  }
  return out;
}

const _f = new Vector3();

/**
 * Racing driver: follows a precomputed racing line using pure-pursuit steering and a
 * curvature-based speed profile; overtakes, defends, makes mistakes and recovers.
 */
export class RacerAI {
  idx = 0;
  progress = 0; // route distance incl. laps
  lap = 0;
  private speedProfile: Float32Array;
  private line: Float32Array;
  private overtake = 0;
  private overtakeTimer = 0;
  private mistakeTimer = 0;
  private mistakeKind: 'none' | 'late' | 'wide' = 'none';
  private stuckTime = 0;
  private reverseTime = 0;
  catchup = 1;
  finished = false;
  enabled = true;
  dbg: Record<string, number> = {};
  private mu = 9;

  constructor(public sim: VehicleSim, public route: Route, public profile: DriverProfile) {
    const n = route.n;
    // the AI computes exact wheel angles: no speed-sensitive steering filter
    sim.assists = { ...sim.assists, steering: false };
    const mu = lateralG(sim.spec) * 9.81;
    this.mu = mu;
    this.speedProfile = new Float32Array(n);
    this.line = new Float32Array(n);
    // racing line: shift towards the inside of corners (smoothed curvature)
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = -12; j <= 12; j++) acc += route.curv[route.idx(i + j)];
      k[i] = acc / 25;
    }
    for (let i = 0; i < n; i++) {
      const room = Math.max(0, route.hw[i] - 1.7);
      this.line[i] = clamp(k[i] * 28, -1, 1) * room * 0.8;
    }
    // speed profile: v = sqrt(mu * g_eff / kappa), then backward pass for braking
    for (let i = 0; i < n; i++) {
      // peak curvature nearby (averaging hides the apex)
      let kap = 1e-4;
      for (let j = -8; j <= 8; j++) kap = Math.max(kap, Math.abs(route.curv[route.idx(i + j)]));
      this.speedProfile[i] = Math.min(95, Math.sqrt((mu * 0.9) / kap));
    }
    // crests: keep the tyres on the road (v^2 * kv < g)
    for (let i = 0; i < n; i++) {
      const a = route.idx(i - 6), b = route.idx(i + 6);
      const kv = -(route.y[a] - 2 * route.y[i] + route.y[b]) / (12 * 12);
      if (kv > 1e-4) this.speedProfile[i] = Math.min(this.speedProfile[i], Math.sqrt(9.81 / kv) * 0.95);
    }
    const brake = mu * 0.82;
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 2; i >= -1; i--) {
        const a = route.idx(i), b = route.idx(i + 1);
        const ds = 2;
        const vMax = Math.sqrt(this.speedProfile[b] ** 2 + 2 * brake * ds);
        if (this.speedProfile[a] > vMax) this.speedProfile[a] = vMax;
        if (!route.closed && i < 0) break;
      }
    this.idx = route.project(sim.position.x, sim.position.z, -1).i;
  }

  /** Route-relative progress (metres incl. laps) of an arbitrary point projected with this racer's hint. */
  update(dt: number, others: { x: number; z: number; progress: number; speed: number }[], playerProgress: number) {
    const s = this.sim;
    const r = this.route;
    const pr = r.project(s.position.x, s.position.z, this.idx, 30);
    // lap counting on closed routes
    if (r.closed) {
      if (pr.i < r.n * 0.2 && this.idx > r.n * 0.8) this.lap++;
      else if (pr.i > r.n * 0.8 && this.idx < r.n * 0.2) this.lap--;
    }
    this.idx = pr.i;
    this.progress = this.lap * r.length + r.d[pr.i];
    const inp = s.input;
    if (!this.enabled || this.finished) {
      inp.throttle = 0;
      inp.brake = this.finished ? 0.4 : 1;
      inp.steer = 0;
      return;
    }
    const v = Math.max(0, s.forwardSpeed);
    // ---- mistakes ----
    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0) {
      this.mistakeKind = 'none';
      if (Math.random() < this.profile.mistakes * (v * dt) / 1000) {
        this.mistakeKind = Math.random() < 0.5 ? 'late' : 'wide';
        this.mistakeTimer = 1.5 + Math.random() * 1.5;
      }
    }
    // ---- overtaking / defending ----
    this.overtakeTimer -= dt;
    if (this.overtakeTimer <= 0) this.overtake = lerp(this.overtake, 0, Math.min(1, dt * 0.8));
    s.getForward(_f);
    for (const o of others) {
      const dx = o.x - s.position.x, dz = o.z - s.position.z;
      const ahead = dx * _f.x + dz * _f.z;
      const side = dx * -_f.z + dz * _f.x;
      if (ahead > 2 && ahead < 18 && Math.abs(side) < 2.4 && o.speed < v + 1) {
        // pick the side with more room
        const target = side > 0 ? -1 : 1;
        this.overtake = target * Math.min(3.2, r.hw[pr.i] - 1.6);
        this.overtakeTimer = 2.2;
      }
      if (this.profile.style === 'defensive' && ahead < -2 && ahead > -15 && Math.abs(side) < 4) {
        this.overtake = lerp(this.overtake, clamp(side, -2.5, 2.5), dt * 1.5);
        this.overtakeTimer = 0.5;
      }
    }
    // ---- target point (pure pursuit) ----
    const latErr = Math.abs(pr.lat - this.line[pr.i]);
    const look = clamp(6 + v * 0.55 - latErr * 1.5, 7, 42);
    const ti = r.indexAtDist(r.d[pr.i] + look);
    let off = this.line[ti] + this.overtake + (this.mistakeKind === 'wide' ? 2.2 * Math.sign(this.line[ti] || 1) : 0);
    off = clamp(off, -r.hw[ti] + 1.3, r.hw[ti] - 1.3);
    const tx = r.x[ti] - r.tz[ti] * off, tz = r.z[ti] + r.tx[ti] * off;
    const dx = tx - s.position.x, dz = tz - s.position.z;
    const rightX = -_f.z, rightZ = _f.x;
    const lx = dx * rightX + dz * rightZ;
    const lz = dx * _f.x + dz * _f.z;
    const alpha = Math.atan2(lx, Math.max(0.1, lz));
    const L = s.spec.chassis.wheelbase;
    let steerAngle = Math.atan((2 * L * Math.sin(alpha)) / look);
    // countersteer when the rear steps out
    if (v > 5) steerAngle += clamp(s.bodySlip, -0.5, 0.5) * 0.7;
    inp.steer = clamp(steerAngle / s.spec.steering.maxAngle, -1, 1);
    this.dbg = { alpha, look, off, lx, lz, ti };
    // ---- speed control ----
    const si = r.indexAtDist(r.d[pr.i] + clamp(v * 0.35, 4, 30));
    let vt = this.speedProfile[si] * this.profile.skill * this.catchup;
    if (this.mistakeKind === 'late') vt *= 1.12;
    if (this.profile.style === 'aggressive') vt *= 1.015;
    // rubber-banding (mild)
    const gap = playerProgress - this.progress;
    this.catchup = lerp(this.catchup, clamp(1 + gap / 3000, 0.94, 1.08), dt * 0.5);
    const err = vt - v;
    // predictive braking: deceleration needed to meet every profile point in the next 140 m
    const sk = this.profile.skill * this.catchup * (this.mistakeKind === 'late' ? 1.12 : 1);
    let need = 0;
    for (let k = 2; k <= 70; k += 2) {
      const j = r.idx(pr.i + k);
      const vj = this.speedProfile[j] * sk;
      if (v > vj) need = Math.max(need, (v * v - vj * vj) / (2 * k * 2));
    }
    // downhill reduces available braking
    const grade = (r.y[r.idx(pr.i + 5)] - r.y[pr.i]) / 10;
    const brakeCap = this.mu * 0.72 + grade * 9.81;
    if (need > brakeCap * 0.55) {
      inp.throttle = 0;
      inp.brake = clamp(need / Math.max(1, brakeCap), 0.15, 1);
    } else if (err > 0) {
      inp.throttle = clamp(0.35 + err * 0.35, 0, 1);
      inp.brake = 0;
    } else {
      inp.throttle = clamp(0.3 + err * 0.4, 0, 0.6);
      inp.brake = clamp(-err * 0.18 - 0.05, 0, 1);
    }
    // off-line correction: far from route → slow down
    if (Math.abs(pr.lat) > r.hw[pr.i] + 3) inp.throttle *= 0.5;
    inp.handbrake = false;
    inp.nitro = s.spec.nitro > 0 && err > 8 && Math.abs(inp.steer) < 0.15;
    // ---- stuck recovery ----
    if (v < 1.2 && s.age > 4) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);
    if (this.stuckTime > 2.5) {
      this.reverseTime = 1.4;
      this.stuckTime = 0;
    }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -inp.steer;
    }
  }

  /** Teleport back onto the route (used when hopelessly stuck or fallen off). */
  resetToRoute() {
    const r = this.route;
    const i = this.idx;
    this.sim.reset(r.x[i], r.y[i] + 1.2, r.z[i], r.heading(i));
    this.stuckTime = 0;
  }

  get needsReset(): boolean {
    const s = this.sim;
    const r = this.route;
    const pr = r.project(s.position.x, s.position.z, this.idx, 10);
    return s.isFlipped || pr.err > 45 || s.position.y < r.y[pr.i] - 15;
  }
}
