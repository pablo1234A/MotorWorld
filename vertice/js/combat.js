// Sistema de combate: disparo hitscan con dispersión, penetración de cristal, daño
// por zona y distancia, explosiones con oclusión, bajas, asistencias y medallas.
import * as THREE from 'three';
import { Audio } from './audio.js';
import { spreadDir } from './util.js';
import { SCORE, WEAPONS, LETHALS } from './data.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const PART_MUL = { head: null, chest: 1.0, body: 1.0, legs: 0.85 };

export class Combat {
  constructor(game) { this.g = game; this.res = {}; }

  shoot(shooter, ws, origin, dir, spreadDeg, muzzlePos) {
    const g = this.g; const def = ws.def;
    let best = null;
    for (let i = 0; i < def.pellets; i++) {
      spreadDir(dir, spreadDeg, _d);
      const r = this.trace(shooter, origin, _d, def, ws, 400);
      if (r.actor && (!best || r.killed || (best && !best.killed && r.part === 'head'))) best = r;
      if (i === 0 || Math.random() < 0.25) {
        const tr = shooter.isPlayer ? Math.random() < 0.45 : Math.random() < 0.7;
        if (tr && r.dist > 3) g.fx.tracer(muzzlePos || origin, r.point, def.pellets > 1 ? 300 : 420);
      }
    }
    shooter.stats.shots++;
    shooter.lastShotTime = g.time;
    // sonido
    const sound = 'gun_' + def.sound;
    if (shooter.isPlayer) Audio.play(sound, { vol: 0.9, jitter: 0.05, priority: true });
    else {
      const occ = !g.world.los(origin.x, origin.y, origin.z, g.camera.position.x, g.camera.position.y, g.camera.position.z, 'sight');
      Audio.play(sound, { pos: origin, vol: 1, ref: 6, rolloff: 1.0, jitter: 0.06, occluded: occ, maxDist: 220 });
    }
    g.noise(origin, def.id === 'sable' ? 110 : 75, shooter, 'shot');
    if (best) shooter.stats.hits++;
    return best;
  }

  trace(shooter, o, d, def, ws, maxT) {
    const g = this.g, W = g.world; const res = this.res;
    let ox = o.x, oy = o.y, oz = o.z, travelled = 0;
    let hit = null, wt = maxT;
    for (let pass = 0; pass < 4; pass++) {
      hit = W.raycast(ox, oy, oz, d.x, d.y, d.z, maxT - travelled, 'bullet', res);
      if (!hit) { wt = maxT; break; }
      const bx = hit.box;
      if (bx.data && bx.data.type === 'glass') {
        // solo atravesar si no hay un personaje antes del cristal
        const tHere = travelled + hit.t;
        if (this._actorBefore(shooter, o, d, tHere)) { wt = tHere; break; }
        _p.set(ox + d.x * hit.t, oy + d.y * hit.t, oz + d.z * hit.t);
        g.map.damageBox(bx, 999, _p, shooter);
        travelled += hit.t + 0.02; ox = o.x + d.x * travelled; oy = o.y + d.y * travelled; oz = o.z + d.z * travelled;
        hit = null; continue;
      }
      wt = travelled + hit.t; break;
    }
    // personajes
    let victim = null, vt = wt, part = null;
    for (const c of g.combatants) {
      if (c === shooter || !c.alive || !g.isEnemy(c, shooter)) continue;
      const h = c.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, vt);
      if (h && h.t < vt) { vt = h.t; victim = c; part = h.part; }
    }
    // vehículos
    let veh = null;
    if (g.vehicles) for (const v of g.vehicles) {
      if (!v.alive) continue;
      const t = v.rayHit(o, d, Math.min(vt, wt));
      if (t !== null && t < Math.min(vt, wt)) { veh = v; vt = t; victim = null; }
    }
    const out = { point: new THREE.Vector3(), actor: null, part: null, killed: false, dist: 0 };
    if (veh) {
      out.point.set(o.x + d.x * vt, o.y + d.y * vt, o.z + d.z * vt); out.dist = vt;
      g.fx.impact(out.point, _n.copy(d).negate(), 'metal');
      veh.damage(def.dmg * ws.falloff(vt) * 0.6, shooter);
      return out;
    }
    if (victim) {
      out.point.set(o.x + d.x * vt, o.y + d.y * vt, o.z + d.z * vt); out.dist = vt;
      let mul = part === 'head' ? def.head : (part === 'chest' ? (def.chest || 1) : PART_MUL[part]);
      const dmg = def.dmg * ws.falloff(vt) * mul;
      out.actor = victim; out.part = part;
      out.killed = this.damage(victim, dmg, shooter, { weapon: def.id, head: part === 'head', dir: d, point: out.point });
      g.fx.impact(out.point, _n.copy(d).negate(), 'body');
      if (!shooter.isPlayer || Math.random() < 0.5) Audio.play('imp_body', { pos: out.point, vol: 0.5, ref: 2 });
      return out;
    }
    if (hit) {
      out.point.set(o.x + d.x * wt, o.y + d.y * wt, o.z + d.z * wt); out.dist = wt;
      _n.set(res.nx, res.ny, res.nz);
      const mat = res.box.mat;
      g.fx.impact(out.point, _n, mat);
      if (res.box.hp) g.map.damageBox(res.box, def.pellets > 1 ? def.dmg * 0.6 : def.dmg, out.point, shooter);
      const near = out.point.distanceToSquared(g.camera.position) < 900;
      if (near || Math.random() < 0.3) Audio.play('imp_' + (mat === 'metal' ? 'metal' : mat === 'wood' ? 'wood' : mat === 'dirt' || mat === 'ground' ? 'dirt' : 'concrete'), { pos: out.point, vol: 0.55, ref: 2.5, jitter: 0.15 });
      // supresión: bala cerca de un bot
      g.bulletNear(shooter, o, d, wt);
    } else {
      out.point.set(o.x + d.x * maxT, o.y + d.y * maxT, o.z + d.z * maxT); out.dist = maxT;
      g.bulletNear(shooter, o, d, maxT);
    }
    return out;
  }
  _actorBefore(shooter, o, d, t) {
    for (const c of this.g.combatants) {
      if (c === shooter || !c.alive || !this.g.isEnemy(c, shooter)) continue;
      const h = c.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, t);
      if (h) return true;
    }
    return false;
  }

  // Devuelve true si mata
  damage(victim, amount, attacker, info = {}) {
    const g = this.g;
    if (!victim.alive || amount <= 0) return false;
    if (g.over) return false;
    const self = attacker === victim;
    if (g.time < victim.spawnProtect && !self) amount *= 0.2;
    if (victim.isPlayer && attacker && !attacker.isPlayer) amount *= g.diff.dmgMul;
    if (victim.isPlayer && g.godMode) amount = 0;
    if (victim.armor > 0) { const ab = Math.min(victim.armor, amount * 0.5); victim.armor -= ab; amount -= ab; }
    victim.health -= amount;
    victim.lastDamageTime = g.time;
    if (attacker && !self) {
      const rec = victim.damagers.get(attacker) || { dmg: 0, t: 0 };
      rec.dmg += amount; rec.t = g.time; victim.damagers.set(attacker, rec);
      attacker.stats.damage += amount; attacker.lastHitTime = g.time;
    }
    if (victim.model && victim.model.flinch !== undefined) victim.model.flinch = Math.min(1, victim.model.flinch + 0.6);
    if (victim.isPlayer) g.onPlayerDamaged(attacker, amount, info);
    if (victim.brain) victim.brain.onDamaged(attacker, amount, info);
    const killed = victim.health <= 0;
    if (attacker && attacker.isPlayer && !self) g.hud.hitmarker(info.head, killed);
    if (killed) this.kill(victim, attacker, info);
    return killed;
  }

  kill(victim, attacker, info) {
    const g = this.g;
    victim.alive = false; victim.health = 0;
    const prevStreak = victim.stats.streak;
    victim.stats.deaths++; victim.stats.streak = 0;
    victim.lastKiller = attacker && attacker !== victim ? attacker : null;
    victim.respawnAt = g.time + g.respawnDelay();
    if (victim.inVehicle) victim.inVehicle.eject(victim);
    if (victim.model) { const dir = info.dir ? info.dir : _d.set(0, 0, 1); const f = victim.forward(_e); victim.model.kill((f.x * dir.x + f.z * dir.z) > 0 ? -1 : 1); }
    const wName = info.weapon ? (WEAPONS[info.weapon] ? WEAPONS[info.weapon].name : (LETHALS[info.weapon] ? 'GRANADA' : info.weapon === 'barrel' ? 'BARRIL' : info.weapon.toUpperCase())) : '';
    const a = attacker;
    if (a && a !== victim && g.isEnemy(a, victim)) {
      const S = a.stats;
      S.kills++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      let pts = SCORE.kill; const medals = [];
      if (info.head) { S.headshots++; pts += SCORE.headshot; medals.push('DISPARO A LA CABEZA'); }
      if (info.explosive) S.explosiveKills++;
      if (g.time - a.lastKillTime < 3.5) a.multiKill++; else a.multiKill = 1;
      a.lastKillTime = g.time;
      if (a.multiKill === 2) medals.push('DOBLE BAJA'); else if (a.multiKill === 3) medals.push('TRIPLE BAJA'); else if (a.multiKill >= 4) medals.push('MASACRE');
      if (a.lastKiller === victim) { pts += SCORE.revenge; medals.push('VENGANZA'); a.lastKiller = null; }
      if (!g.firstBlood) { g.firstBlood = true; pts += SCORE.firstBlood; medals.push('PRIMERA SANGRE'); }
      if (prevStreak >= 5) { medals.push('FIN DE RACHA'); pts += 50; }
      if (S.streak >= 3) pts += SCORE.streakKill;
      S.score += pts;
      if (a.perk === 'carronero' && a.alive) { for (const w of a.weapons) w.refill(0.3); a.lethals = Math.min(a.lethals + 1, a.lethalDef.count + 1); }
      if (a.isPlayer) {
        g.hud.popup(`+${pts}`, 'BAJA ' + victim.name.toUpperCase());
        for (const m of medals) g.hud.medal(m);
        if (S.streak === 5 || S.streak === 10 || S.streak === 15) g.hud.medal(`RACHA DE ${S.streak}`);
        Audio.ui2d(info.head ? 'ui_head' : 'ui_kill', 0.8);
      }
      g.streaks.onKill(a);
    }
    // asistencias
    for (const [c, rec] of victim.damagers) {
      if (c === a || c === victim || !g.isEnemy(c, victim)) continue;
      if (rec.dmg >= 20 && g.time - rec.t < 10) {
        c.stats.assists++; c.stats.score += SCORE.assist;
        if (c.isPlayer) g.hud.popup(`+${SCORE.assist}`, 'ASISTENCIA');
      }
    }
    g.hud.killfeed(a, victim, wName, !!info.head, !!info.explosive);
    g.mode.onKill(victim, a, info);
    g.onDeath(victim, a, info);
  }

  explode(pos, radius, maxDmg, attacker, weaponId, scale = 1) {
    const g = this.g;
    g.fx.explosion(pos, scale);
    Audio.play(scale < 0.8 ? 'explosion_s' : 'explosion', { pos, vol: 1, ref: 9, rolloff: 0.8, priority: true, maxDist: 400 });
    for (const c of g.combatants) {
      if (!c.alive) continue;
      if (attacker && c !== attacker && !g.isEnemy(attacker, c)) continue;
      c.chest(_c);
      const d = _c.distanceTo(pos);
      if (d > radius) continue;
      const los = g.world.los(pos.x, pos.y + 0.4, pos.z, _c.x, _c.y, _c.z, 'bullet');
      let dmg = maxDmg * Math.pow(1 - d / radius, 1.1) * (los ? 1 : 0.25);
      if (c === attacker) dmg *= 0.5;
      if (dmg > 3) this.damage(c, dmg, attacker, { weapon: weaponId, explosive: true, dir: _d.subVectors(_c, pos).normalize(), point: _c.clone() });
    }
    // objetos destructibles
    const q = [];
    g.world.query(pos.x - radius * 0.6, pos.y - 1, pos.z - radius * 0.6, pos.x + radius * 0.6, pos.y + 3, pos.z + radius * 0.6, q);
    for (const b of q.slice()) {
      if (!b.hp || b.dead) continue;
      if (b.data && b.data.type === 'barrel') { g.schedule(0.15 + Math.random() * 0.15, () => g.map.damageBox(b, 999, pos, attacker)); }
      else g.map.damageBox(b, 999, pos, attacker);
    }
    if (g.vehicles) for (const v of g.vehicles) { if (v.alive && v.pos.distanceTo(pos) < radius + 1.5) v.damage(maxDmg * (1 - Math.min(1, v.pos.distanceTo(pos) / (radius + 1.5))) * 1.5, attacker); }
    const dp = g.camera.position.distanceTo(pos);
    g.shake(Math.max(0, 1.2 - dp / 30) * scale);
    g.noise(pos, 100, attacker, 'explosion');
  }
}
