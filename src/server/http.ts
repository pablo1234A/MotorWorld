import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer) must match the
 * host the request was sent to. SameSite=Lax cookies already block most cross-site posts.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Origen no permitido.");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Origen no permitido.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(403, "Origen no permitido.");
  }
}

export async function requireUser(req?: Request): Promise<CurrentUser> {
  if (req) assertSameOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
  return user;
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new HttpError(400, "El cuerpo de la petición no es JSON válido.");
  }
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Datos no válidos.", r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

/** Wraps a route handler with uniform error handling (never leaks stack traces). */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, details: e.details }, e.status);
      console.error("[api]", e);
      return json({ error: "Error interno. Inténtalo de nuevo." }, 500);
    }
  };
}

/** Small in-memory fixed-window rate limiter (per process). */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) throw new HttpError(429, "Demasiadas peticiones. Espera un momento.");
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? u.host;
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
