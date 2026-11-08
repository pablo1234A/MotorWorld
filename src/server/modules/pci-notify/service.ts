import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { formatDate, todayIn } from "@/lib/dates";
import { DEFAULT_TEMPLATES, type PciKind, renderWorkshopEmail, type TemplateContent } from "@/lib/email/reminder-email";
import { SEVERITY_LABELS } from "@/lib/pci/labels";
import type { OrgContext } from "@/server/auth/context";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { EmailAttachment, EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { resolveWorkshopSender } from "@/server/email/sender";
import { logger } from "@/server/logger";
import { getIncident } from "@/server/modules/incidents/service";
import { getInstallation } from "@/server/modules/installations/service";
import { logoUrl } from "@/server/modules/organizations/profile";
import { getWorkOrder } from "@/server/modules/work-orders/service";
import { installationStatusPdf, workOrderPdf } from "@/server/pci/pdf";

/**
 * Correos PCI que la empresa envía a su cliente pulsando un botón (nunca
 * solos): próxima actuación, servicio realizado (con el parte en PDF),
 * incidencia detectada y envío del estado de una instalación (PDF).
 *  - Son comunicaciones del servicio contratado: una baja de los AVISOS no
 *    las impide, pero sí los rebotes, las quejas y los bloqueos manuales.
 *  - Cuentan en el consumo mensual de correos del plan.
 *  - Sin proveedor configurado no se envía ni se simula nada.
 */

export type PciNotifyOutcome = "sent" | "no_email" | "suppressed" | "not_configured" | "quota" | "failed";

type Ctx = Pick<OrgContext, "auth" | "membership" | "subscription">;
interface Deps {
  email: EmailPort | null;
  sender: SenderConfig | null;
}

interface Prepared {
  branchId: string;
  customerId: string;
  to: string | null;
  firstName: string;
  vars: Record<string, string>;
  attachment: EmailAttachment | null;
  links: { work_order_id?: string; installation_id?: string; incident_id?: string };
  idempotency: string;
}

async function customerContact(ctx: Ctx, customerId: string): Promise<{ email: string | null; firstName: string }> {
  return withRls(ctx.auth, async (tx) => {
    const c = await tx.selectFrom("customers").select([sql<string | null>`email::text`.as("email"), "first_name", "contact_name", "customer_kind"]).where("id", "=", customerId).executeTakeFirst();
    if (!c) throw new DomainError("not_found");
    // Empresas: saludo a la persona de contacto si la hay.
    const first = c.customer_kind === "company" && c.contact_name ? c.contact_name.split(" ")[0] : c.first_name;
    return { email: c.email, firstName: first };
  });
}

async function prepare(ctx: Ctx, kind: PciKind, id: string): Promise<Prepared> {
  if (kind === "action_upcoming" || kind === "service_completed") {
    const o = await getWorkOrder(ctx, id);
    if (!o) throw new DomainError("not_found");
    if (kind === "action_upcoming" && (!o.scheduledFor || o.status === "completed" || o.status === "canceled")) throw new DomainError("validation_error", "work_order_not_scheduled");
    if (kind === "service_completed" && o.status !== "completed") throw new DomainError("validation_error", "work_order_not_completed");
    const contact = await customerContact(ctx, o.customerId);
    const base = { branchId: o.branchId, customerId: o.customerId, to: contact.email, firstName: contact.firstName, links: { work_order_id: o.id, installation_id: o.installationId } };
    if (kind === "action_upcoming") {
      return {
        ...base,
        vars: { instalacion: o.installationName, direccion: o.installationAddress, orden: o.number, fecha_visita: formatDate(o.scheduledFor), hora_visita: o.scheduledTime ? ` a las ${o.scheduledTime}` : "" },
        attachment: null,
        idempotency: `action_upcoming-${o.id}-${o.scheduledFor}-${o.scheduledTime ?? ""}`,
      };
    }
    const pdf = await workOrderPdf(ctx, o.id);
    const done = o.itemList.filter((i) => i.status !== "pending");
    const count = (r: string) => done.filter((i) => i.result === r).length;
    const resumen = [
      `Equipos revisados: ${done.length}.`,
      count("compliant") ? `Correctos: ${count("compliant")}.` : null,
      count("compliant_with_remarks") ? `Correctos con observaciones: ${count("compliant_with_remarks")}.` : null,
      count("non_compliant") ? `No conformes: ${count("non_compliant")}.` : null,
      count("not_performed") || done.length - done.filter((i) => i.result).length ? `No realizados: ${count("not_performed") + done.length - done.filter((i) => i.result).length}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ...base,
      vars: { instalacion: o.installationName, orden: o.number, fecha_servicio: formatDate((o.completedAt ?? new Date()).toISOString().slice(0, 10)), resumen },
      attachment: pdf ? { filename: pdf.filename, content: pdf.body, contentType: "application/pdf" } : null,
      idempotency: `service_completed-${o.id}-${randomUUID()}`,
    };
  }
  if (kind === "incident_detected") {
    const x = await getIncident(ctx, id);
    if (!x) throw new DomainError("not_found");
    const inst = await getInstallation(ctx, x.installationId);
    if (!inst) throw new DomainError("not_found");
    const contact = await customerContact(ctx, inst.customerId);
    return {
      branchId: inst.branchId,
      customerId: inst.customerId,
      to: contact.email,
      firstName: contact.firstName,
      vars: {
        instalacion: x.installationName,
        incidencia: x.title,
        gravedad: (SEVERITY_LABELS[x.severity as keyof typeof SEVERITY_LABELS] ?? x.severity).toLowerCase(),
        equipo: x.equipmentCode ? ` (equipo ${x.equipmentCode})` : "",
      },
      attachment: null,
      links: { incident_id: x.id, installation_id: x.installationId, ...(x.workOrderId ? { work_order_id: x.workOrderId } : {}) },
      idempotency: `incident_detected-${x.id}-${randomUUID()}`,
    };
  }
  // report_sent: estado de la instalación en PDF
  const pdf = await installationStatusPdf(ctx, id, todayIn());
  if (!pdf) throw new DomainError("not_found");
  const contact = await customerContact(ctx, pdf.installation.customerId);
  return {
    branchId: pdf.installation.branchId,
    customerId: pdf.installation.customerId,
    to: contact.email,
    firstName: contact.firstName,
    vars: { instalacion: pdf.installation.name, informe: "Estado de la instalación" },
    attachment: { filename: pdf.filename, content: pdf.body, contentType: "application/pdf" },
    links: { installation_id: pdf.installation.id },
    idempotency: `report_sent-${pdf.installation.id}-${randomUUID()}`,
  };
}

export async function sendPciEmail(ctx: Ctx, kind: PciKind, id: string, deps: Deps): Promise<PciNotifyOutcome> {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
  const p = await prepare(ctx, kind, id);
  if (!deps.email || !deps.sender) return "not_configured";
  if (!p.to) return "no_email";
  const orgId = ctx.membership.organizationId;
  const to = p.to;

  const org = await withSystem(async (tx) => {
    const { rows } = await sql<{
      suppressed: boolean;
      name: string;
      brand_primary: string | null;
      logo_path: string | null;
      address: string | null;
      phone: string | null;
      contact_email: string | null;
      subject: string | null;
      body: string | null;
      button_label: string | null;
      button_enabled: boolean | null;
    }>`
      select exists (select 1 from email_suppressions es where es.organization_id = o.id and es.email = ${to}
                      and es.reason in ('hard_bounce', 'complaint', 'manual')) as suppressed,
             o.trade_name as name, o.brand_primary, o.logo_path,
             nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '') as address,
             coalesce(b.phone, o.phone) as phone,
             coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as contact_email,
             t.subject, t.body, t.button_label, t.button_enabled
        from organizations o
        join branches b on b.id = ${p.branchId} and b.organization_id = o.id
        left join branch_settings bs on bs.branch_id = b.id
        left join lateral (
          select et.subject, et.body, et.button_label, et.button_enabled from email_templates et
           where et.organization_id = o.id and et.status = 'active' and et.kind = ${kind}
             and (et.branch_id = b.id or et.branch_id is null)
           order by et.branch_id nulls last limit 1
        ) t on true
       where o.id = ${orgId}
    `.execute(tx);
    return rows[0];
  });
  if (!org) throw new DomainError("not_found");
  if (org.suppressed) return "suppressed";

  const period = await withSystem(async (tx) => {
    const { rows } = await sql<{ p: string | null }>`select app.reserve_usage(${orgId}::uuid, 'emails')::text as p`.execute(tx);
    return rows[0]?.p ?? null;
  });
  if (!period) return "quota";

  const template: TemplateContent = org.subject
    ? { subject: org.subject, body: org.body ?? DEFAULT_TEMPLATES[kind].body, buttonLabel: org.button_label ?? DEFAULT_TEMPLATES[kind].buttonLabel, buttonEnabled: false }
    : { ...DEFAULT_TEMPLATES[kind], buttonEnabled: false };
  const rendered = renderWorkshopEmail({
    template,
    vars: { nombre: p.firstName || "cliente", taller: org.name, ...p.vars },
    workshop: {
      name: org.name,
      brandColor: org.brand_primary,
      address: org.address,
      phone: org.phone,
      email: org.contact_email,
      logoUrl: logoUrl(deps.sender.appUrl, orgId, org.logo_path),
    },
    unsubscribeUrl: null,
  });
  const sender = await withSystem((tx) => resolveWorkshopSender(tx, orgId, deps.sender!, p.branchId));
  const result = await deps.email
    .send({
      from: sender.from,
      to,
      replyTo: sender.replyTo ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      idempotencyKey: p.idempotency,
      tags: { kind, organization_id: orgId },
      attachments: p.attachment ? [p.attachment] : [],
    })
    .catch((err: Error) => ({ kind: "retryable" as const, code: "adapter_exception", message: err.message }));

  await withSystem(async (tx) => {
    if (result.kind !== "accepted") await sql`select app.release_usage(${orgId}::uuid, 'emails', ${period}::date)`.execute(tx);
    await tx
      .insertInto("email_logs")
      .values({
        organization_id: orgId,
        branch_id: p.branchId,
        customer_id: p.customerId,
        ...p.links,
        kind,
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
  }).catch((err) => logger.error("pci_email_log_failed", { kind, id, error: err }));
  return result.kind === "accepted" ? "sent" : "failed";
}

/** Últimos correos enviados sobre una orden, incidencia o instalación (para la ficha). */
export async function emailHistory(ctx: Pick<OrgContext, "auth" | "membership">, ref: { workOrderId?: string; incidentId?: string; installationId?: string }) {
  return withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("email_logs")
      .select(["kind", "status", "to_email", "sent_at", "created_at"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .$if(Boolean(ref.workOrderId), (q) => q.where("work_order_id", "=", ref.workOrderId!))
      .$if(Boolean(ref.incidentId), (q) => q.where("incident_id", "=", ref.incidentId!))
      .$if(Boolean(ref.installationId), (q) => q.where("installation_id", "=", ref.installationId!).where("kind", "=", "report_sent"))
      .orderBy("created_at", "desc")
      .limit(10)
      .execute(),
  );
}
