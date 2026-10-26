import { it } from 'vitest';
import { FlatWorld } from '../src/physics/PhysicsWorld';
import { VehicleSim } from '../src/physics/VehicleSim';
import { getCar } from '../src/vehicles/CarCatalog';
import { resolveSpec } from '../src/vehicles/Tuning';
it('dbg', () => {
  for (const tcs of [true, false]) {
  const sim = new VehicleSim(resolveSpec(getCar('halden_vektor'), {}), new FlatWorld());
  sim.assists.tcs = tcs;
  sim.reset(0, 0.7, 0, 0);
  const dt = 1/120;
  for (let i = 0; i < 120*9; i++) {
    if (i === 90) sim.input.throttle = 1;
    sim.step(dt);
    if (i % 30 === 0 && i >= 90) {
      const w = sim.wheels;
      console.log(tcs, ((i-90)*dt).toFixed(2), 'v', (sim.forwardSpeed*3.6).toFixed(1), 'rpm', sim.powertrain.rpm.toFixed(0), 'g', sim.powertrain.gear, 'cl', sim.powertrain.clutch.toFixed(2), 'Te', sim.powertrain.engineTorque.toFixed(0), 'boost', sim.powertrain.boost.toFixed(2),
        'Td', w.map(x=>x.driveTorque.toFixed(0)).join(','), 'fx', w.map(x=>x.fx.toFixed(0)).join(','), 'fz', w.map(x=>x.load.toFixed(0)).join(','), 'sr', w.map(x=>x.slipRatio.toFixed(2)).join(','));
    }
  }}
});
