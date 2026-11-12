/** Cliente HTTP mínimo para llamar a la API propia desde componentes de cliente. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
    this.fields = (this.details.fields as Record<string, string> | undefined) ?? {};
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; formData?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? (options.body || options.formData ? "POST" : "GET"), signal: options.signal, credentials: "same-origin" };
  if (options.formData) init.body = options.formData;
  else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "network_error", "No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.");
  }
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; details?: unknown } } | null;
  if (!response.ok || !payload || payload.error) {
    if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiClientError(response.status, payload?.error?.code ?? "unknown", payload?.error?.message ?? "Ha ocurrido un error inesperado.", payload?.error?.details);
  }
  return payload.data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ha ocurrido un error inesperado.";
}

/** Clave de idempotencia para operaciones que consumen cuota. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
