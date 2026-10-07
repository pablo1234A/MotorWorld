// Soldados controlados por IA. Percepción (cono de visión, línea de visión, humo, oído,
// supresión), memoria de amenazas, tiempo de reacción, modelo de puntería con error que
// converge, cobertura con asomado, flanqueo, retirada, granadas, presión al recargar y
// objetivos de modo asignados por la escuadra. La dificultad cambia el comportamiento.
import * as THREE from 'three';
import { Combatant } from './actors.js';
import { Soldier } from './soldier.js';
import { Audio } from './audio.js';
import { clamp, damp, DEG, rand, randInt, wrapAngle, yawFromDir, pointSegDist2D } from './util.js';
import { TEAMS } from './data.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _mres = {};

export class Bot extends Combatant {
  constructor(game, o) {
    super(game, o);
    const accent = game.mode.def.teams ? TEAMS[o.team].hex : 0xff4d3a;
    this.model = new Soldier(o.look, accent, o.loadout.primary, { camo: o.loadout.camo, shadow: game.Q.shadows });
    game.scene.add(this.model.root);
    this.model.root.visible = false;
    this.vy = 0; this.speedNow = 0; this.bodyYaw = 0; this.stepAcc = 0;
    this.brain = new Brain(this);
  }
  resetForSpawn(p) {
    super.resetForSpawn(p);
    this.vy = 0; this.bodyYaw = this.yaw;
    this.model.setWeapon(this.weapon.id, this.loadout.camo);
    this.brain.reset();
  }
  update(dt) {
    if (this.alive && !this.inVehicle) this.brain.update(dt);
    // modelo
    const m = this.model;
    m.root.position.copy(this.pos);
    if (this.alive) this.bodyYaw = this.bodyYaw + wrapAngle(this.yaw - this.bodyYaw) * Math.min(1, dt * 10);
    m.root.rotation.y = this.bodyYaw;
    const cam = this.game.camera.position;
    const d2 = (cam.x - this.pos.x) ** 2 + (cam.z - this.pos.z) ** 2;
    const far = d2 > this.game.drawDist2;
    m.root.visible = !far && (this.alive || this.game.time - this.deathTime < 6);
    if (!m.root.visible) return;
    m.setLOD(d2 > 45 * 45 ? 2 : d2 > 22 * 22 ? 1 : 0);
    if (d2 < 70 * 70 || !this.alive) m.update(dt, { speed: this.speedNow, crouch: this.crouch, aimPitch: this.pitch, sprint: this.sprint, grounded: true });
  }
}

class Brain {
  constructor(bot) {
    this.b = bot; this.g = bot.game; this.D = bot.game.diff;
    this.mem = new Map();
    this.reset();
  }
  reset() {
    const t = this.g.time;
    this.state = 'objective'; this.target = null; this.path = null; this.pi = 0; this.goal = null; this.goalKind = null;
    this.errY = 0; this.errP = 0; this.reactUntil = 0; this.burstLeft = 0; this.pauseUntil = 0;
    this.strafe = 0; this.strafeUntil = 0; this.cover = null; this.coverPhase = null; this.coverT = 0; this.peekPos = null;
    this.thinkT = Math.random() * 0.4; this.perceiveT = Math.random() * 0.2; this.stunUntil = 0;
    this.nadeCD = t + rand(6, 14); this.lastPos = this.b.pos.clone(); this.stuckT = 0; this.stuckN = 0;
    this.holdUntil = 0; this.lookAt = null; this.evadeUntil = 0; this.dodged = new Set(); this.wantCrouch = false;
    this.headshotBias = false; this.lastTargetT = -99; this.suspicion = null; this.arriveT = 0; this.scanT = 0; this.scanYaw = 0;
    this.pathWait = 0; this.searchUntil = 0; this.mem.clear(); this.objT = 0;
    this.urgent = false; this.lastFire = -99; this.engageStart = 0; this.visCount = 0; this.engageMove = 'hold'; this.moveDirLen = 0;
  }
  stun(dur) { this.stunUntil = Math.max(this.stunUntil, this.g.time + dur * (this.D.id === 'elite' ? 0.75 : 1)); this.burstLeft = 0; }

  // ------------------------------------------------------------ percepción
  memFor(c) { let m = this.mem.get(c); if (!m) { m = { c, pos: c.pos.clone(), t: -99, seen: false, spot: 0, heard: false }; this.mem.set(c, m); } return m; }
  perceive(dtP) {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    b.eye(_a);
    const fwdYaw = b.yaw;
    const visMul = g.atmosVis;
    let best = null, bestScore = -Infinity, visCount = 0;
    for (const c of g.combatants) {
      if (!c.alive || !g.isEnemy(c, b)) continue;
      const dx = c.pos.x - b.pos.x, dz = c.pos.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      const m = this.mem.get(c);
      if (dist > D.viewRange * visMul * 1.2 && !m) continue;
      const ang = Math.abs(wrapAngle(yawFromDir(dx, dz) - fwdYaw));
      const inFov = ang < D.fov * 0.5 * DEG || dist < 4;
      let visible = false;
      if (inFov && dist < D.viewRange * visMul * (c.crouch ? 0.85 : 1) * (c.inVehicle ? 1.4 : 1)) {
        c.head(_b);
        visible = g.world.los(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 'sight');
        if (!visible) { c.chest(_b); visible = g.world.los(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, 'sight'); }
        if (visible && g.fx.smokeBlocks(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z)) visible = false;
      }
      const mm = this.memFor(c);
      if (visible) {
        let rate = D.spot * (dist < 10 ? 3 : dist < 25 ? 1.8 : dist < 50 ? 1.0 : 0.6);
        if (t - c.lastShotTime < 0.6) rate *= 2.2;
        if (c.isPlayer && c.moveSpeed > 4) rate *= 1.3;
        if (c.crouch && t - c.lastShotTime > 1) rate *= 0.7;
        if (ang > D.fov * 0.35 * DEG) rate *= 0.6; // visión periférica
        if (mm.t > t - 3) rate *= 2.5; // ya lo conocía
        mm.spot = Math.min(1.2, mm.spot + rate * dtP);
        if (mm.spot >= 1) {
          if (!mm.seen) { this.onSpot(c, mm, dist); }
          mm.seen = true; mm.pos.copy(c.pos); mm.t = t; mm.heard = false;
          visCount++;
          let score = -dist;
          if (c === this.target) score += 12;
          if (c.isPlayer) score += 2;
          if (t - c.lastShotTime < 1) score += 6;
          if (score > bestScore) { bestScore = score; best = c; }
        }
      } else {
        mm.spot = Math.max(0, mm.spot - dtP * 0.8);
        if (mm.seen) { mm.seen = false; mm.lostT = t; }
      }
    }
    this.visCount = visCount;
    if (best !== this.target) {
      this.target = best;
      if (best) {
        this.engageStart = t;
        const m = this.mem.get(best);
        this.reactUntil = Math.max(this.reactUntil, t + D.reaction * rand(0.75, 1.25) * (m && t - m.lostT < 2 ? 0.4 : 1));
        const e = D.aimErr * rand(0.6, 1.1);
        this.errY = (Math.random() < 0.5 ? -1 : 1) * e * DEG; this.errP = rand(-0.6, 0.6) * e * DEG;
        this.headshotBias = Math.random() < (D.id === 'elite' ? 0.35 : D.id === 'hard' ? 0.2 : 0.05);
        this.urgent = true;
      }
    }
    // reconocimiento aéreo del equipo
    const recon = g.streaks.reconActive(b.team);
    if (recon && (!this._reconT || t - this._reconT > 2)) {
      this._reconT = t;
      for (const c of g.combatants) { if (c.alive && g.isEnemy(c, b) && c.perk !== 'fantasma') { const m = this.memFor(c); if (!m.seen) { m.pos.copy(c.pos); m.t = t - 1; m.heard = true; } } }
    }
  }
  onSpot(c, m, dist) {
    const g = this.g;
    g.squads[this.b.team] && g.squads[this.b.team].report(this.b, c);
    if (Math.random() < 0.25 && dist < 40) this.g.botCallout(this.b, 'contact');
  }
  hear(pos, source, kind) {
    const t = this.g.time;
    if (this.target && this.mem.get(this.target) && this.mem.get(this.target).seen) return;
    const m = this.memFor(source);
    const err = kind === 'step' ? 2.5 : kind === 'explosion' ? 6 : 4;
    if (t - m.t < 0.5 && m.seen) return;
    m.pos.set(pos.x + rand(-err, err), pos.y, pos.z + rand(-err, err)); m.t = t; m.heard = true;
    this.suspicion = m;
    if (this.state !== 'engage' && this.state !== 'cover') this.urgent = true;
  }
  knowFromSquad(c, pos, t) {
    const m = this.memFor(c);
    if (m.seen || m.t >= t) return;
    m.pos.copy(pos); m.t = t; m.heard = true;
  }
  onDamaged(att, amount, info) {
    if (!att || att === this.b) return;
    const t = this.g.time, D = this.D;
    const m = this.memFor(att);
    if (!m.seen) { m.pos.copy(att.pos); m.t = t; m.heard = true; m.spot = Math.max(m.spot, 0.6); }
    this.suspicion = m;
    // girar hacia la amenaza (las IA buenas reaccionan antes)
    if (!this.target) { this.lookAt = att.pos.clone(); this.reactUntil = Math.max(this.reactUntil, t + D.reaction * 0.6); }
    if (this.b.health < 60 && Math.random() < D.coverChance && this.state !== 'cover' && this.state !== 'retreat') { this.seekCover(att.pos, this.b.health < D.retreatHp); }
    this.urgent = true;
    this.g.squads[this.b.team] && this.g.squads[this.b.team].report(this.b, att, 0.5);
  }
  suppressed(shooter) {
    const m = this.memFor(shooter);
    const t = this.g.time;
    if (!m.seen) { m.pos.copy(shooter.pos); m.t = t; m.heard = true; }
    if (!this.target) { this.lookAt = shooter.pos.clone(); this.urgent = true; }
    if (this.D.coverChance > 0.5 && Math.random() < this.D.coverChance * 0.35 && this.state !== 'cover') this.seekCover(shooter.pos, false);
  }

  // ------------------------------------------------------------ decisión
  think() {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    // limpiar memoria
    for (const [c, m] of this.mem) if (!c.alive || t - m.t > 20) this.mem.delete(c);
    // evitar granadas
    for (const n of g.projectiles.list) {
      if (this.dodged.has(n) || !(n.def.id === 'frag')) continue;
      if (n.owner && !g.isEnemy(n.owner, b) && n.owner !== b) continue;
      const d = n.pos.distanceTo(b.pos);
      if (d < n.def.radius + 1.5) {
        this.dodged.add(n);
        if (Math.random() < D.dodgeGrenade) {
          _a.subVectors(b.pos, n.pos).setY(0); if (_a.lengthSq() < 0.01) _a.set(rand(-1, 1), 0, rand(-1, 1)); _a.normalize();
          const tgt = g.nav.randomNear(b.pos.x + _a.x * 8, b.pos.z + _a.z * 8, 3);
          if (tgt >= 0) { this.setPath(g.nav.cx(tgt), g.nav.cz(tgt)); this.state = 'evade'; this.evadeUntil = t + 2.2; if (Math.random() < 0.4) g.botCallout(b, 'grenade'); return; }
        }
      }
    }
    if (this.state === 'evade' && t < this.evadeUntil) return;
    const tm = this.target ? this.mem.get(this.target) : null;
    const seen = tm && tm.seen;
    const ws = b.weapon;
    // modo objetivo especial: plantar / desactivar en curso
    if (this.state === 'interact') { if (!seen && t - (this.interactStart || 0) < 9) return; this.state = 'objective'; }

    if (seen) {
      const tgt = this.target;
      const dist = tgt.pos.distanceTo(b.pos);
      this.lastTargetT = t;
      // recarga
      if (ws.mag === 0) {
        if (!ws.reloading) this.reload();
        if (Math.random() < D.coverChance && this.state !== 'cover') { this.seekCover(tgt.pos, false); return; }
      }
      // cambiar a pistola si está vacío y sin reserva
      if (ws.mag === 0 && ws.reserve === 0 && b.slot === 0) { b.slot = 1; b.model.setWeapon(b.weapon.id, b.loadout.camo); }
      // retirada
      if (D.retreatHp > 0 && b.health < D.retreatHp && this.state !== 'retreat' && this.state !== 'cover') {
        if (this.seekCover(tgt.pos, true)) { this.state = 'retreat'; if (Math.random() < 0.3 && b.tacticals > 0 && b.tacticalDef.id === 'smoke') this.throwNade('tactical', _a.copy(b.pos).lerp(tgt.pos, 0.35)); return; }
      }
      // superado en número
      if (this.visCount >= 2 && Math.random() < D.coverChance * 0.6 && this.state !== 'cover') { if (this.seekCover(tgt.pos, false)) return; }
      // presionar si el objetivo recarga (lee los movimientos del jugador)
      if (tgt.weapon && tgt.weapon.reloading && Math.random() < D.pushOnReload && dist < 30) {
        this.state = 'push'; this.setPath(tgt.pos.x, tgt.pos.z); return;
      }
      // si el jugador carga contra la IA élite, retroceder buscando ángulo
      if (D.squadTactics && tgt.isPlayer && dist < 9 && tgt.moveSpeed > 5 && Math.random() < 0.4) { if (this.seekCover(tgt.pos, true)) return; }
      // ruptura de punto muerto: si nadie acierta durante un rato, reposicionarse
      if (t - this.engageStart > 7 && t - (b.lastHitTime || -99) > 5 && t - b.lastDamageTime > 5 && this.state !== 'retreat') {
        this.engageStart = t;
        if (this.cover) { this.cover.owner = null; this.cover = null; this.coverPhase = null; }
        if (g.mode.objectiveMode && Math.random() < 0.7) { this.goToObjective(); return; }
        if (Math.random() < Math.max(0.25, D.flankChance) && this.flank(tgt.pos, 0)) return;
        this.state = 'engage'; this.engageMove = 'advance'; this.setPath(tgt.pos.x, tgt.pos.z); return;
      }
      if (this.state === 'cover' || this.state === 'retreat') return; // gestionado en movimiento
      this.state = 'engage';
      // movimiento en combate
      const optimal = Math.min(b.weapon.def.range[1] * 0.75, 45);
      if (dist > optimal && D.strafe > 0.3 && Math.random() < 0.6) { this.setPath(tgt.pos.x, tgt.pos.z); this.engageMove = 'advance'; }
      else if (Math.random() < D.strafe) { this.path = null; this.engageMove = 'strafe'; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = t + rand(0.5, 1.4); }
      else { this.path = null; this.engageMove = 'hold'; }
      this.wantCrouch = Math.random() < D.crouchChance && this.engageMove !== 'advance';
      // granada contra objetivos atrincherados cercanos
      if (dist > 8 && dist < 28 && t > this.nadeCD && Math.random() < D.grenadeChance * 0.25 && b.lethals > 0) this.throwNade('lethal', tgt.pos);
      return;
    }

    // sin contacto visual pero con información reciente
    const recent = this.bestMemory();
    this.wantCrouch = false;
    const objMode = !!g.mode.objectiveMode;
    const relevant = recent && (objMode ? (t - recent.t < 5 && recent.pos.distanceTo(b.pos) < 30) : t - recent.t < 10);
    if (relevant) {
      const dist = recent.pos.distanceTo(b.pos);
      if (this.state === 'flank' || this.state === 'search' || this.state === 'hold') {
        if (this.state === 'hold' && t > this.holdUntil) { this.state = 'search'; this.setPath(recent.pos.x, recent.pos.z); }
        else if (this.state === 'search' && !this.path && t > this.searchUntil) { this.goToObjective(); }
        return;
      }
      if (this.state === 'cover' && t - this.coverT < 3.5) return;
      // granada a la última posición conocida
      if (t - recent.t > 1.0 && dist > 7 && dist < 30 && t > this.nadeCD && Math.random() < D.grenadeChance) {
        const useFlash = b.tacticalDef.id === 'flash' && b.tacticals > 0 && dist < 16 && Math.random() < 0.5;
        if (useFlash) this.throwNade('tactical', recent.pos); else if (b.lethals > 0) this.throwNade('lethal', recent.pos);
      }
      const role = g.squads[b.team] ? g.squads[b.team].roleOf(b) : null;
      if ((role && role.startsWith('flank')) || Math.random() < D.flankChance) {
        if (this.flank(recent.pos, role === 'flankL' ? -1 : role === 'flankR' ? 1 : 0)) return;
      }
      if (D.preAim && Math.random() < 0.45 && dist < 40) {
        this.state = 'hold'; this.holdUntil = t + rand(1.5, 3.5); this.path = null; this.lookAt = recent.pos.clone().setY(recent.pos.y + 1.3);
        if (b.weapon.mag < b.weapon.def.mag * 0.5) this.reload();
        return;
      }
      this.state = 'search'; this.searchUntil = t + 6; this.setPath(recent.pos.x, recent.pos.z); this.lookAt = recent.pos.clone().setY(recent.pos.y + 1.3);
      return;
    }
    // sin información: objetivo del modo
    if (ws.mag < ws.def.mag * 0.6 && !ws.reloading) this.reload();
    if (this.state !== 'objective' || !this.path && t > this.objT) this.goToObjective();
  }
  bestMemory() {
    let best = null;
    for (const m of this.mem.values()) if (m.c.alive && (!best || m.t > best.t)) best = m;
    return best;
  }
  goToObjective() {
    const g = this.g, b = this.b;
    const sq = g.squads[b.team];
    const goal = sq ? sq.goalFor(b) : null;
    this.state = 'objective';
    if (!goal) { const i = g.nav.randomCell(); this.setPath(g.nav.cx(i), g.nav.cz(i)); this.goalKind = 'patrol'; this.objT = g.time + 20; return; }
    this.goal = goal; this.goalKind = goal.kind;
    let gx = goal.x, gz = goal.z;
    if (goal.kind !== 'plant' && goal.kind !== 'defuse' && goal.r > 1) {
      // posición dentro de la zona, preferiblemente con cobertura
      const cp = this.coverNear(goal.x, goal.z, goal.kind === 'capture' || goal.kind === 'defend' ? goal.r : goal.r + 2, goal.face);
      if (cp && Math.random() < 0.75) { gx = cp.x; gz = cp.z; } else { const i = g.nav.randomNear(goal.x, goal.z, goal.r * 0.8); if (i >= 0) { gx = g.nav.cx(i); gz = g.nav.cz(i); } }
    }
    this.setPath(gx, gz);
    this.objT = g.time + rand(6, 14);
    this.lookAt = goal.face ? new THREE.Vector3(goal.face.x, 1.5, goal.face.z) : null;
  }
  coverNear(x, z, r, face) {
    const cov = this.g.nav.cover; const t = this.g.time;
    let best = null, bs = -Infinity;
    for (let k = 0; k < 40; k++) {
      const cp = cov[Math.floor(Math.random() * cov.length)];
      const d = Math.hypot(cp.x - x, cp.z - z);
      if (d > r) continue;
      if (cp.owner && cp.owner !== this.b && cp.until > t) continue;
      let s = -d * 0.3;
      if (face) { const fx = face.x - cp.x, fz = face.z - cp.z; const L = Math.hypot(fx, fz) || 1; s += (cp.nx * fx + cp.nz * fz) / L * 3; }
      if (s > bs) { bs = s; best = cp; }
    }
    if (best) { best.owner = this.b; best.until = t + 15; }
    return best;
  }

  seekCover(threat, away) {
    const g = this.g, b = this.b, t = g.time, D = this.D;
    if (D.coverChance <= 0.01) return false;
    const cov = g.nav.cover;
    const cands = [];
    const maxD = away ? 20 : 13;
    for (const cp of cov) {
      const dx = cp.x - b.pos.x, dz = cp.z - b.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxD * maxD) continue;
      if (cp.owner && cp.owner !== b && cp.until > t) continue;
      const tx = threat.x - cp.x, tz = threat.z - cp.z; const td = Math.hypot(tx, tz) || 1;
      const facing = (cp.nx * tx + cp.nz * tz) / td;
      if (facing < 0.35) continue;
      if (td < 5) continue;
      const d = Math.sqrt(d2);
      let s = -d + facing * 4 + (away ? Math.min(td, 30) * 0.4 : 0) - Math.max(0, 8 - td) * 2;
      // no cruzar delante de la amenaza
      const toCover = dx * (threat.x - b.pos.x) + dz * (threat.z - b.pos.z);
      if (toCover > 0 && d > 4) s -= 4;
      cands.push([s, cp]);
    }
    cands.sort((p, q) => q[0] - p[0]);
    for (let i = 0; i < Math.min(6, cands.length); i++) {
      const cp = cands[i][1];
      const h = cp.low ? 1.0 : 1.5;
      if (g.world.los(threat.x, (threat.y || 0) + 1.5, threat.z, cp.x, cp.y + h, cp.z, 'sight')) continue;
      if (cp.owner && cp.owner !== b) continue;
      if (this.cover) this.cover.owner = null;
      cp.owner = b; cp.until = t + 14;
      this.cover = cp; this.coverPhase = 'go'; this.coverT = t; this.coverThreat = threat.clone ? threat.clone() : new THREE.Vector3(threat.x, threat.y || 0, threat.z);
      this.state = away ? 'retreat' : 'cover';
      this.setPath(cp.x, cp.z);
      // posición para asomarse
      this.peekPos = null;
      if (D.peek) {
        const px = -cp.nz, pz = cp.nx;
        for (const s of [1, -1]) {
          const qx = cp.x + px * 1.3 * s - cp.nx * 0.4, qz = cp.z + pz * 1.3 * s - cp.nz * 0.4;
          const qi = g.nav.idx(qx, qz);
          if (qi >= 0 && g.nav.walk[qi] && g.world.los(qx, cp.y + 1.55, qz, threat.x, (threat.y || 0) + 1.4, threat.z, 'sight')) { this.peekPos = new THREE.Vector3(qx, cp.y, qz); break; }
        }
      }
      return true;
    }
    return false;
  }

  flank(pos, side) {
    const g = this.g, b = this.b;
    const vx = b.pos.x - pos.x, vz = b.pos.z - pos.z; const L = Math.hypot(vx, vz) || 1;
    const ux = vx / L, uz = vz / L;
    const sides = side ? [side, -side] : (Math.random() < 0.5 ? [1, -1] : [-1, 1]);
    for (const s of sides) {
      const px = -uz * s, pz = ux * s;
      const gx = pos.x + px * 14 + ux * 3, gz = pos.z + pz * 14 + uz * 3;
      const i = g.nav.nearest(gx, gz, 6);
      if (i < 0) continue;
      const ax = b.pos.x, az = b.pos.z, bx = pos.x, bz = pos.z, nav = g.nav;
      const cost = (j) => { const d = pointSegDist2D(nav.cx(j), nav.cz(j), ax, az, bx, bz); return d < 8 ? (8 - d) * 0.9 : 0; };
      if (this.setPath(nav.cx(i), nav.cz(i), cost)) {
        this.state = 'flank'; this.flankTarget = pos.clone(); this.lookAt = null;
        return true;
      }
    }
    return false;
  }

  throwNade(kind, target) {
    const b = this.b, g = this.g;
    const count = kind === 'lethal' ? b.lethals : b.tacticals;
    if (count <= 0) return;
    b.eye(_c); _c.y += 0.1;
    const tgt = _d.copy(target); tgt.y = (target.y || 0) + 0.2;
    // error de lanzamiento según dificultad
    const err = this.D.id === 'elite' ? 1 : this.D.id === 'hard' ? 2 : 3.5;
    tgt.x += rand(-err, err); tgt.z += rand(-err, err);
    const vel = g.projectiles.solve(_c, tgt, _b);
    if (!vel) return;
    // comprobar que el arco no choca de inmediato con un techo/pared
    const sp = vel.length();
    if (!g.world.los(_c.x, _c.y, _c.z, _c.x + vel.x / sp * 3, _c.y + vel.y / sp * 3, _c.z + vel.z / sp * 3, 'solid')) return;
    const def = kind === 'lethal' ? b.lethalDef : b.tacticalDef;
    if (kind === 'lethal') b.lethals--; else b.tacticals--;
    g.projectiles.throw(b, def, _c, vel);
    Audio.play('throw', { pos: _c, vol: 0.5 });
    this.nadeCD = g.time + rand(8, 16);
    if (kind === 'lethal' && Math.random() < 0.5) g.botCallout(b, 'nade');
  }
  reload() {
    const b = this.b;
    const dur = b.weapon.startReload(this.g.time, b.perk === 'manos' ? 0.65 : 1);
    if (dur) { b.model.reloadT = 0; b.model.reloadDur = dur; Audio.play('mag_out', { pos: b.pos, vol: 0.35, ref: 2 }); }
  }

  setPath(x, z, cost = null) {
    const g = this.g, b = this.b;
    if (g.pathBudget <= 0) { this.pendingPath = { x, z, cost }; return true; }
    g.pathBudget--;
    this.pendingPath = null;
    const p = g.nav.findPath(b.pos.x, b.pos.z, x, z, cost);
    if (!p || !p.length) { this.path = null; return false; }
    this.path = p; this.pi = 0;
    return true;
  }

  // ------------------------------------------------------------ actualización
  update(dt) {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    if (this.pendingPath && g.pathBudget > 0) { const pp = this.pendingPath; this.setPath(pp.x, pp.z, pp.cost); }
    const stunned = t < this.stunUntil;
    const nearPlayer = g.player && b.pos.distanceToSquared(g.player.pos) < 60 * 60;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0 && !stunned) { const p = nearPlayer ? 0.12 : 0.25; this.perceive(p - this.perceiveT); this.perceiveT = p; }
    this.thinkT -= dt;
    if ((this.thinkT <= 0 || this.urgent) && !stunned) { this.urgent = false; this.think(); this.thinkT = D.think * rand(0.8, 1.25); }
    b.weapon.update(t, dt);
    if (b.weapon.mag === 0 && !b.weapon.reloading && b.weapon.reserve > 0) this.reload();
    // salud: regeneración lenta fuera de combate
    if (t - b.lastDamageTime > 5 && b.health < b.maxHealth) b.health = Math.min(b.maxHealth, b.health + 20 * dt);
    this.aim(dt, stunned);
    if (!stunned) this.shoot(dt);
    this.move(dt, stunned);
  }

  aim(dt, stunned) {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    let tx, ty, tz;
    const tm = this.target && this.mem.get(this.target);
    b.eye(_a);
    if (stunned) {
      b.yaw += Math.sin(t * 7 + b.id) * dt * 2; b.pitch = damp(b.pitch, -0.3, 3, dt);
      return;
    }
    if (this.target && tm && tm.seen) {
      const c = this.target;
      if (this.headshotBias && c.pos.distanceTo(b.pos) < 30) c.head(_b); else c.chest(_b);
      // compensar el movimiento del objetivo (élite lo hace casi perfecto)
      _b.addScaledVector(c.vel, 0.18 * D.lead);
      tx = _b.x; ty = _b.y; tz = _b.z;
      // error por seguimiento lateral
      const lat = Math.abs(c.vel.x * Math.cos(b.yaw) - c.vel.z * Math.sin(b.yaw));
      const dist = Math.max(3, c.pos.distanceTo(b.pos));
      const track = (lat / dist) * (1 - D.lead * 0.7) * dt * 0.8;
      this.errY += (Math.random() < 0.5 ? -1 : 1) * track;
    } else if (this.lookAt) {
      tx = this.lookAt.x; ty = this.lookAt.y > 0.5 ? this.lookAt.y : this.lookAt.y + 1.4; tz = this.lookAt.z;
      if (_a.distanceToSquared(this.lookAt) < 4) this.lookAt = null;
    } else if (this.moveDirLen > 0.2) {
      // mirar hacia donde camina, con barridos ocasionales
      this.scanT -= dt;
      if (this.scanT <= 0) { this.scanT = rand(1.2, 3); this.scanYaw = Math.random() < 0.5 ? rand(-0.7, 0.7) : 0; }
      const yaw = yawFromDir(this.moveDir.x, this.moveDir.z) + this.scanYaw;
      tx = _a.x - Math.sin(yaw) * 10; ty = _a.y - 0.2; tz = _a.z - Math.cos(yaw) * 10;
    } else {
      this.scanT -= dt;
      if (this.scanT <= 0) { this.scanT = rand(1.5, 3.5); this.scanYaw = b.yaw + rand(-1.2, 1.2); }
      tx = _a.x - Math.sin(this.scanYaw) * 10; ty = _a.y; tz = _a.z - Math.cos(this.scanYaw) * 10;
    }
    const dx = tx - _a.x, dy = ty - _a.y, dz = tz - _a.z;
    const wantYaw = yawFromDir(dx, dz) + this.errY;
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.errP;
    const maxTurn = D.turnSpeed * DEG * dt * (this.target ? 1 : 0.6);
    const dyaw = wrapAngle(wantYaw - b.yaw);
    b.yaw = wrapAngle(b.yaw + clamp(dyaw, -maxTurn, maxTurn));
    b.pitch += clamp(wantPitch - b.pitch, -maxTurn, maxTurn);
    // el error converge con el tiempo de apuntado
    const k = Math.exp(-dt / Math.max(0.05, D.aimSettle));
    this.errY *= k; this.errP *= k;
    const minErr = (D.aimErr * 0.08) * DEG;
    if (Math.abs(this.errY) < minErr) this.errY = (Math.random() - 0.5) * 2 * minErr;
  }

  shoot(dt) {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    const c = this.target; if (!c || !c.alive) return;
    const tm = this.mem.get(c); if (!tm || !tm.seen) return;
    if (t < this.reactUntil || t < this.pauseUntil || b.sprint) return;
    const ws = b.weapon; if (!ws.canFire(t)) return;
    b.eye(_a); c.chest(_b);
    const dist = _a.distanceTo(_b);
    const wantYaw = yawFromDir(_b.x - _a.x, _b.z - _a.z);
    const diff = Math.abs(wrapAngle(wantYaw - b.yaw));
    const tol = Math.atan(0.9 / dist) + (ws.def.scope ? 0.3 : 1.5) * DEG;
    if (diff > tol + Math.abs(this.errY)) return;
    if (dist > ws.def.range[1] * 1.6 && ws.def.pellets > 1) return; // escopeta fuera de alcance
    if (ws.def.scope && t - this.lastFire < 1.2) return;
    if (this.burstLeft <= 0) this.burstLeft = randInt(D.burst[0], D.burst[1]) * (ws.def.auto ? 1 : 0.5) + 1;
    const moving = this.speedNow > 1.2;
    let spread = (dist < 8 ? ws.def.spreadHip * 0.7 : ws.def.spreadAds + 0.3 + (moving ? ws.def.moveSpread * 0.35 : 0)) * D.spreadMul;
    if (b.crouch) spread *= 0.8;
    spread *= 1 + ws.bloom * 0.8;
    const dir = b.forward(_c);
    // boca del arma
    const mz = _d.set(b.pos.x, b.pos.y + (b.crouch ? 1.0 : 1.45), b.pos.z).addScaledVector(dir, 0.75);
    mz.x += Math.cos(b.yaw) * 0.12; mz.z -= Math.sin(b.yaw) * 0.12;
    ws.fire(t);
    g.combat.shoot(b, ws, _a, dir, spread, mz);
    g.fx.muzzle(mz, dir, 1);
    if (g.fx.lights.length && mz.distanceToSquared(g.camera.position) < 900 && Math.random() < 0.5) g.fx.flashLight(mz, 0xffb060, 4, 0.05, 6);
    b.model.recoil = 1;
    this.lastFire = t;
    this.burstLeft--;
    if (this.burstLeft <= 0) this.pauseUntil = t + rand(D.burstPause[0], D.burstPause[1]);
    // retroceso para la IA
    this.errP += ws.def.recoil.v * DEG * 0.3 * (1.2 - D.lead * 0.5);
  }

  move(dt, stunned) {
    const b = this.b, g = this.g, D = this.D, t = g.time;
    let dx = 0, dz = 0, speed = 0;
    const tm = this.target && this.mem.get(this.target);
    const seen = tm && tm.seen;
    b.sprint = false;
    if (stunned) { dx = Math.sin(t * 3 + b.id); dz = Math.cos(t * 2.3 + b.id); speed = 1; }
    else if (this.state === 'interact') { speed = 0; b.crouch = true; }
    else if ((this.state === 'cover' || this.state === 'retreat') && this.cover) {
      const cp = this.cover;
      if (this.coverPhase === 'go') {
        const r = this.followPath();
        if (r) { dx = r.x; dz = r.z; speed = this.state === 'retreat' ? 5.4 : 4.8; }
        if (!r || Math.hypot(cp.x - b.pos.x, cp.z - b.pos.z) < 0.7) { this.coverPhase = 'in'; this.coverT = t; this.path = null; }
        b.crouch = false;
      } else if (this.coverPhase === 'in') {
        b.crouch = cp.low;
        if (!b.weapon.reloading && b.weapon.mag < b.weapon.def.mag * 0.5) this.reload();
        const ready = !b.weapon.reloading && b.health > (D.retreatHp || 0) * 0.9;
        if (ready && t - this.coverT > (this.state === 'retreat' ? 3.5 : 1.0)) {
          if (cp.low) { this.coverPhase = 'peek'; this.peekT = t + rand(1.2, 2.6); }
          else if (this.peekPos) { this.coverPhase = 'peek'; this.peekT = t + rand(1.2, 2.6); }
          else if (t - this.coverT > 4) { this.leaveCover(); }
        }
        if (this.coverThreat) this.lookAt = this.coverThreat.clone().setY((this.coverThreat.y || 0) + 1.4);
      } else if (this.coverPhase === 'peek') {
        if (cp.low) b.crouch = false;
        else if (this.peekPos) { const px = this.peekPos.x - b.pos.x, pz = this.peekPos.z - b.pos.z; const L = Math.hypot(px, pz); if (L > 0.2) { dx = px / L; dz = pz / L; speed = 3; } }
        if (this.coverThreat && !seen) this.lookAt = this.coverThreat.clone().setY((this.coverThreat.y || 0) + 1.4);
        if (t > this.peekT) {
          if ((b.health < 60 || b.weapon.mag < 4) && Math.random() < D.coverChance) { this.coverPhase = 'back'; }
          else if (!seen && t - this.lastTargetT > 3) this.leaveCover();
          else this.peekT = t + rand(1, 2);
        }
      } else if (this.coverPhase === 'back') {
        const px = cp.x - b.pos.x, pz = cp.z - b.pos.z; const L = Math.hypot(px, pz);
        if (L > 0.3) { dx = px / L; dz = pz / L; speed = 3.2; } else { this.coverPhase = 'in'; this.coverT = t; }
      }
    } else if (this.state === 'engage' && seen) {
      const c = this.target;
      if (this.engageMove === 'advance') {
        const r = this.followPath(); if (r) { dx = r.x; dz = r.z; speed = 3.0; }
        if (!r || c.pos.distanceTo(b.pos) < 12) this.engageMove = 'hold';
      } else if (this.engageMove === 'strafe') {
        if (t > this.strafeUntil) { this.strafe = Math.random() < D.strafe ? (Math.random() < 0.5 ? -1 : 1) : 0; this.strafeUntil = t + rand(0.5, 1.4); }
        if (this.strafe) {
          const ux = c.pos.x - b.pos.x, uz = c.pos.z - b.pos.z; const L = Math.hypot(ux, uz) || 1;
          dx = -uz / L * this.strafe; dz = ux / L * this.strafe; speed = D.id === 'elite' ? 3.6 : 2.8;
          // las IA difíciles mantienen distancia óptima
          if (D.strafe > 0.7) { const dist = L; const want = Math.min(b.weapon.def.range[0] * 1.2, 22); const k = clamp((dist - want) / 10, -0.6, 0.6); dx += ux / L * k; dz += uz / L * k; }
        }
      }
      b.crouch = this.wantCrouch && speed < 0.1;
    } else if (this.state === 'push' && this.target) {
      const r = this.followPath(); if (r) { dx = r.x; dz = r.z; speed = 5.0; }
      if (!r || !this.target.weapon.reloading) this.state = 'engage';
      b.crouch = false;
    } else if (this.state === 'hold') {
      b.crouch = D.crouchChance > 0.3;
    } else {
      // objetivo / búsqueda / flanqueo / evasión
      const r = this.followPath();
      b.crouch = false;
      if (r) {
        dx = r.x; dz = r.z;
        const calm = !this.target && (!this.suspicion || t - this.suspicion.t > 6);
        speed = this.state === 'evade' ? 5.6 : this.state === 'flank' ? 5.2 : calm ? 5.4 : 4.2;
        if (calm && this.path && this.path.length - this.pi > 2 && this.state === 'objective') { b.sprint = true; speed = 6.0; }
      } else {
        // llegada
        if (this.state === 'flank') { this.state = 'search'; this.searchUntil = t + 4; if (this.flankTarget) this.setPath(this.flankTarget.x, this.flankTarget.z); }
        else if (this.state === 'objective') this.atObjective(dt);
        else if (this.state === 'evade') { this.state = 'objective'; }
      }
    }
    // separación
    for (const o of g.combatants) {
      if (o === b || !o.alive) continue;
      const ox = b.pos.x - o.pos.x, oz = b.pos.z - o.pos.z; const d2 = ox * ox + oz * oz;
      if (d2 < 1.0 && d2 > 1e-4) { const d = Math.sqrt(d2); dx += ox / d * (1 - d) * 1.5; dz += oz / d * (1 - d) * 1.5; if (speed < 1) speed = 1.5; }
    }
    const L = Math.hypot(dx, dz);
    if (L > 1e-3) { dx /= L; dz /= L; }
    this.moveDir = this.moveDir || new THREE.Vector3();
    this.moveDir.set(dx, 0, dz); this.moveDirLen = L > 1e-3 && speed > 0 ? 1 : 0;
    if (b.crouch) speed = Math.min(speed, 2.0);
    speed *= b.weapon.def.move;
    b.vel.x = damp(b.vel.x, dx * speed, 10, dt); b.vel.z = damp(b.vel.z, dz * speed, 10, dt);
    b.vy -= 16 * dt; if (b.grounded && b.vy < -1) b.vy = -1;
    b.height = b.crouch ? b.crouchH : b.standH;
    const res = g.world.move(b.pos, b.vel.x * dt, b.vy * dt, b.vel.z * dt, b.radius, b.height, 0.46, b.grounded, _mres);
    b.grounded = res.ground; if (res.ground) b.vy = Math.max(b.vy, -1);
    b.speedNow = Math.hypot(b.vel.x, b.vel.z);
    b.moveSpeed = b.speedNow;
    if (res.hitWall && this.engageMove === 'strafe') this.strafe = -this.strafe;
    // atasco
    this.stuckT += dt;
    if (this.stuckT > 1.0) {
      const moved = this.lastPos.distanceTo(b.pos);
      if (speed > 1 && moved < 0.35) {
        this.stuckN++;
        if (this.path && this.pi < this.path.length) { const wp = this.path[Math.min(this.pi, this.path.length - 1)]; this.setPath(wp.x + rand(-1, 1), wp.z + rand(-1, 1)); }
        if (this.stuckN > 2) { this.stuckN = 0; this.path = null; if (this.state === 'engage') this.engageMove = 'hold'; else this.state = 'objective'; const i = g.nav.randomNear(b.pos.x, b.pos.z, 6); if (i >= 0) this.setPath(g.nav.cx(i), g.nav.cz(i)); }
      } else this.stuckN = 0;
      this.stuckT = 0; this.lastPos.copy(b.pos);
    }
    // pasos audibles
    if (b.grounded && b.speedNow > 2) {
      b.stepAcc += b.speedNow * dt;
      if (b.stepAcc > 2.2) {
        b.stepAcc = 0;
        if (!b.crouch && g.player && b.pos.distanceToSquared(g.player.pos) < 30 * 30) {
          Audio.play('step' + Math.floor(Math.random() * 4), { pos: b.pos, vol: b.perk === 'fantasma' ? 0.12 : 0.35, ref: 2, rolloff: 1.4, maxDist: 30 });
        }
        if (!b.crouch) g.noise(b.pos, b.speedNow > 5 ? 14 : 8, b, 'step');
      }
    }
  }
  leaveCover() {
    if (this.cover) { this.cover.owner = null; this.cover = null; }
    this.coverPhase = null; this.state = 'objective'; this.urgent = true;
  }
  followPath() {
    const b = this.b; const p = this.path;
    if (!p || this.pi >= p.length) { this.path = null; return null; }
    let wp = p[this.pi];
    let dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
    let d = Math.hypot(dx, dz);
    while (d < 0.6) {
      this.pi++;
      if (this.pi >= p.length) { this.path = null; return null; }
      wp = p[this.pi]; dx = wp.x - b.pos.x; dz = wp.z - b.pos.z; d = Math.hypot(dx, dz);
    }
    return _b.set(dx / d, 0, dz / d);
  }
  atObjective(dt) {
    const g = this.g, b = this.b, t = g.time;
    const goal = this.goal;
    if (!goal) { this.goToObjective(); return; }
    if (goal.kind === 'plant' || goal.kind === 'defuse') {
      const d = Math.hypot(goal.x - b.pos.x, goal.z - b.pos.z);
      if (d < (goal.r || 2.5)) { if (g.mode.botInteract && g.mode.botInteract(b, goal.kind)) { this.state = 'interact'; this.interactStart = t; return; } this.objT = Math.min(this.objT, t + 1.5); }
      else { this.setPath(goal.x, goal.z); return; }
    }
    // mantener posición un rato, mirando hacia la amenaza probable
    b.crouch = goal.kind === 'defend' && Math.random() < 0.02 ? !b.crouch : b.crouch;
    if (goal.face) this.lookAt = new THREE.Vector3(goal.face.x, 1.5, goal.face.z);
    if (t > this.objT) this.goToObjective();
  }
}
