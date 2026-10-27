import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGen';
import { EVENTS } from '../../src/race/EventCatalog';
import { Route } from '../../src/race/Route';

describe('event routes', async () => {
  const w = await generateWorld();
  for (const e of EVENTS) {
    it(`${e.id} builds a continuous route`, () => {
      const r = new Route(w.roads, e.legs, e.closed);
      let maxGap = 0;
      for (let i = 1; i < r.n; i++) maxGap = Math.max(maxGap, Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]));
      const closeGap = e.closed ? Math.hypot(r.x[0] - r.x[r.n - 1], r.z[0] - r.z[r.n - 1]) : 0;
      console.log(e.id.padEnd(16), 'len', r.length.toFixed(0), 'maxGap', maxGap.toFixed(1), 'close', closeGap.toFixed(1), 'cps', r.checkpoints.length);
      expect(r.length).toBeGreaterThan(400);
      expect(maxGap).toBeLessThan(25);
      expect(closeGap).toBeLessThan(25);
    });
  }
});
