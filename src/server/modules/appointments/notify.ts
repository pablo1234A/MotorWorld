import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { formatDate } from "@/lib/dates";
import { renderPlatformEmail } from "@/lib/email/platform-email";
import {
  type BookingKind,
  DEFAULT_TEMPLATES,
  renderWorkshopEmail,
  type TemplateContent,
  vehicleLabel,
} from "@/lib/email/reminder-email";
import { buildIcs } from "@/lib/ics";
import { withSystem } from "@/server/db/client";
import type { EmailAttachment, EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { platformFrom, resolveWorkshopSender } from "@/server/email/sender";
import { logger } from "@/server/logger";
import { logoUrl } from "@/server/modules/organizations/profile";

/**
 * Correos de una cita al cliente (solicitud recibida, confirmada, cambiada,
 * rechazada, cancelada) y aviso a la empresa de una solicitud nueva.
 *  - Los correos al cliente cuentan en el consumo mensual (P5).
 *  - Se respetan rebotes, quejas y bloqueos manuales; una baja de los AVISOS
 *    no impide los correos de una cita que la propia persona ha pedido.
 *  - Sin proveedor configurado no se envía ni se simula nada.
 */

export type NotifyOutcome =
  | "sent"
  | "no_email"
  | "suppressed"
  | "not_configured"
  | "quota"
  | "failed";

interface Deps {
  email: EmailPort | null;
  sender: SenderConfig | null;
}

interface AppointmentContext {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  to_email: string | null;
  first_name: string;
  make: string | null;
  model: string | null;
  plate: string | null;
  installation_name: string | null;
  start: Date | null;
  end: Date | null;
  requested_date: string | null;
  local_date: string | null;
  local_time: string | null;
  org_name: string;
  org_slug: string;
  brand_primary: string | null;
  logo_path: string | null;
  booking_enabled: boolean;
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  suppressed: boolean;
  sequence: number;
  template_subject: string | null;
  template_body: string | null;
  template_button_label: string | null;
  template_button_enabled: boolean | null;
}

async function loadContext(
  appointmentId: string,
  kind: BookingKind,
): Promise<AppointmentContext | undefined> {
  return withSystem(async (tx) => {
    const { rows } = await sql<AppointmentContext>`
      select a.id, a.organization_id, a.branch_id, a.customer_id, a.vehicle_id,
             coalesce(a.requester_email::text, c.email::text) as to_email,
             coalesce(nullif(c.first_name, ''), split_part(a.requester_name, ' ', 1)) as first_name,
             v.make, v.model, coalesce(v.plate, a.plate_entered) as plate,
             coalesce(i.name, nullif(a.requester_address, '')) as installation_name,
             a.confirmed_start as start, a.confirmed_end as "end", a.requested_date::text as requested_date,
             to_char(coalesce(a.confirmed_start, lower(a.requested_slot)) at time zone tz.tz, 'YYYY-MM-DD') as local_date,
             to_char(coalesce(a.confirmed_start, lower(a.requested_slot)) at time zone tz.tz, 'HH24:MI') as local_time,
             o.trade_name as org_name, o.slug::text as org_slug, o.brand_primary, o.logo_path,
             bs.booking_enabled,
             nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '') as address,
             coalesce(b.phone, o.phone) as phone,
             coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as contact_email,
             exists (select 1 from email_suppressions es
                      where es.organization_id = a.organization_id
                        and es.email = coalesce(a.requester_email, c.email)
                        and es.reason in ('hard_bounce', 'complaint', 'manual')) as suppressed,
             (select count(*)::int from appointment_events e where e.appointment_id = a.id) as sequence,
             t.subject as template_subject, t.body as template_body, t.button_label as template_button_label,
             t.button_enabled as template_button_enabled
        from appointments a
        join branches b on b.id = a.branch_id
        join organizations o on o.id = a.organization_id
        join branch_settings bs on bs.branch_id = a.branch_id
        cross join lateral (select coalesce(b.timezone, o.timezone) as tz) tz
        left join customers c on c.id = a.customer_id
        left join vehicles v on v.id = a.vehicle_id
        left join installations i on i.id = a.installation_id
        left join lateral (
          select et.subject, et.body, et.button_label, et.button_enabled from email_templates et
           where et.organization_id = a.organization_id and et.status = 'active' and et.kind = ${kind}
             and (et.branch_id = a.branch_id or et.branch_id is null)
           order by et.branch_id nulls last limit 1
        ) t on true
       where a.id = ${appointmentId}
    `.execute(tx);
    return rows[0];
  });
}

export function bookingPageUrl(appUrl: string, orgSlug: string): string {
  return new URL(`/t/${encodeURIComponent(orgSlug)}/cita`, appUrl).toString();
}

export async function sendAppointmentEmail(
  kind: BookingKind,
  appointmentId: string,
  deps: Deps,
  opts: { note?: string | null } = {},
): Promise<NotifyOutcome> {
  if (!deps.email || !deps.sender) return "not_configured";
  const c = await loadContext(appointmentId, kind);
  if (!c) return "failed";
  if (!c.to_email) return "no_email";
  if (c.suppressed) return "suppressed";

  const period = await withSystem(async (tx) => {
    const { rows } = await sql<{
      p: string | null;
    }>`select app.reserve_usage(${c.organization_id}::uuid, 'emails')::text as p`.execute(
      tx,
    );
    return rows[0]?.p ?? null;
  });
  if (!period) return "quota";

  const template: TemplateContent = c.template_subject
    ? {
        subject: c.template_subject,
        body: c.template_body ?? DEFAULT_TEMPLATES[kind].body,
        buttonLabel:
          c.template_button_label ?? DEFAULT_TEMPLATES[kind].buttonLabel,
        buttonEnabled: c.template_button_enabled ?? false,
      }
    : DEFAULT_TEMPLATES[kind];
  const date = c.local_date ?? c.requested_date;
  const rendered = renderWorkshopEmail({
    template,
    vars: {
      nombre: c.first_name || "cliente",
      modelo: vehicleLabel(c.make, c.model),
      matricula: c.plate ?? "",
      // Visita técnica (PCI): la instalación o la dirección indicada; cuentas antiguas: el vehículo.
      instalacion:
        c.installation_name ??
        (c.plate
          ? `tu ${vehicleLabel(c.make, c.model)} (${c.plate})`
          : "tu instalación"),
      fecha_cita: date ? formatDate(date) : "",
      hora_cita: c.local_time ?? "",
      taller: c.org_name,
    },
    workshop: {
      name: c.org_name,
      brandColor: c.brand_primary,
      address: c.address,
      phone: c.phone,
      email: c.contact_email,
      logoUrl: logoUrl(deps.sender.appUrl, c.organization_id, c.logo_path),
    },
    ctaHref: c.booking_enabled
      ? bookingPageUrl(deps.sender.appUrl, c.org_slug)
      : null,
    unsubscribeUrl: null,
    note: opts.note ?? null,
  });

  const attachments: EmailAttachment[] = [];
  if (
    (kind === "booking_confirmed" || kind === "booking_rescheduled") &&
    c.start &&
    c.end
  ) {
    attachments.push({
      filename: "cita.ics",
      contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      content: Buffer.from(
        buildIcs({
          uid: `${c.id}@revisaya`,
          sequence: c.sequence,
          start: c.start,
          end: c.end,
          summary: c.installation_name
            ? `Visita técnica de ${c.org_name}: ${c.installation_name}`
            : `Cita en ${c.org_name}${c.plate ? ` (${c.plate})` : ""}`,
          location: c.address,
          description: c.phone ? `Teléfono de contacto: ${c.phone}` : null,
        }),
        "utf8",
      ),
    });
  }

  const sender = await withSystem((tx) =>
    resolveWorkshopSender(tx, c.organization_id, deps.sender!, c.branch_id),
  );
  const result = await deps.email
    .send({
      from: sender.from,
      to: c.to_email,
      replyTo: sender.replyTo ?? undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {},
      idempotencyKey: `${kind}-${c.id}-${c.sequence}`,
      tags: { kind, organization_id: c.organization_id },
      attachments,
    })
    .catch((err: Error) => ({
      kind: "retryable" as const,
      code: "adapter_exception",
      message: err.message,
    }));

  await withSystem(async (tx) => {
    if (result.kind !== "accepted")
      await sql`select app.release_usage(${c.organization_id}::uuid, 'emails', ${period}::date)`.execute(
        tx,
      );
    await tx
      .insertInto("email_logs")
      .values({
        organization_id: c.organization_id,
        branch_id: c.branch_id,
        appointment_id: c.id,
        customer_id: c.customer_id,
        vehicle_id: c.vehicle_id,
        kind,
        to_email: c.to_email!,
        from_email: sender.fromAddress,
        reply_to: sender.replyTo,
        subject: rendered.subject,
        provider: deps.email!.name,
        provider_message_id:
          result.kind === "accepted" ? result.messageId : null,
        status: result.kind === "accepted" ? "accepted" : "failed",
        error_code:
          result.kind === "accepted" ? null : result.code.slice(0, 100),
        sent_at: result.kind === "accepted" ? new Date() : null,
      })
      .execute();
  }).catch((err) =>
    logger.error("appointment_email_log_failed", { appointmentId, error: err }),
  );
  return result.kind === "accepted" ? "sent" : "failed";
}

/** Aviso a la empresa (administradores y quien gestiona citas en esa sucursal) de una solicitud nueva. */
export async function notifyStaffNewRequest(
  appointmentId: string,
  deps: Deps,
): Promise<number> {
  if (!deps.email || !deps.sender) return 0;
  const { email: port, sender } = deps;
  const info = await withSystem(async (tx) => {
    const { rows } = await sql<{
      organization_id: string;
      branch_id: string;
      requester_name: string;
      plate: string | null;
      when_text: string | null;
      message: string | null;
      org_name: string;
      branch_name: string;
      branches: number;
    }>`
      select a.organization_id, a.branch_id, a.requester_name, a.plate_entered as plate, a.customer_message as message,
             coalesce(to_char(lower(a.requested_slot) at time zone coalesce(b.timezone, o.timezone), 'DD/MM/YYYY HH24:MI'),
                      to_char(a.requested_date, 'DD/MM/YYYY')) as when_text,
             o.trade_name as org_name, b.name as branch_name,
             (select count(*)::int from branches b2 where b2.organization_id = o.id and b2.status = 'active') as branches
        from appointments a join branches b on b.id = a.branch_id join organizations o on o.id = a.organization_id
       where a.id = ${appointmentId}
    `.execute(tx);
    return rows[0];
  });
  if (!info) return 0;
  const recipients = await withSystem(async (tx) => {
    const { rows } = await sql<{ email: string }>`
      select p.email from organization_members m join profiles p on p.id = m.user_id
       where m.organization_id = ${info.organization_id} and m.status = 'active' and p.status = 'active'
         and (m.role = 'admin' or 'appointments.manage' = any (m.permissions))
         and (m.branch_scope = 'all' or exists (select 1 from member_branches mb where mb.member_id = m.id and mb.branch_id = ${info.branch_id}))
       order by m.is_owner desc, m.created_at limit 10
    `.execute(tx);
    return rows;
  });
  const where =
    info.branches > 1
      ? `${info.org_name} · ${info.branch_name}`
      : info.org_name;
  const msg = renderPlatformEmail({
    title: "Nueva solicitud de cita",
    intro: `${info.requester_name} ha pedido cita en ${where}. Todavía no está confirmada: confírmala, cámbiala o recházala desde el panel.`,
    rows: [
      ["Cliente", info.requester_name],
      ...(info.plate
        ? ([["Matrícula", info.plate]] as Array<[string, string]>)
        : []),
      ...(info.when_text
        ? ([["Fecha pedida", info.when_text]] as Array<[string, string]>)
        : []),
    ],
    notes: info.message ? [`Mensaje: ${info.message}`] : [],
    link: {
      href: new URL(`/app/citas/${appointmentId}`, sender.appUrl).toString(),
      label: "Ver la solicitud",
    },
  });
  const { from, address } = platformFrom(sender);
  let sent = 0;
  for (const r of recipients) {
    const subject = `Nueva solicitud de cita · ${info.requester_name}`.slice(
      0,
      200,
    );
    const result = await port
      .send({
        from,
        to: r.email,
        subject,
        html: msg.html,
        text: msg.text,
        headers: {},
        idempotencyKey: `booking-request-${appointmentId}-${randomUUID()}`,
        tags: { kind: "booking_request" },
      })
      .catch((err: Error) => ({
        kind: "retryable" as const,
        code: "adapter_exception",
        message: err.message,
      }));
    if (result.kind === "accepted") sent++;
    await withSystem((tx) =>
      tx
        .insertInto("email_logs")
        .values({
          organization_id: info.organization_id,
          branch_id: info.branch_id,
          appointment_id: appointmentId,
          kind: "booking_request",
          to_email: r.email,
          from_email: address,
          subject,
          provider: port.name,
          provider_message_id:
            result.kind === "accepted" ? result.messageId : null,
          status: result.kind === "accepted" ? "accepted" : "failed",
          error_code:
            result.kind === "accepted" ? null : result.code.slice(0, 100),
          sent_at: result.kind === "accepted" ? new Date() : null,
        })
        .execute(),
    ).catch((err) =>
      logger.error("staff_email_log_failed", { appointmentId, error: err }),
    );
  }
  return sent;
}

export const NOTIFY_MESSAGES: Record<NotifyOutcome, string> = {
  sent: "Le hemos enviado un correo al cliente.",
  no_email: "El cliente no tiene correo: avísale por teléfono.",
  suppressed:
    "No se ha enviado correo: esa dirección está bloqueada (rebote, queja o bloqueo manual).",
  not_configured:
    "No se ha enviado correo: el envío aún no está configurado en RevisaYa.",
  quota:
    "No se ha enviado correo: has alcanzado el límite de correos de este mes.",
  failed: "No se ha podido enviar el correo al cliente. Avísale por teléfono.",
};
