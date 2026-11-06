import "server-only";

import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { type DnsRecord, type DomainPort, DomainProviderError, type ProviderDomain } from "@/server/email/domains";
import { logger } from "@/server/logger";
import type { ServiceCtx } from "@/server/modules/branches/service";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import { assertOrgAdmin } from "@/server/auth/db-guards";

/**
 * Dominio propio del taller (modo `custom_domain` del PDF). Solo se usa como
 * remitente cuando el proveedor lo da por VERIFICADO (SPF + DKIM). Mientras
 * tanto, y si deja de estarlo, los avisos salen con el remitente compartido
 * (P1) — lo impone la base de datos (app.validate_sender_mode y
 * app.on_sending_domain_unverified).
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

export const MAX_DOMAINS_PER_ORG = 3;
/** Comprobación automática durante 72 h tras darlo de alta (y luego a diario). */
export const AUTO_CHECK_HOURS = 72;

export interface SendingDomainView {
  id: string;
  domain: string;
  fromLocalPart: string;
  status: string;
  records: DnsRecord[];
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

function requirePort(port: DomainPort | null): DomainPort {
  if (!port) throw new DomainError("email_not_configured");
  return port;
}

function providerFailure(err: unknown): DomainError {
  if (err instanceof DomainProviderError && err.status >= 400 && err.status < 500 && err.status !== 429) {
    return new DomainError("validation_error", "domain_rejected", { cause: err });
  }
  return new DomainError("email_send_failed", "domain", { cause: err });
}

export async function listDomains(ctx: Ctx): Promise<SendingDomainView[]> {
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("sending_domains")
      .select(["id", sql<string>`domain::text`.as("domain"), "from_local_part", "status", "dns_records", "verified_at", "last_checked_at", "created_at"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .orderBy("created_at")
      .execute(),
  );
  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    fromLocalPart: r.from_local_part,
    status: r.status,
    records: (Array.isArray(r.dns_records) ? r.dns_records : []) as unknown as DnsRecord[],
    verifiedAt: r.verified_at,
    lastCheckedAt: r.last_checked_at,
    createdAt: r.created_at,
  }));
}

/** El dominio pertenece al taller del usuario (RLS: solo administradores lo ven). */
async function ownDomain(ctx: Ctx, id: string): Promise<{ id: string; providerDomainId: string | null }> {
  const row = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("sending_domains")
      .select(["id", "provider_domain_id"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .executeTakeFirst(),
  );
  if (!row) throw new DomainError("not_found");
  return { id: row.id, providerDomainId: row.provider_domain_id };
}

export async function addDomain(ctx: Ctx, input: { domain: string; fromLocalPart: string }, port: DomainPort | null): Promise<string> {
  assertWritable(ctx);
  const provider = requirePort(port);
  await assertOrgAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  const existing = await listDomains(ctx);
  if (existing.some((d) => d.domain === input.domain)) throw new DomainError("conflict", "sending_domains_unique");
  if (existing.length >= MAX_DOMAINS_PER_ORG) throw new DomainError("validation_error", "too_many_domains");
  await enforceRateLimits([[`domain-create:org:${orgId}`, RATE_LIMITS.domainCreatesPerOrg]]);

  let remote: ProviderDomain;
  try {
    remote = await provider.create(input.domain);
  } catch (err) {
    throw providerFailure(err);
  }
  try {
    // Los usuarios no pueden insertar dominios directamente (solo este flujo).
    return await withSystem(async (tx) => {
      const row = await tx
        .insertInto("sending_domains")
        .values({
          organization_id: orgId,
          domain: input.domain,
          from_local_part: input.fromLocalPart,
          provider: provider.name,
          provider_domain_id: remote.id,
          status: remote.status,
          dns_records: JSON.stringify(remote.records),
          verified_at: remote.status === "verified" ? new Date() : null,
          last_checked_at: new Date(),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await sql`select app.write_audit(${orgId}::uuid, 'sending_domain.created', 'sending_domain', ${row.id}, ${JSON.stringify({ domain: input.domain })}::jsonb)`.execute(tx);
      return row.id;
    });
  } catch (err) {
    // No dejar el dominio huérfano en el proveedor.
    await provider.remove(remote.id).catch((e) => logger.warn("domain_cleanup_failed", { error: e }));
    throw err;
  }
}

async function refresh(id: string, providerDomainId: string, provider: DomainPort, triggerVerify: boolean): Promise<string> {
  if (triggerVerify) await provider.verify(providerDomainId);
  const remote = await provider.get(providerDomainId);
  await withSystem((tx) =>
    tx
      .updateTable("sending_domains")
      .set({
        status: remote.status,
        dns_records: JSON.stringify(remote.records),
        verified_at: remote.status === "verified" ? sql`coalesce(verified_at, now())` : null,
        last_checked_at: new Date(),
      })
      .where("id", "=", id)
      .execute(),
  );
  return remote.status;
}

/** Botón "Comprobar ahora". */
export async function checkDomain(ctx: Ctx, id: string, port: DomainPort | null): Promise<string> {
  assertWritable(ctx);
  const provider = requirePort(port);
  await assertOrgAdmin(ctx);
  const d = await ownDomain(ctx, id);
  if (!d.providerDomainId) throw new DomainError("not_found");
  await enforceRateLimits([[`domain-check:org:${ctx.membership.organizationId}`, RATE_LIMITS.domainChecksPerOrg]]);
  try {
    return await refresh(d.id, d.providerDomainId, provider, true);
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw providerFailure(err);
  }
}

export async function removeDomain(ctx: Ctx, id: string, port: DomainPort | null): Promise<void> {
  assertWritable(ctx);
  await assertOrgAdmin(ctx);
  const d = await ownDomain(ctx, id);
  const orgId = ctx.membership.organizationId;
  await withSystem(async (tx) => {
    // Las sucursales que lo usaban vuelven al remitente compartido.
    await tx.updateTable("branch_settings").set({ sender_mode: "shared", sending_domain_id: null }).where("sending_domain_id", "=", d.id).execute();
    await tx.deleteFrom("sending_domains").where("id", "=", d.id).where("organization_id", "=", orgId).execute();
    await sql`select app.write_audit(${orgId}::uuid, 'sending_domain.removed', 'sending_domain', ${d.id}, '{}'::jsonb)`.execute(tx);
  });
  if (port && d.providerDomainId) {
    await port.remove(d.providerDomainId).catch((err) => logger.warn("domain_remote_remove_failed", { error: err }));
  }
}

/**
 * Proceso programado: comprueba los dominios pendientes (cada ejecución,
 * durante 72 h desde el alta) y los verificados (una vez al día; si alguien
 * borra los registros DNS, el taller vuelve al remitente compartido).
 */
export async function checkPendingDomains(port: DomainPort | null, limit = 50): Promise<{ checked: number; verified: number; failed: number }> {
  const stats = { checked: 0, verified: 0, failed: 0 };
  if (!port) return stats;
  const due = await withSystem((tx) =>
    tx
      .selectFrom("sending_domains")
      .select(["id", "provider_domain_id", "status"])
      .where("provider", "=", port.name)
      .where("provider_domain_id", "is not", null)
      .where((eb) =>
        eb.or([
          eb.and([
            eb("status", "in", ["pending", "temporary_failure"]),
            eb("created_at", ">", sql<Date>`now() - make_interval(hours => ${AUTO_CHECK_HOURS})`),
            eb.or([eb("last_checked_at", "is", null), eb("last_checked_at", "<", sql<Date>`now() - interval '25 minutes'`)]),
          ]),
          eb.and([eb("status", "=", "verified"), eb("last_checked_at", "<", sql<Date>`now() - interval '24 hours'`)]),
        ]),
      )
      .orderBy("last_checked_at", "asc")
      .limit(limit)
      .execute(),
  );
  for (const d of due) {
    try {
      const status = await refresh(d.id, d.provider_domain_id!, port, d.status !== "verified");
      stats.checked++;
      if (status === "verified") stats.verified++;
    } catch (err) {
      stats.failed++;
      logger.warn("domain_check_failed", { domainId: d.id, error: err });
    }
  }
  return stats;
}
