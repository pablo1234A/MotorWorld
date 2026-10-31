"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Carga de datos del backend con estados de carga/error y recarga manual. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const ctrl = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const d = await api<T>(path, { signal: c.signal });
      setData(d);
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e as ApiError);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
    return () => ctrl.current?.abort();
  }, [reload]);
  return { data, error, loading, reload, setData };
}
