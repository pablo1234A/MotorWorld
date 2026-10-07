// Vehículos terrestres originales:
//  · JABALÍ 4x4: ligero y rápido, conductor expuesto, atropellos.
//  · RINOCERONTE: blindado 8x8 lento, muy resistente, torreta pesada que dispara donde apuntas.
// Conducción arcade, colisiones con el mundo y con soldados, daño, explosión y motor posicional.
import * as THREE from './lib/three.module.min.js';
import { Audio } from './audio.js';
import { WeaponState } from './weapons.js';
import { clamp, damp, wrapAngle } from './util.js';

const _a = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3(), _t = new THREE.Vector3(), _hit = {};

const KINDS = {
  jeep: { name: 'JABALÍ 4x4', hp: 700, maxF: 17, maxB: 6, accel: 9, halfW: 1.0, halfL: 2.3, top: 1.6, colR: 0.9, colZ: [-1.7, 0, 1.7], camDist: 7.5, paint: 0x4b5338, bulletMul: 0.6, seatY: 0.55, turn: 1.6 },
  apc: { name: 'RINOCERONTE', hp: 1500, maxF: 11, maxB: 4, accel: 5, halfW: 1.35, halfL: 2.9, top: 2.75, colR: 1.3, colZ: [-2.0, 0, 2.0], camDist: 8.5, paint: 0x596048, bulletMul: 0.35, seatY: 0.9, turn: 1.1 },
};

function mats(paintHex) {
  return {
    paint: new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.62, metalness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.8, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.35, metalness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2229, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 1.5 }),
  };
}
function boxer(g) {
  return (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
}

function buildJeep(M) {
  const g = new THREE.Group(); const box = boxer(g);
  box(1.9, 0.55, 4.3, M.paint, 0, 0.75, 0);
  box(1.85, 0.35, 1.5, M.paint, 0, 1.15, -1.35);
  box(1.95, 0.12, 4.4, M.dark, 0, 0.45, 0);
  box(1.7, 0.06, 0.9, M.glass, 0, 1.55, -0.45).rotation.x = -0.35;
  for (const x of [-0.82, 0.82]) box(0.06, 0.55, 0.06, M.metal, x, 1.55, -0.42);
  box(1.7, 0.06, 0.06, M.metal, 0, 2.0, 0.9); for (const x of [-0.82, 0.82]) { box(0.06, 0.95, 0.06, M.metal, x, 1.5, 0.9); box(0.06, 0.06, 1.4, M.metal, x, 2.0, 0.2); }
  box(0.5, 0.45, 0.1, M.dark, -0.45, 1.25, 0.15); box(0.5, 0.45, 0.1, M.dark, 0.45, 1.25, 0.15);
  box(1.7, 0.4, 0.1, M.dark, 0, 1.2, 1.6);
  box(0.25, 0.14, 0.05, M.lamp, -0.65, 0.9, -2.16); box(0.25, 0.14, 0.05, M.lamp, 0.65, 0.9, -2.16);
  box(1.9, 0.25, 0.15, M.dark, 0, 0.55, -2.22);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14), M.dark); spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.0, 2.25); g.add(spare);
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) { const w = new THREE.Mesh(wg, M.dark); w.position.set(x, 0.42, z); w.castShadow = true; g.add(w); wheels.push(w); }
  return { g, wheels, steerWheels: [wheels[0], wheels[1]] };
}

function buildAPC(M) {
  const g = new THREE.Group(); const box = boxer(g);
  // casco con frontal inclinado
  box(2.5, 1.0, 5.4, M.paint, 0, 1.05, 0.1);
  const nose = box(2.5, 0.75, 1.1, M.paint, 0, 1.15, -2.75); nose.rotation.x = 0.55;
  box(2.6, 0.18, 5.6, M.dark, 0, 0.55, 0);
  box(2.2, 0.35, 3.0, M.paint, 0, 1.72, 0.6);
  for (const x of [-1.29, 1.29]) { box(0.06, 0.5, 4.6, M.dark, x, 1.0, 0.2); }
  for (let i = 0; i < 5; i++) box(0.5, 0.12, 0.35, M.dark, -0.6 + (i % 3) * 0.6, 1.95, -0.2 + Math.floor(i / 3) * 0.9);
  box(0.3, 0.12, 0.06, M.lamp, -0.9, 1.15, -3.18); box(0.3, 0.12, 0.06, M.lamp, 0.9, 1.15, -3.18);
  box(1.2, 0.6, 0.12, M.dark, 0, 1.25, 2.86);
  // ruedas 8x8
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.52, 0.52, 0.4, 16); wg.rotateZ(Math.PI / 2);
  for (const z of [-2.0, -0.75, 0.75, 2.0]) for (const x of [-1.2, 1.2]) { const w = new THREE.Mesh(wg, M.dark); w.position.set(x, 0.52, z); w.castShadow = true; g.add(w); wheels.push(w); }
  // torreta
  const turret = new THREE.Group(); turret.position.set(0, 1.9, 0.3); g.add(turret);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.5, 14), M.paint); tb.position.y = 0.25; tb.castShadow = true; turret.add(tb);
  box(1.0, 0.35, 0.9, M.paint, 0, 0.6, -0.25, turret);
  const pitch = new THREE.Group(); pitch.position.set(0, 0.6, -0.6); turret.add(pitch);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.5, 10), M.metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.75; barrel.castShadow = true; pitch.add(barrel);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10), M.dark); shroud.rotation.x = Math.PI / 2; shroud.position.z = -0.2; pitch.add(shroud);
  box(0.25, 0.2, 0.3, M.dark, 0.35, 0.05, -0.1, pitch);
  const muzzle = new THREE.Object3D(); muzzle.position.z = -1.55; pitch.add(muzzle);
  return { g, wheels, steerWheels: [wheels[0], wheels[1], wheels[2], wheels[3]], turret, pitch, muzzle };
}

export class Vehicle {
  constructor(game, sp) {
    this.g = game;
    this.kind = sp.kind || 'jeep';
    const K = this.K = KINDS[this.kind];
    this.M = mats(K.paint);
    const b = this.kind === 'apc' ? buildAPC(this.M) : buildJeep(this.M);
    this.mesh = b.g; this.wheels = b.wheels; this.steerWheels = b.steerWheels; this.turret = b.turret || null; this.pitchG = b.pitch || null; this.muzzle = b.muzzle || null;
    game.scene.add(this.mesh);
    this.pos = new THREE.Vector3(sp.x, 0, sp.z); this.yaw = sp.yaw || 0; this.speed = 0; this.steer = 0;
    this.hp = K.hp; this.maxHp = K.hp; this.alive = true; this.driver = null; this.team = sp.team;
    this.engine = null; this.respawnAt = 0; this.spawn = sp;
    this.halfW = K.halfW; this.halfL = K.halfL; this.height = K.top; this.name = K.name; this.bulletMul = K.bulletMul;
    this.gun = this.kind === 'apc' ? new WeaponState('hmg') : null;
    this.turretYaw = 0; this.turretPitch = 0;
    this.sync();
  }
  sync() { this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw; }
  dispose() { this.g.scene.remove(this.mesh); if (this.engine) this.engine.stop(); Object.values(this.M).forEach((m) => m.dispose()); }

  _toLocal(x, z) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const ox = x - this.pos.x, oz = z - this.pos.z;
    return [ox * c - oz * s, ox * s + oz * c];
  }
  // Rayo contra la caja orientada del vehículo
  rayHit(o, d, maxT) {
    const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    const ox = o.x - this.pos.x, oz = o.z - this.pos.z;
    const lox = ox * c + oz * s, loz = -ox * s + oz * c;
    const ldx = d.x * c + d.z * s, ldz = -d.x * s + d.z * c;
    const O = [lox, o.y - this.pos.y, loz], D = [ldx, d.y, ldz], mn = [-this.halfW, 0.3, -this.halfL], mx = [this.halfW, this.height, this.halfL];
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-8) { if (O[i] < mn[i] || O[i] > mx[i]) return null; continue; }
      let a = (mn[i] - O[i]) / D[i], b = (mx[i] - O[i]) / D[i]; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    return t0;
  }
  // Empuja una posición (soldado) fuera del vehículo. Devuelve true si la ha movido.
  pushOut(p, r) {
    if (p.y > this.pos.y + this.height) return false;
    const [lx, lz] = this._toLocal(p.x, p.z);
    const hw = this.halfW + r, hl = this.halfL + r;
    if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) return false;
    let nx = lx, nz = lz;
    if (hw - Math.abs(lx) < hl - Math.abs(lz)) nx = Math.sign(lx || 1) * hw; else nz = Math.sign(lz || 1) * hl;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    p.x = this.pos.x + nx * c + nz * s; p.z = this.pos.z - nx * s + nz * c;
    return true;
  }
  damage(amount, attacker) {
    if (!this.alive) return;
    this.hp -= amount;
    if (attacker && attacker.isPlayer && attacker !== this.driver) this.g.hud.hitmarker(false, this.hp <= 0);
    if (this.driver && this.driver.isPlayer && attacker && attacker !== this.driver) this.g.hud.damage(attacker);
    if (this.hp <= 0) this.destroy(attacker);
  }
  destroy(attacker) {
    const g = this.g;
    this.alive = false;
    const d = this.driver;
    if (d) { this.eject(d); g.combat.damage(d, 999, attacker && attacker !== d ? attacker : d, { weapon: 'vehiculo', explosive: true }); }
    g.combat.explode(this.pos.clone().setY(1), 6, 160, attacker, 'vehiculo', 1.5);
    this.M.paint.color.setHex(0x161412);
    g.fx.addFire(this.pos.x, 1.2, this.pos.z, 1.1);
    this.fireRef = g.fx.fires[g.fx.fires.length - 1];
    this.respawnAt = g.time + 30;
    if (this.engine) { this.engine.stop(); this.engine = null; }
  }
  respawn() {
    const g = this.g;
    if (this.fireRef) { const i = g.fx.fires.indexOf(this.fireRef); if (i >= 0) g.fx.fires.splice(i, 1); this.fireRef = null; }
    this.pos.set(this.spawn.x, 0, this.spawn.z); this.yaw = this.spawn.yaw; this.speed = 0;
    this.hp = this.maxHp; this.alive = true; this.M.paint.color.setHex(this.K.paint);
    if (this.gun) { this.gun.mag = this.gun.def.mag; this.gun.reloading = false; }
    this.sync();
  }
  canEnter(p) { return this.alive && !this.driver && p.pos.distanceTo(this.pos) < this.halfL + 1.4 && Math.abs(p.pos.y - this.pos.y) < 1.2; }
  enter(p) {
    this.driver = p; p.inVehicle = this;
    p.crouch = false; p.height = p.standH; p.sprint = false;
    if (p.weapon) p.weapon.cancelReload();
    this.engine = Audio.play('loop_engine', { pos: this.pos, loop: true, vol: this.kind === 'apc' ? 0.8 : 0.6, ref: 6, rate: this.kind === 'apc' ? 0.7 : 1 });
    if (p.isPlayer) {
      const t = this.g.input.touchMode;
      this.g.vm.visible = false;
      this.g.hud.notice(this.name, 'ally', this.kind === 'apc' ? (t ? 'Joystick conduce · arrastra para apuntar la torreta · DISPARAR' : 'WASD conduce · ratón apunta la torreta · clic dispara · E baja') : (t ? 'Joystick para conducir · USAR para bajar' : 'WASD para conducir · E para bajar'));
      if (this.kind === 'apc') p.pitch = 0;
    }
  }
  eject(p) {
    if (this.driver !== p) return;
    this.driver = null; p.inVehicle = null;
    if (this.engine) { this.engine.stop(); this.engine = null; }
    const W = this.g.world;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const side = this.halfW + 1.0, back = this.halfL + 1.2;
    for (const [lx, lz] of [[-side, 0], [side, 0], [0, back], [0, -back]]) {
      const x = this.pos.x + lx * c + lz * s, z = this.pos.z - lx * s + lz * c;
      if (!W.overlapsSolid(x - 0.35, 0.1, z - 0.35, x + 0.35, 1.8, z + 0.35)) { p.pos.set(x, W.groundAt(x, z, 1.0), z); break; }
    }
    p.vel.set(0, 0, 0);
    if (p.isPlayer) { this.g.vm.visible = true; p.equipViewModel(); }
  }
  collides(x, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = this.g.world, R = this.K.colR;
    for (const lz of this.K.colZ) {
      const px = x + lz * s, pz = z + lz * c;
      if (W.overlapsSolid(px - R, 0.35, pz - R, px + R, 1.6, pz + R)) return true;
    }
    for (const v of this.g.vehicles) {
      if (v === this || !v.halfW) continue;
      const dx = v.pos.x - x, dz = v.pos.z - z;
      if (dx * dx + dz * dz < (this.halfL + v.halfL) * (this.halfW + v.halfW) * 0.9) return true;
    }
    return false;
  }
  update(dt) {
    const g = this.g, K = this.K;
    if (!this.alive) { if (g.time > this.respawnAt && !this.driver) { const near = g.combatants.some((c) => c.alive && c.pos.distanceTo(this.spawn) < 5); if (!near) this.respawn(); } return; }
    const d = this.driver;
    let throttle = 0, steerIn = 0, brake = false;
    const playerDriving = d && d.isPlayer && d.alive;
    if (playerDriving) {
      const inp = g.input;
      throttle = -inp.move.y; steerIn = -inp.move.x;
      brake = inp.isHeld('jump') || inp.isHeld('crouch');
      if (inp.touchMode) steerIn *= 0.9;
    }
    // dinámica
    if (throttle > 0.05) this.speed += throttle * (this.speed < 0 ? K.accel * 2 : K.accel) * dt;
    else if (throttle < -0.05) this.speed += throttle * (this.speed > 0 ? K.accel * 2 : K.accel * 0.7) * dt;
    else this.speed = damp(this.speed, 0, 1.2, dt);
    if (brake) this.speed = damp(this.speed, 0, 5, dt);
    this.speed = clamp(this.speed, -K.maxB, K.maxF);
    this.steer = damp(this.steer, steerIn, 6, dt);
    const turn = this.steer * clamp(this.speed / 6, -1, 1) * K.turn * (1 - Math.min(0.5, Math.abs(this.speed) / 40));
    const nyaw = wrapAngle(this.yaw + turn * dt);
    const fx = -Math.sin(nyaw), fz = -Math.cos(nyaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const B = g.map.bounds;
    if (!this.collides(nx, nz, nyaw) && nx > B.minX + 3 && nx < B.maxX - 3 && nz > B.minZ + 3 && nz < B.maxZ - 3) { this.pos.x = nx; this.pos.z = nz; this.yaw = nyaw; }
    else if (!this.collides(this.pos.x, this.pos.z, nyaw)) { this.yaw = nyaw; this._bump(); }
    else this._bump();
    this.sync();
    for (const w of this.wheels) w.rotation.x -= this.speed * dt / 0.45;
    for (const w of this.steerWheels) w.rotation.y = this.steer * 0.45;
    // atropellos
    if (Math.abs(this.speed) > 5 && d) {
      for (const c of g.combatants) {
        if (!c.alive || c === d || !g.isEnemy(c, d)) continue;
        _a.set(c.pos.x - this.pos.x, 0, c.pos.z - this.pos.z);
        if (_a.length() < this.halfL + 0.2) g.combat.damage(c, 250, d, { weapon: 'atropello', dir: _d.set(fx, 0, fz) });
      }
    }
    // torreta del blindado: apunta donde mira la cámara y dispara
    if (this.turret) {
      if (playerDriving) {
        const cam = g.camera; cam.getWorldDirection(_d);
        const r = g.world.raycast(cam.position.x, cam.position.y, cam.position.z, _d.x, _d.y, _d.z, 300, 'bullet', _hit);
        let aimT = r ? r.t : 300;
        for (const c of g.combatants) { if (c === d || !c.alive || !g.isEnemy(c, d)) continue; const h = c.rayHit(cam.position.x, cam.position.y, cam.position.z, _d.x, _d.y, _d.z, aimT); if (h && h.t < aimT) aimT = h.t; }
        _t.copy(cam.position).addScaledVector(_d, aimT);
        this.muzzle.getWorldPosition(_o);
        const tp = this.turret.getWorldPosition(_a);
        const wantYaw = Math.atan2(-(_t.x - tp.x), -(_t.z - tp.z)) - this.yaw;
        this.turretYaw += wrapAngle(wantYaw - this.turretYaw) * Math.min(1, dt * 10);
        const horiz = Math.hypot(_t.x - tp.x, _t.z - tp.z);
        this.turretPitch = damp(this.turretPitch, clamp(Math.atan2(_t.y - (tp.y + 0.6), horiz), -0.25, 0.6), 10, dt);
        this.gun.update(g.time, dt);
        if (g.input.isHeld('fire') && this.gun.canFire(g.time)) {
          this.gun.fire(g.time);
          _d.subVectors(_t, _o).normalize();
          g.combat.shoot(d, this.gun, _o, _d, this.gun.def.spreadHip, _o);
          g.fx.muzzle(_o, _d, 1.6); g.fx.flashLight(_o, 0xffb060, 8, 0.06, 10);
          g.shake(0.06);
          if (this.gun.mag === 0) { this.gun.startReload(g.time, 1); Audio.play('mag_out', { pos: _o, vol: 0.6 }); }
        }
      }
      this.turret.rotation.y = this.turretYaw;
      this.pitchG.rotation.x = this.turretPitch;
    }
    if (this.engine) { this.engine.setPos(this.pos); this.engine.setRate((this.kind === 'apc' ? 0.55 : 0.7) + Math.abs(this.speed) / 14); }
    if (d) { d.pos.set(this.pos.x, this.pos.y + K.seatY, this.pos.z); d.vel.set(fx * this.speed, 0, fz * this.speed); d.moveSpeed = Math.abs(this.speed); }
    if (d && d.alive && Math.abs(this.speed) > 4) g.noise(this.pos, 30, d, 'step');
  }
  _bump() {
    if (Math.abs(this.speed) > 6) { Audio.play('imp_metal', { pos: this.pos, vol: 0.9, ref: 5 }); this.damage(Math.abs(this.speed) * (this.kind === 'apc' ? 1 : 3), null); if (this.driver && this.driver.isPlayer) this.g.shake(0.4); }
    this.speed *= -0.25;
  }
}
