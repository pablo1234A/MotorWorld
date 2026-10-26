import { Matrix3, Quaternion, Vector3 } from 'three';
import { clamp, lerp, moveTowards, smoothstep } from '../core/MathUtil';
import type { Assists, CarSpec } from './CarSpec';
import { DEFAULT_ASSISTS } from './CarSpec';
import type { GroundHit, PhysicsWorld } from './PhysicsWorld';
import { Powertrain } from './Powertrain';
import { COMPOUND_GRIP, COMPOUND_WET, Surface, SURFACES } from './Surface';
import { tireForce, type TireForce, type TireParams } from './Tire';

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const V_MIN = 3.0; // low-speed slip denominator floor (m/s)

export interface VehicleInput {
  throttle: number;
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export const emptyInput = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, shiftUp: false, shiftDown: false });

export class Wheel {
  readonly front: boolean;
  readonly left: boolean;
  /** Suspension mount point in body space. */
  readonly mount = new Vector3();
  radius = 0.33;
  inertia = 1.2;
  steer = 0;
  omega = 0;
  spin = 0;
  /** Current suspension length (0..travel). */
  length = 0;
  compression = 0;
  prevCompression = 0;
  contact = false;
  load = 0;
  slipRatio = 0;
  slipAngle = 0;
  /** Combined normalised slip (>1 sliding). */
  slip = 0;
  fx = 0;
  fy = 0;
  surface: Surface = Surface.Asphalt;
  water = 0;
  driveTorque = 0;
  brakeTorque = 0;
  readonly contactPoint = new Vector3();
  readonly contactNormal = new Vector3(0, 1, 0);
  /** Wheel centre in world space (for rendering). */
  readonly center = new Vector3();
  /** Velocity of the contact patch along the ground (m/s) */
  groundSpeed = 0;
  absActive = false;
  /** Effective peak friction coefficient last step. */
  muEff = 1;

  constructor(public readonly index: number) {
    this.front = index < 2;
    this.left = index % 2 === 0;
  }
}

const _v = new Vector3();
const _v2 = new Vector3();
const _r = new Vector3();
const _f = new Vector3();
const _rt = new Vector3();
const _n = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _mount = new Vector3();
const _dir = new Vector3();
const _tq = new Vector3();
const _q = new Quaternion();
const _m3 = new Matrix3();
const _rot = new Matrix3();
const _tireOut: TireForce = { fx: 0, fy: 0, s: 0 };
const _ground: GroundHit = { height: 0, normal: new Vector3(0, 1, 0), surface: Surface.Asphalt, water: 0 };

/**
 * Full rigid-body vehicle with four ray-cast wheels, combined-slip tires,
 * engine/clutch/gearbox, differentials, aero and driver assists.
 * Car local frame: +X right, +Y up, -Z forward. Origin at centre of gravity.
 */
export class VehicleSim {
  spec!: CarSpec;
  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();
  readonly wheels: Wheel[] = [new Wheel(0), new Wheel(1), new Wheel(2), new Wheel(3)];
  readonly powertrain: Powertrain;
  input: VehicleInput = emptyInput();
  assists: Assists = { ...DEFAULT_ASSISTS };

  mass = 1400;
  readonly invInertiaLocal = new Vector3();
  readonly invInertiaWorld = new Matrix3();
  private readonly force = new Vector3();
  private readonly torque = new Vector3();

  /** Smoothed actual steering angle (rad) */
  steerAngle = 0;
  /** Body slip angle (rad), + when sliding to the right */
  bodySlip = 0;
  speed = 0;
  forwardSpeed = 0;
  airTime = 0;
  wheelsOnGround = 0;
  nitroAmount = 1;
  /** Max g-force experienced in last impact (for camera shake / audio). */
  lastImpact = 0;
  /** Accumulated scrape intensity this frame (0..1). */
  scrape = 0;
  readonly accel = new Vector3();
  private readonly prevVelocity = new Vector3();
  private tcsCut = 0;
  private reverseHold = 0;
  private tireParams: TireParams[] = [];
  private wheelRest = 0;
  /** Seconds since spawn; physics settles before control. */
  age = 0;
  frozen = false;

  constructor(spec: CarSpec, public world: PhysicsWorld) {
    this.powertrain = new Powertrain(spec);
    this.setSpec(spec);
  }

  setSpec(spec: CarSpec) {
    this.spec = spec;
    this.powertrain.setSpec(spec);
    const c = spec.chassis;
    this.mass = c.mass;
    // Box inertia (slightly reduced: mass concentrated towards centre)
    const w = c.width, h = c.height * 0.8, l = c.length;
    const k = 0.85 * (c.mass / 12);
    const ix = k * (h * h + l * l); // pitch
    const iy = k * (w * w + l * l); // yaw
    const iz = k * (w * w + h * h); // roll
    this.invInertiaLocal.set(1 / ix, 1 / iy, 1 / iz);

    const a = c.wheelbase * (1 - c.weightFront); // CG -> front axle
    const b = c.wheelbase * c.weightFront; // CG -> rear axle
    const t = spec.tires;
    const s = spec.suspension;
    for (const wh of this.wheels) {
      const track = wh.front ? c.trackFront : c.trackRear;
      wh.radius = t.radius;
      const widthMm = wh.front ? t.widthFront : t.widthRear;
      wh.inertia = 0.9 + (widthMm / 245) * 0.5 + t.radius * 0.8;
      const axleLoad = (wh.front ? c.weightFront : 1 - c.weightFront) * c.mass * GRAVITY * 0.5;
      const k = wh.front ? s.springFront : s.springRear;
      const staticComp = clamp(axleLoad / k, 0.02, s.travel * 0.8);
      // wheel centre at rest sits at (radius - cgHeight) relative to CG
      const restCenterY = t.radius - (c.cgHeight + s.rideOffset);
      wh.mount.set((wh.left ? -1 : 1) * track * 0.5, restCenterY + (s.travel - staticComp), wh.front ? -a : b);
      this.wheelRest = s.travel;
      const grip = wh.front ? t.gripFront : t.gripRear;
      const widthFactor = 0.9 + 0.1 * (widthMm / 245);
      this.tireParams[wh.index] = {
        mu: grip * widthFactor,
        peakSlipRatio: t.compound === 'drift' ? 0.14 : 0.11,
        peakSlipAngle: (t.compound === 'slick' || t.compound === 'semislick' ? 6.5 : t.compound === 'offroad' ? 9.5 : 8) * (Math.PI / 180),
        falloff: 0.72,
        loadSensitivity: 0.12,
        nominalLoad: (c.mass * GRAVITY) / 4,
      };
    }
  }

  /** Place the car at a position facing heading (radians, 0 = -Z). */
  reset(x: number, y: number, z: number, heading: number) {
    this.position.set(x, y, z);
    this.quaternion.setFromAxisAngle(_up.set(0, 1, 0), heading);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.prevVelocity.set(0, 0, 0);
    for (const w of this.wheels) {
      w.omega = 0;
      w.length = this.wheelRest;
      w.compression = w.prevCompression = 0;
    }
    this.powertrain.forceGear(1);
    this.powertrain.rpm = this.spec.engine.idleRpm;
    this.airTime = 0;
    this.age = 0;
  }

  get heading(): number {
    _fwd.set(0, 0, -1).applyQuaternion(this.quaternion);
    return Math.atan2(-_fwd.x, -_fwd.z);
  }

  getForward(out: Vector3) {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }
  getUp(out: Vector3) {
    return out.set(0, 1, 0).applyQuaternion(this.quaternion);
  }
  getRight(out: Vector3) {
    return out.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  /** Velocity of a world-space point attached to the body. */
  pointVelocity(p: Vector3, out: Vector3) {
    _r.subVectors(p, this.position);
    return out.crossVectors(this.angularVelocity, _r).add(this.velocity);
  }

  applyForceAt(f: Vector3, p: Vector3) {
    this.force.add(f);
    _r.subVectors(p, this.position);
    this.torque.add(_tq.crossVectors(_r, f));
  }

  /** Instant impulse at a world point (used by collisions). */
  applyImpulse(j: Vector3, p: Vector3) {
    this.velocity.addScaledVector(j, 1 / this.mass);
    _r.subVectors(p, this.position);
    _tq.crossVectors(_r, j).applyMatrix3(this.invInertiaWorld);
    this.angularVelocity.add(_tq);
  }

  /** Effective inverse mass along normal n at point p (for impulse solving). */
  invMassAt(p: Vector3, n: Vector3): number {
    _r.subVectors(p, this.position);
    _rt.crossVectors(_r, n).applyMatrix3(this.invInertiaWorld);
    _v2.crossVectors(_rt, _r);
    return 1 / this.mass + n.dot(_v2);
  }

  private updateInertiaWorld() {
    _rot.setFromMatrix4(_m4.makeRotationFromQuaternion(this.quaternion));
    const il = this.invInertiaLocal;
    _m3.set(il.x, 0, 0, 0, il.y, 0, 0, 0, il.z);
    // R * I^-1 * R^T
    this.invInertiaWorld.copy(_rot).multiply(_m3).multiply(_rotT.copy(_rot).transpose());
  }

  step(dt: number) {
    if (this.frozen) return;
    this.age += dt;
    const spec = this.spec;
    const c = spec.chassis;
    const inp = this.input;
    this.force.set(0, -GRAVITY * this.mass, 0);
    this.torque.set(0, 0, 0);
    this.scrape = Math.max(0, this.scrape - dt * 4);
    this.updateInertiaWorld();

    const up = this.getUp(_up);
    const fwd = this.getForward(_fwd);
    const right = this.getRight(_right);
    this.forwardSpeed = this.velocity.dot(fwd);
    this.speed = this.velocity.length();

    // ---------------- Driver input interpretation ----------------
    let throttle = clamp(inp.throttle, 0, 1);
    let brake = clamp(inp.brake, 0, 1);
    const pt = this.powertrain;
    if (this.assists.autoGear) {
      // Brake at standstill engages reverse; throttle returns to drive.
      if (pt.gear > 0 && this.forwardSpeed < 0.8 && brake > 0.5 && throttle < 0.1) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.25) pt.forceGear(-1);
      } else this.reverseHold = 0;
      if (pt.gear < 0) {
        if (throttle > 0.1 && this.forwardSpeed > -1.0) pt.forceGear(1);
        else {
          const t = throttle;
          throttle = brake;
          brake = t;
        }
      }
      if (pt.gear === 0) pt.forceGear(1);
    } else {
      if (inp.shiftUp) pt.requestGear(pt.gear + 1);
      if (inp.shiftDown) pt.requestGear(pt.gear - 1);
    }
    inp.shiftUp = inp.shiftDown = false;

    // ---------------- Steering ----------------
    const vKmh = Math.abs(this.forwardSpeed) * 3.6;
    let maxSteer = spec.steering.maxAngle;
    let target = clamp(inp.steer, -1, 1);
    // body slip angle (for countersteer assist + drift detection)
    const vLatBody = this.velocity.dot(right);
    this.bodySlip = this.speed > 2 ? Math.atan2(vLatBody, Math.abs(this.forwardSpeed) + 0.01) : 0;
    let steerAngle: number;
    if (this.assists.steering) {
      // speed-sensitive steering + automatic countersteer
      maxSteer *= lerp(1, 0.32, smoothstep(30, 220, vKmh));
      steerAngle = target * maxSteer;
      if (this.forwardSpeed > 4) steerAngle += clamp(this.bodySlip, -0.5, 0.5) * 0.55 * (1 - Math.abs(target) * 0.4);
    } else {
      steerAngle = target * maxSteer;
    }
    steerAngle = clamp(steerAngle, -spec.steering.maxAngle, spec.steering.maxAngle);
    this.steerAngle = moveTowards(this.steerAngle, steerAngle, spec.steering.rate * dt);
    // Ackermann geometry
    const L = c.wheelbase;
    const sa = this.steerAngle;
    if (Math.abs(sa) > 1e-4) {
      const R = L / Math.tan(Math.abs(sa));
      const inner = Math.atan(L / (R - c.trackFront * 0.5));
      const outer = Math.atan(L / (R + c.trackFront * 0.5));
      const rightTurn = sa > 0;
      this.wheels[0].steer = Math.sign(sa) * (rightTurn ? outer : inner);
      this.wheels[1].steer = Math.sign(sa) * (rightTurn ? inner : outer);
    } else this.wheels[0].steer = this.wheels[1].steer = 0;

    // ---------------- Powertrain ----------------
    const dl = spec.drivetrain.layout;
    const w = this.wheels;
    let drivenOmega: number;
    if (dl === 'FWD') drivenOmega = (w[0].omega + w[1].omega) * 0.5;
    else if (dl === 'RWD') drivenOmega = (w[2].omega + w[3].omega) * 0.5;
    else drivenOmega = (w[0].omega + w[1].omega + w[2].omega + w[3].omega) * 0.25;

    // traction control
    let maxDrivenSlip = 0;
    for (const wh of w) {
      const driven = dl === 'AWD' || (dl === 'FWD') === wh.front;
      if (driven && wh.contact) maxDrivenSlip = Math.max(maxDrivenSlip, wh.slipRatio * Math.sign(pt.gear || 1));
    }
    const driverThrottle = throttle;
    if (this.assists.tcs && pt.gear !== 0 && Math.abs(this.forwardSpeed) > 0.5) {
      // PI controller holding driven-wheel slip near the tire's peak
      const err = maxDrivenSlip - 0.13;
      this.tcsCut = clamp(this.tcsCut + err * 10 * dt, 0, 0.9);
      if (err < 0) this.tcsCut = Math.max(0, this.tcsCut - dt * 0.8);
      throttle *= clamp(1 - this.tcsCut - Math.max(0, err) * 2.5, 0.08, 1);
    } else this.tcsCut = 0;

    const nitroOn = inp.nitro && this.nitroAmount > 0 && spec.nitro > 0;
    if (nitroOn && pt.nitroActive) this.nitroAmount = Math.max(0, this.nitroAmount - dt * 0.12);
    const axleTorque = pt.update(dt, throttle, drivenOmega, this.assists.autoGear, nitroOn, driverThrottle, brake);

    // Split torque front/rear
    let tf = 0, tr = 0;
    if (dl === 'FWD') tf = axleTorque;
    else if (dl === 'RWD') tr = axleTorque;
    else {
      tf = axleTorque * spec.drivetrain.frontSplit;
      tr = axleTorque - tf;
      // viscous centre coupling
      const fo = (w[0].omega + w[1].omega) * 0.5, ro = (w[2].omega + w[3].omega) * 0.5;
      const lockT = Math.abs(axleTorque) * 0.35 + 60;
      const dT = clamp((fo - ro) * w[0].inertia / dt * 0.5, -lockT, lockT);
      tf -= dT;
      tr += dT;
    }
    const nDriven = dl === 'AWD' ? 4 : 2;
    const reflected = pt.reflectedInertia() / nDriven;
    this.splitDiff(w[0], w[1], tf, spec.drivetrain.frontDiff, dt);
    this.splitDiff(w[2], w[3], tr, spec.drivetrain.rearDiff, dt);

    // Brakes
    const bT = spec.brakes.maxTorque;
    for (const wh of w) {
      const share = wh.front ? spec.brakes.bias : 1 - spec.brakes.bias;
      let tb = brake * bT * share * 0.5;
      wh.absActive = false;
      if (this.assists.abs && tb > 0 && wh.contact && Math.abs(this.forwardSpeed) > 2.5) {
        // ABS: cap brake torque near the tire's peak capacity, release further if it starts locking
        const cap = wh.muEff * wh.load * wh.radius;
        if (tb > cap) {
          tb = cap;
          wh.absActive = true;
        }
        if (wh.slipRatio < -0.14) {
          tb *= 0.5;
          wh.absActive = true;
        }
      }
      if (inp.handbrake && !wh.front) tb += spec.brakes.handbrake;
      wh.brakeTorque = tb;
    }
    if (inp.handbrake && dl !== 'FWD') {
      // handbrake disengages rear drive (clutch-kick style)
      w[2].driveTorque *= 0.1;
      w[3].driveTorque *= 0.1;
    }

    // ---------------- Wheels: suspension + tires ----------------
    const world = this.world;
    const wet = world.wetness;
    const compound = spec.tires.compound;
    let grounded = 0;
    let rollResForce = 0;
    for (const wh of w) {
      _mount.copy(wh.mount).applyQuaternion(this.quaternion).add(this.position);
      _dir.copy(up).negate();
      const maxLen = this.wheelRest + wh.radius;
      // Iterative ray-heightfield intersection
      let t = 0;
      for (let it = 0; it < 4; it++) {
        const px = _mount.x + _dir.x * t, py = _mount.y + _dir.y * t, pz = _mount.z + _dir.z * t;
        world.sampleGround(px, pz, _mount.y + 0.5, _ground);
        const dy = py - _ground.height;
        const denom = Math.max(0.3, -_dir.y);
        t += dy / denom;
        if (t > maxLen + 0.5) break;
      }
      const bump = SURFACES[_ground.surface].bump;
      if (bump > 0) t -= bump * (Math.sin(_mount.x * 3.1 + _mount.z * 1.7) * 0.5 + Math.sin(_mount.x * 7.3 - _mount.z * 5.9) * 0.5);
      wh.prevCompression = wh.compression;
      if (t <= maxLen && t > -0.6) {
        wh.contact = true;
        grounded++;
        wh.length = clamp(t - wh.radius, 0, this.wheelRest);
        wh.compression = this.wheelRest - wh.length;
        wh.surface = _ground.surface;
        wh.water = _ground.water;
        wh.contactNormal.copy(_ground.normal);
        wh.contactPoint.copy(_mount).addScaledVector(_dir, t);
      } else {
        wh.contact = false;
        wh.length = this.wheelRest;
        wh.compression = 0;
        wh.load = 0;
      }
      wh.center.copy(_mount).addScaledVector(_dir, wh.length);
    }

    const s = spec.suspension;
    // Anti-roll bars
    const arbF = (w[0].compression - w[1].compression) * s.arbFront;
    const arbR = (w[2].compression - w[3].compression) * s.arbRear;

    for (const wh of w) {
      const k = wh.front ? s.springFront : s.springRear;
      if (!wh.contact) {
        // free wheel: brakes and drive act on inertia only
        wh.omega += (wh.driveTorque / wh.inertia) * dt;
        const bt = (wh.brakeTorque / wh.inertia) * dt;
        wh.omega = Math.abs(wh.omega) <= bt ? 0 : wh.omega - Math.sign(wh.omega) * bt;
        wh.omega *= 1 - 0.5 * dt;
        wh.slip = 0;
        wh.fx = wh.fy = 0;
        wh.spin += wh.omega * dt;
        continue;
      }
      const compVel = (wh.compression - wh.prevCompression) / dt;
      const damp = compVel > 0 ? s.damperBump : s.damperRebound;
      let fs = k * wh.compression + damp * compVel;
      const arb = wh.front ? arbF : arbR;
      fs += wh.left ? arb : -arb;
      // bump stop
      if (wh.compression > this.wheelRest * 0.92) fs += (wh.compression - this.wheelRest * 0.92) * k * 12;
      fs = Math.max(0, fs);
      // Normal load is the suspension force projected on ground normal
      const fz = fs * Math.max(0.2, up.dot(wh.contactNormal));
      wh.load = fz;
      _f.copy(up).multiplyScalar(fs);
      this.applyForceAt(_f, _mount.copy(wh.mount).applyQuaternion(this.quaternion).add(this.position));

      // Tire frame on the ground plane
      _n.copy(wh.contactNormal);
      _v.set(Math.sin(wh.steer), 0, -Math.cos(wh.steer)).applyQuaternion(this.quaternion); // wheel forward world
      const wf = _v.addScaledVector(_n, -_v.dot(_n)).normalize();
      const wr = _v2.crossVectors(wf, _n).normalize();
      const pv = this.pointVelocity(wh.contactPoint, _rt);
      const vLong = pv.dot(wf);
      const vLat = pv.dot(wr);
      wh.groundSpeed = vLong;

      // Surface grip
      const surf = SURFACES[wh.surface];
      let mu = surf.grip * COMPOUND_GRIP[compound][wh.surface];
      if (wet > 0) {
        const wetMul = lerp(1, surf.wetFactor * COMPOUND_WET[compound], wet);
        mu *= wetMul * (1 - wh.water * 0.3);
      }
      const p = this.tireParams[wh.index];
      const baseMu = p.mu;
      p.mu = baseMu * mu;
      wh.muEff = p.mu;
      p.falloff = surf.slideFalloff * (compound === 'drift' ? 1.08 : 1);
      const R = wh.radius;
      const denom = Math.max(Math.abs(vLong), V_MIN);
      const tanA = vLat / denom;

      // Implicit wheel spin integration. The tire can only pull the wheel towards zero slip,
      // so the solution lies between the driven speed and the free-rolling speed: bisect it.
      // Driven wheels carry the engine inertia reflected through the gearbox.
      const driven = dl === 'AWD' || (dl === 'FWD') === wh.front;
      const I = wh.inertia + (driven ? reflected : 0);
      const omDrive = wh.omega + (wh.driveTorque / I) * dt;
      const omFree = vLong / R;
      const kt = (dt / I) * R;
      let lo = Math.min(omDrive, omFree), hi = Math.max(omDrive, omFree);
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) * 0.5;
        const g = mid - omDrive + kt * tireForce((mid * R - vLong) / denom, tanA, fz, p, _tireOut).fx;
        if (g > 0) hi = mid;
        else lo = mid;
      }
      let omNew = (lo + hi) * 0.5;
      // Brakes act last and can stop (lock) the wheel but never reverse it.
      const bt = (wh.brakeTorque / I) * dt;
      omNew = Math.abs(omNew) <= bt ? 0 : omNew - Math.sign(omNew) * bt;
      const locked = omNew === 0 && wh.brakeTorque > 0;
      wh.omega = omNew;
      wh.spin += wh.omega * dt;
      const slipRatio = (wh.omega * R - vLong) / denom;
      tireForce(slipRatio, tanA, fz, p, _tireOut);
      p.mu = baseMu;
      let fx = _tireOut.fx, fy = _tireOut.fy;
      wh.slipRatio = slipRatio;
      wh.slipAngle = Math.atan(tanA);
      wh.slip = _tireOut.s;

      // Low-speed static friction (hold the car on slopes when stopped/braking)
      const spd = Math.hypot(vLong, vLat);
      if (spd < 1.5) {
        const wStatic = 1 - spd / 1.5;
        const mShare = this.mass * 0.25;
        const lim = mu * baseMu * fz;
        const fyS = clamp((-vLat * mShare) / dt * 0.5, -lim, lim);
        fy = lerp(fy, fyS, wStatic);
        if ((locked || (throttle < 0.05 && brake > 0.05)) && wh.omega === 0) {
          const fxS = clamp((-vLong * mShare) / dt * 0.5, -lim, lim);
          fx = lerp(fx, fxS, wStatic);
        }
      }
      wh.fx = fx;
      wh.fy = fy;
      rollResForce += surf.rollRes * fz;

      // Longitudinal force acts at the contact patch (full pitch transfer); lateral force acts at the
      // roll-centre height (geometric load transfer goes through the links, reduces tip-overs).
      _f.copy(wf).multiplyScalar(fx);
      this.applyForceAt(_f, wh.contactPoint);
      _f.copy(wr).multiplyScalar(fy);
      _v.copy(wh.contactPoint).addScaledVector(up, (wh.front ? 0.06 : 0.1) + c.cgHeight * 0.15);
      this.applyForceAt(_f, _v);
    }
    this.wheelsOnGround = grounded;

    // Rolling resistance
    if (this.speed > 0.1 && grounded > 0) {
      const rr = Math.min(rollResForce, this.speed * this.mass / dt * 0.5);
      this.force.addScaledVector(this.velocity, -rr / this.speed);
    }

    // ---------------- Aerodynamics ----------------
    const a = spec.aero;
    const v2 = this.speed * this.speed;
    if (this.speed > 0.5) {
      const drag = 0.5 * AIR_DENSITY * a.cd * a.frontalArea * v2;
      this.force.addScaledVector(this.velocity, -drag / this.speed);
      const fwdV = Math.max(0, this.forwardSpeed);
      const q = 0.5 * AIR_DENSITY * fwdV * fwdV;
      const aCg = c.wheelbase * (1 - c.weightFront);
      const bCg = c.wheelbase * c.weightFront;
      _f.copy(up).multiplyScalar(-q * a.clFront);
      this.applyForceAt(_f, _v.set(0, 0, -aCg).applyQuaternion(this.quaternion).add(this.position));
      _f.copy(up).multiplyScalar(-q * a.clRear);
      this.applyForceAt(_f, _v.set(0, 0, bCg).applyQuaternion(this.quaternion).add(this.position));
    }

    // ---------------- Assists acting on the body ----------------
    if (grounded === 0) {
      this.airTime += dt;
      // gentle self-righting in the air (arcade): keep the car landing on its wheels
      _v.crossVectors(up, _v2.set(0, 1, 0));
      this.torque.addScaledVector(_v, 1.2 * this.mass);
      _v.copy(this.angularVelocity).multiplyScalar(-0.3 * this.mass);
      this.torque.add(_v);
    } else {
      this.airTime = 0;
      if (this.assists.stability && this.forwardSpeed > 6) {
        // yaw damping when the slide angle grows beyond what the driver can hold
        const excess = Math.max(0, Math.abs(this.bodySlip) - 0.22);
        if (excess > 0) {
          const yawRate = this.angularVelocity.dot(up);
          // only resist rotation that increases the slip
          if (Math.sign(yawRate) === -Math.sign(this.bodySlip) || Math.abs(this.bodySlip) > 0.5) {
            _v.copy(up).multiplyScalar(-yawRate * excess * 6 * this.mass);
            this.torque.add(_v);
          }
        }
      }
    }

    // ---------------- Integrate ----------------
    this.prevVelocity.copy(this.velocity);
    this.velocity.addScaledVector(this.force, dt / this.mass);
    _tq.copy(this.torque).applyMatrix3(this.invInertiaWorld);
    this.angularVelocity.addScaledVector(_tq, dt);
    // mild angular damping for numerical robustness
    this.angularVelocity.multiplyScalar(1 - 0.3 * dt);
    this.position.addScaledVector(this.velocity, dt);
    const av = this.angularVelocity;
    _q.set(av.x * dt * 0.5, av.y * dt * 0.5, av.z * dt * 0.5, 0).multiply(this.quaternion);
    this.quaternion.x += _q.x;
    this.quaternion.y += _q.y;
    this.quaternion.z += _q.z;
    this.quaternion.w += _q.w;
    this.quaternion.normalize();

    this.collideBodyWithGround();
    this.accel.subVectors(this.velocity, this.prevVelocity).divideScalar(dt);
  }

  /** Torque split across an axle through a differential. */
  private splitDiff(l: Wheel, r: Wheel, t: number, diff: CarSpec['drivetrain']['frontDiff'], dt: number) {
    if (t === 0) {
      l.driveTorque = r.driveTorque = 0;
      return;
    }
    let half = t * 0.5;
    let lockT = 0;
    if (diff.type === 'lsd') lockT = diff.preload + diff.lock * Math.abs(t);
    else if (diff.type === 'locked') lockT = 1e9;
    else lockT = 15; // internal friction of an open diff
    const dT = clamp(((l.omega - r.omega) * l.inertia) / dt * 0.5, -lockT, lockT);
    l.driveTorque = half - dT;
    r.driveTorque = half + dT;
  }

  /** Chassis corner probes against the ground: handles rollovers, landings and scraping. */
  private collideBodyWithGround() {
    const c = this.spec.chassis;
    const hx = c.width * 0.46, hz = c.length * 0.46;
    const yBot = -c.cgHeight + 0.12;
    const yTop = c.height - c.cgHeight - 0.05;
    let maxPen = 0;
    for (let i = 0; i < 10; i++) {
      const sx = i % 2 === 0 ? -hx : hx;
      const sz = i < 4 ? (i < 2 ? -hz : hz) : i < 8 ? (i < 6 ? -hz * 0.7 : hz * 0.7) : 0;
      const sy = i < 4 ? yBot : i < 8 ? yTop : yTop;
      _v.set(sx, sy, sz).applyQuaternion(this.quaternion).add(this.position);
      this.world.sampleGround(_v.x, _v.z, _v.y + 1.5, _ground);
      const pen = _ground.height - _v.y;
      if (pen > 0) {
        _n.copy(_ground.normal);
        const pv = this.pointVelocity(_v, _v2);
        const vn = pv.dot(_n);
        if (vn < 0) {
          const im = this.invMassAt(_v, _n);
          const jn = (-(1 + 0.15) * vn) / im;
          _f.copy(_n).multiplyScalar(jn);
          // friction
          _rt.copy(pv).addScaledVector(_n, -vn);
          const vt = _rt.length();
          if (vt > 1e-3) {
            const jt = Math.min(jn * 0.45, vt / im);
            _f.addScaledVector(_rt, -jt / vt);
          }
          this.applyImpulse(_f, _v);
          const g = -vn;
          if (g > 2) this.lastImpact = Math.max(this.lastImpact, g);
          this.scrape = Math.min(1, this.scrape + Math.min(1, vt / 15));
        }
        maxPen = Math.max(maxPen, pen * Math.max(0.3, _n.y));
      }
    }
    if (maxPen > 0) this.position.y += Math.min(maxPen, 0.5) * 0.8;
  }

  /** Total load fraction on front axle (0..1), useful for HUD/telemetry. */
  get frontLoadFraction() {
    const f = this.wheels[0].load + this.wheels[1].load;
    const t = f + this.wheels[2].load + this.wheels[3].load;
    return t > 0 ? f / t : this.spec.chassis.weightFront;
  }

  /** True if upside down / on its side and nearly stopped. */
  get isFlipped(): boolean {
    return this.getUp(_v).y < 0.3 && this.speed < 3;
  }

  /** Drift detection (amount 0..1) */
  get driftAmount(): number {
    if (this.forwardSpeed < 8 || this.wheelsOnGround < 3) return 0;
    return smoothstep(0.18, 0.6, Math.abs(this.bodySlip));
  }
}

import { Matrix4 } from 'three';
const _m4 = new Matrix4();
const _rotT = new Matrix3();
