import { Vector3 } from 'three';
import { obbCircle, obbObb, type Contact2D } from './Collision';
import type { StaticCollider } from './PhysicsWorld';
import type { VehicleSim } from './VehicleSim';

/** Kinematic obstacles (traffic cars) the dynamic vehicles can hit. */
export interface KinematicBody {
  x: number;
  y: number;
  z: number;
  heading: number;
  hx: number;
  hz: number;
  vx: number;
  vz: number;
  mass: number;
  /** Called with the impulse applied to the kinematic body (world XZ). */
  hit(jx: number, jz: number, px: number, pz: number): void;
}

export interface ImpactEvent {
  sim: VehicleSim;
  speed: number;
  x: number;
  y: number;
  z: number;
  kind: 'static' | 'car' | 'barrier' | 'traffic';
}

export interface BarrierSource {
  barrierAt(x: number, y: number, z: number, out: Vector3): number;
}

const _c: Contact2D = { hit: false, nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
const _n = new Vector3();
const _p = new Vector3();
const _v = new Vector3();
const _v2 = new Vector3();
const _t = new Vector3();
const _list: StaticCollider[] = [];

function headingOf(sim: VehicleSim) {
  return sim.heading;
}

/**
 * Resolves vehicle collisions against static colliders, road barriers, other vehicles and traffic.
 * Uses top-down OBB SAT + impulses applied at contact points (produces realistic spins).
 */
export class CollisionSystem {
  impacts: ImpactEvent[] = [];
  /** Scrape intensity per sim this frame (for sparks/audio). */
  scrapes = new Map<VehicleSim, number>();

  resolve(sims: VehicleSim[], traffic: KinematicBody[], barriers: BarrierSource) {
    this.impacts.length = 0;
    this.scrapes.clear();
    for (const s of sims) {
      if (s.frozen) continue;
      this.statics(s);
      this.barriers(s, barriers);
      for (const t of traffic) this.kinematic(s, t);
    }
    for (let i = 0; i < sims.length; i++)
      for (let j = i + 1; j < sims.length; j++) if (!sims[i].frozen && !sims[j].frozen) this.pair(sims[i], sims[j]);
  }

  private box(s: VehicleSim) {
    const c = s.spec.chassis;
    return { hx: c.width * 0.48, hz: c.length * 0.48, rot: headingOf(s) };
  }

  private applyContact(s: VehicleSim, nx: number, nz: number, depth: number, px: number, pz: number, restitution: number, friction: number, kind: ImpactEvent['kind'], other?: VehicleSim | KinematicBody) {
    // contact point at mid-height of the body
    _p.set(px, s.position.y, pz);
    _n.set(nx, 0, nz);
    s.position.x += nx * depth * 0.9;
    s.position.z += nz * depth * 0.9;
    s.pointVelocity(_p, _v);
    let vrel = _v.dot(_n);
    let otherV = 0;
    if (other && (other as KinematicBody).hit) {
      const k = other as KinematicBody;
      otherV = k.vx * nx + k.vz * nz;
      vrel -= otherV;
    }
    if (vrel >= 0) return;
    const im = s.invMassAt(_p, _n);
    const otherInv = other && (other as KinematicBody).hit ? 1 / (other as KinematicBody).mass : 0;
    const jn = (-(1 + restitution) * vrel) / (im + otherInv);
    _t.copy(_v).addScaledVector(_n, -_v.dot(_n));
    const vt = _t.length();
    _v2.copy(_n).multiplyScalar(jn);
    if (vt > 1e-3) _v2.addScaledVector(_t, -Math.min(jn * friction, vt / im) / vt);
    s.applyImpulse(_v2, _p);
    if (other && (other as KinematicBody).hit) (other as KinematicBody).hit(-_v2.x, -_v2.z, px, pz);
    const speed = -vrel;
    if (speed > 1.5) {
      this.impacts.push({ sim: s, speed, x: px, y: s.position.y, z: pz, kind });
      s.lastImpact = Math.max(s.lastImpact, speed);
    }
    if (vt > 2) this.scrapes.set(s, Math.min(1, (this.scrapes.get(s) ?? 0) + vt / 20));
  }

  private statics(s: VehicleSim) {
    const b = this.box(s);
    _list.length = 0;
    s.world.queryStatic(s.position.x, s.position.z, Math.hypot(b.hx, b.hz) + 1, _list);
    const y = s.position.y;
    for (const c of _list) {
      if (y < c.yMin - 0.5 || y > c.yMax + 0.5) continue;
      if (c.kind === 'box') {
        obbObb(s.position.x, s.position.z, b.hx, b.hz, b.rot, c.x, c.z, c.hx, c.hz, c.rot, _c);
      } else {
        obbCircle(s.position.x, s.position.z, b.hx, b.hz, b.rot, c.x, c.z, c.r, _c);
      }
      if (!_c.hit) continue;
      if (c.breakable !== undefined) {
        s.world.onBreak?.(c.breakable, s.speed);
        continue;
      }
      this.applyContact(s, _c.nx, _c.nz, _c.depth, _c.px, _c.pz, 0.18, 0.35, 'static');
    }
  }

  private barriers(s: VehicleSim, src: BarrierSource) {
    const c = s.spec.chassis;
    const hx = c.width * 0.47, hz = c.length * 0.47;
    for (let k = 0; k < 6; k++) {
      const lx = k % 2 ? hx : -hx;
      const lz = k < 2 ? -hz : k < 4 ? hz : 0;
      _p.set(lx, 0, lz).applyQuaternion(s.quaternion).add(s.position);
      const pen = src.barrierAt(_p.x, _p.y, _p.z, _n);
      if (pen > 0) this.applyContact(s, _n.x, _n.z, pen, _p.x, _p.z, 0.12, 0.22, 'barrier');
    }
  }

  private kinematic(s: VehicleSim, t: KinematicBody) {
    if (Math.abs(t.x - s.position.x) > 12 || Math.abs(t.z - s.position.z) > 12 || Math.abs(t.y - s.position.y) > 3) return;
    const b = this.box(s);
    obbObb(s.position.x, s.position.z, b.hx, b.hz, b.rot, t.x, t.z, t.hx, t.hz, t.heading, _c);
    if (!_c.hit) return;
    this.applyContact(s, _c.nx, _c.nz, _c.depth, _c.px, _c.pz, 0.25, 0.3, 'traffic', t);
  }

  private pair(a: VehicleSim, b: VehicleSim) {
    if (a.position.distanceToSquared(b.position) > 100) return;
    if (Math.abs(a.position.y - b.position.y) > 2) return;
    const A = this.box(a), B = this.box(b);
    obbObb(a.position.x, a.position.z, A.hx, A.hz, A.rot, b.position.x, b.position.z, B.hx, B.hz, B.rot, _c);
    if (!_c.hit) return;
    const nx = _c.nx, nz = _c.nz;
    // split positional correction
    a.position.x += nx * _c.depth * 0.5;
    a.position.z += nz * _c.depth * 0.5;
    b.position.x -= nx * _c.depth * 0.5;
    b.position.z -= nz * _c.depth * 0.5;
    _p.set(_c.px, (a.position.y + b.position.y) / 2, _c.pz);
    _n.set(nx, 0, nz);
    a.pointVelocity(_p, _v);
    b.pointVelocity(_p, _v2);
    _v.sub(_v2);
    const vrel = _v.dot(_n);
    if (vrel >= 0) return;
    const im = a.invMassAt(_p, _n) + b.invMassAt(_p, _n);
    const jn = (-(1 + 0.2) * vrel) / im;
    _t.copy(_v).addScaledVector(_n, -vrel);
    const vt = _t.length();
    _v2.copy(_n).multiplyScalar(jn);
    if (vt > 1e-3) _v2.addScaledVector(_t, -Math.min(jn * 0.3, vt / im) / vt);
    a.applyImpulse(_v2, _p);
    b.applyImpulse(_v2.negate(), _p);
    if (-vrel > 1.5) {
      this.impacts.push({ sim: a, speed: -vrel, x: _p.x, y: _p.y, z: _p.z, kind: 'car' });
      this.impacts.push({ sim: b, speed: -vrel, x: _p.x, y: _p.y, z: _p.z, kind: 'car' });
    }
  }
}
