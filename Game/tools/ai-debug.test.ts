import { it } from 'vitest';
import { generateWorld } from '../src/world/WorldGen';
import { getEvent } from '../src/race/EventCatalog';
import { Route } from '../src/race/Route';
import { Ground } from '../src/world/Ground';
import { VehicleSim } from '../src/physics/VehicleSim';
import { getCar } from '../src/vehicles/CarCatalog';
import { resolveSpec } from '../src/vehicles/Tuning';
import { RacerAI } from '../src/ai/RacerAI';
import { CollisionSystem } from '../src/physics/CollisionSystem';
it('dbg', async () => {
  const w = await generateWorld();
  const ground = new Ground(w, null);
  for (const [ev, car] of [['e_hillclimb', 'petra_hot']] as const) {
    const e = getEvent(ev);
    const route = new Route(w.roads, e.legs, e.closed);
    const sim = new VehicleSim(resolveSpec(getCar(car), {}), ground);
    sim.reset(route.x[2], route.y[2] + 1.0, route.z[2], route.heading(2));
    const ai = new RacerAI(sim, route, { name: 'T', skill: 0.95, style: 'clean', mistakes: 0 });
    const col = new CollisionSystem();
    let t = 0; const dt = 1 / 120; let k = 0;
    while (t < 160 && ai.progress < route.length - 10) {
      ai.update(dt, [], 0); sim.step(dt); col.resolve([sim], [], ground); t += dt;
      const pr = route.project(sim.position.x, sim.position.z, ai.idx, 20);
      const off = Math.abs(pr.lat) - route.hw[pr.i];
      if ((off > 3 || k % 240 === 0) && k % 30 === 0) console.log(ev, t.toFixed(1), 'i', pr.i, 'lat', pr.lat.toFixed(1), 'v', (sim.forwardSpeed * 3.6).toFixed(0), 'y', sim.position.y.toFixed(1), 'ry', route.y[pr.i].toFixed(1), 'steer', sim.input.steer.toFixed(2), 'thr', sim.input.throttle.toFixed(2), 'brk', sim.input.brake.toFixed(2), 'wog', sim.wheelsOnGround, 'up', sim.getUp(sim.position.clone()).y.toFixed(2), JSON.stringify(Object.fromEntries(Object.entries(ai.dbg).map(([k,v])=>[k,+v.toFixed(2)]))), 'yaw', sim.angularVelocity.y.toFixed(2), 'slip', sim.bodySlip.toFixed(2), 'wsteer', sim.wheels[0].steer.toFixed(3));
      if (off > 8) break;
      k++;
    }
  }
}, 120000);
