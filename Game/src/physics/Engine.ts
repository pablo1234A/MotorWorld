import { clamp, smoothstep } from '../core/MathUtil';
import type { EngineSpec } from './CarSpec';

const RPM_TO_RADS = (2 * Math.PI) / 60;

/** Normalised torque curve shape (1 = peak) for a given rpm. */
export function torqueShape(e: EngineSpec, rpm: number): number {
  if (rpm <= e.idleRpm) return e.lowEndFrac * clamp(rpm / e.idleRpm, 0, 1);
  if (rpm < e.torqueRpm) {
    const t = (rpm - e.idleRpm) / (e.torqueRpm - e.idleRpm);
    // ease-out rise
    return e.lowEndFrac + (1 - e.lowEndFrac) * (1 - (1 - t) * (1 - t));
  }
  if (rpm <= e.plateauRpm) return 1;
  if (rpm <= e.redline) {
    const t = (rpm - e.plateauRpm) / Math.max(1, e.redline - e.plateauRpm);
    return 1 - (1 - e.redlineFrac) * Math.pow(t, 1.5);
  }
  const over = (rpm - e.redline) / 400;
  return Math.max(0, e.redlineFrac * (1 - over));
}

/** Naturally aspirated base torque (peak torque spec includes stock boost). */
export function baseTorque(e: EngineSpec): number {
  return e.turbo ? e.peakTorque / (1 + e.turbo.maxBoost * e.turbo.gainPerBar) : e.peakTorque;
}

/** Full-throttle torque (Nm) at rpm with given boost and no nitro. */
export function fullTorque(e: EngineSpec, rpm: number, boost: number): number {
  let t = baseTorque(e) * torqueShape(e, rpm);
  if (e.turbo) t *= 1 + boost * e.turbo.gainPerBar;
  if (e.electricAssist > 0) t += e.peakTorque * e.electricAssist * (1 - smoothstep(e.idleRpm, e.torqueRpm * 1.2, rpm));
  return t;
}

/** Steady-state boost at full throttle for a given rpm. */
export function steadyBoost(e: EngineSpec, rpm: number, throttle: number): number {
  if (!e.turbo) return 0;
  return e.turbo.maxBoost * throttle * smoothstep(e.turbo.spoolRpm * 0.55, e.turbo.spoolRpm * 1.05, rpm);
}

export interface PowerStats {
  peakHp: number;
  peakHpRpm: number;
  peakTorque: number;
  peakTorqueRpm: number;
}

/** Scan the curve to find advertised peak power/torque (assumes full boost). */
export function powerStats(e: EngineSpec): PowerStats {
  let peakHp = 0, peakHpRpm = 0, peakT = 0, peakTRpm = 0;
  for (let rpm = e.idleRpm; rpm <= e.redline; rpm += 25) {
    const t = fullTorque(e, rpm, steadyBoost(e, rpm, 1));
    const hp = (t * rpm * RPM_TO_RADS) / 745.7;
    if (hp > peakHp) {
      peakHp = hp;
      peakHpRpm = rpm;
    }
    if (t > peakT) {
      peakT = t;
      peakTRpm = rpm;
    }
  }
  return { peakHp, peakHpRpm, peakTorque: peakT, peakTorqueRpm: peakTRpm };
}

export { RPM_TO_RADS };
