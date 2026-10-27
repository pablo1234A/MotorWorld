/**
 * Crash-safe local persistence.
 * - Two alternating slots (A/B) with a sequence number and checksum: a torn/corrupted write
 *   never loses progress, the previous good slot is used instead.
 * - Version field + migrations for future schema changes.
 * - Pluggable storage backend (localStorage by default; in-memory for tests).
 */
export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class LocalStorageBackend implements StorageBackend {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  set(k: string, v: string) {
    localStorage.setItem(k, v);
  }
  remove(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export class MemoryBackend implements StorageBackend {
  data = new Map<string, string>();
  get(k: string) {
    return this.data.get(k) ?? null;
  }
  set(k: string, v: string) {
    this.data.set(k, v);
  }
  remove(k: string) {
    this.data.delete(k);
  }
}

export function checksum(s: string): string {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface Envelope {
  seq: number;
  sum: string;
  data: string;
}

export type Migration = (data: any) => any;

export class SaveSystem<T extends { version: number }> {
  private seq = 0;
  lastError: string | null = null;
  lastSaveAt = 0;

  constructor(
    private backend: StorageBackend,
    private prefix: string,
    private currentVersion: number,
    private migrations: Record<number, Migration> = {},
  ) {}

  private slotKey(slot: 0 | 1) {
    return `${this.prefix}_${slot ? 'B' : 'A'}`;
  }

  private readSlot(slot: 0 | 1): { seq: number; data: T } | null {
    const raw = this.backend.get(this.slotKey(slot));
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as Envelope;
      if (typeof env.seq !== 'number' || typeof env.data !== 'string') return null;
      if (checksum(env.data) !== env.sum) return null;
      const data = JSON.parse(env.data);
      return { seq: env.seq, data };
    } catch {
      return null;
    }
  }

  /** Load the newest valid slot (migrating if needed). Returns null if no valid save exists. */
  load(): T | null {
    const a = this.readSlot(0), b = this.readSlot(1);
    const pick = a && b ? (a.seq >= b.seq ? a : b) : a ?? b;
    if (!pick) return null;
    this.seq = Math.max(a?.seq ?? 0, b?.seq ?? 0);
    let data: any = pick.data;
    let v = data.version ?? 0;
    while (v < this.currentVersion) {
      const m = this.migrations[v];
      if (!m) break;
      data = m(data);
      v = data.version;
    }
    return data as T;
  }

  /** Persist into the older slot. Returns true on success. */
  save(data: T): boolean {
    try {
      const json = JSON.stringify(data);
      const env: Envelope = { seq: this.seq + 1, sum: checksum(json), data: json };
      const slot = ((this.seq + 1) % 2) as 0 | 1;
      this.backend.set(this.slotKey(slot), JSON.stringify(env));
      this.seq++;
      this.lastError = null;
      this.lastSaveAt = Date.now();
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  wipe() {
    this.backend.remove(this.slotKey(0));
    this.backend.remove(this.slotKey(1));
    this.seq = 0;
  }
}
