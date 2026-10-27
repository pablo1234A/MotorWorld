import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGen';
import { getEvent } from '../../src/race/EventCatalog';
import { Route } from '../../src/race/Route';
import { Ground } from '../../src/world/Ground';
import { VehicleSim } from '../../src/physics/VehicleSim';
import { getCar } from '../../src/vehicles/CarCatalog';
import { resolveSpec } from '../../src/vehicles/Tuning';
import { RacerAI } from '../../src/ai/RacerAI';
import { CollisionSystem } from '../../src/physics/CollisionSystem';

describe('racer AI', async () => {
  const w = await generateWorld();
  const ground = new Ground(w, null);
  for (const [ev, car, maxT] of [['e_gp', 'kensei_raiden', 140], ['e_hillclimb', 'petra_hot', 160], ['e_first', 'brannock_thunder', 80]] as const) {
    it(`completes ${ev} in ${car} without leaving the road`, () => {
      const e = getEvent(ev);
      const route = new Route(w.roads, e.legs, e.closed);
      const sim = new VehicleSim(resolveSpec(getCar(car), {}), ground);
      sim.reset(route.x[2], route.y[2] + 1.0, route.z[2], route.heading(2));
      const ai = new RacerAI(sim, route, { name: 'T', skill: 0.95, style: 'clean', mistakes: 0 });
      const col = new CollisionSystem();
      const dt = 1 / 120;
      let t = 0, maxErr = 0, resets = 0;
      const goal = route.closed ? route.length : route.length - 10;
      while (t < maxT && ai.progress < goal) {
        ai.update(dt, [], 0);
        sim.step(dt);
        col.resolve([sim], [], ground);
        t += dt;
        const pr = route.project(sim.position.x, sim.position.z, ai.idx, 20);
        if (sim.age > 2) maxErr = Math.max(maxErr, Math.abs(pr.lat) - route.hw[pr.i]);
        if (ai.needsReset) {
          resets++;
          ai.resetToRoute();
        }
      }
      console.log(ev, car, 'time', t.toFixed(1), 'progress', ai.progress.toFixed(0), '/', goal.toFixed(0), 'avg', (ai.progress / t * 3.6).toFixed(0), 'km/h maxOff', maxErr.toFixed(1), 'resets', resets);
      expect(ai.progress).toBeGreaterThanOrEqual(goal * 0.99);
      expect(resets).toBe(0);
    }, 120000);
  }
});
