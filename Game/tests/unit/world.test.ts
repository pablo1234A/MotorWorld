import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGen';
import { RF } from '../../src/world/RoadNetwork';

describe('world generation', () => {
  it('generates terrain, roads and consistent queries', async () => {
    const t0 = performance.now();
    const w = await generateWorld();
    const dt = performance.now() - t0;
    console.log('world gen ms', dt.toFixed(0));
    const { hm, roads } = w;
    // city is flat at ~8
    expect(Math.abs(hm.heightAt(650, 0) - 8)).toBeLessThan(0.6);
    // sea in the far east
    expect(hm.heightAt(2000, 0)).toBeLessThan(0);
    // mountains are high
    let maxH = -1e9;
    for (let k = 0; k < hm.h.length; k++) maxH = Math.max(maxH, hm.h[k]);
    console.log('max height', maxH.toFixed(1));
    expect(maxH).toBeGreaterThan(200);
    for (const r of roads.roads) {
      let tunnels = 0, bridges = 0, rails = 0, maxStep = 0;
      for (let i = 0; i < r.n; i++) {
        if (r.flags[i] & RF.tunnel) tunnels++;
        if (r.flags[i] & RF.bridge) bridges++;
        if (r.flags[i] & (RF.railL | RF.railR)) rails++;
        if (i > 0) maxStep = Math.max(maxStep, Math.abs(r.py[i] - r.py[i - 1]));
        if (i === 0 && r.loop) maxStep = Math.max(maxStep, Math.abs(r.py[0] - r.py[r.n - 1]));
      }
      if (!r.def.id.startsWith('st_'))
        console.log(r.def.id.padEnd(10), 'len', r.length.toFixed(0).padStart(6), 'tunnel', (tunnels * 2).toString().padStart(5), 'bridge', (bridges * 2).toString().padStart(5), 'rails', rails * 2, 'maxStep', maxStep.toFixed(3), 'y', Math.min(...r.py).toFixed(0), Math.max(...r.py).toFixed(0), 'junctions', r.junctions.length);
      expect(maxStep).toBeLessThan(0.4);
    }
    // road query returns the road under a road point
    const hw = roads.byId('hw');
    const hit = roads.nearest(hw.px[100], hw.pz[100], 2);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.y - hw.py[100])).toBeLessThan(0.1);
  }, 60000);
});
