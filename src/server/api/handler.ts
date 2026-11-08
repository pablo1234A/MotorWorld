import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { sql } from "kysely";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorMessage } from "@/lib/error-messages";
import { loadSubscription, type SubscriptionState } from "@/server/auth/context";
import { withSystem } from "@/server/db/client";
import { DomainError, mapDatabaseError } from "@/server/db/errors";
import { dynamicRequest } from "@/server/http/dynamic";
import { logger } from "@/server/logger";
import { consumeRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

import { type ApiScope, apiConfigured, findKeyByHash, hashKey, parseKey, sameHash } from "./keys";

/**
 * Envoltorio de cada endpoint de /api/v1:
 *   request_id → clave (Bearer) → plan con API → límite de peticiones →
 *   scope → Idempotency-Key (POST) → endpoint → registro (sin cuerpos).
 * La clave actúa con los permisos del administrador que la creó, comprobados
 * en cada petición (si deja de ser administrador, la clave deja de servir):
 * se reutilizan los mismos servicios, RLS y límites del plan que el panel.
 * El organization_id nunca llega del cliente: sale de la clave.
 */

export interface ApiPrincipal {
  keyId: string;
  orgId: string;
  scopes: ApiScope[];
  /** null = todas las sucursales del taller */
  branchIds: string[] | null;
  ctx: {
    auth: { userId: string };
    membership: { organizationId: string; memberId: string; role: "admin"; permissions: [] };
    subscription: SubscriptionState;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message ?? code);
  }
}

export type ApiResult = { status?: number; body: unknown; headers?: Record<string, string> };

const MAX_BODY = 64 * 1024;
const requestId = () => `req_${randomBytes(12).toString("base64url")}`;

function json(status: number, body: unknown, rid: string, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "X-Request-Id": rid, "Cache-Control": "no-store", ...headers } });
}

function errorBody(e: ApiError, rid: string) {
  return { error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), request_id: rid } };
}

/** DomainError / zod → error de la API (estable y sin detalles internos). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof z.ZodError) {
    const fields: Record<string, string[]> = {};
    for (const i of err.issues) (fields[i.path.join(".") || "_"] ??= []).push(i.message);
    return new ApiError(400, "validation_error", "Los datos no son válidos", fields);
  }
  const d = err instanceof DomainError ? err : mapDatabaseError(err);
  const msg = errorMessage(d.code, d.detail);
  switch (d.code) {
    case "validation_error":
      return new ApiError(400, "validation_error", msg);
    case "not_found":
      return new ApiError(404, "not_found", "No existe");
    case "permission_denied":
      return new ApiError(403, "forbidden", msg);
    case "conflict":
      return new ApiError(409, "conflict", msg);
    case "integrity_violation":
      return new ApiError(409, "conflict", msg);
    case "plan_limit_reached":
      return new ApiError(422, "plan_limit_reached", msg);
    case "subscription_inactive":
      return new ApiError(403, "subscription_inactive", msg);
    case "feature_unavailable":
      return new ApiError(403, "plan_feature_unavailable", msg);
    default:
      return new ApiError(500, "internal_error", "Error interno");
  }
}

const unauthenticated = () => new ApiError(401, "unauthenticated", "Clave de API no válida, caducada o revocada");

async function authenticate(request: Request): Promise<ApiPrincipal> {
  if (!apiConfigured()) throw new ApiError(503, "api_not_configured", "La API no está configurada en esta instalación");
  const header = request.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!parseKey(key)) throw unauthenticated();
  const hash = hashKey(key);
  const row = await findKeyByHash(hash);
  if (!row || !sameHash(Buffer.from(row.key_hash), hash) || row.revoked_at || (row.expires_at && row.expires_at < new Date()) || !row.created_by) {
    throw unauthenticated();
  }
  const owner = await withSystem(async (tx) => {
    const { rows } = await sql<{ member_id: string; api: boolean }>`
      select m.id as member_id, app.has_feature(m.organization_id, 'api') as api
        from organization_members m join organizations o on o.id = m.organization_id
       where m.organization_id = ${row.organization_id} and m.user_id = ${row.created_by} and m.status = 'active' and m.role = 'admin'
         and o.status = 'active'
    `.execute(tx);
    return rows[0];
  });
  if (!owner) throw new ApiError(401, "unauthenticated", "La persona que creó esta clave ya no es administradora del taller: crea una clave nueva");
  if (!owner.api) throw new ApiError(403, "plan_feature_unavailable", "La API está incluida en el plan Excelencia");
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 60_000) {
    void withSystem((tx) => tx.updateTable("api_keys").set({ last_used_at: new Date() }).where("id", "=", row.id).execute()).catch(() => undefined);
  }
  return {
    keyId: row.id,
    orgId: row.organization_id,
    scopes: row.scopes as ApiScope[],
    branchIds: row.branch_ids,
    ctx: {
      auth: { userId: row.created_by },
      membership: { organizationId: row.organization_id, memberId: owner.member_id, role: "admin", permissions: [] },
      subscription: await loadSubscription({ id: row.created_by }, row.organization_id),
    },
  };
}

async function readJson(request: Request): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) throw new ApiError(413, "payload_too_large", "Máximo 64 KB");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new ApiError(413, "payload_too_large", "Máximo 64 KB");
  if (!text) return {};
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new ApiError(415, "unsupported_media_type", "Envía JSON (Content-Type: application/json)");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request", "JSON mal formado");
  }
}

export interface ApiContext {
  principal: ApiPrincipal;
  url: URL;
  body: unknown;
  params: Record<string, string>;
}

interface Options {
  route: string;
  scope: ApiScope;
}

type Handler = (c: ApiContext) => Promise<ApiResult>;

export function apiRoute(opts: Options, handler: Handler) {
  return async (request: Request, segment?: { params: Promise<Record<string, string>> }): Promise<Response> => {
    // Siempre dinámica: nunca se pregenera ni se cachea una respuesta de la API.
    await dynamicRequest();
    const rid = requestId();
    const started = Date.now();
    let principal: ApiPrincipal | null = null;
    let status = 500;
    try {
      principal = await authenticate(request);
      const allowed =
        (await consumeRateLimit(`api:key:${principal.keyId}`, RATE_LIMITS.apiPerKey)) && (await consumeRateLimit(`api:org:${principal.orgId}`, RATE_LIMITS.apiPerOrg));
      if (!allowed) {
        status = 429;
        return json(429, errorBody(new ApiError(429, "rate_limited", "Demasiadas peticiones: espera unos segundos"), rid), rid, {
          "Retry-After": "2",
          "RateLimit-Limit": "60",
          "RateLimit-Remaining": "0",
        });
      }
      if (!principal.scopes.includes(opts.scope)) throw new ApiError(403, "forbidden", `La clave no tiene el permiso ${opts.scope}`);

      const body = request.method === "GET" ? undefined : await readJson(request);
      const params = segment ? await segment.params : {};
      const run = async () => handler({ principal: principal!, url: new URL(request.url), body, params });

      const idemKey = request.method === "POST" ? request.headers.get("idempotency-key") : null;
      const result = idemKey ? await idempotent(principal.keyId, idemKey, `${request.method} ${new URL(request.url).pathname} ${JSON.stringify(body)}`, run) : await run();
      status = result.status ?? 200;
      return json(status, result.body, rid, result.headers);
    } catch (err) {
      unstable_rethrow(err);
      const e = toApiError(err);
      status = e.status;
      if (e.status >= 500) logger.error("api_request_failed", { route: opts.route, requestId: rid, error: err });
      return json(e.status, errorBody(e, rid), rid);
    } finally {
      if (principal) {
        const p = principal;
        const latency = Date.now() - started;
        void withSystem((tx) =>
          tx
            .insertInto("api_request_logs")
            .values({ organization_id: p.orgId, api_key_id: p.keyId, request_id: rid, method: request.method, route: opts.route, status, latency_ms: latency })
            .execute(),
        ).catch((err) => logger.warn("api_log_failed", { error: err }));
      }
    }
  };
}

/** Idempotency-Key (24 h): misma clave + misma petición → misma respuesta, sin repetir el efecto. */
async function idempotent(keyId: string, idemKey: string, fingerprint: string, run: () => Promise<ApiResult>): Promise<ApiResult> {
  if (idemKey.length > 200) throw new ApiError(400, "bad_request", "Idempotency-Key demasiado larga (máx. 200)");
  const hash = createHash("sha256").update(fingerprint).digest();
  const claimed = await withSystem(async (tx) => {
    const { rows } = await sql<{ ok: number }>`
      insert into private.api_idempotency (api_key_id, idem_key, request_hash) values (${keyId}, ${idemKey}, ${hash})
      on conflict (api_key_id, idem_key) do update set request_hash = excluded.request_hash, status = null, response = null, created_at = now()
        where private.api_idempotency.created_at < now() - interval '24 hours'
      returning 1 as ok
    `.execute(tx);
    return rows.length > 0;
  });
  if (!claimed) {
    const prev = await withSystem(async (tx) => {
      const { rows } = await sql<{ request_hash: Buffer; status: number | null; response: unknown }>`
        select request_hash, status, response from private.api_idempotency where api_key_id = ${keyId} and idem_key = ${idemKey}
      `.execute(tx);
      return rows[0];
    });
    if (!prev || !sameHash(Buffer.from(prev.request_hash), hash)) throw new ApiError(409, "idempotency_conflict", "Esa Idempotency-Key ya se usó con otra petición");
    if (prev.status === null) throw new ApiError(409, "idempotency_in_progress", "La petición original todavía se está procesando");
    return { status: prev.status, body: prev.response, headers: { "Idempotent-Replayed": "true" } };
  }
  try {
    const result = await run();
    await withSystem((tx) =>
      sql`update private.api_idempotency set status = ${result.status ?? 200}, response = ${JSON.stringify(result.body)}::jsonb where api_key_id = ${keyId} and idem_key = ${idemKey}`.execute(tx),
    );
    return result;
  } catch (err) {
    const e = toApiError(err);
    if (e.status >= 500) {
      await withSystem((tx) => sql`delete from private.api_idempotency where api_key_id = ${keyId} and idem_key = ${idemKey}`.execute(tx)).catch(() => undefined);
    } else {
      await withSystem((tx) =>
        sql`update private.api_idempotency set status = ${e.status}, response = ${JSON.stringify({ error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } })}::jsonb where api_key_id = ${keyId} and idem_key = ${idemKey}`.execute(tx),
      ).catch(() => undefined);
    }
    throw err;
  }
}

// ------------------------------------------------------------------ utilidades

export const LIMIT_MAX = 100;

export function pageParams(url: URL): { limit: number; cursor: { at: string; id: string } | null } {
  const raw = Number(url.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(raw) || raw < 1 || raw > LIMIT_MAX) throw new ApiError(400, "validation_error", `limit tiene que estar entre 1 y ${LIMIT_MAX}`);
  const c = url.searchParams.get("cursor");
  let cursor: { at: string; id: string } | null = null;
  if (c) {
    try {
      const [at, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
      if (!at || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
      cursor = { at, id };
    } catch {
      throw new ApiError(400, "validation_error", "cursor no válido");
    }
  }
  return { limit: raw, cursor };
}

export function nextCursor<T extends { created_at: Date; id: string }>(rows: T[], limit: number): string | null {
  if (rows.length <= limit) return null;
  const last = rows[limit - 1];
  return Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString("base64url");
}

export function uuidParam(v: string | null | undefined, name = "id"): string {
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ApiError(404, "not_found", "No existe");
  void name;
  return v;
}

/** Comprueba que la sucursal está permitida para la clave (si la clave está limitada). */
export function assertBranch(p: ApiPrincipal, branchId: string): void {
  if (p.branchIds && !p.branchIds.includes(branchId)) throw new ApiError(404, "not_found", "No existe");
}
