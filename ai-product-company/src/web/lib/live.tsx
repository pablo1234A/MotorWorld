import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { localTransport } from './transport';

export interface CompanyEvent {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface LiveState {
  /** Increments (throttled) whenever the company changes — pages refetch on it. */
  version: number;
  connected: boolean;
  events: CompanyEvent[];
  subscribe: (fn: (e: CompanyEvent) => void) => () => void;
}

const Ctx = createContext<LiveState>({ version: 0, connected: false, events: [], subscribe: () => () => {} });

/** Real-time link to the company (Server-Sent Events). */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const subs = useRef(new Set<(e: CompanyEvent) => void>());
  const pending = useRef<number | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: number | null = null;
    const onCompany = (e: CompanyEvent) => {
      subs.current.forEach((fn) => fn(e));
      setEvents((prev) => [e, ...prev].slice(0, 200));
      if (pending.current == null) {
        pending.current = window.setTimeout(() => {
          pending.current = null;
          setVersion((v) => v + 1);
        }, 350);
      }
    };
    const local = localTransport();
    if (local) {
      setConnected(true);
      return local.subscribe((type, data) => type === 'company' && onCompany(data as CompanyEvent));
    }
    const connect = () => {
      es = new EventSource('/api/stream');
      es.addEventListener('hello', () => setConnected(true));
      es.addEventListener('company', (msg) => onCompany(JSON.parse((msg as MessageEvent).data) as CompanyEvent));
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, []);

  const subscribe = useCallback((fn: (e: CompanyEvent) => void) => {
    subs.current.add(fn);
    return () => {
      subs.current.delete(fn);
    };
  }, []);

  return <Ctx.Provider value={{ version, connected, events, subscribe }}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);

/** Fetch a resource and keep it fresh as the company changes. */
export function useResource<T>(url: string | null, opts: { live?: boolean } = { live: true }) {
  const { version } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const liveVersion = opts.live === false ? 0 : version;
  useEffect(() => {
    if (!url) return;
    let alive = true;
    api
      .get<T>(url)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, liveVersion, nonce]);
  return { data, error, loading: loading && !data, reload: () => setNonce((n) => n + 1), setData };
}
