import { describe, expect, it, vi } from 'vitest';
import { MemoryBackend, SaveSystem } from '../../src/save/SaveSystem';

vi.stubGlobal('window', undefined);

describe('SaveSystem', () => {
  it('round-trips and alternates slots', () => {
    const be = new MemoryBackend();
    const s = new SaveSystem<{ version: number; v: number }>(be, 'k', 1);
    s.save({ version: 1, v: 1 });
    s.save({ version: 1, v: 2 });
    expect(be.data.size).toBe(2);
    const s2 = new SaveSystem<{ version: number; v: number }>(be, 'k', 1);
    expect(s2.load()!.v).toBe(2);
  });
  it('recovers from a corrupted newest slot', () => {
    const be = new MemoryBackend();
    const s = new SaveSystem<{ version: number; v: number }>(be, 'k', 1);
    s.save({ version: 1, v: 1 });
    s.save({ version: 1, v: 2 });
    // corrupt slot B (seq 2)
    const raw = be.get('k_A')!;
    be.set('k_A', raw.slice(0, raw.length / 2));
    const s2 = new SaveSystem<{ version: number; v: number }>(be, 'k', 1);
    const got = s2.load()!;
    expect([1, 2]).toContain(got.v);
    // tamper checksum
    const env = JSON.parse(be.get('k_B')!);
    env.data = env.data.replace('"v":1', '"v":999');
    be.set('k_B', JSON.stringify(env));
    expect(new SaveSystem<any>(be, 'k', 1).load()).toBeNull();
  });
  it('migrates old versions', () => {
    const be = new MemoryBackend();
    new SaveSystem<any>(be, 'm', 0).save({ version: 0, a: 1 });
    const s = new SaveSystem<any>(be, 'm', 2, { 0: (d) => ({ ...d, version: 1, b: 2 }), 1: (d) => ({ ...d, version: 2, c: 3 }) });
    expect(s.load()).toEqual({ version: 2, a: 1, b: 2, c: 3 });
  });
});
