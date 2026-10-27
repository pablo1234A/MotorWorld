import { clamp, lerp, moveTowards } from '../core/MathUtil';
import type { CarSpec } from './CarSpec';
import { fullTorque, RPM_TO_RADS, steadyBoost } from './Engine';

/**
 * Engine + clutch + gearbox. Produces the torque delivered to the driven axles
 * from throttle and the (averaged) driven wheel speed.
 */
export class Powertrain {
  rpm: number;
  /** -1 reverse, 0 neutral, 1..n forward. */
  gear = 1;
  boost = 0;
  /** Engine output torque this step (Nm, crank). */
  engineTorque = 0;
  /** 0..1 engine load (for audio). */
  load = 0;
  clutch = 1;
  shiftTimer = 0;
  private targetGear = 1;
  private sinceShift = 10;
  limiterCut = 0;
  /** Set for one frame when the turbo dumps pressure on lift-off. */
  blowOff = 0;
  /** Set for one frame on each gear change (+1 up, -1 down). */
  shiftEvent = 0;
  /** Lift-off backfire impulse counter for audio/vfx. */
  backfire = 0;
  nitroActive = false;
  private prevThrottle = 0;

  constructor(private spec: CarSpec) {
    this.rpm = spec.engine.idleRpm;
  }

  setSpec(spec: CarSpec) {
    this.spec = spec;
    this.gear = clamp(this.gear, -1, spec.drivetrain.gears.length);
  }

  get gearCount() {
    return this.spec.drivetrain.gears.length;
  }

  ratio(gear = this.gear): number {
    const d = this.spec.drivetrain;
    if (gear === 0) return 0;
    if (gear < 0) return -d.reverse * d.finalDrive;
    return d.gears[gear - 1] * d.finalDrive;
  }

  /** Engine + flywheel inertia seen at the wheels through the current gear (kg·m²). */
  reflectedInertia(): number {
    if (this.gear === 0 || this.shiftTimer > 0) return 0;
    const r = this.ratio();
    const ie = 0.1 + this.spec.engine.cylinders * 0.012;
    return ie * r * r * this.clutch;
  }

  get shifting() {
    return this.shiftTimer > 0;
  }

  requestGear(g: number) {
    const n = this.gearCount;
    g = clamp(g, -1, n);
    if (g === this.gear || this.shiftTimer > 0) return;
    this.shiftEvent = g > this.gear ? 1 : -1;
    this.targetGear = g;
    this.shiftTimer = this.spec.drivetrain.shiftTime;
    this.sinceShift = 0;
  }

  /** Immediately put into gear (no shift delay) – used for reverse/forward selection at standstill. */
  forceGear(g: number) {
    this.gear = this.targetGear = g;
    this.shiftTimer = 0;
  }

  /**
   * @param wheelOmega averaged angular velocity of driven wheels (rad/s)
   * @param groundOmega road speed expressed as wheel angular velocity (rad/s); the automatic box shifts on it
   *   like a real one shifts on output-shaft speed, so wheelspin does not trigger upshifts
   * @returns torque applied to the driven axles combined (Nm, signed in wheel space)
   */
  update(dt: number, throttle: number, wheelOmega: number, autoGear: boolean, nitro: boolean, driverThrottle: number, braking: number, groundOmega = wheelOmega): number {
    const s = this.spec;
    const e = s.engine;
    this.shiftEvent = 0;
    this.blowOff = 0;
    this.sinceShift += dt;

    // --- Gear change sequencing (torque cut during shift) ---
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= s.drivetrain.shiftTime * 0.5 && this.gear !== this.targetGear) {
        this.gear = this.targetGear;
      }
      if (this.shiftTimer <= 0) this.shiftTimer = 0;
    }

    // --- Turbo spool ---
    const targetBoost = steadyBoost(e, this.rpm, throttle);
    if (e.turbo) {
      const rate = targetBoost > this.boost ? e.turbo.spoolRate : e.turbo.spoolRate * 3.5;
      if (this.prevThrottle > 0.6 && throttle < 0.2 && this.boost > e.turbo.maxBoost * 0.35) this.blowOff = this.boost / e.turbo.maxBoost;
      this.boost = moveTowards(this.boost, targetBoost, rate * dt);
    }
    if (this.prevThrottle > 0.7 && throttle < 0.1 && this.rpm > e.redline * 0.6) this.backfire++;
    this.prevThrottle = throttle;

    // --- Rev limiter ---
    if (this.limiterCut > 0) this.limiterCut -= dt;
    if (this.rpm >= e.redline + 150) this.limiterCut = 0.06;
    const effThrottle = this.limiterCut > 0 ? 0 : throttle;

    const ratio = this.ratio();
    const engaged = this.gear !== 0 && this.shiftTimer <= 0;
    const wheelRpm = Math.abs(wheelOmega * ratio) / RPM_TO_RADS;
    this.nitroActive = nitro && s.nitro > 0 && throttle > 0.1 && this.gear > 0;
    const nitroMul = this.nitroActive ? 1 + s.nitro : 1;

    let crankTorque: number;
    if (!engaged) {
      // Free revving: engine spins towards throttle-target rpm, or syncs to next gear when shifting.
      const target = this.shiftTimer > 0 && this.targetGear !== 0
        ? Math.max(e.idleRpm, Math.abs(wheelOmega * this.ratio(this.targetGear)) / RPM_TO_RADS)
        : lerp(e.idleRpm, e.redline + 200, effThrottle);
      this.rpm = moveTowards(this.rpm, target, e.revRate * dt * (this.shiftTimer > 0 ? 1.6 : 1));
      this.clutch = 0;
      crankTorque = 0;
      this.load = effThrottle * 0.4;
    } else {
      const launchRpm = lerp(e.idleRpm + 300, Math.min(e.torqueRpm * 1.05, e.redline * 0.7), effThrottle);
      if (wheelRpm < launchRpm && effThrottle > 0.05) {
        // Clutch slipping: engine held at launch rpm, transmits its torque.
        this.rpm = moveTowards(this.rpm, Math.max(launchRpm, wheelRpm), e.revRate * dt);
        this.clutch = clamp(wheelRpm / launchRpm, 0, 1);
      } else if (wheelRpm < e.idleRpm) {
        // Rolling very slowly with no throttle: clutch disengages to keep idle.
        this.rpm = moveTowards(this.rpm, e.idleRpm, e.revRate * dt);
        this.clutch = wheelRpm / e.idleRpm;
      } else {
        this.rpm = wheelRpm;
        this.clutch = 1;
      }
      const tFull = fullTorque(e, this.rpm, this.boost) * nitroMul;
      const brake = e.engineBrake * clamp(this.rpm / e.redline, 0.2, 1.1);
      crankTorque = effThrottle * tFull - (1 - effThrottle) * brake * this.clutch;
      if (this.clutch < 1 && crankTorque < 0) crankTorque *= this.clutch;
      this.load = clamp(crankTorque / Math.max(1, tFull), -1, 1);
    }
    this.rpm = clamp(this.rpm, e.idleRpm * 0.85, e.redline + 400);
    this.engineTorque = crankTorque;

    // --- Automatic gearbox ---
    if (autoGear && this.shiftTimer <= 0 && this.gear > 0) {
      const n = this.gearCount;
      const dthr = clamp(driverThrottle * 1.2, 0, 1);
      const upRpm = e.redline * lerp(0.55, 0.97, dthr);
      const roadRpm = Math.abs(groundOmega * ratio) / RPM_TO_RADS;
      if (this.gear < n && this.rpm > upRpm && roadRpm > upRpm * 0.85 && this.sinceShift > 0.45) {
        this.requestGear(this.gear + 1);
      } else if (this.gear > 1) {
        const lowerRpm = (this.rpm * this.ratio(this.gear - 1)) / this.ratio(this.gear);
        const braking_ = braking > 0.2;
        const downRpm = braking_ ? e.redline * 0.5 : e.redline * lerp(0.3, 0.45, dthr);
        const headroom = braking_ ? 0.82 : 0.78;
        const wait = braking_ ? 0.35 : 1.2;
        if (this.sinceShift > wait && this.rpm < downRpm && lowerRpm < e.redline * headroom) this.requestGear(this.gear - 1);
      }
    }

    return engaged ? crankTorque * ratio * s.drivetrain.efficiency : 0;
  }
}
