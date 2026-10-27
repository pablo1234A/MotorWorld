/**
 * IndexedDB cache for the generated island (heightmap, surfaces, road profiles) so that
 * second and later launches skip terrain generation. Any failure simply falls back to generating.
 */
const DB = 'motorworld-cache';
const STORE = 'world';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export interface CachedWorld {
  key: string;
  h: Float32Array;
  surf: Uint8Array;
  roads: { py: Float32Array; flags: Uint8Array }[];
}

export async function loadWorldCache(key: string): Promise<CachedWorld | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await open();
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get('island');
      r.onsuccess = () => res(r.result && r.result.key === key ? (r.result as CachedWorld) : null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function saveWorldCache(data: CachedWorld): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, 'island');
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* storage full or unavailable: ignore */
  }
}
