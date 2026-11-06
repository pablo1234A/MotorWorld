import { formatDate } from "@/lib/dates";

/**
 * Correos del taller a sus clientes: avisos de revisión (Fase 5) y correos de
 * citas (Fase 7). Plantilla (por defecto o del taller), variables y
 * maquetación con la marca del taller. Funciones puras (se prueban sin red).
 *
 * Seguridad: el texto del taller y los datos del cliente se ESCAPAN antes de
 * insertarse en el HTML (sin XSS) y el asunto se limpia de saltos de línea
 * (sin inyección de cabeceras).
 */

export type ReminderKind = "reminder_service_date" | "reminder_service_km";
export type BookingKind = "booking_received" | "booking_confirmed" | "booking_rejected" | "booking_rescheduled" | "booking_canceled";
export type EmailKind = ReminderKind | BookingKind;

export interface TemplateContent {
  subject: string;
  body: string;
  buttonLabel: string;
  buttonEnabled: boolean;
}

/** Plantillas originales. "Restaurar plantilla" vuelve a estas. */
export const DEFAULT_TEMPLATES: Record<EmailKind, TemplateContent> = {
  // Texto del PDF (§8).
  reminder_service_date: {
    subject: "Revisión de tu {modelo} en {taller}",
    body:
      "Hola {nombre}, te recordamos que la revisión de tu {modelo} ({matricula}) está prevista para el {fecha_revision}.\n\n" +
      "Pide cita respondiendo a este correo o con el botón de abajo.\n\n{taller}.",
    buttonLabel: "Pedir cita",
    buttonEnabled: true,
  },
  reminder_service_km: {
    subject: "Tu {modelo} se acerca a los kilómetros de su revisión",
    body:
      "Hola {nombre}, según el kilometraje habitual de tu {modelo} ({matricula}), está llegando a los kilómetros de su próxima revisión " +
      "(estimamos que hacia el {fecha_revision}).\n\nPide cita respondiendo a este correo o con el botón de abajo.\n\n{taller}.",
    buttonLabel: "Pedir cita",
    buttonEnabled: true,
  },
  booking_received: {
    subject: "Hemos recibido tu solicitud de cita en {taller}",
    body:
      "Hola {nombre}, hemos recibido tu solicitud de cita para tu {modelo} ({matricula}).\n\n" +
      "Todavía no es una cita confirmada: te escribiremos con el día y la hora en cuanto lo revisemos.\n\n{taller}.",
    buttonLabel: "Pedir otra cita",
    buttonEnabled: false,
  },
  booking_confirmed: {
    subject: "Cita confirmada en {taller}: {fecha_cita} a las {hora_cita}",
    body:
      "Hola {nombre}, tu cita para el {modelo} ({matricula}) está confirmada el {fecha_cita} a las {hora_cita}.\n\n" +
      "Te adjuntamos la cita para que la añadas a tu calendario. Si no puedes venir, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir otra cita",
    buttonEnabled: false,
  },
  booking_rejected: {
    subject: "Sobre tu solicitud de cita en {taller}",
    body:
      "Hola {nombre}, lo sentimos: no podemos atenderte en la fecha que pediste para tu {modelo} ({matricula}).\n\n" +
      "Responde a este correo o pide otra cita con el botón de abajo y buscaremos otro hueco.\n\n{taller}.",
    buttonLabel: "Pedir otra cita",
    buttonEnabled: true,
  },
  booking_rescheduled: {
    subject: "Hemos cambiado tu cita en {taller}: {fecha_cita} a las {hora_cita}",
    body:
      "Hola {nombre}, tu cita para el {modelo} ({matricula}) ha cambiado: ahora es el {fecha_cita} a las {hora_cita}.\n\n" +
      "Te adjuntamos la cita actualizada. Si no te viene bien, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir otra cita",
    buttonEnabled: false,
  },
  booking_canceled: {
    subject: "Tu cita en {taller} se ha cancelado",
    body:
      "Hola {nombre}, tu cita para el {modelo} ({matricula}) del {fecha_cita} se ha cancelado.\n\n" +
      "Si quieres otra fecha, responde a este correo o pide una nueva cita con el botón de abajo.\n\n{taller}.",
    buttonLabel: "Pedir otra cita",
    buttonEnabled: true,
  },
};

/** Variables de los avisos (lista cerrada del PDF + {taller}). */
export const TEMPLATE_VARIABLES = ["nombre", "modelo", "matricula", "fecha_revision", "taller"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const BOOKING_VARIABLES = ["nombre", "modelo", "matricula", "fecha_cita", "hora_cita", "taller"] as const;

export function variablesFor(kind: EmailKind): readonly string[] {
  return kind.startsWith("reminder_") ? TEMPLATE_VARIABLES : BOOKING_VARIABLES;
}

export interface WorkshopBrand {
  name: string;
  brandColor?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  /** URL pública absoluta del logo (o relativa en la vista previa del panel). */
  logoUrl?: string | null;
}

export interface ReminderEmailInput {
  template: TemplateContent;
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string; // AAAA-MM-DD
  workshop: WorkshopBrand;
  /** Destino del botón (página de cita o mailto:). Sin destino, no hay botón. */
  ctaHref?: string | null;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function vehicleLabel(make: string | null, model: string | null): string {
  return [make, model].filter(Boolean).join(" ").trim() || "vehículo";
}

function fill(text: string, vars: Record<string, string>, transform: (v: string) => string = (v) => v): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? transform(vars[key]) : match));
}

/** Variables desconocidas en un texto de plantilla (para validarla al guardar). */
export function unknownVariables(text: string, kind: EmailKind = "reminder_service_date"): string[] {
  const allowed = variablesFor(kind);
  return [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !allowed.includes(k));
}

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface WorkshopEmailInput {
  template: TemplateContent;
  vars: Record<string, string>;
  workshop: WorkshopBrand;
  ctaHref?: string | null;
  /** Avisos: enlace de baja. Correos de una cita (transaccionales): sin él. */
  unsubscribeUrl?: string | null;
  /** Mensaje opcional del taller (motivo de un rechazo o una cancelación). */
  note?: string | null;
}

export function renderWorkshopEmail(input: WorkshopEmailInput): RenderedEmail {
  const vars = input.vars;
  const subject = fill(input.template.subject, vars)
    .replace(/[\r\n\t\u0000-\u001f]+/g, " ")
    .trim()
    .slice(0, 200);

  const paragraphs = input.template.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const note = input.note?.trim() || null;
  const color = input.workshop.brandColor && SAFE_COLOR.test(input.workshop.brandColor) ? input.workshop.brandColor : "#1f4fd8";
  const name = escapeHtml(input.workshop.name);
  const showButton = input.template.buttonEnabled && Boolean(input.ctaHref);
  const contact = [input.workshop.address, input.workshop.phone, input.workshop.email].filter(Boolean) as string[];

  const htmlParagraphs = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${fill(escapeHtml(p), vars, escapeHtml).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const htmlNote = note
    ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${color};background:#f4f5f7;font-size:14px;line-height:1.6">${escapeHtml(note).replace(/\n/g, "<br>")}</p>`
    : "";
  const footer = input.unsubscribeUrl
    ? `Recibes este aviso porque tu vehículo se revisa en ${name}. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#5b616e">No quiero recibir más avisos</a>.`
    : `Recibes este correo por tu cita en ${name}.`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#14161a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
${
  input.workshop.logoUrl
    ? `<tr><td style="padding:20px 28px;border-bottom:4px solid ${color}"><img src="${escapeHtml(input.workshop.logoUrl)}" alt="${name}" height="48" style="display:block;height:auto;max-height:48px;max-width:220px;border:0"></td></tr>`
    : `<tr><td style="background:${color};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">${name}</td></tr>`
}
<tr><td style="padding:28px">
${htmlParagraphs}
${htmlNote}
${
  showButton
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.ctaHref!)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${escapeHtml(fill(input.template.buttonLabel, vars))}</a></p>`
    : ""
}
${contact.length ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b616e">${contact.map(escapeHtml).join("<br>")}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f5f7;font-size:12px;line-height:1.6;color:#5b616e">
${footer}
</td></tr>
</table>
</body></html>`;

  const text = [
    ...paragraphs.map((p) => fill(p, vars)),
    note,
    showButton ? `${fill(input.template.buttonLabel, vars)}: ${input.ctaHref}` : null,
    contact.length ? contact.join("\n") : null,
    input.unsubscribeUrl ? `Para no recibir más avisos: ${input.unsubscribeUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  return renderWorkshopEmail({
    template: input.template,
    vars: {
      nombre: input.customerFirstName.trim() || "cliente",
      modelo: vehicleLabel(input.vehicleMake, input.vehicleModel),
      matricula: input.plate,
      fecha_revision: formatDate(input.dueDate),
      taller: input.workshop.name,
    },
    workshop: input.workshop,
    ctaHref: input.ctaHref,
    unsubscribeUrl: input.unsubscribeUrl,
  });
}
