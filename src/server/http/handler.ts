import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { checkRateLimit, clientIp, type RateLimitRule } from "@/server/security/rate-limit";
import { ApiError } from "./errors";

type RouteContext<P> = { params: Promise<P> };
type Handler<P> = (request: Request, params: P) => Promise<Response>;

type RouteOptions = {
  /** Límite por IP aplicado antes de ejecutar el handler. */
  rateLimit?: RateLimitRule;
  /** Desactiva la comprobación de origen (solo webhooks/cron con autenticación propia). */
  skipOriginCheck?: boolean;
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defensa CSRF: las peticiones que modifican estado deben originarse en la propia
 * aplicación. Se combina con cookies SameSite=Lax y con cuerpos JSON.
 */
function assertSameOrigin(request: Request) {
  if (!MUTATING.has(request.method)) return;
  const origin = request.headers.get("origin");
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getEnv().NEXT_PUBLIC_APP_URL).origin);
  } catch {
    /* URL de app no válida: se usa solo el host de la petición */
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (!origin || !allowed.has(origin)) {
    throw new ApiError("forbidden", "Origen de la petición no permitido.");
  }
}

export function errorResponse(error: unknown, request?: Request): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  // Errores internos: se registran completos y se devuelve un mensaje genérico.
  logger.error("api.unhandled_error", { path: request ? new URL(request.url).pathname : undefined, method: request?.method, error });
  return NextResponse.json(
    { error: { code: "internal_error", message: "Ha ocurrido un error inesperado. Inténtalo de nuevo." } },
    { status: 500 },
  );
}

/** Envoltorio común de los Route Handlers: origen, rate limit y errores homogéneos. */
export function route<P = Record<string, never>>(handler: Handler<P>, options: RouteOptions = {}) {
  return async (request: Request, context: RouteContext<P>): Promise<Response> => {
    try {
      if (!options.skipOriginCheck) assertSameOrigin(request);
      if (options.rateLimit && !(await checkRateLimit(options.rateLimit, clientIp(request)))) {
        throw new ApiError("rate_limited", "Demasiadas peticiones. Espera un momento e inténtalo de nuevo.");
      }
      const params = await context.params;
      return await handler(request, params);
    } catch (error) {
      return errorResponse(error, request);
    }
  };
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

const MAX_JSON_BYTES = 3 * 1024 * 1024;

/** Lee y valida un cuerpo JSON con Zod. Devuelve errores por campo. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_JSON_BYTES) throw new ApiError("payload_too_large", "La petición es demasiado grande.");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("bad_request", "El cuerpo de la petición no es JSON válido.");
  }
  return validate(schema, raw);
}

export function validate<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      fields[path] ??= issue.message;
    }
    const first = Object.values(fields)[0];
    throw new ApiError("validation_error", first ?? "Revisa los datos enviados.", { fields });
  }
  return result.data;
}

export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return validate(schema, params);
}

/** Límite adicional por usuario autenticado (además del límite por IP). */
export async function limitUser(rule: RateLimitRule, userId: string) {
  if (!(await checkRateLimit(rule, `user:${userId}`))) {
    throw new ApiError("rate_limited", "Has realizado demasiadas operaciones seguidas. Espera un momento.");
  }
}

/** Traduce errores de PostgREST/PostgreSQL a errores de API seguros. */
export function fromDbError(error: { code?: string; message: string; details?: string | null }, fallback = "No se pudo completar la operación."): ApiError {
  switch (error.code) {
    case "AP001":
      return new ApiError("limit_reached", `Has alcanzado el límite de productos de tu plan. ${error.details ?? ""}`.trim());
    case "AP002":
      return new ApiError("validation_error", "La categoría seleccionada no es válida.");
    case "AP003":
      return new ApiError("limit_reached", `Has alcanzado el límite de plantillas de tu plan. ${error.details ?? ""}`.trim());
    case "AP004":
      return new ApiError("validation_error", "La plantilla seleccionada no es válida.");
    case "23505":
      return new ApiError("conflict", "Ya existe un registro con esos datos (por ejemplo, el mismo SKU).");
    case "23503":
      return new ApiError("validation_error", "El recurso relacionado no existe.");
    case "23514":
    case "22001":
    case "22P02":
      return new ApiError("validation_error", "Alguno de los datos enviados no es válido.");
    case "42501":
      return new ApiError("forbidden", "No tienes permiso para realizar esta acción.");
    case "PGRST116":
      return new ApiError("not_found", "El recurso no existe o no tienes acceso.");
    default:
      logger.error("db.error", { code: error.code, message: error.message });
      return new ApiError("internal_error", fallback);
  }
}
