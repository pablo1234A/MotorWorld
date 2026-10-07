// Granadas físicas con rebotes, vista previa de trayectoria y detonaciones
// (fragmentación, impacto, humo y aturdidora).
import * as THREE from 'three';
import { Audio } from './audio.js';
import { clamp } from './util.js';

const GRAV = 14;
const _hit = {};
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Projectiles {
  constructor(game) {
    this.g = game; this.list = [];
    this.geo = {
      frag: new THREE.IcosahedronGeometry(0.055, 1),
      cyl: new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10),
    };
    this.mats = {
      frag: new THREE.MeshStandardMaterial({ color: 0x3b4a2e, roughness: 0.6, metalness: 0.3 }),
      impact: new THREE.MeshStandardMaterial({ color: 0x6b2a1e, roughness: 0.5, metalness: 0.4 }),
      smoke: new THREE.MeshStandardMaterial({ color: 0x7a7f84, roughness: 0.6, metalness: 0.5 }),
      flash: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.5 }),
    };
    // vista previa
    this.N = 64;
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.line = new THREE.Line(pg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.85, depthTest: false }));
    this.line.frustumCulled = false; this.line.visible = false; this.line.renderOrder = 30;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; this.marker.renderOrder = 30;
    game.scene.add(this.line, this.marker);
  }
  dispose() {
    for (const n of this.list) this.g.scene.remove(n.mesh);
    this.g.scene.remove(this.line, this.marker);
    Object.values(this.geo).forEach((g) => g.dispose()); Object.values(this.mats).forEach((m) => m.dispose());
    this.line.geometry.dispose(); this.line.material.dispose(); this.marker.geometry.dispose(); this.marker.material.dispose();
  }

  throw(owner, def, origin, vel) {
    const geo = def.id === 'frag' || def.id === 'impact' ? this.geo.frag : this.geo.cyl;
    const mesh = new THREE.Mesh(geo, this.mats[def.id] || this.mats.frag);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.g.scene.add(mesh);
    const n = { def, owner, pos: origin.clone(), vel: vel.clone(), t: 0, mesh, rest: false, armed: true, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), bounces: 0 };
    this.list.push(n);
    if (owner && owner.model && owner.model.throwT !== undefined) owner.model.throwT = 0;
    return n;
  }

  // velocidad para alcanzar target desde origin (para la IA)
  solve(origin, target, out) {
    const dx = target.x - origin.x, dz = target.z - origin.z, dy = target.y - origin.y;
    const d = Math.hypot(dx, dz);
    for (const ang of [0.6, 0.75, 0.45, 0.95]) {
      const c = Math.cos(ang), tn = Math.tan(ang);
      const denom = 2 * c * c * (d * tn - dy);
      if (denom <= 0) continue;
      const v2 = GRAV * d * d / denom;
      const v = Math.sqrt(v2);
      if (v > 22) continue;
      out.set(dx / d * v * c, v * Math.sin(ang), dz / d * v * c);
      return out;
    }
    return null;
  }

  _step(p, v, dt, n) {
    const W = this.g.world;
    v.y -= GRAV * dt;
    const sp = v.length();
    if (sp < 1e-4) return null;
    const step = sp * dt;
    const r = W.raycast(p.x, p.y, p.z, v.x / sp, v.y / sp, v.z / sp, step + 0.06, 'solid', _hit);
    if (r) {
      const t = Math.max(0, r.t - 0.06);
      p.x += v.x / sp * t; p.y += v.y / sp * t; p.z += v.z / sp * t;
      const nx = r.nx, ny = r.ny, nz = r.nz;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      v.x -= (1 + 0.42) * vn * nx; v.y -= (1 + 0.42) * vn * ny; v.z -= (1 + 0.42) * vn * nz;
      v.multiplyScalar(0.7);
      if (ny > 0.5 && Math.abs(v.y) < 1.2) { v.y = 0; v.x *= 0.85; v.z *= 0.85; }
      return { nx, ny, nz, speed: sp };
    }
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (p.y < 0.05) { p.y = 0.05; if (v.y < 0) { v.y = -v.y * 0.35; v.x *= 0.7; v.z *= 0.7; if (Math.abs(v.y) < 1.2) v.y = 0; } return { nx: 0, ny: 1, nz: 0, speed: sp }; }
    return null;
  }

  preview(origin, vel, def) {
    const pos = this.line.geometry.attributes.position;
    _a.copy(origin); _b.copy(vel);
    let i = 0, landed = false;
    const dt = 1 / 30;
    for (; i < this.N; i++) {
      pos.setXYZ(i, _a.x, _a.y, _a.z);
      const h = this._step(_a, _b, dt);
      if (h && (def.impact || h.ny > 0.5)) { landed = true; i++; pos.setXYZ(i < this.N ? i : this.N - 1, _a.x, _a.y, _a.z); break; }
    }
    for (let k = i; k < this.N; k++) pos.setXYZ(k, _a.x, _a.y, _a.z);
    pos.needsUpdate = true;
    this.line.computeLineDistances();
    this.line.visible = true;
    this.marker.visible = landed;
    if (landed) this.marker.position.set(_a.x, _a.y + 0.04, _a.z);
  }
  hidePreview() { this.line.visible = false; this.marker.visible = false; }

  update(dt) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i]; n.t += dt;
      if (!n.rest) {
        const sub = 2;
        for (let s = 0; s < sub; s++) {
          const h = this._step(n.pos, n.vel, dt / sub, n);
          if (h) {
            if (n.def.impact && n.t > 0.05) { this.detonate(n); n.done = true; break; }
            if (h.speed > 2.5 && n.bounces < 6) { Audio.play('bounce', { pos: n.pos, vol: clamp(h.speed / 12, 0.2, 0.8), jitter: 0.2 }); n.bounces++; }
            if (n.vel.lengthSq() < 0.15 && h.ny > 0.5) { n.rest = true; n.vel.set(0, 0, 0); }
          }
        }
        if (n.done) { this.remove(i); continue; }
        // impacto directo contra enemigos
        if (n.def.impact) {
          for (const c of g.combatants) {
            if (!c.alive || c === n.owner || !g.isEnemy(c, n.owner)) continue;
            if (c.chest(_a).distanceToSquared(n.pos) < 0.4) { this.detonate(n); n.done = true; break; }
          }
          if (n.done) { this.remove(i); continue; }
        }
        n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.y += n.spin.y * dt;
      }
      n.mesh.position.copy(n.pos);
      if (n.t >= n.def.fuse) { this.detonate(n); this.remove(i); }
    }
  }
  remove(i) { const n = this.list[i]; this.g.scene.remove(n.mesh); this.list.splice(i, 1); }

  detonate(n) {
    const g = this.g, d = n.def, p = n.pos;
    if (d.id === 'frag' || d.id === 'impact') {
      g.combat.explode(p.clone(), d.radius, d.dmg, n.owner, d.id, d.id === 'impact' ? 0.75 : 1);
    } else if (d.id === 'smoke') {
      g.fx.smokeGrenade(p.clone(), 14, 5.5);
      Audio.play('smoke', { pos: p, vol: 0.8, ref: 5 });
    } else if (d.id === 'flash') {
      g.fx.flashbang(p);
      Audio.play('flash', { pos: p, vol: 1, ref: 8, priority: true });
      for (const c of g.combatants) {
        if (!c.alive) continue;
        if (c !== n.owner && !g.isEnemy(c, n.owner)) continue;
        c.eye(_a);
        const dist = _a.distanceTo(p);
        if (dist > 16) continue;
        if (!g.world.los(p.x, p.y + 0.15, p.z, _a.x, _a.y, _a.z, 'sight')) continue;
        c.forward(_b);
        const toN = _a.sub(p).negate().normalize(); // del ojo a la granada
        const facing = clamp((_b.dot(toN) + 0.3) / 1.3, 0.15, 1);
        const k = (1 - dist / 16) * facing;
        if (k < 0.08) continue;
        const dur = 0.6 + k * 3.4;
        if (c.isPlayer) g.onPlayerFlashed(k, dur);
        else if (c.brain) c.brain.stun(dur);
        c.flashedUntil = g.time + dur;
      }
      g.noise(p, 40, n.owner, 'explosion');
    }
  }
}
