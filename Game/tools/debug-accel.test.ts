import { it } from 'vitest';
import { FlatWorld } from '../src/physics/PhysicsWorld';
import { VehicleSim } from '../src/physics/VehicleSim';
import { testSpec } from '../tests/unit/physics.test';
it('dbg', () => {
  for (const L of ['AWD','RWD'] as const) {
  const sim = new VehicleSim(testSpec(L), new FlatWorld());
  sim.reset(0, 0.6, 0, 0);
  const dt = 1/120;
  for (let i = 0; i < 120*6; i++) {
    if (i === 120) sim.input.throttle = 1;
    sim.step(dt);
    if (i % 30 === 0) {
      const w = sim.wheels;
      console.log(L, (i*dt).toFixed(2), 'v', (sim.forwardSpeed*3.6).toFixed(1), 'rpm', sim.powertrain.rpm.toFixed(0), 'g', sim.powertrain.gear, 'cl', sim.powertrain.clutch.toFixed(2), 'Te', sim.powertrain.engineTorque.toFixed(0),
        'om', w.map(x=>x.omega.toFixed(1)).join(','), 'Td', w.map(x=>x.driveTorque.toFixed(0)).join(','), 'fx', w.map(x=>x.fx.toFixed(0)).join(','), 'fz', w.map(x=>x.load.toFixed(0)).join(','), 'sr', w.map(x=>x.slipRatio.toFixed(2)).join(','));
    }
  }}
});
