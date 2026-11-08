import "server-only";

import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Remitente por sucursal (compartido o dominio propio verificado), resumen
 * a la empresa y lista de direcciones bloqueadas. RLS: solo administradores.
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export interface SenderSettings {
  branchId: string;
  branchName: string;
  senderMode: "shared" | "custom_domain";
  sendingDomainId: string | null;
  digestFrequency: "off" | "daily" | "weekly";
  replyToEmail: string | null;
}

export async function getSenderSettings(ctx: Ctx, branchId: string): Promise<SenderSettings | null> {
  const row = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("branch_settings as s")
      .innerJoin("branches as b", "b.id", "s.branch_id")
      .select([
        "s.branch_id as branchId",
        "b.name as branchName",
        "s.sender_mode as senderMode",
        "s.sending_domain_id as sendingDomainId",
        "s.digest_frequency as digestFrequency",
        sql<string | null>`s.reply_to_email::text`.as("replyToEmail"),
      ])
      .where("s.organization_id", "=", ctx.membership.organizationId)
      .where("s.branch_id", "=", branchId)
      .where("b.status", "=", "active")
      .executeTakeFirst(),
  );
  return row ? (row as SenderSettings) : null;
}

export async function updateSenderSettings(
  ctx: Ctx,
  input: { branchId: string; senderMode: "shared" | "custom_domain"; sendingDomainId: string | null; digestFrequency: "off" | "daily" | "weekly" },
): Promise<void> {
  assertWritable(ctx);
  if (input.senderMode === "custom_domain" && !input.sendingDomainId) throw new DomainError("validation_error", "sending_domain_not_verified");
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("branch_settings")
      .set({
        sender_mode: input.senderMode,
        sending_domain_id: input.senderMode === "custom_domain" ? input.sendingDomainId : null,
        digest_frequency: input.digestFrequency,
      })
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "=", input.branchId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

export interface SuppressionRow {
  email: string;
  reason: string;
  createdAt: Date;
}

export async function listSuppressions(ctx: Ctx, limit = 200): Promise<SuppressionRow[]> {
  return withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("email_suppressions")
      .select([sql<string>`email::text`.as("email"), "reason", "created_at as createdAt"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute(),
  );
}

/** Bloqueo manual (la empresa no quiere escribir a esa dirección). */
export async function addSuppression(ctx: Ctx, email: string): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, (tx) =>
    tx.insertInto("email_suppressions").values({ organization_id: ctx.membership.organizationId, email, reason: "manual" }).execute(),
  );
}

/**
 * Solo se pueden quitar los bloqueos manuales. Rebotes, quejas y bajas no:
 * la persona tiene que volver a darse de alta con la empresa (y la empresa
 * cambiar el correo si era erróneo). RLS lo impone.
 */
export async function removeSuppression(ctx: Ctx, email: string): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .deleteFrom("email_suppressions")
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("email", "=", email)
      .where("reason", "=", "manual")
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw new DomainError("not_found");
  });
}
