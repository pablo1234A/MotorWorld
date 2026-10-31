"use client";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string>, readonly details?: unknown) {
    super(message);
  }
}

/** Cliente HTTP del panel. Las cookies de sesión viajan automáticamente (same-origin). */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* noop */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } } } | null)?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/v1/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    // Algunas rutas devuelven un resultado de negocio con estado HTTP de error (p. ej. 402 por límite del plan).
    const flat = data as { message?: string; reason?: string } | null;
    throw new ApiError(res.status, err?.code ?? flat?.reason ?? "ERROR", err?.message ?? flat?.message ?? "No se pudo completar la operación.", err?.details?.fields, err?.details ?? data);
  }
  return data as T;
}
