// Vehículo terrestre "JABALÍ" 4x4: conducción arcade, colisiones con el mundo,
// atropellos, daño, explosión y sonido de motor posicional.
import * as THREE from 'three';
import { Audio } from './audio.js';
import { clamp, damp, wrapAngle } from './util.js';

const _a = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();

function buildJeep(T) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x4b5338, roughness: 0.6, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.8, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.35, metalness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2229, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 1.5 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  box(1.9, 0.55, 4.3, paint, 0, 0.75, 0);
  box(1.85, 0.35, 1.5, paint, 0, 1.15, -1.35);
  box(1.95, 0.12, 4.4, dark, 0, 0.45, 0);
  box(1.7, 0.06, 0.9, glass, 0, 1.55, -0.45).rotation.x = -0.35;
  for (const x of [-0.82, 0.82]) box(0.06, 0.55, 0.06, metal, x, 1.55, -0.42);
  box(1.7, 0.06, 0.06, metal, 0, 2.0, 0.9); for (const x of [-0.82, 0.82]) { box(0.06, 0.95, 0.06, metal, x, 1.5, 0.9); box(0.06, 0.06, 1.4, metal, x, 2.0, 0.2); }
  box(0.5, 0.45, 0.1, dark, -0.45, 1.25, 0.15); box(0.5, 0.45, 0.1, dark, 0.45, 1.25, 0.15);
  box(1.7, 0.4, 0.1, dark, 0, 1.2, 1.6);
  box(0.25, 0.14, 0.05, lamp, -0.65, 0.9, -2.16); box(0.25, 0.14, 0.05, lamp, 0.65, 0.9, -2.16);
  box(1.9, 0.25, 0.15, dark, 0, 0.55, -2.22);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 14), dark); spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.0, 2.25); g.add(spare);
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) {
    const w = new THREE.Mesh(wg, dark); w.position.set(x, 0.42, z); w.castShadow = true; g.add(w); wheels.push(w);
  }
  return { g, wheels, paint };
}

export class Vehicle {
  constructor(game, sp) {
    this.g = game;
    const { g, wheels, paint } = buildJeep();
    this.mesh = g; this.wheels = wheels; this.paint = paint;
    game.scene.add(g);
    this.pos = new THREE.Vector3(sp.x, 0, sp.z); this.yaw = sp.yaw || 0; this.speed = 0; this.steer = 0;
    this.hp = 700; this.maxHp = 700; this.alive = true; this.driver = null; this.team = sp.team;
    this.engine = null; this.respawnAt = 0; this.spawn = sp;
    this.halfW = 1.0; this.halfL = 2.3; this.height = 2.0;
    this.sync();
  }
  sync() { this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw; }
  dispose() { this.g.scene.remove(this.mesh); if (this.engine) this.engine.stop(); }

  // OBB local
  rayHit(o, d, maxT) {
    const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    const ox = o.x - this.pos.x, oz = o.z - this.pos.z;
    const lox = ox * c + oz * s, loz = -ox * s + oz * c;
    const ldx = d.x * c + d.z * s, ldz = -d.x * s + d.z * c;
    const O = [lox, o.y - this.pos.y, loz], D = [ldx, d.y, ldz], mn = [-this.halfW, 0.3, -this.halfL], mx = [this.halfW, 1.6, this.halfL];
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-8) { if (O[i] < mn[i] || O[i] > mx[i]) return null; continue; }
      let a = (mn[i] - O[i]) / D[i], b = (mx[i] - O[i]) / D[i]; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    // el conductor sobresale: dejar pasar disparos dirigidos a la cabeza
    return t0;
  }
  damage(amount, attacker) {
    if (!this.alive) return;
    this.hp -= amount;
    if (attacker && attacker.isPlayer && attacker !== this.driver) this.g.hud.hitmarker(false, this.hp <= 0);
    if (this.hp <= 0) this.destroy(attacker);
  }
  destroy(attacker) {
    const g = this.g;
    this.alive = false;
    const d = this.driver;
    if (d) { this.eject(d); g.combat.damage(d, 999, attacker && attacker !== d ? attacker : d, { weapon: 'vehiculo', explosive: true }); }
    g.combat.explode(this.pos.clone().setY(1), 6, 160, attacker, 'vehiculo', 1.5);
    this.paint.color.setHex(0x161412);
    g.fx.addFire(this.pos.x, 1.2, this.pos.z, 1.1);
    this.fireIdx = g.fx.fires.length - 1;
    this.respawnAt = g.time + 30;
    if (this.engine) { this.engine.stop(); this.engine = null; }
  }
  respawn() {
    const g = this.g;
    if (this.fireIdx !== undefined) { g.fx.fires.splice(this.fireIdx, 1); this.fireIdx = undefined; }
    this.pos.set(this.spawn.x, 0, this.spawn.z); this.yaw = this.spawn.yaw; this.speed = 0;
    this.hp = this.maxHp; this.alive = true; this.paint.color.setHex(0x4b5338);
    this.sync();
  }
  canEnter(p) { return this.alive && !this.driver && p.pos.distanceTo(this.pos) < 3.4 && Math.abs(p.pos.y - this.pos.y) < 1.2; }
  enter(p) {
    this.driver = p; p.inVehicle = this;
    p.crouch = false; p.height = p.standH; p.sprint = false;
    if (p.weapon) p.weapon.cancelReload();
    this.engine = Audio.play('loop_engine', { pos: this.pos, loop: true, vol: 0.6, ref: 6 });
    if (p.isPlayer) { this.g.vm.visible = false; this.g.hud.notice('JABALÍ 4x4', 'ally', this.g.input.touchMode ? 'Joystick para conducir · USAR para bajar' : 'WASD para conducir · E para bajar'); }
  }
  eject(p) {
    if (this.driver !== p) return;
    this.driver = null; p.inVehicle = null;
    if (this.engine) { this.engine.stop(); this.engine = null; }
    // buscar hueco libre a los lados
    const W = this.g.world;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const [lx, lz] of [[-2.2, 0], [2.2, 0], [0, 3.6], [0, -3.6]]) {
      const x = this.pos.x + lx * c + lz * s, z = this.pos.z - lx * s + lz * c;
      if (!W.overlapsSolid(x - 0.35, 0.1, z - 0.35, x + 0.35, 1.8, z + 0.35)) { p.pos.set(x, W.groundAt(x, z, 1.0), z); break; }
    }
    p.vel.set(0, 0, 0);
    if (p.isPlayer) { this.g.vm.visible = true; p.equipViewModel(); }
  }
  collides(x, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = this.g.world;
    for (const lz of [-1.7, 0, 1.7]) {
      const px = x + lz * s, pz = z + lz * c;
      if (W.overlapsSolid(px - 0.9, 0.35, pz - 0.9, px + 0.9, 1.6, pz + 0.9)) return true;
    }
    return false;
  }
  update(dt) {
    const g = this.g;
    if (!this.alive) { if (g.time > this.respawnAt && !this.driver) { const near = g.combatants.some((c) => c.alive && c.pos.distanceTo(this.spawn) < 5); if (!near) this.respawn(); } return; }
    const d = this.driver;
    let throttle = 0, steerIn = 0, brake = false;
    if (d && d.isPlayer && d.alive) {
      const inp = g.input;
      throttle = -inp.move.y; steerIn = -inp.move.x;
      brake = inp.isHeld('jump') || inp.isHeld('crouch');
      if (inp.touchMode) steerIn *= 0.9;
    }
    // dinámica
    const maxF = 17, maxB = 6;
    if (throttle > 0.05) this.speed += throttle * (this.speed < 0 ? 18 : 9) * dt;
    else if (throttle < -0.05) this.speed += throttle * (this.speed > 0 ? 18 : 6) * dt;
    else this.speed = damp(this.speed, 0, 1.2, dt);
    if (brake) this.speed = damp(this.speed, 0, 5, dt);
    this.speed = clamp(this.speed, -maxB, maxF);
    this.steer = damp(this.steer, steerIn, 6, dt);
    const turn = this.steer * clamp(this.speed / 6, -1, 1) * 1.6 * (1 - Math.min(0.5, Math.abs(this.speed) / 40));
    const nyaw = wrapAngle(this.yaw + turn * dt);
    const fx = -Math.sin(nyaw), fz = -Math.cos(nyaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const B = g.map.bounds;
    if (!this.collides(nx, nz, nyaw) && nx > B.minX + 3 && nx < B.maxX - 3 && nz > B.minZ + 3 && nz < B.maxZ - 3) { this.pos.x = nx; this.pos.z = nz; this.yaw = nyaw; }
    else if (!this.collides(this.pos.x, this.pos.z, nyaw)) { this.yaw = nyaw; this._bump(); }
    else this._bump();
    this.sync();
    for (const w of this.wheels) w.rotation.x -= this.speed * dt / 0.42;
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = this.steer * 0.45;
    // atropellos
    if (Math.abs(this.speed) > 5 && d) {
      for (const c of g.combatants) {
        if (!c.alive || c === d || !g.isEnemy(c, d)) continue;
        _a.set(c.pos.x - this.pos.x, 0, c.pos.z - this.pos.z);
        if (_a.length() < 2.4) g.combat.damage(c, 250, d, { weapon: 'atropello', dir: _d.set(fx, 0, fz) });
      }
    }
    if (this.engine) { this.engine.setPos(this.pos); this.engine.setRate(0.7 + Math.abs(this.speed) / 14); }
    if (d) { d.pos.set(this.pos.x, this.pos.y + 0.55, this.pos.z); d.vel.set(fx * this.speed, 0, fz * this.speed); d.moveSpeed = Math.abs(this.speed); }
    if (d && d.alive && Math.abs(this.speed) > 4) g.noise(this.pos, 30, d, 'step');
  }
  _bump() {
    if (Math.abs(this.speed) > 6) { Audio.play('imp_metal', { pos: this.pos, vol: 0.9, ref: 5 }); this.damage(Math.abs(this.speed) * 3, null); if (this.driver && this.driver.isPlayer) this.g.shake(0.4); }
    this.speed *= -0.25;
  }
}
