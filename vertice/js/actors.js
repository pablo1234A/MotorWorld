// Combatiente base (jugador y bots): salud, armadura, armas, estadísticas e impactos.
import * as THREE from './lib/three.module.min.js';
import { WeaponState } from './weapons.js';
import { LETHALS, TACTICALS } from './data.js';
import { raySphere } from './util.js';

let NEXT_ID = 1;

export class Combatant {
  constructor(game, o) {
    this.game = game;
    this.id = NEXT_ID++;
    this.name = o.name;
    this.team = o.team;
    this.isPlayer = !!o.isPlayer;
    this.look = o.look;
    this.loadout = o.loadout;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.32; this.standH = 1.8; this.crouchH = 1.2; this.height = 1.8;
    this.eyeOff = 1.62;
    this.alive = false; this.crouch = false; this.sprint = false; this.grounded = true;
    this.maxHealth = 100; this.health = 100; this.armor = 0;
    this.weapons = [
      new WeaponState(o.loadout.primary, { optic: o.loadout.optic, camo: o.loadout.camo }),
      new WeaponState(o.loadout.secondary, { optic: 'iron', camo: o.loadout.camo }),
    ];
    this.slot = 0;
    this.perk = o.loadout.perk;
    this.lethalDef = LETHALS[o.loadout.lethal]; this.tacticalDef = TACTICALS[o.loadout.tactical];
    this.lethals = 0; this.tacticals = 0;
    this.stats = { kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, bestStreak: 0, headshots: 0, shots: 0, hits: 0, captures: 0, defends: 0, plants: 0, defuses: 0, explosiveKills: 0, damage: 0 };
    this.damagers = new Map();
    this.lastDamageTime = -99; this.lastShotTime = -99; this.respawnAt = 0; this.spawnProtect = 0;
    this.flashedUntil = 0; this.lastKiller = null; this.lastKillTime = -99; this.multiKill = 0;
    this.model = null;
    this.inVehicle = null;
    this.revealedUntil = 0;
  }
  get weapon() { return this.weapons[this.slot]; }
  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z); }
  eyeHeight() { return this.crouch ? 1.05 : this.eyeOff; }
  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  chest(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.68, this.pos.z); }
  head(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.13, this.pos.z); }

  resetForSpawn(p) {
    this.pos.set(p.x, p.y || 0, p.z); this.vel.set(0, 0, 0);
    this.yaw = p.yaw || 0; this.pitch = 0;
    this.alive = true; this.health = this.maxHealth;
    this.armor = this.perk === 'kevlar' ? 50 : 0;
    this.crouch = false; this.height = this.standH; this.sprint = false;
    this.slot = 0;
    for (const w of this.weapons) { w.mag = w.def.mag; w.reserve = w.def.reserve; w.reloading = false; w.bloom = 0; }
    this.lethals = this.lethalDef.count; this.tacticals = this.tacticalDef.count;
    this.damagers.clear();
    this.spawnProtect = this.game.time + 2.5;
    this.flashedUntil = 0;
    this.lastDamageTime = -99;
    if (this.model) { this.model.revive(); this.model.root.visible = !this.isPlayer || this.game.thirdPerson; }
  }

  // Impacto de rayo: devuelve {t, part} o null
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.alive) return null;
    const h = this.height;
    // descarte rápido por cilindro
    const cx = this.pos.x - ox, cy = this.pos.y + h * 0.5 - oy, cz = this.pos.z - oz;
    const s = cx * dx + cy * dy + cz * dz;
    if (s < -1 || s > maxT + 1) return null;
    const qx = cx - dx * s, qy = cy - dy * s, qz = cz - dz * s;
    if (qx * qx + qy * qy + qz * qz > 1.1) return null;
    let best = maxT, part = null;
    const y = this.pos.y;
    const t1 = raySphere(ox, oy, oz, dx, dy, dz, this.pos.x, y + h - 0.13, this.pos.z, 0.15);
    if (t1 >= 0 && t1 < best) { best = t1; part = 'head'; }
    const t2 = raySphere(ox, oy, oz, dx, dy, dz, this.pos.x, y + h * 0.66, this.pos.z, 0.27);
    if (t2 >= 0 && t2 < best - 0.02) { best = t2; part = 'chest'; }
    const t3 = raySphere(ox, oy, oz, dx, dy, dz, this.pos.x, y + h * 0.46, this.pos.z, 0.25);
    if (t3 >= 0 && t3 < best - 0.02) { best = t3; part = 'body'; }
    const t4 = raySphere(ox, oy, oz, dx, dy, dz, this.pos.x, y + h * 0.22, this.pos.z, 0.23);
    if (t4 >= 0 && t4 < best - 0.02) { best = t4; part = 'legs'; }
    return part ? { t: best, part } : null;
  }
}
