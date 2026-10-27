import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGen';
import { TrafficControl } from '../../src/world/TrafficControl';

describe('traffic control', async () => {
  const w = await generateWorld();
  const tc = new TrafficControl(w.roads);

  it('signalises the city grid and puts STOP/YIELD on minor approaches elsewhere', () => {
    const sig = tc.intersections.filter((i) => i.signal);
    expect(sig.length).toBeGreaterThan(40);
    for (const i of sig) expect(i.approaches.every((a) => a.control === 'signal')).toBe(true);
    const minor = tc.intersections.filter((i) => !i.signal).flatMap((i) => i.approaches).filter((a) => a.control === 'stop' || a.control === 'yield');
    expect(minor.length).toBeGreaterThan(0);
  });

  it('never gives green to crossing directions at the same time', () => {
    for (let t = 0; t < 120; t += 0.5) {
      tc.time = t;
      for (const i of tc.intersections.filter((x) => x.signal)) {
        const a = tc.light(i, 0).state, b = tc.light(i, 1).state;
        expect(a === 'green' && b === 'green').toBe(false);
        expect(a !== 'red' && b !== 'red').toBe(false);
      }
    }
  });

  it('red stops, yellow stops only with room to brake, and the next stop line is found ahead', () => {
    const i = tc.intersections.find((x) => x.signal)!;
    const a = i.approaches[0];
    // find a time where this approach is red, then yellow
    let tRed = 0, tYel = 0;
    for (let t = 0; t < 60; t += 0.25) {
      tc.time = t;
      const s = tc.light(i, a.group).state;
      if (s === 'red' && !tRed) tRed = t;
      if (s === 'yellow' && !tYel) tYel = t;
    }
    tc.time = tRed;
    expect(tc.canGo(a, 30, 10)).toBe(false);
    tc.time = tYel;
    expect(tc.canGo(a, 60, 10)).toBe(false); // plenty of room: stop
    expect(tc.canGo(a, 2, 15)).toBe(true); // too close: go through
    const n = tc.next(a.road, a.s - a.dir * 40, a.dir, 90);
    expect(n).not.toBeNull();
    expect(Math.abs(n!.ds - 40)).toBeLessThan(1);
  });
});
