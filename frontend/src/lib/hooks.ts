"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { api, errMsg } from "./api";
import type { Asset, Generation, Model, Provider, User } from "./types";

export function useMe() {
  return useQuery<User>({ queryKey: ["me"], queryFn: () => api("/api/me"), retry: false, staleTime: 60_000 });
}

export function useModels(params: { task?: string; category?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery<{ items: Model[]; tasks: Record<string, string> }>({
    queryKey: ["models", qs],
    queryFn: () => api(`/api/models${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
  });
}

export function useProviders(live = false) {
  return useQuery<{ items: Provider[] }>({ queryKey: ["providers", live], queryFn: () => api(`/api/providers?live=${live}`), staleTime: 30_000 });
}

export function useOptions() {
  return useQuery<any>({ queryKey: ["options"], queryFn: () => api("/api/options"), staleTime: Infinity });
}

export function useAssets(filters: Record<string, string | boolean | number | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery<{ items: Asset[]; total: number }>({ queryKey: ["assets", qs], queryFn: () => api(`/api/assets?${qs}`) });
}

const ACTIVE = new Set(["queued", "processing"]);

export function useGenerations(filters: Record<string, string | boolean | number | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return useQuery<{ items: Generation[]; total: number }>({
    queryKey: ["generations", qs],
    queryFn: () => api(`/api/generations?${qs}`),
    refetchInterval: (q) => (q.state.data?.items.some((g) => ACTIVE.has(g.status)) ? 2000 : false),
  });
}

/** Poll a job until it finishes; invalidates dependent caches on completion. */
export function useJob(id: string | null | undefined, onDone?: (g: Generation) => void) {
  const qc = useQueryClient();
  const q = useQuery<Generation>({
    queryKey: ["generation", id],
    queryFn: () => api(`/api/generations/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data && !ACTIVE.has(query.state.data.status) ? false : 1500),
  });
  const status = q.data?.status;
  useEffect(() => {
    if (!q.data || ACTIVE.has(q.data.status)) return;
    qc.invalidateQueries({ queryKey: ["generations"] });
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["active-jobs"] });
    onDone?.(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q.data?.id]);
  return q;
}

export function useActiveJobs() {
  return useQuery<{ items: Generation[]; total: number }>({
    queryKey: ["active-jobs"],
    queryFn: () => api("/api/generations?active=true&limit=20"),
    refetchInterval: (q) => ((q.state.data?.total ?? 0) > 0 ? 2000 : 10000),
  });
}

export function useCreateGeneration(onCreated?: (g: Generation) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Generation>("/api/generations", { method: "POST", json: body }),
    onSuccess: (g) => {
      qc.invalidateQueries({ queryKey: ["active-jobs"] });
      qc.invalidateQueries({ queryKey: ["generations"] });
      onCreated?.(g);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export function useJobActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["generations"] });
    qc.invalidateQueries({ queryKey: ["generation"] });
    qc.invalidateQueries({ queryKey: ["active-jobs"] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return {
    cancel: (id: string) => run(() => api(`/api/generations/${id}/cancel`, { method: "POST" }), "Cancelación solicitada"),
    retry: (id: string) => run(() => api(`/api/generations/${id}/retry`, { method: "POST" }), "Reintento en cola"),
    duplicate: (id: string) => run(() => api(`/api/generations/${id}/duplicate`, { method: "POST", json: {} }), "Duplicado en cola"),
    save: (id: string, v: boolean) => run(() => api(`/api/generations/${id}`, { method: "PATCH", json: { is_saved: v } }), v ? "Guardado" : "Quitado de guardados"),
    remove: (id: string, outputs: boolean) => run(() => api(`/api/generations/${id}?delete_outputs=${outputs}`, { method: "DELETE" }), "Eliminado"),
    favorite: (assetId: string, v: boolean) =>
      run(() => api(`/api/assets/${assetId}`, { method: "PATCH", json: { is_favorite: v } }), v ? "Añadido a favoritos" : "Quitado de favoritos"),
  };
}
