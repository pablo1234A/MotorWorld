// Rachas de bajas originales: OJO DE HALCÓN (reconocimiento), LLUVIA DE ACERO (artillería
// designada) y ESPECTRO (dron artillado autónomo). La IA también las obtiene y las usa.
import * as THREE from 'three';
import { Audio } from './audio.js';
import { STREAKS } from './data.js';
import { rand, spreadDir } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

function droneMesh(scale = 1, color = 0x2e3236) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.4, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.6, 4, 10), m); body.rotation.x = Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 1.1), m); wing.position.z = 0.1; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.6), m); tail.position.z = 1.6; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.6), m); fin.position.set(0, 0.4, 1.6); g.add(fin);
  const pod = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), dark); pod.position.set(0, -0.45, -0.8); g.add(pod);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); light.position.set(0, -0.3, 1.5); g.add(light);
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Streaks {
  constructor(game) {
    this.g = game;
    this.avail = [false, false, false];
    this.recon = new Map(); // team -> hasta
    this.air = [];
    this.designating = false;
    this.pendingBarrage = [];
  }
  dispose() { for (const a of this.air) { this.g.scene.remove(a.mesh); if (a.snd) a.snd.stop(); } }
  reconActive(team) { return (this.recon.get(team) || 0) > this.g.time; }

  onKill(c) {
    const k = c.stats.streak;
    STREAKS.forEach((s, i) => {
      if (k !== s.kills) return;
      if (c.isPlayer) {
        this.avail[i] = true;
        this.g.hud.streakReady(i, true);
        this.g.hud.notice(`${s.name} DISPONIBLE`, 'ally', this.g.input.touchMode ? 'Toca el icono para activarla' : `Pulsa ${i + 3} para activarla`);
        Audio.ui2d('ui_levelup', 0.6);
      } else {
        this.g.schedule(rand(1, 4), () => this.aiActivate(c, i));
      }
    });
  }
  activate(p, i) {
    if (!this.avail[i] || !p.alive) return;
    if (i === 1) { this.designating = true; this.designIdx = i; this.g.hud.designate(true); return; }
    this.avail[i] = false; this.g.hud.streakReady(i, false);
    this.launch(p, i);
  }
  confirmDesignation(p) {
    const g = this.g;
    const cam = g.camera; cam.getWorldDirection(_d);
    const r = g.world.raycast(cam.position.x, cam.position.y, cam.position.z, _d.x, _d.y, _d.z, 250, 'bullet', {});
    if (!r) { g.hud.notice('OBJETIVO FUERA DE ALCANCE', 'enemy'); return; }
    const pt = new THREE.Vector3(cam.position.x + _d.x * r.t, 0, cam.position.z + _d.z * r.t);
    this.designating = false; g.hud.designate(false);
    this.avail[1] = false; g.hud.streakReady(1, false);
    this.barrage(pt, p);
  }
  cancelDesignation() { if (this.designating) { this.designating = false; this.g.hud.designate(false); } }

  launch(owner, i) {
    const g = this.g; const s = STREAKS[i];
    const friendly = !g.isEnemy(owner, g.player) || owner === g.player;
    if (owner !== g.player) g.hud.notice(friendly ? `${s.name} ALIADO` : `¡${s.name} ENEMIGO!`, friendly ? 'ally' : 'enemy', owner.name);
    else g.hud.notice(`${s.name} EN CAMINO`, 'ally');
    owner.stats.score += 100;
    if (i === 0) {
      this.recon.set(owner.team, g.time + 30);
      this.spawnAir('recon', owner, 30);
    } else if (i === 2) {
      this.spawnAir('spectre', owner, 30);
    }
  }
  aiActivate(c, i) {
    const g = this.g;
    if (g.over) return;
    if (i === 1) {
      // objetivo: el grupo de enemigos más numeroso que conozca su escuadra
      const sq = g.squads[c.team];
      const known = sq ? sq.freshEnemies(12).map((k) => k.pos) : [];
      if (!known.length) for (const o of g.combatants) if (o.alive && g.isEnemy(o, c) && Math.random() < 0.6) known.push(o.pos.clone().add(_a.set(rand(-10, 10), 0, rand(-10, 10))));
      if (!known.length) return;
      let best = known[0], bc = 0;
      for (const p of known) { let n = 0; for (const q of known) if (p.distanceTo(q) < 12) n++; if (n > bc) { bc = n; best = p; } }
      const friendly = !g.isEnemy(c, g.player);
      g.hud.notice(friendly ? 'LLUVIA DE ACERO ALIADA' : '¡ARTILLERÍA ENEMIGA ENTRANTE!', friendly ? 'ally' : 'enemy', c.name);
      c.stats.score += 100;
      this.barrage(best.clone().setY(0), c);
    } else this.launch(c, i);
  }

  barrage(pt, owner) {
    const g = this.g;
    const n = 9;
    Audio.play('ui_alert', { pos: pt, vol: 0.6, ref: 20 });
    for (let k = 0; k < n; k++) {
      const delay = 1.6 + k * 0.55 + rand(0, 0.3);
      const p = new THREE.Vector3(pt.x + rand(-9, 9), 0, pt.z + rand(-9, 9));
      p.y = g.nav.floorAt(p.x, p.z) + 0.1;
      g.schedule(delay - 1.4, () => Audio.play('whistle', { pos: p, vol: 0.8, ref: 15, maxDist: 220 }));
      g.schedule(delay, () => { if (!g.over) g.combat.explode(p, 7, 170, owner, 'artilleria', 1.3); });
    }
  }

  spawnAir(kind, owner, dur) {
    const g = this.g;
    const friendly = !g.isEnemy(owner, g.player) || owner === g.player;
    const mesh = droneMesh(kind === 'recon' ? 0.8 : 1.4, kind === 'recon' ? 0x5a6066 : 0x2a2e33);
    g.scene.add(mesh);
    const a = {
      kind, owner, team: owner.team, mesh, t: 0, dur, alive: true, hp: kind === 'spectre' ? 450 : 200,
      ang: Math.random() * 6.28, radius: kind === 'recon' ? 55 : 38, alt: kind === 'recon' ? 62 : 42,
      pos: new THREE.Vector3(), target: null, fireT: 0, burst: 0, friendly,
      snd: Audio.play('loop_drone', { pos: new THREE.Vector3(0, 40, 0), loop: true, vol: kind === 'spectre' ? 0.5 : 0.25, ref: 30, rate: kind === 'spectre' ? 0.8 : 1.3 }),
    };
    a.rayHit = (o, d, maxT) => {
      _a.subVectors(a.pos, o); const s = _a.dot(d); if (s < 0 || s > maxT) return null;
      const q = _a.addScaledVector(d, -s).lengthSq(); return q < 4 ? s : null;
    };
    a.damage = (amt, att) => {
      if (!a.alive) return;
      a.hp -= amt;
      if (att && att.isPlayer) g.hud.hitmarker(false, a.hp <= 0);
      if (a.hp <= 0) {
        a.alive = false; a.t = a.dur;
        g.fx.explosion(a.pos, 1.4); Audio.play('explosion', { pos: a.pos, vol: 1, ref: 30, maxDist: 400 });
        if (att) { att.stats.score += 150; if (att.isPlayer) { g.hud.popup('+150', 'DRON DERRIBADO'); } }
      }
    };
    this.air.push(a);
    if (kind === 'spectre') g.vehicles.push(a);
  }

  update(dt) {
    const g = this.g;
    for (let i = this.air.length - 1; i >= 0; i--) {
      const a = this.air[i];
      a.t += dt;
      const speed = a.kind === 'recon' ? 0.12 : 0.17;
      a.ang += speed * dt * (a.t < 2 ? 2 : 1);
      const enter = Math.min(1, a.t / 3), leave = Math.max(0, (a.t - a.dur + 3) / 3);
      const r = a.radius + (1 - enter) * 120 + leave * 140;
      a.pos.set(Math.cos(a.ang) * r, a.alt + leave * 30, Math.sin(a.ang) * r);
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.set(0, -a.ang, 0); a.mesh.rotateZ(-0.35);
      if (a.snd) a.snd.setPos(a.pos);
      if (a.kind === 'spectre' && a.alive && a.t > 3 && a.t < a.dur - 2) this.spectreFire(a, dt);
      if (a.t >= a.dur + 1) {
        g.scene.remove(a.mesh); if (a.snd) a.snd.stop();
        this.air.splice(i, 1);
        const vi = g.vehicles.indexOf(a); if (vi >= 0) g.vehicles.splice(vi, 1);
      }
    }
  }
  spectreFire(a, dt) {
    const g = this.g;
    a.fireT -= dt;
    if (a.fireT > 0) return;
    // adquirir objetivo visible
    if (!a.target || !a.target.alive || Math.random() < 0.1) {
      a.target = null; let bd = Infinity;
      for (const c of g.combatants) {
        if (!c.alive || !g.isEnemy(c, a.owner)) continue;
        c.chest(_a);
        if (!g.world.los(a.pos.x, a.pos.y - 1, a.pos.z, _a.x, _a.y, _a.z, 'sight')) continue;
        const d = _a.distanceTo(a.pos);
        if (d < bd) { bd = d; a.target = c; }
      }
      if (!a.target) { a.fireT = 0.5; return; }
    }
    if (a.burst <= 0) { a.burst = 6; }
    const c = a.target; c.chest(_a);
    _b.set(a.pos.x, a.pos.y - 1.2, a.pos.z);
    _d.subVectors(_a, _b).normalize();
    spreadDir(_d, 0.9, _d);
    const r = g.world.raycast(_b.x, _b.y, _b.z, _d.x, _d.y, _d.z, 200, 'bullet', {});
    const t = r ? r.t : 200;
    const hitPt = _a.copy(_b).addScaledVector(_d, t);
    g.fx.tracer(_b, hitPt, 500);
    g.fx.impact(hitPt, { x: 0, y: 1, z: 0 }, 'concrete');
    Audio.play('gun_turret', { pos: _b, vol: 0.9, ref: 25, maxDist: 300 });
    // daño en área pequeña (proyectil de 25 mm)
    for (const o of g.combatants) {
      if (!o.alive || !g.isEnemy(o, a.owner)) continue;
      const d = o.chest(_b).distanceTo(hitPt);
      if (d < 2.2) g.combat.damage(o, 44 * (1 - d / 2.2) + 12, a.owner, { weapon: 'espectro', explosive: true, dir: _d.clone(), point: hitPt.clone() });
    }
    a.burst--;
    a.fireT = a.burst > 0 ? 0.13 : rand(0.8, 1.5);
  }
}
