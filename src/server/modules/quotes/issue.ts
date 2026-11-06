import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { formatDate } from "@/lib/dates";
import { renderWorkshopEmail } from "@/lib/email/reminder-email";
import { formatEuro } from "@/lib/quotes/money";
import type { OrgContext } from "@/server/auth/context";
import { withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { resolveWorkshopSender } from "@/server/email/sender";
import { logger } from "@/server/logger";
import type { NotifyOutcome } from "@/server/modules/appointments/notify";
import type { ServiceCtx } from "@/server/modules/branches/service";
import { logoUrl } from "@/server/modules/organizations/profile";
import { renderQuotePdf } from "@/server/quotes/pdf";
import { getObject, putObject, removeObject } from "@/server/storage";

import { buildSnapshot, getQuote, markIssued } from "./service";

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;
interface Deps {
  email: EmailPort | null;
  sender: SenderConfig | null;
}

/**
 * Emitir: congela los datos (taller, cliente, vehículo), genera el PDF, lo
 * guarda (bucket privado "documents") y pasa el presupuesto a "emitido".
 * Si algo falla, no queda ni el PDF ni el cambio de estado.
 */
export async function issueQuote(ctx: Ctx, id: string): Promise<void> {
  const q = await getQuote(ctx, id);
  if (!q) throw new DomainError("not_found");
  if (q.status !== "draft") throw new DomainError("validation_error", "quote_not_editable");
  const snapshot = await buildSnapshot(ctx, q);
  const pdf = await renderQuotePdf({ ...q, status: "sent" }, snapshot);
  const path = `${ctx.membership.organizationId}/quotes/${q.number}-${randomUUID().slice(0, 8)}.pdf`;
  await putObject("documents", path, pdf, "application/pdf");
  try {
    await markIssued(ctx, id, snapshot, path);
  } catch (err) {
    await removeObject("documents", path).catch(() => undefined);
    throw err;
  }
}

/** PDF para descargar: el guardado si está emitido; si es borrador, uno al momento con la marca "BORRADOR". */
export async function quotePdf(ctx: Ctx, id: string): Promise<{ body: Buffer; filename: string } | null> {
  const q = await getQuote(ctx, id);
  if (!q) return null;
  if (q.pdfPath) {
    const stored = await getObject("documents", q.pdfPath);
    if (stored) return { body: stored.body, filename: `presupuesto-${q.number}.pdf` };
  }
  const snapshot = q.snapshot ?? (await buildSnapshot(ctx, q));
  return { body: await renderQuotePdf(q, snapshot), filename: `presupuesto-${q.number}${q.status === "draft" ? "-borrador" : ""}.pdf` };
}

/** Envía el presupuesto emitido al cliente con el PDF adjunto (cuenta en el consumo). */
export async function emailQuote(ctx: Ctx, id: string, deps: Deps): Promise<NotifyOutcome> {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
  const q = await getQuote(ctx, id);
  if (!q) throw new DomainError("not_found");
  if (q.status === "draft" || !q.snapshot || !q.pdfPath) throw new DomainError("validation_error", "quote_not_issued");
  if (!deps.email || !deps.sender) return "not_configured";
  const to = q.snapshot.customer.email;
  if (!to) return "no_email";
  const orgId = ctx.membership.organizationId;

  const suppressed = await withSystem(async (tx) => {
    const { rows } = await sql<{ x: boolean }>`
      select exists (select 1 from email_suppressions where organization_id = ${orgId} and email = ${to}
                     and reason in ('hard_bounce', 'complaint', 'manual')) as x
    `.execute(tx);
    return rows[0].x;
  });
  if (suppressed) return "suppressed";
  const pdf = await getObject("documents", q.pdfPath);
  if (!pdf) return "failed";

  const period = await withSystem(async (tx) => {
    const { rows } = await sql<{ p: string | null }>`select app.reserve_usage(${orgId}::uuid, 'emails')::text as p`.execute(tx);
    return rows[0]?.p ?? null;
  });
  if (!period) return "quota";

  const w = q.snapshot.workshop;
  const rendered = renderWorkshopEmail({
    template: {
      subject: `Presupuesto ${q.number} de ${w.name}`,
      body:
        `Hola ${q.snapshot.customer.name.split(" ")[0]}, te enviamos el presupuesto ${q.number}` +
        `${q.snapshot.vehicle ? ` para tu ${q.snapshot.vehicle.name ?? "vehículo"} (${q.snapshot.vehicle.plate})` : ""}.\n\n` +
        `Importe total: ${formatEuro(q.total)} (IVA incluido). Válido hasta el ${formatDate(q.validUntil)}.\n\n` +
        `Lo tienes adjunto en PDF. Si quieres que hagamos el trabajo o tienes cualquier duda, responde a este correo.\n\n${w.name}.`,
      buttonLabel: "",
      buttonEnabled: false,
    },
    vars: {},
    workshop: { name: w.name, brandColor: w.brandColor, phone: w.phone, email: w.email, address: w.address, logoUrl: logoUrl(deps.sender.appUrl, orgId, w.logoPath) },
    unsubscribeUrl: null,
  });
  const sender = await withSystem((tx) => resolveWorkshopSender(tx, orgId, deps.sender!, q.branchId));
  const result = await deps.email
    .send({
      from: sender.from,
      to,
      replyTo: sender.replyTo ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      idempotencyKey: `quote-${q.id}-${randomUUID()}`,
      tags: { kind: "quote", organization_id: orgId },
      attachments: [{ filename: `presupuesto-${q.number}.pdf`, content: pdf.body, contentType: "application/pdf" }],
    })
    .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));

  await withSystem(async (tx) => {
    if (result.kind !== "accepted") await sql`select app.release_usage(${orgId}::uuid, 'emails', ${period}::date)`.execute(tx);
    await tx
      .insertInto("email_logs")
      .values({
        organization_id: orgId,
        branch_id: q.branchId,
        customer_id: q.customer.id,
        vehicle_id: q.vehicle?.id ?? null,
        kind: "quote",
        to_email: to,
        from_email: sender.fromAddress,
        reply_to: sender.replyTo,
        subject: rendered.subject,
        provider: deps.email!.name,
        provider_message_id: result.kind === "accepted" ? result.messageId : null,
        status: result.kind === "accepted" ? "accepted" : "failed",
        error_code: result.kind === "accepted" ? null : result.code.slice(0, 100),
        sent_at: result.kind === "accepted" ? new Date() : null,
      })
      .execute();
  }).catch((err) => logger.error("quote_email_log_failed", { quoteId: id, error: err }));
  return result.kind === "accepted" ? "sent" : "failed";
}
