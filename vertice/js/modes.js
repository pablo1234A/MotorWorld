// Modos de juego: Duelo por equipos, Dominio, Sabotaje (rondas) y Todos contra todos.
import * as THREE from './lib/three.module.min.js';
import { Audio } from './audio.js';
import { MODES, SCORE, TEAMS } from './data.js';
import { rand, fmtTime } from './util.js';

const _v = new THREE.Vector3();

class Mode {
  constructor(game, cfg) {
    this.g = game; this.cfg = cfg;
    this.timeLeft = cfg.duration * 60;
    this.result = null;
    this.markers = [];
  }
  init() {}
  update(dt) {
    if (this.result) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.onTimeUp(); }
  }
  onTimeUp() {}
  onKill() {}
  respawnDelay() { return 4; }
  canRespawn() { return true; }
  interactionFor() { return null; }
  botInteract() { return false; }
  dispose() { for (const o of this.objects || []) this.g.scene.remove(o); }
  enemyBaseDir(team) { return team === 0 ? { x: 0, z: -50 } : { x: 0, z: 50 }; }

  // Selección de aparición segura
  pickSpawn(c, cands) {
    const g = this.g;
    let best = null, bs = -Infinity;
    const enemies = g.combatants.filter((o) => o.alive && o !== c && g.isEnemy(o, c));
    const allies = g.combatants.filter((o) => o.alive && o !== c && !g.isEnemy(o, c));
    const list = cands.length > 14 ? cands.slice().sort(() => Math.random() - 0.5).slice(0, 14) : cands.slice().sort(() => Math.random() - 0.5);
    for (const p of list) {
      let minE = 60, vis = false, crowd = false;
      for (const o of g.combatants) if (o !== c && o.alive && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 2.6) { crowd = true; break; }
      for (const e of enemies) {
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        if (d < minE) minE = d;
        if (d < 45 && !vis) { e.eye(_v); if (g.world.los(_v.x, _v.y, _v.z, p.x, (p.y || 0) + 1.5, p.z, 'sight')) vis = true; }
      }
      let s = Math.min(minE, 45) - (vis ? 60 : 0) - (crowd ? 80 : 0) + rand(0, 6);
      for (const a of allies) { const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z); if (d < 18) { s += 6; break; } }
      if (s > bs) { bs = s; best = p; }
    }
    best = best || cands[0];
    return { x: best.x + rand(-0.6, 0.6), y: best.y || 0, z: best.z + rand(-0.6, 0.6), yaw: best.yaw !== undefined ? best.yaw : 0 };
  }
  faceYaw(p, team) {
    const e = this.enemyBaseDir(team);
    return Math.atan2(-(e.x - p.x), -(e.z - p.z));
  }
  // patrulla/caza genérica
  huntGoal(bot, squad) {
    const g = this.g;
    // equipos de fuego de 2-3 soldados que avanzan juntos hacia un mismo objetivo
    if (squad && this.def.teams && squad.members.length > 1) {
      const alive = squad.members.filter((m) => m.alive);
      const idx = Math.max(0, alive.indexOf(bot));
      const teams = Math.max(1, Math.round(alive.length / 2.5));
      const key = 'ft' + (idx % teams);
      let ft = squad.memo[key];
      if (!ft || g.time > ft.until || (ft.enemy && !ft.enemy.alive)) {
        const fresh = squad.freshEnemies(20);
        if (fresh.length && Math.random() < 0.85) { const f = fresh[Math.floor(Math.random() * fresh.length)]; ft = { x: f.pos.x, z: f.pos.z, kind: 'hunt', enemy: f.e, face: { x: f.pos.x, z: f.pos.z } }; }
        else { const p = this.patrolPoint(bot); ft = { x: p.x, z: p.z, kind: 'patrol', face: this.enemyBaseDir(bot.team) }; }
        ft.until = g.time + rand(12, 20);
        squad.memo[key] = ft;
      }
      return { x: ft.x + rand(-5, 5), z: ft.z + rand(-5, 5), r: 6, kind: ft.kind, face: ft.face };
    }
    const fresh = squad ? squad.freshEnemies(20) : [];
    if (fresh.length && Math.random() < 0.85) {
      const f = fresh[Math.floor(Math.random() * fresh.length)];
      return { x: f.pos.x + rand(-6, 6), z: f.pos.z + rand(-6, 6), r: 6, kind: 'hunt', face: f.pos };
    }
    const p = this.patrolPoint(bot);
    return { x: p.x, z: p.z, r: 5, kind: 'patrol', face: this.def.teams ? this.enemyBaseDir(bot.team) : null };
  }
  patrolPoint(bot) {
    const g = this.g;
    const hs = g.map.spawns.ffa;
    // preferir el centro y la mitad enemiga
    let p = hs[Math.floor(Math.random() * hs.length)];
    if (this.def.teams) {
      for (let k = 0; k < 3; k++) { const q = hs[Math.floor(Math.random() * hs.length)]; const e = this.enemyBaseDir(bot.team); if (Math.hypot(q.x - e.x, q.z - e.z) < Math.hypot(p.x - e.x, p.z - e.z)) p = q; }
    }
    return p;
  }
}

// ------------------------------------------------------------------ DUELO POR EQUIPOS
export class TDM extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.def = MODES.tdm;
    this.scores = [0, 0];
    this.limit = cfg.teamSize * 8;
    this.firstSpawn = true;
  }
  onKill(victim, killer) {
    if (killer && killer !== victim && killer.team !== victim.team) {
      this.scores[killer.team]++;
      if (this.scores[killer.team] >= this.limit) this.result = { winner: killer.team, reason: 'Límite de bajas alcanzado' };
    }
  }
  onTimeUp() {
    const [a, b] = this.scores;
    this.result = a === b ? { draw: true, reason: 'Tiempo agotado' } : { winner: a > b ? 0 : 1, reason: 'Tiempo agotado' };
  }
  respawnDelay() { return 3.5; }
  spawnPoint(c) {
    const S = this.g.map.spawns;
    if (!c._spawned) { c._spawned = true; return this.pickSpawn(c, S[c.team]); }
    const own = S[c.team];
    const sideOk = S.ffa.filter((p) => (c.team === 0 ? p.z > -8 : p.z < 8));
    const p = this.pickSpawn(c, own.concat(sideOk));
    p.yaw = this.faceYaw(p, c.team);
    return p;
  }
  goalFor(bot, squad) { return this.huntGoal(bot, squad); }
  hudInfo(team) {
    return {
      a: { v: this.scores[team], max: this.limit }, b: { v: this.scores[1 - team], max: this.limit },
      timer: fmtTime(this.timeLeft), text: `ELIMINA AL ENEMIGO · ${this.limit} BAJAS PARA GANAR`,
    };
  }
  teamScore(t) { return this.scores[t]; }
}

// ------------------------------------------------------------------ DOMINIO
export class DOM extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.def = MODES.dom; this.objectiveMode = true;
    this.scores = [0, 0];
    this.limit = 200;
    this.tick = 0;
    this.flags = game.map.dom.map((f) => ({ ...f, owner: -1, prog: 0, capTeam: -1, contested: false, ring: null, pole: null, cloth: null }));
    this.objects = [];
  }
  init() {
    const g = this.g;
    for (const f of this.flags) {
      const y = g.nav.floorAt(f.x, f.z) + 0.05;
      const ring = new THREE.Mesh(new THREE.RingGeometry(f.r - 0.25, f.r, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(f.x, y, f.z); ring.renderOrder = 3;
      const fill = new THREE.Mesh(new THREE.CircleGeometry(f.r - 0.25, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.set(f.x, y - 0.01, f.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x9a9da0, metalness: 0.9, roughness: 0.3 }));
      pole.position.set(f.x, y + 2.1, f.z); pole.castShadow = true;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 6, 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide, roughness: 0.9 }));
      cloth.position.set(f.x + 0.66, y + 3.75, f.z);
      f.ring = ring; f.fill = fill; f.pole = pole; f.cloth = cloth; f.baseY = y;
      g.scene.add(ring, fill, pole, cloth);
      this.objects.push(ring, fill, pole, cloth);
    }
  }
  colorFor(owner) { return owner < 0 ? 0xdddddd : owner === this.g.player.team ? TEAMS[0].hex : TEAMS[1].hex; }
  update(dt) {
    super.update(dt);
    if (this.result) return;
    const g = this.g;
    for (const f of this.flags) {
      const n = [0, 0]; const inside = [[], []];
      for (const c of g.combatants) {
        if (!c.alive) continue;
        if (Math.hypot(c.pos.x - f.x, c.pos.z - f.z) < f.r && Math.abs(c.pos.y - (f.baseY || 0)) < 3) { n[c.team]++; inside[c.team].push(c); }
      }
      f.contested = n[0] > 0 && n[1] > 0;
      f.inside = inside;
      if (!f.contested && (n[0] || n[1])) {
        const T = n[0] ? 0 : 1; const cnt = n[T];
        const rate = (1 / 7) * Math.min(1.8, 1 + (cnt - 1) * 0.4);
        if (f.owner === T) { f.prog = Math.min(1, f.prog + rate * dt); }
        else {
          if (f.capTeam !== T) { f.prog -= rate * dt * 1.5; if (f.prog <= 0) { f.prog = 0; f.capTeam = T; if (f.owner !== -1) { f.owner = -1; this.flagChanged(f, -1); } } }
          else { f.prog += rate * dt; if (f.prog >= 1) { f.prog = 1; f.owner = T; this.captured(f, T, inside[T]); } }
        }
      } else if (!n[0] && !n[1] && f.owner === -1 && f.prog > 0) { f.prog = Math.max(0, f.prog - dt * 0.05); }
      // bandera ondeando
      f.cloth.rotation.y = Math.sin(g.time * 2 + f.x) * 0.25;
      f.cloth.position.y = (f.baseY || 0) + 0.8 + 2.95 * (f.owner >= 0 ? 1 : 0.4 + f.prog * 0.6);
    }
    this.tick += dt;
    if (this.tick >= 2.5) {
      this.tick = 0;
      for (const f of this.flags) if (f.owner >= 0) this.scores[f.owner]++;
      for (const T of [0, 1]) if (this.scores[T] >= this.limit) { this.scores[T] = this.limit; this.result = { winner: T, reason: 'Límite de puntuación alcanzado' }; }
    }
  }
  flagChanged(f, owner) {
    const col = this.colorFor(owner);
    f.ring.material.color.setHex(col); f.fill.material.color.setHex(col); f.cloth.material.color.setHex(col);
  }
  captured(f, T, who) {
    const g = this.g;
    this.flagChanged(f, T);
    for (const c of who) {
      c.stats.captures++; c.stats.score += SCORE.capture;
      if (c.isPlayer) { g.hud.popup(`+${SCORE.capture}`, `ZONA ${f.id} CAPTURADA`); }
    }
    const mine = T === g.player.team;
    g.hud.notice(mine ? `ZONA ${f.id} ASEGURADA` : `HEMOS PERDIDO ${f.id}`, mine ? 'ally' : 'enemy');
    Audio.ui2d(mine ? 'ui_confirm' : 'ui_alert', 0.8);
  }
  onKill(victim, killer) {
    if (!killer || killer === victim || killer.team === victim.team) return;
    for (const f of this.flags) {
      if (f.owner !== killer.team) continue;
      const dk = Math.hypot(killer.pos.x - f.x, killer.pos.z - f.z), dv = Math.hypot(victim.pos.x - f.x, victim.pos.z - f.z);
      if (dk < f.r + 4 || dv < f.r + 4) {
        killer.stats.defends++; killer.stats.score += SCORE.defend;
        if (killer.isPlayer) this.g.hud.popup(`+${SCORE.defend}`, 'DEFENSA');
        break;
      }
    }
  }
  onTimeUp() {
    const [a, b] = this.scores;
    this.result = a === b ? { draw: true, reason: 'Tiempo agotado' } : { winner: a > b ? 0 : 1, reason: 'Tiempo agotado' };
  }
  respawnDelay() { return 4; }
  spawnPoint(c) {
    const S = this.g.map.spawns;
    if (!c._spawned) { c._spawned = true; return this.pickSpawn(c, S[c.team]); }
    // cerca de zonas propias o de la base
    const cands = S[c.team].slice();
    for (const f of this.flags) if (f.owner === c.team && !f.contested) for (const p of S.ffa) if (Math.hypot(p.x - f.x, p.z - f.z) < 22) cands.push(p);
    const p = this.pickSpawn(c, cands); p.yaw = this.faceYaw(p, c.team); return p;
  }
  goalFor(bot, squad) {
    const g = this.g, T = bot.team;
    // reparto: los bots se distribuyen por zonas no controladas; uno defiende cada zona propia
    const alive = squad.members.filter((m) => m.alive);
    const idx = alive.indexOf(bot);
    const notOwned = this.flags.filter((f) => f.owner !== T);
    const owned = this.flags.filter((f) => f.owner === T);
    const byDist = (list) => list.slice().sort((a, b) => Math.hypot(a.x - bot.pos.x, a.z - bot.pos.z) - Math.hypot(b.x - bot.pos.x, b.z - bot.pos.z));
    let f;
    const prev = bot.brain && bot.brain.goal && bot.brain.goal.flag;
    if (prev && ((bot.brain.goal.kind === 'capture' && prev.owner !== T) || (bot.brain.goal.kind === 'defend' && prev.owner === T && Math.random() < 0.6))) f = prev;
    else if (owned.length && idx >= 0 && idx < owned.length && (notOwned.length === 0 || idx % 3 === 0)) f = owned[idx % owned.length];
    else if (notOwned.length) {
      // élite/difícil: atacar en grupo la zona más cercana; normal/fácil: reparto más aleatorio
      const coordinated = g.diff.flankChance >= 0.4;
      const sorted = byDist(notOwned);
      f = coordinated ? sorted[Math.min(sorted.length - 1, idx % 4 === 3 ? 1 : 0)] : sorted[Math.floor(Math.random() * sorted.length)];
    } else f = this.flags[Math.floor(Math.random() * this.flags.length)];
    const e = this.enemyBaseDir(T);
    return { x: f.x, z: f.z, r: f.r * 0.7, kind: f.owner === T ? 'defend' : 'capture', face: { x: e.x, z: e.z }, flag: f };
  }
  hudInfo(team) {
    const fl = this.flags.find((f) => f.inside && f.inside[team] && f.inside[team].includes(this.g.player));
    let text = 'CAPTURA Y MANTÉN LAS ZONAS A, B Y C';
    if (fl) text = fl.contested ? `ZONA ${fl.id} EN DISPUTA` : fl.owner === team ? `DEFENDIENDO ${fl.id}` : `CAPTURANDO ${fl.id}`;
    return {
      a: { v: this.scores[team], max: this.limit }, b: { v: this.scores[1 - team], max: this.limit }, timer: fmtTime(this.timeLeft), text,
      flags: this.flags.map((f) => ({ id: f.id, owner: f.owner < 0 ? 'n' : f.owner === team ? 'a' : 'e', prog: f.prog, cap: f.capTeam < 0 ? 'n' : f.capTeam === team ? 'a' : 'e', contested: f.contested, here: f === fl })),
    };
  }
  worldMarkers(team) { return this.flags.map((f) => ({ x: f.x, y: (f.baseY || 0) + 4.6, z: f.z, label: f.id, cls: f.owner < 0 ? 'n' : f.owner === team ? 'a' : 'e' })); }
  teamScore(t) { return this.scores[t]; }
}

// ------------------------------------------------------------------ SABOTAJE
export class SAB extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.def = MODES.sab; this.objectiveMode = true;
    this.rounds = [0, 0];
    this.winRounds = 4; this.round = 0;
    this.attack = 0; // equipo atacante
    this.phase = 'pre'; this.phaseT = 0; this.roundTime = 100;
    this.bomb = null; this.objects = [];
    this.timeLeft = this.roundTime;
    this.plantDur = 3.5; this.defuseDur = 6; this.fuse = 35;
  }
  init() {
    const g = this.g;
    for (const s of g.map.sites) {
      const y = g.nav.floorAt(s.x, s.z) + 0.04;
      const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.2, s.r, 40), new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, y, s.z);
      // caja de objetivo (equipo de comunicaciones)
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.4 }));
      box.position.set(s.x + s.r - 0.9, y + 0.45, s.z); box.castShadow = true;
      g.world.addBox(s.x + s.r - 1.5, 0, s.z - 0.4, s.x + s.r - 0.3, 0.9, s.z + 0.4, { mat: 'metal' });
      g.scene.add(ring, box); this.objects.push(ring, box);
    }
    this.startRound();
  }
  startRound() {
    const g = this.g;
    this.round++;
    if (this.round === 4) { this.attack = 1 - this.attack; g.hud.notice('CAMBIO DE BANDO', 'ally'); }
    this.phase = 'pre'; this.phaseT = 3; this.timeLeft = this.roundTime;
    if (this.bomb) { g.scene.remove(this.bomb.mesh); if (this.bomb.beep) this.bomb.beep = null; this.bomb = null; }
    for (const s of g.squads) if (s) { s.memo = { site: Math.random() < 0.5 ? 0 : 1 }; s.known.clear(); }
    for (const c of g.combatants) { c._spawned = false; g.respawn(c); c._sabFrozen = true; }
    g.projectiles.list.slice().forEach((n, i) => g.projectiles.remove(g.projectiles.list.indexOf(n)));
    const myAtk = this.attack === g.player.team;
    g.hud.notice(`RONDA ${this.round}`, 'ally', myAtk ? 'ATACAS · PLANTA LA CARGA EN A O B' : 'DEFIENDES · PROTEGE A Y B');
    Audio.ui2d('sting_start', 0.5);
  }
  teamOf(c) { return c.team; }
  spawnPoint(c) {
    // atacantes al sur, defensores al norte
    const S = this.g.map.spawns;
    const side = c.team === this.attack ? 0 : 1;
    const p = this.pickSpawn(c, S[side]);
    p.yaw = side === 0 ? 0 : Math.PI;
    return p;
  }
  enemyBaseDir(team) { return team === this.attack ? { x: 0, z: -50 } : { x: 0, z: 50 }; }
  canRespawn() { return false; }
  respawnDelay() { return 999; }
  aliveCount(team) { return this.g.combatants.filter((c) => c.alive && c.team === team).length; }
  update(dt) {
    const g = this.g;
    if (this.result) return;
    if (this.phase === 'pre') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'live'; for (const c of g.combatants) c._sabFrozen = false; }
      return;
    }
    if (this.phase === 'post') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.rounds[0] >= this.winRounds || this.rounds[1] >= this.winRounds) this.result = { winner: this.rounds[0] > this.rounds[1] ? 0 : 1, reason: `${this.rounds[0]} - ${this.rounds[1]} en rondas` };
        else this.startRound();
      }
      return;
    }
    if (this.phase === 'live') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endRound(1 - this.attack, 'Tiempo agotado'); return; }
      if (this.aliveCount(this.attack) === 0) { this.endRound(1 - this.attack, 'Atacantes eliminados'); return; }
      if (this.aliveCount(1 - this.attack) === 0) { this.endRound(this.attack, 'Defensores eliminados'); return; }
    }
    if (this.phase === 'planted') {
      const b = this.bomb;
      b.t -= dt; this.timeLeft = b.t;
      b.beepT -= dt;
      const rate = b.t > 15 ? 1 : b.t > 6 ? 0.5 : 0.2;
      if (b.beepT <= 0) { b.beepT = rate; Audio.play('ui_beep', { pos: b.pos, vol: 0.7, ref: 4 }); b.light.material.emissiveIntensity = 4; }
      else b.light.material.emissiveIntensity = Math.max(0.3, b.light.material.emissiveIntensity - dt * 12);
      if (b.t <= 0) {
        g.combat.explode(b.pos.clone().setY(b.pos.y + 0.3), 14, 400, b.planter, 'carga', 2.2);
        this.endRound(this.attack, 'Carga detonada');
        return;
      }
      if (this.aliveCount(1 - this.attack) === 0) { this.endRound(this.attack, 'Defensores eliminados'); return; }
      // desactivación por bots
      if (b.defuser) {
        const d = b.defuser;
        if (!d.alive || d.brain && d.brain.state !== 'interact' || d.pos.distanceTo(b.pos) > 2.2) { b.defuser = null; b.defuseT = 0; }
        else { b.defuseT += dt; if (b.defuseT >= this.defuseDur) this.defused(d); }
      }
    }
    if (this.planting) {
      const p = this.planting;
      if (!p.c.alive || p.c.brain.state !== 'interact' || this.phase !== 'live') { this.planting = null; }
      else { p.t += dt; if (p.t >= this.plantDur) { this.plant(p.c, p.site); this.planting = null; } }
    }
  }
  endRound(winner, reason) {
    const g = this.g;
    if (this.phase === 'post') return;
    this.phase = 'post'; this.phaseT = 4.5;
    this.rounds[winner]++;
    for (const c of g.combatants) if (c.team === winner) c.stats.score += SCORE.roundWin;
    const mine = winner === g.player.team;
    g.hud.notice(mine ? 'RONDA GANADA' : 'RONDA PERDIDA', mine ? 'ally' : 'enemy', reason);
    Audio.ui2d(mine ? 'ui_confirm' : 'ui_alert', 0.9);
    for (const c of g.combatants) if (c.brain) { c.brain.state = 'objective'; c.brain.path = null; }
  }
  plant(c, site) {
    const g = this.g;
    if (this.phase !== 'live') return;
    this.phase = 'planted';
    const y = g.nav.floorAt(site.x, site.z);
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x2b2f2a, roughness: 0.6, metalness: 0.5 }));
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 1 }));
    light.position.set(0.1, 0.13, 0.05); body.castShadow = true;
    mesh.add(body, light);
    const pos = new THREE.Vector3(c.pos.x, y + 0.11, c.pos.z);
    mesh.position.copy(pos); g.scene.add(mesh); this.objects.push(mesh);
    this.bomb = { mesh, light, pos, t: this.fuse, beepT: 0, site, planter: c, defuser: null, defuseT: 0 };
    c.stats.plants++; c.stats.score += SCORE.plant;
    if (c.brain) { c.brain.state = 'objective'; c.brain.path = null; }
    if (c.isPlayer) g.hud.popup(`+${SCORE.plant}`, 'CARGA PLANTADA');
    const mine = c.team === g.player.team;
    g.hud.notice('¡CARGA PLANTADA!', mine ? 'ally' : 'enemy', mine ? `Defiende el sitio ${site.id}` : `Desactívala en ${site.id}`);
    Audio.ui2d('ui_alert', 1);
    for (const s of g.squads) if (s) s.memo.bombSite = site;
  }
  defused(c) {
    const g = this.g;
    c.stats.defuses++; c.stats.score += SCORE.defuse;
    if (c.brain) { c.brain.state = 'objective'; c.brain.path = null; }
    if (c.isPlayer) g.hud.popup(`+${SCORE.defuse}`, 'CARGA DESACTIVADA');
    if (this.bomb) { this.bomb.light.material.emissiveIntensity = 0; }
    this.endRound(1 - this.attack, 'Carga desactivada');
  }
  onKill(victim, killer) {
    const g = this.g;
    if (this.bomb && this.bomb.defuser === victim) { this.bomb.defuser = null; this.bomb.defuseT = 0; }
    if (killer && killer.isPlayer && this.phase === 'planted' && killer.team !== this.attack && killer.pos.distanceTo(this.bomb.pos) < 12) {
      killer.stats.defends++; killer.stats.score += SCORE.defend; g.hud.popup(`+${SCORE.defend}`, 'DEFENSA DEL OBJETIVO');
    }
  }
  interactionFor(p) {
    if (!p.alive || p._sabFrozen) return null;
    if (this.phase === 'live' && p.team === this.attack) {
      for (const s of this.g.map.sites) {
        if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r) {
          return { key: 'plant' + s.id, label: `PLANTAR CARGA (${s.id})`, duration: this.plantDur, action: () => this.plant(p, s) };
        }
      }
    }
    if (this.phase === 'planted' && p.team !== this.attack && this.bomb && p.pos.distanceTo(this.bomb.pos) < 2.2) {
      return { key: 'defuse', label: 'DESACTIVAR CARGA', duration: this.defuseDur, action: () => this.defused(p) };
    }
    return null;
  }
  botInteract(bot, kind) {
    if (kind === 'plant' && this.phase === 'live' && bot.team === this.attack && !this.planting) {
      const s = this.g.map.sites.find((q) => Math.hypot(bot.pos.x - q.x, bot.pos.z - q.z) < q.r);
      if (!s) return false;
      this.planting = { c: bot, site: s, t: 0 };
      return true;
    }
    if (kind === 'defuse' && this.phase === 'planted' && bot.team !== this.attack && this.bomb && !this.bomb.defuser && bot.pos.distanceTo(this.bomb.pos) < 2.2) {
      this.bomb.defuser = bot; this.bomb.defuseT = 0;
      return true;
    }
    return false;
  }
  goalFor(bot, squad) {
    const g = this.g, T = bot.team;
    const sites = g.map.sites;
    const alive = squad.members.filter((m) => m.alive);
    const idx = alive.indexOf(bot);
    if (this.phase === 'post' || this.phase === 'pre') return { x: bot.pos.x, z: bot.pos.z, r: 1, kind: 'hold' };
    if (T === this.attack) {
      if (this.phase === 'planted' && this.bomb) {
        const b = this.bomb.pos;
        return { x: b.x + rand(-5, 5), z: b.z + rand(-5, 5), r: 6, kind: 'defend', face: { x: b.x, z: b.z - 30 } };
      }
      const site = sites[squad.memo.site || 0];
      // el más cercano planta; el resto cubre. Élite: uno amaga en el otro sitio
      const sorted = alive.slice().sort((a, b) => Math.hypot(a.pos.x - site.x, a.pos.z - site.z) - Math.hypot(b.pos.x - site.x, b.pos.z - site.z));
      if (g.diff.squadTactics && sorted.length > 2 && sorted[sorted.length - 1] === bot) {
        const o = sites[1 - (squad.memo.site || 0)];
        return { x: o.x, z: o.z, r: 6, kind: 'capture', face: { x: o.x, z: o.z - 20 } };
      }
      if (sorted[0] === bot) return { x: site.x, z: site.z, r: 1.5, kind: 'plant' };
      return { x: site.x + rand(-6, 6), z: site.z + rand(-2, 8), r: 6, kind: 'capture', face: { x: site.x, z: site.z - 25 } };
    }
    // defensores
    if (this.phase === 'planted' && this.bomb) {
      const b = this.bomb.pos;
      const sorted = alive.slice().sort((a, c) => a.pos.distanceToSquared(b) - c.pos.distanceToSquared(b));
      if (sorted[0] === bot) return { x: b.x, z: b.z, r: 1.6, kind: 'defuse' };
      return { x: b.x + rand(-6, 6), z: b.z + rand(-6, 6), r: 6, kind: 'defend', face: { x: b.x, z: b.z + 25 } };
    }
    const site = sites[idx % 2];
    return { x: site.x + rand(-4, 4), z: site.z + rand(0, 6), r: 7, kind: 'defend', face: { x: site.x, z: site.z + 30 } };
  }
  hudInfo(team) {
    const atk = team === this.attack;
    let text = atk ? 'PLANTA LA CARGA EN A O B' : 'DEFIENDE LOS SITIOS A Y B';
    if (this.phase === 'planted') text = atk ? 'DEFIENDE LA CARGA' : '¡DESACTIVA LA CARGA!';
    if (this.phase === 'pre') text = `RONDA ${this.round} · PREPÁRATE`;
    return {
      a: { v: this.rounds[team], max: this.winRounds, rounds: true }, b: { v: this.rounds[1 - team], max: this.winRounds, rounds: true },
      timer: fmtTime(this.phase === 'pre' ? this.phaseT : this.timeLeft), urgent: this.phase === 'planted', text,
      alive: [this.aliveCount(team), this.aliveCount(1 - team)],
    };
  }
  worldMarkers(team) {
    const m = this.g.map.sites.map((s) => ({ x: s.x, y: this.g.nav.floorAt(s.x, s.z) + 2.5, z: s.z, label: s.id, cls: team === this.attack ? 'e' : 'a' }));
    if (this.bomb) m.push({ x: this.bomb.pos.x, y: this.bomb.pos.y + 1.2, z: this.bomb.pos.z, label: '✹', cls: 'bomb' });
    return m;
  }
  teamScore(t) { return this.rounds[t]; }
}

// ------------------------------------------------------------------ TODOS CONTRA TODOS
export class FFA extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.def = MODES.ffa;
    this.limit = 20;
  }
  onKill(victim, killer) {
    if (killer && killer !== victim && killer.stats.kills >= this.limit) this.result = { winner: killer.team, winnerC: killer, reason: 'Límite de bajas alcanzado' };
  }
  onTimeUp() {
    const s = this.g.combatants.slice().sort((a, b) => b.stats.kills - a.stats.kills || b.stats.score - a.stats.score);
    if (s.length > 1 && s[0].stats.kills === s[1].stats.kills && s[0].stats.score === s[1].stats.score) this.result = { draw: true, reason: 'Empate a bajas' };
    else this.result = { winner: s[0].team, winnerC: s[0], reason: 'Tiempo agotado' };
  }
  respawnDelay() { return 2.5; }
  spawnPoint(c) { const S = this.g.map.spawns; return this.pickSpawn(c, S.ffa.concat(S[0], S[1])); }
  goalFor(bot, squad) { return this.huntGoal(bot, squad); }
  leader() { return this.g.combatants.slice().sort((a, b) => b.stats.kills - a.stats.kills)[0]; }
  hudInfo() {
    const p = this.g.player; const L = this.leader();
    const others = this.g.combatants.filter((c) => c !== p).sort((a, b) => b.stats.kills - a.stats.kills);
    return {
      a: { v: p.stats.kills, max: this.limit, label: 'TÚ' }, b: { v: others[0] ? others[0].stats.kills : 0, max: this.limit, label: others[0] ? others[0].name.toUpperCase() : '' },
      timer: fmtTime(this.timeLeft), text: L === p ? 'VAS EN CABEZA' : `LÍDER: ${L.name.toUpperCase()} · ${this.limit} BAJAS PARA GANAR`, ffa: true,
    };
  }
  teamScore(t) { const c = this.g.combatants.find((o) => o.team === t); return c ? c.stats.kills : 0; }
}

export function createMode(game, cfg) {
  if (cfg.mode === 'dom') return new DOM(game, cfg);
  if (cfg.mode === 'sab') return new SAB(game, cfg);
  if (cfg.mode === 'ffa') return new FFA(game, cfg);
  return new TDM(game, cfg);
}
