import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('window', undefined);
import { MemoryBackend } from '../../src/save/SaveSystem';
import { levelFromXp, Profile, xpForLevel } from '../../src/progression/Profile';

describe('Profile', () => {
  it('persists progression across "app restarts"', () => {
    const be = new MemoryBackend();
    const p = new Profile(be);
    expect(p.isNew).toBe(true);
    p.addCash(100000);
    p.addXp(5000);
    const car = p.currentCar;
    expect(p.installPart(car, 'turbo', 2)).toBe(true);
    const bought = p.buyCar('ridgeback_trail');
    expect(bought).not.toBeNull();
    p.flush();
    const p2 = new Profile(be);
    expect(p2.isNew).toBe(false);
    expect(p2.data.cars.length).toBe(2);
    expect(p2.data.cars[0].parts.turbo).toBe(2);
    expect(p2.level).toBe(p.level);
    expect(p2.data.cash).toBe(p.data.cash);
  });
  it('level curve is monotonic', () => {
    for (let l = 1; l < 50; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(7))).toBe(7);
  });
  it('rejects unaffordable purchases', () => {
    const p = new Profile(new MemoryBackend());
    expect(p.buyCar('aurion_zenith')).toBeNull();
  });
});
