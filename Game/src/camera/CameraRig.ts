import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, damp, lerp } from '../core/MathUtil';
import type { Vehicle } from '../game/Vehicle';
import type { PhysicsWorld, GroundHit } from '../physics/PhysicsWorld';

export type CamMode = 'chase' | 'far' | 'hood' | 'cockpit' | 'bumper' | 'wheel' | 'top' | 'cinematic' | 'orbit';
export const CAM_MODES: CamMode[] = ['chase', 'far', 'cockpit', 'hood', 'bumper', 'wheel', 'top', 'cinematic'];

const _v = new Vector3();
const _f = new Vector3();
const _q = new Quaternion();
const _target = new Vector3();
const _g: GroundHit = { height: 0, normal: new Vector3(), surface: 0 as any, water: 0 };

/**
 * Vehicle camera: spring-damped chase with speed-dependent FOV, g-force lag, landing bumps,
 * collision shake; hood and cockpit views; cinematic trackside shots.
 */
export class CameraRig {
  mode: CamMode = 'chase';
  readonly pos = new Vector3(0, 5, 10);
  readonly look = new Vector3();
  private vel = new Vector3();
  private yaw = 0;
  private shake = 0;
  private fov = 62;
  private cineAnchor = new Vector3();
  private cineTimer = 0;
  lookBack = false;
  /** orbit mode for menus */
  orbitAngle = 0;
  orbitDist = 7;
  orbitHeight = 2;
  baseFov = 62;
  private landing = 0;
  private prevAir = 0;
  /** free look (drag on screen) in the interior / hood views, springs back when released */
  lookYaw = 0;
  lookPitch = 0;
  looking = false;
  private headYaw = 0;

  constructor(public camera: PerspectiveCamera) {}

  next() {
    const i = CAM_MODES.indexOf(this.mode);
    this.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    this.cineTimer = 0;
  }

  addShake(a: number) {
    this.shake = Math.min(1.5, this.shake + a);
  }

  snap(v: Vehicle) {
    const s = v.sim;
    this.yaw = s.heading;
    s.getForward(_f);
    this.pos.copy(s.position).addScaledVector(_f, -7).add(_v.set(0, 2.4, 0));
    this.vel.set(0, 0, 0);
  }

  update(dt: number, v: Vehicle, world: PhysicsWorld) {
    const s = v.sim;
    const cam = this.camera;
    const spd = s.speed;
    s.getForward(_f);
    // shake decay
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (s.airTime === 0 && this.prevAir > 0.35) this.landing = Math.min(1, this.prevAir * 0.8);
    this.prevAir = s.airTime;
    this.landing = Math.max(0, this.landing - dt * 3);

    let targetFov = this.baseFov;
    // portrait screens (aspect < 1): taller vertical FOV so the road is not a narrow slit,
    // camera a bit higher and further back so the car sits low in the frame with the road ahead visible
    const portrait = clamp((1 - cam.aspect) / 0.5, 0, 1);
    if (this.mode === 'chase' || this.mode === 'far') {
      const far = this.mode === 'far';
      // heading follows velocity direction when moving (drift view), car heading when slow
      let hd = s.heading;
      if (spd > 4 && s.forwardSpeed > 0) {
        const vh = Math.atan2(-s.velocity.x, -s.velocity.z);
        let d = vh - hd;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        hd += clamp(d, -0.6, 0.6) * 0.55;
      }
      if (this.lookBack) hd += Math.PI;
      let dy = hd - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * (1 - Math.exp(-(this.lookBack ? 30 : 5.5) * dt));
      const dist = (far ? 9.5 : 6.4) + v.def.body.length * 0.35 + Math.min(spd, 70) * 0.025 + portrait * 1.6;
      const height = (far ? 3.4 : 2.1) + v.def.body.roofH * 0.35 + portrait * 1.3;
      _target.set(-Math.sin(this.yaw) * -dist, height, -Math.cos(this.yaw) * -dist).add(s.position);
      // acceleration lag: braking pushes camera forward, accel pulls back
      const longA = s.accel.dot(_f);
      _target.addScaledVector(_f, clamp(longA * 0.035, -0.6, 0.5));
      // spring
      const k = 60, c = 2 * Math.sqrt(k) * 0.95;
      _v.subVectors(_target, this.pos).multiplyScalar(k).addScaledVector(this.vel, -c);
      this.vel.addScaledVector(_v, dt);
      this.pos.addScaledVector(this.vel, dt);
      // keep tight horizontally at speed
      this.pos.lerp(_target, 1 - Math.exp(-6 * dt));
      // ground clearance
      world.sampleGround(this.pos.x, this.pos.z, this.pos.y + 2, _g);
      if (this.pos.y < _g.height + 0.8) this.pos.y = _g.height + 0.8;
      this.look.copy(s.position).add(_v.set(0, 0.9 + v.def.body.roofH * 0.2 + portrait * 0.9, 0)).addScaledVector(_f, (this.lookBack ? -3 : 3) * (1 + portrait * 1.6));
      this.look.y -= this.landing * 0.6;
      targetFov = this.baseFov + clamp((spd - 15) * 0.32, 0, 20) + (s.powertrain.nitroActive ? 6 : 0);
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
    } else if (this.mode === 'hood' || this.mode === 'cockpit' || this.mode === 'bumper') {
      const m = v.model;
      const b = v.def.body;
      if (this.mode === 'bumper') _v.set(0, b.clearance + 0.32, m.profile.noseZ + 0.15);
      else _v.copy(this.mode === 'hood' ? m.hoodCam : m.eye);
      _v.add(m.bodyGroup.position);
      // head moves a little with the g-forces in the cockpit
      const latA = s.accel.dot(new Vector3(1, 0, 0).applyQuaternion(s.quaternion));
      const lonA = s.accel.dot(_f);
      if (this.mode === 'cockpit') _v.add(new Vector3(clamp(-latA * 0.004, -0.04, 0.04), 0, clamp(lonA * 0.003, -0.04, 0.04)));
      cam.position.copy(_v).applyQuaternion(s.quaternion).add(s.position);
      if (!this.looking) {
        this.lookYaw *= Math.exp(-4 * dt);
        this.lookPitch *= Math.exp(-4 * dt);
      }
      // the driver looks into the corner a little
      this.headYaw = damp(this.headYaw, this.mode === 'cockpit' ? clamp(-s.steerAngle * 0.5, -0.25, 0.25) : 0, 4, dt);
      _q.copy(s.quaternion);
      const yaw = (this.lookBack ? Math.PI : 0) + this.lookYaw + this.headYaw;
      if (yaw) _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
      if (this.lookPitch) _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), this.lookPitch));
      if (this.mode === 'cockpit') _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.06));
      cam.quaternion.slerp(_q, 1 - Math.exp(-(this.mode === 'cockpit' ? 14 : 20) * dt));
      cam.rotateZ(clamp(latA * 0.004, -0.06, 0.06));
      targetFov = (this.mode === 'cockpit' ? 72 : this.mode === 'bumper' ? 70 : 64) + clamp((spd - 20) * 0.18, 0, 12);
    } else if (this.mode === 'wheel' || this.mode === 'top') {
      // wheel: low side camera by the rear wheel looking forward; top: high helicopter chase
      const b = v.def.body;
      if (this.mode === 'wheel') {
        _v.set(b.width / 2 + 0.95, b.wheelRadius * 1.5, b.wheelbase / 2 + 1.25).add(v.model.bodyGroup.position);
        cam.position.copy(_v).applyQuaternion(s.quaternion).add(s.position);
        _target.set(b.width * 0.05, b.wheelRadius * 1.2, -b.length * 3).add(v.model.bodyGroup.position).applyQuaternion(s.quaternion).add(s.position);
        cam.up.set(0, 1, 0);
        cam.lookAt(_target);
        targetFov = 62 + clamp((spd - 15) * 0.25, 0, 14);
      } else {
        let dy = s.heading - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-2.5 * dt));
        const d = 9 + Math.min(spd, 60) * 0.12;
        cam.position.set(s.position.x + Math.sin(this.yaw) * d * 0.55, s.position.y + 16 + Math.min(spd, 60) * 0.1, s.position.z + Math.cos(this.yaw) * d * 0.55);
        cam.up.set(0, 1, 0);
        cam.lookAt(_target.copy(s.position).addScaledVector(_f, 6 + spd * 0.15));
        targetFov = 55;
      }
    } else if (this.mode === 'cinematic') {
      // trackside camera: place ahead of the car, hold until it passes far enough
      this.cineTimer -= dt;
      const d = this.cineAnchor.distanceTo(s.position);
      if (this.cineTimer <= 0 || d > 60) {
        this.cineTimer = 6;
        const side = Math.random() < 0.5 ? -1 : 1;
        const ahead = 25 + spd * 1.6;
        const rx = -_f.z, rz = _f.x;
        this.cineAnchor.copy(s.position).addScaledVector(_f, ahead).add(_v.set(rx * 9 * side, 0, rz * 9 * side));
        world.sampleGround(this.cineAnchor.x, this.cineAnchor.z, this.cineAnchor.y + 50, _g);
        this.cineAnchor.y = _g.height + 1.2 + Math.random() * 3;
      }
      cam.position.copy(this.cineAnchor);
      cam.up.set(0, 1, 0);
      cam.lookAt(_v.copy(s.position).add(new Vector3(0, 0.8, 0)));
      targetFov = clamp(30 + d * 0.6, 22, 60);
    } else if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.12;
      cam.position.set(s.position.x + Math.sin(this.orbitAngle) * this.orbitDist, s.position.y + this.orbitHeight, s.position.z + Math.cos(this.orbitAngle) * this.orbitDist);
      cam.lookAt(_v.copy(s.position).add(new Vector3(0, 0.4, 0)));
      targetFov = 40;
    }
    // shake (impacts, rough surfaces, nitro)
    const rough = s.wheelsOnGround > 0 ? Math.min(1, spd / 60) * 0.02 : 0;
    const amp = this.shake * 0.12 + rough + (s.powertrain.nitroActive ? 0.015 : 0);
    if (amp > 0 && this.mode !== 'orbit') {
      const t = performance.now() * 0.001;
      cam.position.x += Math.sin(t * 61) * amp;
      cam.position.y += Math.sin(t * 47 + 1) * amp;
      cam.position.z += Math.sin(t * 53 + 2) * amp;
    }
    if (this.mode !== 'orbit' && this.mode !== 'cinematic') targetFov = Math.min(100, targetFov * (1 + 0.4 * portrait));
    else if (this.mode === 'orbit') targetFov *= 1 + 0.55 * portrait;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    void lerp;
  }
}
