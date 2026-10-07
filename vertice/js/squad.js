// Coordinación de escuadra: información compartida (con retardo según dificultad),
// roles de cerco (fijar / flanquear por izquierda y derecha) y objetivos del modo.
export class Squad {
  constructor(game, team) {
    this.g = game; this.team = team;
    this.members = [];
    this.known = new Map(); // enemigo -> {pos, t}
    this.roles = new Map();
    this.timer = Math.random();
    this.pending = [];
    this.memo = {}; // datos de planificación del modo
  }
  add(bot) { this.members.push(bot); }
  report(from, enemy, conf = 1) {
    const D = this.g.diff;
    if (D.share < 0) return;
    this.pending.push({ at: this.g.time + D.share * (conf < 1 ? 1.5 : 1), enemy, pos: enemy.pos.clone(), t: this.g.time, from });
  }
  roleOf(bot) { return this.roles.get(bot) || null; }
  goalFor(bot) { return this.g.mode.goalFor ? this.g.mode.goalFor(bot, this) : null; }
  freshEnemies(maxAge = 15) {
    const out = [];
    for (const [e, k] of this.known) if (e.alive && this.g.time - k.t < maxAge) out.push({ e, pos: k.pos, t: k.t });
    return out;
  }
  update(dt) {
    const g = this.g, t = g.time;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (t < p.at) continue;
      this.pending.splice(i, 1);
      const k = this.known.get(p.enemy);
      if (!k || k.t < p.t) this.known.set(p.enemy, { pos: p.pos, t: p.t });
      for (const m of this.members) if (m !== p.from && m.alive && m.brain) m.brain.knowFromSquad(p.enemy, p.pos, p.t);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    for (const [e] of this.known) if (!e.alive) this.known.delete(e);
    // roles de cerco
    this.roles.clear();
    const D = g.diff;
    if (D.flankChance < 0.3) return;
    const fresh = this.freshEnemies(8);
    if (!fresh.length) return;
    fresh.sort((a, b) => b.t - a.t);
    const focus = fresh[0].pos;
    const alive = this.members.filter((m) => m.alive).sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    const max = D.squadTactics ? alive.length : Math.min(alive.length, 3);
    for (let i = 0; i < max; i++) {
      const m = alive[i];
      if (m.pos.distanceTo(focus) > 55) break;
      this.roles.set(m, i === 0 ? 'pin' : i % 2 ? 'flankL' : 'flankR');
    }
  }
}
