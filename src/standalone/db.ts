/**
 * Tiny key-value store for the single-file edition: IndexedDB (large quota, works from file://
 * in Chromium and Firefox), falling back to localStorage, then to memory.
 */
const DB_NAME = "world-builder-ai";
const STORE = "kv";

type Backend = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void>; del(k: string): Promise<void>; keys(): Promise<string[]>; kind: string };

function idbBackend(): Promise<Backend> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((res, rej) => {
          const r = fn(db.transaction(STORE, mode).objectStore(STORE));
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      resolve({
        kind: "IndexedDB",
        get: (k) => tx("readonly", (s) => s.get(k)),
        set: async (k, v) => void (await tx("readwrite", (s) => s.put(v, k))),
        del: async (k) => void (await tx("readwrite", (s) => s.delete(k))),
        keys: async () => (await tx("readonly", (s) => s.getAllKeys())).map(String),
      });
    };
  });
}

function localBackend(): Backend {
  const prefix = "wb:";
  localStorage.setItem(prefix + "__probe", "1");
  return {
    kind: "localStorage",
    get: async (k) => {
      const v = localStorage.getItem(prefix + k);
      return v === null ? undefined : JSON.parse(v);
    },
    set: async (k, v) => localStorage.setItem(prefix + k, JSON.stringify(v)),
    del: async (k) => localStorage.removeItem(prefix + k),
    keys: async () => Object.keys(localStorage).filter((k) => k.startsWith(prefix) && k !== prefix + "__probe").map((k) => k.slice(prefix.length)),
  };
}

function memoryBackend(): Backend {
  const m = new Map<string, unknown>();
  return { kind: "memoria (no persistente)", get: async (k) => structuredClone(m.get(k)) as never, set: async (k, v) => void m.set(k, structuredClone(v)), del: async (k) => void m.delete(k), keys: async () => [...m.keys()] };
}

let backend: Promise<Backend> | null = null;
export function db(): Promise<Backend> {
  if (!backend)
    backend = idbBackend().catch(() => {
      try {
        return localBackend();
      } catch {
        return memoryBackend();
      }
    });
  return backend;
}
