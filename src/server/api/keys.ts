import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { sql } from "kysely";

import { planHasFeature } from "@/lib/plans";
import type { OrgContext } from "@/server/auth/context";
import { assertOrgAdmin } from "@/server/auth/db-guards";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

/**
 * Claves de la API (plan Excelencia). Formato: ry_test_<8>_<32> (o ry_live_
 * en producción). En la base de datos solo se guarda el HMAC-SHA-256 de la
 * clave con API_KEY_PEPPER: si alguien lee la tabla no obtiene claves
 * utilizables. La clave completa se muestra UNA vez, al crearla.
 */

export const API_SCOPES = [
  "customers:read",
  "customers:write",
  "vehicles:read",
  "vehicles:write",
  "maintenance:read",
  "maintenance:write",
  "appointments:read",
  "appointments:write",
  "reminders:read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "customers:read": "Ver clientes",
  "customers:write": "Crear y editar clientes",
  "vehicles:read": "Ver vehículos",
  "vehicles:write": "Crear y editar vehículos y kilómetros",
  "maintenance:read": "Ver el historial",
  "maintenance:write": "Añadir revisiones al historial",
  "appointments:read": "Ver citas",
  "appointments:write": "Crear, confirmar y cancelar citas",
  "reminders:read": "Ver avisos",
};

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const KEY_RE = /^(ry_(?:test|live)_[a-z0-9]{8})_([A-Za-z0-9]{32})$/;
export const MAX_KEYS_PER_ORG = 20;

function randomString(n: number, alphabet: string): string {
  const bytes = randomBytes(n * 2);
  let out = "";
  for (let i = 0; out.length < n && i < bytes.length; i++) {
    // Rechazo de sesgo: solo bytes que caben un número entero de veces.
    const max = 256 - (256 % alphabet.length);
    if (bytes[i] < max) out += alphabet[bytes[i] % alphabet.length];
  }
  return out.length === n ? out : randomString(n, alphabet);
}

function pepper(): string {
  const p = process.env.API_KEY_PEPPER;
  if (!p || p.length < 32) throw new DomainError("integration_not_configured", "api_key_pepper");
  return p;
}

export function apiConfigured(): boolean {
  return Boolean(process.env.API_KEY_PEPPER && process.env.API_KEY_PEPPER.length >= 32);
}

export function hashKey(key: string): Buffer {
  return createHmac("sha256", pepper()).update(key).digest();
}

export function keyMode(): "live" | "test" {
  return process.env.APP_ENV === "production" ? "live" : "test";
}

export function generateKey(mode = keyMode()): { prefix: string; key: string } {
  const prefix = `ry_${mode}_${randomString(8, ALPHABET)}`;
  return { prefix, key: `${prefix}_${randomString(32, ALPHABET + "ABCDEFGHIJKLMNOPQRSTUVWXYZ")}` };
}

export function parseKey(key: string): { prefix: string } | null {
  const m = KEY_RE.exec(key);
  return m ? { prefix: m[1] } : null;
}

export function sameHash(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

type Ctx = Pick<OrgContext, "auth" | "membership" | "subscription">;

export function apiAvailable(ctx: Pick<Ctx, "subscription">): boolean {
  return Boolean(ctx.subscription.active && ctx.subscription.planCode && planHasFeature(ctx.subscription.planCode, "api"));
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  branchIds: string[] | null;
  createdBy: string | null;
  createdByEmail: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listApiKeys(ctx: Ctx): Promise<ApiKeyRow[]> {
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("api_keys as k")
      .leftJoin("profiles as p", "p.id", "k.created_by")
      .select(["k.id", "k.name", "k.prefix", "k.scopes", "k.branch_ids", "k.created_by", sql<string | null>`p.email::text`.as("email"), "k.last_used_at", "k.expires_at", "k.revoked_at", "k.created_at"])
      .where("k.organization_id", "=", ctx.membership.organizationId)
      .orderBy("k.revoked_at", (ob) => ob.desc().nullsFirst())
      .orderBy("k.created_at", "desc")
      .execute(),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes as ApiScope[],
    branchIds: r.branch_ids,
    createdBy: r.created_by,
    createdByEmail: r.email,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }));
}

export async function createApiKey(
  ctx: Ctx,
  input: { name: string; scopes: ApiScope[]; branchIds: string[] | null; expiresAt: Date | null },
): Promise<{ id: string; key: string; prefix: string }> {
  await assertOrgAdmin(ctx);
  if (!apiAvailable(ctx)) throw new DomainError("feature_unavailable", "api");
  if (!input.scopes.length) throw new DomainError("validation_error", "api_scopes");
  const orgId = ctx.membership.organizationId;
  const { key, prefix } = generateKey();
  const hash = hashKey(key);
  const id = await withRls(ctx.auth, async (tx) => {
    const active = await tx
      .selectFrom("api_keys")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("organization_id", "=", orgId)
      .where("revoked_at", "is", null)
      .executeTakeFirstOrThrow();
    if (Number(active.n) >= MAX_KEYS_PER_ORG) throw new DomainError("validation_error", "api_key_limit");
    if (input.branchIds?.length) {
      const ok = await tx.selectFrom("branches").select("id").where("organization_id", "=", orgId).where("id", "in", input.branchIds).execute();
      if (ok.length !== new Set(input.branchIds).size) throw new DomainError("validation_error", "invalid_branches");
    }
    const row = await tx
      .insertInto("api_keys")
      .values({
        organization_id: orgId,
        name: input.name,
        prefix,
        key_hash: hash,
        scopes: input.scopes,
        branch_ids: input.branchIds?.length ? input.branchIds : null,
        created_by: ctx.auth.userId,
        expires_at: input.expiresAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await sql`select app.write_audit(${orgId}::uuid, 'api_key.created', 'api_key', ${row.id}, ${JSON.stringify({ prefix, scopes: input.scopes })}::jsonb)`.execute(tx);
    return row.id;
  });
  return { id, key, prefix };
}

export async function revokeApiKey(ctx: Ctx, id: string): Promise<void> {
  await assertOrgAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const r = await tx
      .updateTable("api_keys")
      .set({ revoked_at: new Date() })
      .where("id", "=", id)
      .where("organization_id", "=", orgId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("not_found");
    await sql`select app.write_audit(${orgId}::uuid, 'api_key.revoked', 'api_key', ${id}, '{}'::jsonb)`.execute(tx);
  });
}

/** Uso de la API en los últimos 30 días (para el panel). */
export async function apiUsage(ctx: Ctx): Promise<{ requests: number; errors: number }> {
  const r = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("api_request_logs")
      .select([sql<string>`count(*)`.as("n"), sql<string>`count(*) filter (where status >= 400)`.as("e")])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("created_at", ">", sql<Date>`now() - interval '30 days'`)
      .executeTakeFirstOrThrow(),
  );
  return { requests: Number(r.n), errors: Number(r.e) };
}

/** Uso interno de la autenticación (conexión del sistema). */
export async function findKeyByHash(hash: Buffer) {
  return withSystem((tx) =>
    tx
      .selectFrom("api_keys")
      .select(["id", "organization_id", "key_hash", "scopes", "branch_ids", "created_by", "expires_at", "revoked_at", "last_used_at"])
      .where("key_hash", "=", hash)
      .executeTakeFirst(),
  );
}
