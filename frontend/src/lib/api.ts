"use client";

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 50);
      });
  }
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty */
  }
  const d = body?.detail;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const { code, message, ...extra } = d;
    return new ApiError(res.status, code || "error", message || "Error", extra);
  }
  if (typeof d === "string") return new ApiError(res.status, "error", d);
  if (res.status === 413) return new ApiError(413, "too_large", "El archivo es demasiado grande");
  if (res.status >= 500) return new ApiError(res.status, "server", "El servidor no responde. Inténtalo de nuevo en unos segundos.");
  return new ApiError(res.status, "error", `Error ${res.status}`);
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; retry?: boolean } = {}): Promise<T> {
  const { json, retry = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...rest, headers, credentials: "include", body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await tryRefresh()) return api<T>(path, { ...init, retry: false });
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export function uploadFile(file: File, opts: { projectId?: string; onProgress?: (p: number) => void; url?: string } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (opts.projectId) form.append("project_id", opts.projectId);
    const send = (again: boolean) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", opts.url || "/api/assets");
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
      xhr.onload = async () => {
        if (xhr.status === 401 && again && (await tryRefresh())) return send(false);
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* empty */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new ApiError(xhr.status, body?.detail?.code || "upload", body?.detail?.message || `Error ${xhr.status} al subir`));
      };
      xhr.onerror = () => reject(new ApiError(0, "network", "Error de red al subir el archivo"));
      xhr.send(form);
    };
    send(true);
  });
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Error inesperado";
}

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

export const fmtDur = (s?: number | null) => {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
};

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export const fmtUsd = (v?: number | null) => (v == null ? "—" : v === 0 ? "Gratis" : `≈ ${v < 0.01 ? v.toFixed(4) : v.toFixed(2)} $`);
