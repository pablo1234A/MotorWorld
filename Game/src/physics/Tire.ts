import { clamp } from '../core/MathUtil';

/**
 * Normalised combined-slip tire curve.
 * s = |(κ/κpeak, tanα/tanαpeak)|. Returns fraction of peak friction (1 at s = 1).
 * Rises with zero slope at the peak, then decays towards the sliding friction plateau.
 */
export function tireCurve(s: number, falloff: number): number {
  if (s < 1) return s * (2 - s);
  return falloff + (1 - falloff) * Math.exp(-(s - 1) * 1.6);
}

export interface TireParams {
  mu: number;
  peakSlipRatio: number;
  peakSlipAngle: number; // radians
  falloff: number;
  loadSensitivity: number;
  nominalLoad: number;
}

export interface TireForce {
  fx: number;
  fy: number;
  /** Combined normalised slip (>1 means sliding). */
  s: number;
}

/**
 * Compute longitudinal (fx, +forward) and lateral (fy, +right) tire forces.
 * vLat is velocity of the contact patch along the wheel's right axis.
 */
export function tireForce(slipRatio: number, tanAlpha: number, fz: number, p: TireParams, out: TireForce): TireForce {
  if (fz <= 0) {
    out.fx = out.fy = out.s = 0;
    return out;
  }
  // Load sensitivity: friction coefficient drops as load rises above nominal.
  const loadRatio = fz / p.nominalLoad;
  const mu = p.mu * clamp(1 - p.loadSensitivity * (loadRatio - 1), 0.6, 1.25);
  const sx = slipRatio / p.peakSlipRatio;
  const sy = tanAlpha / Math.tan(p.peakSlipAngle);
  const s = Math.hypot(sx, sy);
  out.s = s;
  if (s < 1e-6) {
    out.fx = out.fy = 0;
    return out;
  }
  const f = mu * fz * tireCurve(s, p.falloff);
  out.fx = (f * sx) / s;
  out.fy = (-f * sy) / s;
  return out;
}
