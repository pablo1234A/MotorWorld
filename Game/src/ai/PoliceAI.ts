import { Vector3 } from 'three';
import { clamp } from '../core/MathUtil';
import type { VehicleSim } from '../physics/VehicleSim';

const _f = new Vector3();

/**
 * Pursuit driver: intercepts the target's predicted position, rams when close,
 * handbrake-turns when facing the wrong way and recovers from being stuck.
 */
export class PoliceAI {
  private stuck = 0;
  private reverse = 0;
  aggression = 1;

  constructor(public sim: VehicleSim) {
    sim.assists = { ...sim.assists, steering: false, stability: true, tcs: true, abs: true };
  }

  update(dt: number, target: { x: number; z: number; vx: number; vz: number }) {
    const s = this.sim;
    const inp = s.input;
    const dist = Math.hypot(target.x - s.position.x, target.z - s.position.z);
    const lead = clamp(dist / 40, 0.2, 1.4);
    const tx = target.x + target.vx * lead, tz = target.z + target.vz * lead;
    s.getForward(_f);
    const dx = tx - s.position.x, dz = tz - s.position.z;
    const lx = dx * -_f.z + dz * _f.x;
    const lz = dx * _f.x + dz * _f.z;
    const alpha = Math.atan2(lx, lz);
    const v = s.forwardSpeed;
    let steer = clamp((alpha * 1.6) / s.spec.steering.maxAngle, -1, 1);
    if (v > 5) steer += clamp(s.bodySlip, -0.5, 0.5) * 0.6;
    inp.steer = clamp(steer, -1, 1);
    const sharp = Math.abs(alpha) > 1.2;
    inp.throttle = sharp && v > 20 ? 0.3 : 1;
    inp.brake = sharp && v > 25 ? 0.6 : 0;
    inp.handbrake = Math.abs(alpha) > 1.6 && v > 8;
    inp.nitro = false;
    // match speed when right behind to avoid overshooting, ram otherwise
    const tSpeed = Math.hypot(target.vx, target.vz);
    if (dist < 14 && lz > 0 && v > tSpeed + 6 * this.aggression) inp.throttle = 0.4;
    if (v < 1.5 && s.age > 3) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 2) {
      this.reverse = 1.3;
      this.stuck = 0;
    }
    if (this.reverse > 0) {
      this.reverse -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -inp.steer;
      inp.handbrake = false;
    }
  }
}
