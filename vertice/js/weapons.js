// Estado de arma compartido por jugador y bots: munición, cadencia, recarga y dispersión.
import { WEAPONS } from './data.js';

export class WeaponState {
  constructor(id, opts = {}) {
    this.def = WEAPONS[id];
    this.id = id;
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
    this.nextShot = 0;
    this.reloading = false; this.reloadEnd = 0; this.reloadStart = 0;
    this.bloom = 0; // dispersión acumulada
    this.shotsInBurst = 0;
    this.optic = opts.optic || 'iron';
    this.camo = opts.camo || 'pavonado';
    this.triggerHeld = false;
  }
  get interval() { return 60 / this.def.rpm; }
  canFire(t) { return !this.reloading && this.mag > 0 && t >= this.nextShot; }
  fire(t) {
    this.mag--;
    if (t - this.nextShot > this.interval) this.nextShot = t;
    this.nextShot += this.interval;
    this.bloom = Math.min(1, this.bloom + (this.def.auto ? 0.09 : 0.25));
    this.shotsInBurst++;
  }
  needsReload() { return this.mag < this.def.mag && this.reserve > 0; }
  startReload(t, speedMul = 1) {
    if (this.reloading || !this.needsReload()) return false;
    this.reloading = true;
    const dur = (this.mag === 0 ? this.def.reloadEmpty : this.def.reload) * speedMul;
    this.reloadStart = t; this.reloadEnd = t + dur;
    return dur;
  }
  cancelReload() { this.reloading = false; }
  update(t, dt) {
    if (this.reloading && t >= this.reloadEnd) {
      const need = this.def.mag - this.mag;
      const take = Math.min(need, this.reserve);
      this.mag += take; this.reserve -= take;
      this.reloading = false;
      return 'reloaded';
    }
    this.bloom = Math.max(0, this.bloom - dt * (this.def.auto ? 2.2 : 2.8));
    if (t > this.nextShot + 0.25) this.shotsInBurst = 0;
    return null;
  }
  refill(frac = 1) {
    const add = Math.ceil(this.def.reserve * frac);
    this.reserve = Math.min(this.def.reserve + this.def.mag, this.reserve + add);
  }
  // dispersión en grados
  spread(ads, moving, crouch, airborne, mulAds = 1) {
    const d = this.def;
    let s = ads ? d.spreadAds * mulAds : d.spreadHip;
    s *= 1 + this.bloom * (ads ? 1.6 : 0.8);
    if (moving) s += d.moveSpread * (ads ? 0.35 : 1);
    if (crouch) s *= 0.75;
    if (airborne) s += 3;
    return s;
  }
  // multiplicador de daño por distancia
  falloff(dist) {
    const [a, b] = this.def.range;
    if (dist <= a) return 1;
    if (dist >= b) return this.def.minMul;
    return 1 - (1 - this.def.minMul) * ((dist - a) / (b - a));
  }
}
