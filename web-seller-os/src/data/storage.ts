import type { AppState } from './types';

/**
 * Capa de persistencia.
 *
 * La app nunca habla directamente con localStorage: lo hace a través de un
 * StorageAdapter. Para conectar un backend real (Supabase, Firebase, una API
 * REST propia…) basta con implementar esta interfaz y pasarla a <StoreProvider>.
 * Ver RemoteAdapter más abajo como punto de partida.
 */
export interface StorageAdapter {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'web-seller-os:v1';

export class LocalStorageAdapter implements StorageAdapter {
  async load(): Promise<AppState | null> {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  }
  async save(state: AppState): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[storage] No se pudo guardar', e);
      throw e;
    }
  }
  async clear(): Promise<void> {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }
}

/**
 * Adaptador para un backend HTTP. Espera un endpoint que devuelva/acepte el
 * AppState completo como JSON:
 *   GET  {baseUrl}/state   → AppState | 404
 *   PUT  {baseUrl}/state   ← AppState
 *   DELETE {baseUrl}/state
 * Es deliberadamente simple: cuando el volumen crezca, sustitúyelo por
 * endpoints por colección (prospects, items, activities…).
 */
export class RemoteAdapter implements StorageAdapter {
  constructor(
    private baseUrl: string,
    private token?: string,
  ) {}
  private headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }
  async load() {
    const r = await fetch(`${this.baseUrl}/state`, { headers: this.headers() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`load ${r.status}`);
    return (await r.json()) as AppState;
  }
  async save(state: AppState) {
    const r = await fetch(`${this.baseUrl}/state`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(state),
    });
    if (!r.ok) throw new Error(`save ${r.status}`);
  }
  async clear() {
    await fetch(`${this.baseUrl}/state`, { method: 'DELETE', headers: this.headers() });
  }
}

export function downloadJson(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `web-seller-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
