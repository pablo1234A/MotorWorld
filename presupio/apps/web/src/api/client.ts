// Cliente HTTP único de la aplicación. La sesión viaja en una cookie HttpOnly gestionada
// por el navegador: aquí no se guarda ni se lee ningún token.

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Errores por campo, para mostrarlos junto a cada input. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) if (d.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'No se ha encontrado lo que buscas.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (status >= 500) return 'El servidor no ha podido completar la operación. Inténtalo de nuevo en unos minutos.';
  return 'No se ha podido completar la operación.';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: ApiErrorDetail[]; requestId?: string } } | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR'),
      err?.message ?? fallbackMessage(res.status),
      Array.isArray(err?.details) ? err.details : [],
      err?.requestId ?? res.headers.get('x-request-id'),
    );
  }
  if (data === undefined || typeof data !== 'object') {
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'El servidor ha devuelto una respuesta inesperada.');
  }
  return data as T;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

/** Construye una query string ignorando valores vacíos. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
