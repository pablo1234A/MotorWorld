import { clamp } from '../core/MathUtil';
import type { CarSpec } from '../physics/CarSpec';
import { fullTorque, powerStats, RPM_TO_RADS, steadyBoost } from '../physics/Engine';
import { FlatWorld } from '../physics/PhysicsWorld';
import { COMPOUND_GRIP, Surface } from '../physics/Surface';
import { VehicleSim } from '../physics/VehicleSim';

export interface PerfStats {
  hp: number;
  torque: number;
  weight: number;
  topSpeed: number; // km/h
  zeroTo100: number; // s
  braking: number; // m from 100
  lateralG: number;
  pi: number;
  cls: CarClass;
  bars: { speed: number; accel: number; handling: number; braking: number; launch: number; offroad: number };
  layout: string;
}

export type CarClass = 'D' | 'C' | 'B' | 'A' | 'S1' | 'S2' | 'X';
export const CLASS_COLORS: Record<CarClass, string> = { D: '#3fb8e0', C: '#f2c94c', B: '#f2994a', A: '#eb5757', S1: '#bb6bd9', S2: '#2f80ed', X: '#27ae60' };
export const CLASS_ORDER: CarClass[] = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];

export function piToClass(pi: number): CarClass {
  if (pi <= 400) return 'D';
  if (pi <= 500) return 'C';
  if (pi <= 600) return 'B';
  if (pi <= 700) return 'A';
  if (pi <= 800) return 'S1';
  if (pi <= 900) return 'S2';
  return 'X';
}

/** Analytic top speed: highest speed where available wheel force exceeds resistances. */
export function topSpeed(s: CarSpec): number {
  const m = s.chassis.mass;
  const R = s.tires.radius;
  const d = s.drivetrain;
  let best = 0;
  for (let v = 5; v < 140; v += 0.25) {
    const resist = 0.5 * 1.225 * s.aero.cd * s.aero.frontalArea * v * v + 0.012 * m * 9.81 + 0.5 * 1.225 * (s.aero.clFront + s.aero.clRear) * v * v * 0.012;
    let maxF = 0;
    for (const g of d.gears) {
      const ratio = g * d.finalDrive;
      const rpm = (v / R) * ratio / RPM_TO_RADS;
      if (rpm > s.engine.redline + 100) continue;
      const rr = Math.max(rpm, s.engine.idleRpm);
      const t = fullTorque(s.engine, rr, steadyBoost(s.engine, rr, 1));
      maxF = Math.max(maxF, (t * ratio * d.efficiency) / R);
    }
    if (maxF >= resist) best = v;
    else if (best > 0 && v > best + 3) break;
  }
  return best * 3.6;
}

function simulate(s: CarSpec, fn: (sim: VehicleSim, t: number) => boolean, maxT: number): VehicleSim {
  const sim = new VehicleSim(s, new FlatWorld());
  sim.reset(0, s.chassis.cgHeight + 0.15, 0, 0);
  const dt = 1 / 120;
  for (let i = 0; i < 90; i++) sim.step(dt); // settle
  let t = 0;
  while (t < maxT) {
    if (!fn(sim, t)) break;
    sim.step(dt);
    t += dt;
  }
  return sim;
}

export function zeroTo100(s: CarSpec): number {
  let result = 30;
  simulate(s, (sim, t) => {
    sim.input.throttle = 1;
    if (sim.forwardSpeed * 3.6 >= 100) {
      result = t;
      return false;
    }
    return true;
  }, 25);
  return result;
}

export function brakingDistance(s: CarSpec): number {
  let z0 = 0, braking = false, dist = 60;
  simulate(s, (sim) => {
    if (!braking) {
      sim.input.throttle = 1;
      if (sim.forwardSpeed * 3.6 >= 100) {
        braking = true;
        z0 = sim.position.z;
        sim.input.throttle = 0;
        sim.input.brake = 1;
      }
      return true;
    }
    if (sim.forwardSpeed < 0.3) {
      dist = Math.abs(sim.position.z - z0);
      return false;
    }
    return true;
  }, 40);
  return dist;
}

export function lateralG(s: CarSpec): number {
  const t = s.tires;
  const comp = COMPOUND_GRIP[t.compound][Surface.Asphalt];
  const wF = 0.9 + 0.1 * (t.widthFront / 245), wR = 0.9 + 0.1 * (t.widthRear / 245);
  const muF = t.gripFront * wF * comp, muR = t.gripRear * wR * comp;
  const m = s.chassis.mass;
  const v = 120 / 3.6;
  const q = 0.5 * 1.225 * v * v;
  const dfF = q * s.aero.clFront, dfR = q * s.aero.clRear;
  const wf = s.chassis.weightFront;
  // grip-limited lateral capacity per axle (axle saturating first limits the car)
  const fzF = m * 9.81 * wf + dfF, fzR = m * 9.81 * (1 - wf) + dfR;
  const avgTrack = (s.chassis.trackFront + s.chassis.trackRear) / 2;
  const transfer = clamp(s.chassis.cgHeight / avgTrack, 0.2, 0.6);
  const loadPenalty = 1 - 0.12 * transfer * 1.4;
  const capF = (muF * fzF * loadPenalty) / wf;
  const capR = (muR * fzR * loadPenalty) / (1 - wf);
  const rollStiff = (s.suspension.arbFront + s.suspension.arbRear + (s.suspension.springFront + s.suspension.springRear) * 0.5) / m;
  const stiffBonus = clamp((rollStiff - 50) / 400, -0.03, 0.05);
  return (Math.min(capF, capR) / (m * 9.81)) * (1 + stiffBonus);
}

export function computeStats(s: CarSpec): PerfStats {
  const ps = powerStats(s.engine);
  const hp = ps.peakHp * (1 + s.nitro * 0);
  const top = topSpeed(s);
  const z = zeroTo100(s);
  const br = brakingDistance(s);
  const lg = lateralG(s);
  const A = clamp((11 - z) / 9, 0, 1);
  const S = clamp((top - 160) / 260, 0, 1);
  const H = clamp((lg - 0.8) / 0.75, 0, 1);
  const B = clamp((48 - br) / 22, 0, 1);
  const pi = Math.round(100 + 899 * clamp(0.3 * A + 0.24 * S + 0.3 * H + 0.16 * B, 0, 1));
  const off = COMPOUND_GRIP[s.tires.compound][Surface.Dirt] * clamp(s.suspension.travel / 0.3, 0.4, 1) * (s.drivetrain.layout === 'AWD' ? 1 : 0.75);
  return {
    hp, torque: ps.peakTorque, weight: s.chassis.mass, topSpeed: top, zeroTo100: z, braking: br, lateralG: lg, pi, cls: piToClass(pi),
    bars: {
      speed: clamp(top / 420, 0.05, 1) * 10,
      accel: clamp((14 - z) / 12, 0.05, 1) * 10,
      handling: clamp((lg - 0.6) / 1.0, 0.05, 1) * 10,
      braking: clamp((60 - br) / 32, 0.05, 1) * 10,
      launch: clamp(((ps.peakTorque * s.drivetrain.gears[0] * s.drivetrain.finalDrive) / s.tires.radius / (s.chassis.mass * 9.81)) / 1.2, 0.05, 1) * 10,
      offroad: clamp(off, 0.05, 1) * 10,
    },
    layout: s.drivetrain.layout,
  };
}
