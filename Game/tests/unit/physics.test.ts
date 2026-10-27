import { describe, expect, it } from 'vitest';
import { FlatWorld } from '../../src/physics/PhysicsWorld';
import { VehicleSim } from '../../src/physics/VehicleSim';
import type { CarSpec } from '../../src/physics/CarSpec';

export function testSpec(layout: 'FWD' | 'RWD' | 'AWD' = 'RWD'): CarSpec {
  return {
    engine: { idleRpm: 900, redline: 7000, peakTorque: 420, torqueRpm: 4500, plateauRpm: 5200, redlineFrac: 0.8, lowEndFrac: 0.55, engineBrake: 60, revRate: 9000, cylinders: 6, layout: 'I', turbo: null, electricAssist: 0 },
    drivetrain: { layout, frontSplit: 0.4, gears: [3.4, 2.2, 1.6, 1.25, 1.0, 0.82], reverse: 3.2, finalDrive: 3.6, shiftTime: 0.2, efficiency: 0.88,
      frontDiff: { type: 'open', lock: 0, preload: 0 }, rearDiff: { type: 'lsd', lock: 0.4, preload: 80 } },
    chassis: { mass: 1450, cgHeight: 0.5, weightFront: 0.52, wheelbase: 2.65, trackFront: 1.56, trackRear: 1.58, length: 4.5, width: 1.85, height: 1.32 },
    suspension: { travel: 0.2, springFront: 52000, springRear: 50000, damperBump: 4200, damperRebound: 5600, arbFront: 22000, arbRear: 16000, rideOffset: 0 },
    tires: { radius: 0.33, widthFront: 245, widthRear: 265, compound: 'street', gripFront: 1.0, gripRear: 1.0 },
    brakes: { maxTorque: 9000, bias: 0.64, handbrake: 2500 },
    aero: { cd: 0.32, frontalArea: 2.1, clFront: 0.1, clRear: 0.12 },
    steering: { maxAngle: 0.6, rate: 2.5 },
    nitro: 0.35,
  };
}

function run(sim: VehicleSim, seconds: number, fn?: (t: number) => void) {
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    fn?.(t);
    sim.step(dt);
  }
}

describe('VehicleSim', () => {
  it('settles on its suspension without drifting', () => {
    const sim = new VehicleSim(testSpec(), new FlatWorld());
    sim.reset(0, 0.6, 0, 0);
    run(sim, 3);
    expect(sim.speed).toBeLessThan(0.05);
    expect(sim.position.y).toBeGreaterThan(0.3);
    expect(sim.position.y).toBeLessThan(0.7);
    expect(Math.abs(sim.position.x) + Math.abs(sim.position.z)).toBeLessThan(0.1);
    for (const w of sim.wheels) expect(w.contact).toBe(true);
  });

  for (const layout of ['FWD', 'RWD', 'AWD'] as const) {
    it(`${layout} accelerates to 100 km/h in a plausible time and reaches a top speed`, () => {
      const sim = new VehicleSim(testSpec(layout), new FlatWorld());
      sim.reset(0, 0.6, 0, 0);
      run(sim, 1);
      let t100 = -1;
      let t = 0;
      sim.input.throttle = 1;
      run(sim, 40, (tt) => {
        t = tt;
        if (t100 < 0 && sim.forwardSpeed * 3.6 >= 100) t100 = tt;
      });
      const top = sim.forwardSpeed * 3.6;
      console.log(layout, '0-100', t100.toFixed(2), 's  top', top.toFixed(0), 'km/h gear', sim.powertrain.gear, 'x', sim.position.x.toFixed(2));
      expect(t100).toBeGreaterThan(3);
      expect(t100).toBeLessThan(9);
      expect(top).toBeGreaterThan(200);
      expect(top).toBeLessThan(320);
      // drives straight
      expect(Math.abs(sim.position.x)).toBeLessThan(5);
    });
  }

  it('brakes from 100 km/h in a realistic distance', () => {
    const sim = new VehicleSim(testSpec(), new FlatWorld());
    sim.reset(0, 0.6, 0, 0);
    run(sim, 1);
    sim.input.throttle = 1;
    let t = 0;
    while (sim.forwardSpeed * 3.6 < 100 && t < 30) {
      sim.step(1 / 120);
      t += 1 / 120;
    }
    sim.input.throttle = 0;
    const z0 = sim.position.z;
    const v0 = sim.forwardSpeed * 3.6;
    sim.input.brake = 1;
    t = 0;
    while (sim.forwardSpeed > 0.3 && t < 10) {
      sim.step(1 / 120);
      t += 1 / 120;
    }
    const dist = Math.abs(sim.position.z - z0) * (100 / v0) ** 2;
    console.log('braking 100-0 approx', dist.toFixed(1), 'm from', v0.toFixed(0));
    expect(dist).toBeGreaterThan(28);
    expect(dist).toBeLessThan(50);
  });

  it('turns in the commanded direction', () => {
    const sim = new VehicleSim(testSpec(), new FlatWorld());
    sim.reset(0, 0.6, 0, 0);
    run(sim, 1);
    sim.input.throttle = 0.5;
    run(sim, 4);
    sim.input.steer = 1;
    sim.input.throttle = 0.3;
    run(sim, 2);
    // right turn: heading should decrease (rotation is clockwise from above)
    expect(sim.position.x).toBeGreaterThan(1);
    expect(sim.heading).toBeLessThan(-0.3);
  });

  it('RWD oversteers more than FWD under power in a corner', () => {
    const yaw: Record<string, number> = {};
    for (const layout of ['FWD', 'RWD'] as const) {
      const sim = new VehicleSim(testSpec(layout), new FlatWorld());
      sim.assists = { abs: false, tcs: false, stability: false, steering: false, autoGear: true };
      sim.reset(0, 0.6, 0, 0);
      run(sim, 1);
      sim.input.throttle = 0.6;
      run(sim, 3.5);
      sim.input.steer = 0.6;
      sim.input.throttle = 1;
      let maxSlip = 0;
      run(sim, 2.5, () => (maxSlip = Math.max(maxSlip, Math.abs(sim.bodySlip))));
      yaw[layout] = maxSlip;
    }
    console.log('max body slip', yaw);
    expect(yaw.RWD).toBeGreaterThan(yaw.FWD);
  });

  it('handbrake induces rotation', () => {
    const sim = new VehicleSim(testSpec('RWD'), new FlatWorld());
    sim.assists.stability = false;
    sim.reset(0, 0.6, 0, 0);
    run(sim, 1);
    sim.input.throttle = 1;
    run(sim, 4);
    sim.input.throttle = 0;
    sim.input.steer = 0.7;
    sim.input.handbrake = true;
    let maxSlip = 0;
    run(sim, 1.2, () => (maxSlip = Math.max(maxSlip, Math.abs(sim.bodySlip))));
    expect(maxSlip).toBeGreaterThan(0.3);
  });

  it('reverses when holding brake at standstill', () => {
    const sim = new VehicleSim(testSpec(), new FlatWorld());
    sim.reset(0, 0.6, 0, 0);
    run(sim, 1);
    sim.input.brake = 1;
    run(sim, 3);
    expect(sim.powertrain.gear).toBe(-1);
    expect(sim.forwardSpeed).toBeLessThan(-2);
  });
  it('automatic gearbox does not upshift on wheelspin alone', () => {
    const spec = testSpec('RWD');
    spec.engine.peakTorque = 900;
    const sim = new VehicleSim(spec, new FlatWorld());
    sim.reset(0, 0.6, 0, 0);
    sim.assists.tcs = false;
    run(sim, 1);
    sim.input.throttle = 1;
    let maxGearSlow = 0;
    run(sim, 3, () => {
      if (sim.forwardSpeed * 3.6 < 25) maxGearSlow = Math.max(maxGearSlow, sim.powertrain.gear);
    });
    expect(maxGearSlow).toBe(1);
  });
});
