import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { formatDate } from "@/lib/dates";
import { renderPlatformEmail } from "@/lib/email/platform-email";
import { withSystem } from "@/server/db/client";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { platformFrom } from "@/server/email/sender";
import { logger } from "@/server/logger";

/**
 * Correos de RevisaYa a los administradores sobre su suscripción (no cuentan
 * en el consumo): cobro fallido y fin de la prueba gratuita. Sin proveedor de
 * correo no se envía nada (el panel también lo muestra).
 */
export async function notifyBilling(organizationId: string, kind: "payment_failed" | "trial_ending", date: Date | null): Promise<number> {
  const email = getEmailProvider();
  const sender = getSenderConfig();
  if (!email || !sender) return 0;
  const info = await withSystem(async (tx) => {
    const { rows } = await sql<{ org_name: string; branch_id: string; emails: string[] }>`
      select o.trade_name as org_name, b.id as branch_id,
             array(select p.email from organization_members m join profiles p on p.id = m.user_id
                    where m.organization_id = o.id and m.role = 'admin' and m.status = 'active' order by m.is_owner desc limit 10) as emails
        from organizations o join branches b on b.organization_id = o.id and b.is_primary
       where o.id = ${organizationId}
    `.execute(tx);
    return rows[0];
  });
  if (!info) return 0;
  const link = { href: new URL("/app/facturacion", sender.appUrl).toString(), label: "Ir a facturación" };
  const day = date ? formatDate(date.toISOString().slice(0, 10)) : null;
  const msg =
    kind === "payment_failed"
      ? renderPlatformEmail({
          title: "No hemos podido cobrar tu suscripción",
          intro: `El cobro de la suscripción de ${info.org_name} a RevisaYa ha fallado. Actualiza la tarjeta: si en 7 días no se ha podido cobrar, el taller pasará a solo lectura y se pausarán los avisos a tus clientes.`,
          link,
        })
      : renderPlatformEmail({
          title: "Tu prueba gratuita termina pronto",
          intro: `La prueba gratuita de ${info.org_name} termina${day ? ` el ${day}` : " en unos días"}. Ese día se hará el primer cobro con la tarjeta que indicaste. Si no quieres continuar, cancela antes desde Facturación.`,
          link,
        });
  const subject = kind === "payment_failed" ? "No hemos podido cobrar tu suscripción" : "Tu prueba gratuita termina pronto";
  const { from, address } = platformFrom(sender);
  let sent = 0;
  for (const to of info.emails) {
    const result = await email
      .send({ from, to, subject, html: msg.html, text: msg.text, headers: {}, idempotencyKey: `billing-${kind}-${randomUUID()}`, tags: { kind: "billing" } })
      .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));
    if (result.kind === "accepted") sent++;
    await withSystem((tx) =>
      tx
        .insertInto("email_logs")
        .values({
          organization_id: organizationId,
          branch_id: info.branch_id,
          kind: "billing",
          to_email: to,
          from_email: address,
          subject,
          provider: email.name,
          provider_message_id: result.kind === "accepted" ? result.messageId : null,
          status: result.kind === "accepted" ? "accepted" : "failed",
          error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
          sent_at: result.kind === "accepted" ? new Date() : null,
        })
        .execute(),
    ).catch((err) => logger.error("billing_email_log_failed", { error: err }));
  }
  return sent;
}
