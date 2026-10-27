/** IndexedDB persistence for the browser edition: the SQLite image + every media file. */
const DB_NAME = 'ai-product-company';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const idb = () => (dbp ??= open());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return idb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadAll(): Promise<{ db: Uint8Array | null; files: [string, Uint8Array][] }> {
  try {
    const db = (await tx<Uint8Array>('kv', 'readonly', (s) => s.get('sqlite'))) ?? null;
    const keys = ((await tx<IDBValidKey[]>('files', 'readonly', (s) => s.getAllKeys())) ?? []) as string[];
    const values = ((await tx<Uint8Array[]>('files', 'readonly', (s) => s.getAll())) ?? []) as Uint8Array[];
    return { db, files: keys.map((k, i) => [k, values[i]]) };
  } catch (err) {
    console.warn('[persist] storage unavailable, running in memory only', err);
    return { db: null, files: [] };
  }
}

export const saveDb = (data: Uint8Array) => tx('kv', 'readwrite', (s) => s.put(data, 'sqlite')).catch((e) => console.warn('[persist] db', e));
export const putFile = (path: string, data: Uint8Array) => tx('files', 'readwrite', (s) => s.put(data, path)).catch((e) => console.warn('[persist] file', e));
export const deleteFile = (path: string) => tx('files', 'readwrite', (s) => s.delete(path)).catch(() => {});
export async function wipe() {
  await tx('kv', 'readwrite', (s) => s.clear());
  await tx('files', 'readwrite', (s) => s.clear());
}
