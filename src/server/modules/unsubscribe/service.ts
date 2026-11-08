import "server-only";

import { withSystem } from "@/server/db/client";
import { verifyUnsubscribeToken } from "@/server/email/links";

/**
 * Baja de avisos desde el enlace del correo (y one-click, RFC 8058). Idempotente:
 * repetirla no cambia nada. Marca al cliente, añade su correo a la lista de
 * supresión de la empresa y cancela sus avisos pendientes.
 */

export interface UnsubscribeTarget {
  customerId: string;
  workshopName: string;
  alreadyOptedOut: boolean;
}

function secret(): string | null {
  const s = process.env.EMAIL_LINK_SECRET;
  return s && s.length >= 32 ? s : null;
}

export async function resolveUnsubscribe(token: string): Promise<UnsubscribeTarget | null> {
  const key = secret();
  const customerId = key ? verifyUnsubscribeToken(token, key) : null;
  if (!customerId) return null;
  const row = await withSystem((tx) =>
    tx
      .selectFrom("customers as c")
      .innerJoin("organizations as o", "o.id", "c.organization_id")
      .select(["c.id", "o.trade_name", "c.reminders_opt_out"])
      .where("c.id", "=", customerId)
      .executeTakeFirst(),
  );
  return row ? { customerId: row.id, workshopName: row.trade_name, alreadyOptedOut: row.reminders_opt_out } : null;
}

export async function unsubscribe(token: string): Promise<UnsubscribeTarget | null> {
  const target = await resolveUnsubscribe(token);
  if (!target) return null;
  await withSystem(async (tx) => {
    const c = await tx
      .updateTable("customers")
      .set({ reminders_opt_out: true, opted_out_at: new Date() })
      .where("id", "=", target.customerId)
      .where("reminders_opt_out", "=", false)
      .returning(["organization_id", "email"])
      .executeTakeFirst();
    const row =
      c ??
      (await tx.selectFrom("customers").select(["organization_id", "email"]).where("id", "=", target.customerId).executeTakeFirstOrThrow());
    if (row.email) {
      await tx
        .insertInto("email_suppressions")
        .values({ organization_id: row.organization_id, email: row.email, reason: "unsubscribe" })
        .onConflict((oc) => oc.columns(["organization_id", "email"]).doNothing())
        .execute();
    }
    await tx
      .updateTable("reminders")
      .set({ status: "skipped", skip_reason: "opted_out" })
      .where("customer_id", "=", target.customerId)
      .where("status", "in", ["scheduled", "retrying"])
      .execute();
    if (c) {
      await tx
        .insertInto("audit_logs")
        .values({ organization_id: row.organization_id, actor_type: "system", action: "customer.unsubscribed", resource_type: "customers", resource_id: target.customerId })
        .execute();
    }
  });
  return { ...target, alreadyOptedOut: true };
}
