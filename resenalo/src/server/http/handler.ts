import { env } from "../env";
import { reportError } from "../logger";
import { AppError } from "./errors";

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx) => Promise<Response>;

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Protección CSRF para rutas autenticadas por cookie: las peticiones que
 * modifican estado deben originarse en nuestro propio dominio (cabecera Origin
 * o, en su defecto, Referer). Se combina con cookies SameSite=Lax.
 */
export function assertSameOrigin(req: Request) {
  if (!UNSAFE.has(req.method)) return;
  const allowed = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== allowed) throw new AppError("FORBIDDEN", "Origen de la petición no permitido.");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === allowed) return;
    } catch {
      /* noop */
    }
  }
  throw new AppError("FORBIDDEN", "Origen de la petición no permitido.");
}

export function errorResponse(err: unknown, req?: Request): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
    if (err.retryAfter) headers["retry-after"] = String(err.retryAfter);
    return new Response(JSON.stringify({ error: { code: err.code, message: err.message, details: err.details ?? undefined } }), {
      status: err.status,
      headers,
    });
  }
  void reportError(err, { path: req ? new URL(req.url).pathname : undefined, method: req?.method });
  return Response.json({ error: { code: "INTERNAL", message: "Se ha producido un error inesperado. Inténtalo de nuevo." } }, { status: 500 });
}

/** Envoltorio común de los route handlers: CSRF + gestión de errores sin filtrar información interna. */
export function route(handler: Handler, opts: { csrf?: boolean } = {}): Handler {
  return async (req, ctx) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}
