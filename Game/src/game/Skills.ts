import { EventBus } from '../core/EventBus';
import type { VehicleSim } from '../physics/VehicleSim';

export type SkillName = 'drift' | 'near_miss' | 'air' | 'speed_skill' | 'smash' | 'slipstream' | 'drift_zone';

export type SkillEvents = {
  chain: { name: SkillName; points: number; mult: number; total: number };
  banked: { points: number; mult: number; xp: number; cash: number };
  lost: { points: number };
};

/**
 * Skill chain system: drifting, near misses, jumps, top speed, smashing scenery.
 * Skills add points to a chain whose multiplier grows with variety; the chain banks into XP
 * after a short quiet period and is lost on a crash.
 */
export class Skills {
  readonly bus = new EventBus<SkillEvents>();
  points = 0;
  mult = 1;
  timer = 0;
  last: SkillName | null = null;
  private seen = new Set<SkillName>();
  private wasAir = 0;
  private driftTime = 0;
  private speedTime = 0;
  /** Drift points multiplier (drift zones / events). */
  driftBoost = 1;
  /** Total drift points since reset (used by drift events). */
  driftTotal = 0;
  enabled = true;
  readonly window = 2.6;

  reset() {
    this.points = 0;
    this.mult = 1;
    this.timer = 0;
    this.seen.clear();
    this.driftTotal = 0;
  }

  add(name: SkillName, pts: number) {
    if (!this.enabled || pts <= 0) return;
    if (!this.seen.has(name)) {
      this.seen.add(name);
      if (this.seen.size > 1) this.mult = Math.min(8, this.mult + 0.5);
    }
    this.points += pts;
    this.timer = this.window;
    this.last = name;
    this.bus.emit('chain', { name, points: pts, mult: this.mult, total: this.points });
  }

  /** Crash: the current chain is lost. */
  crash() {
    if (this.points > 0) this.bus.emit('lost', { points: this.points });
    this.points = 0;
    this.mult = 1;
    this.timer = 0;
    this.seen.clear();
  }

  update(dt: number, sim: VehicleSim) {
    const kmh = sim.forwardSpeed * 3.6;
    // drift
    const d = sim.driftAmount;
    if (d > 0 && kmh > 35) {
      this.driftTime += dt;
      const p = dt * (kmh * 0.9) * (0.4 + d) * this.driftBoost * (1 + Math.min(this.driftTime, 4) * 0.25);
      this.driftTotal += p * this.mult;
      if (this.driftTime > 0.35) this.add(this.driftBoost > 1 ? 'drift_zone' : 'drift', p);
    } else this.driftTime = Math.max(0, this.driftTime - dt * 2);
    // air
    if (sim.airTime > 0) this.wasAir = sim.airTime;
    else if (this.wasAir > 0) {
      if (this.wasAir > 0.45 && kmh > 30) this.add('air', Math.round(this.wasAir * 650));
      this.wasAir = 0;
    }
    // sustained speed
    if (kmh > 190) {
      this.speedTime += dt;
      if (this.speedTime > 1) this.add('speed_skill', dt * (kmh - 150) * 2);
    } else this.speedTime = 0;
    // bank
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.points > 0) {
        const total = Math.round(this.points * this.mult);
        this.bus.emit('banked', { points: total, mult: this.mult, xp: Math.round(total / 8), cash: Math.round(total / 20) });
        this.points = 0;
        this.mult = 1;
        this.seen.clear();
      }
    }
  }
}
