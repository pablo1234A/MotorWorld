import { formatDate } from "@/lib/dates";

/**
 * Correos de la empresa a sus clientes: avisos de mantenimiento, visitas,
 * órdenes de trabajo, incidencias e informes (PCI), y los avisos de revisión
 * de vehículos que conservan las cuentas de la etapa anterior. Plantilla (por
 * defecto o de la empresa), variables y maquetación con su marca. Funciones
 * puras (se prueban sin red).
 *
 * Seguridad: el texto del taller y los datos del cliente se ESCAPAN antes de
 * insertarse en el HTML (sin XSS) y el asunto se limpia de saltos de línea
 * (sin inyección de cabeceras).
 */

export type ReminderKind =
  | "reminder_service_date"
  | "reminder_service_km"
  | "reminder_maintenance";
export type BookingKind =
  | "booking_received"
  | "booking_confirmed"
  | "booking_rejected"
  | "booking_rescheduled"
  | "booking_canceled";
/** Correos PCI que la empresa envía a mano desde una orden, una incidencia o una instalación. */
export type PciKind =
  | "action_upcoming"
  | "service_completed"
  | "incident_detected"
  | "report_sent";
export type EmailKind = ReminderKind | BookingKind | PciKind;

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
  // Avisos de vencimiento de una instalación (PCI).
  reminder_maintenance: {
    subject: "Mantenimiento de protección contra incendios en {instalacion}",
    body:
      "Hola {nombre}, te recordamos que el {fecha_revision} vence el mantenimiento de los equipos de protección contra incendios de {instalacion} ({direccion}): {equipos}.\n\n" +
      "Responde a este correo o pide una visita con el botón de abajo y lo organizamos.\n\n{taller}.",
    buttonLabel: "Pedir visita",
    buttonEnabled: true,
  },
  booking_received: {
    subject: "Hemos recibido tu solicitud de visita en {taller}",
    body:
      "Hola {nombre}, hemos recibido tu solicitud de visita técnica para {instalacion}.\n\n" +
      "Todavía no es una visita confirmada: te escribiremos con el día y la hora en cuanto lo revisemos.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: false,
  },
  booking_confirmed: {
    subject: "Visita confirmada con {taller}: {fecha_cita} a las {hora_cita}",
    body:
      "Hola {nombre}, la visita técnica a {instalacion} está confirmada el {fecha_cita} a las {hora_cita}.\n\n" +
      "Te adjuntamos la cita para que la añadas a tu calendario. Si no os viene bien, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: false,
  },
  booking_rejected: {
    subject: "Sobre tu solicitud de visita en {taller}",
    body:
      "Hola {nombre}, lo sentimos: no podemos hacer la visita a {instalacion} en la fecha que pediste.\n\n" +
      "Responde a este correo o pide otra fecha con el botón de abajo y buscaremos otro hueco.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: true,
  },
  booking_rescheduled: {
    subject: "{taller} ha cambiado la visita: {fecha_cita} a las {hora_cita}",
    body:
      "Hola {nombre}, la visita técnica a {instalacion} ha cambiado: ahora es el {fecha_cita} a las {hora_cita}.\n\n" +
      "Te adjuntamos la cita actualizada. Si no os viene bien, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: false,
  },
  booking_canceled: {
    subject: "La visita a {instalacion} se ha cancelado",
    body:
      "Hola {nombre}, la visita técnica a {instalacion} del {fecha_cita} se ha cancelado.\n\n" +
      "Si quieres otra fecha, responde a este correo o pide una nueva visita con el botón de abajo.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: true,
  },
  action_upcoming: {
    subject: "Próxima actuación en {instalacion}: {fecha_visita}",
    body:
      "Hola {nombre}, tenemos programada la actuación de mantenimiento en {instalacion} ({direccion}) el {fecha_visita}{hora_visita}.\n\n" +
      "Orden de trabajo: {orden}. Si necesitas cambiar la fecha o hay que avisar a alguien para el acceso, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir otra visita",
    buttonEnabled: false,
  },
  service_completed: {
    subject: "Servicio realizado en {instalacion} ({orden})",
    body:
      "Hola {nombre}, hemos terminado el servicio en {instalacion} el {fecha_servicio}.\n\n{resumen}\n\n" +
      "Te adjuntamos el parte de trabajo con el resultado de cada equipo. Si tienes cualquier duda, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir visita",
    buttonEnabled: false,
  },
  incident_detected: {
    subject: "Incidencia detectada en {instalacion}",
    body:
      "Hola {nombre}, durante nuestro trabajo en {instalacion} hemos detectado una incidencia que conviene que conozcas:\n\n" +
      "{incidencia} (gravedad: {gravedad}){equipo}.\n\nResponde a este correo y te explicamos cómo resolverla.\n\n{taller}.",
    buttonLabel: "Pedir visita",
    buttonEnabled: false,
  },
  report_sent: {
    subject: "{informe}: {instalacion}",
    body: "Hola {nombre}, te adjuntamos el documento «{informe}» de {instalacion}.\n\nSi tienes cualquier duda, responde a este correo.\n\n{taller}.",
    buttonLabel: "Pedir visita",
    buttonEnabled: false,
  },
};

/** Variables de los avisos de vehículos (etapa anterior: lista cerrada del PDF + {taller}). */
export const TEMPLATE_VARIABLES = [
  "nombre",
  "modelo",
  "matricula",
  "fecha_revision",
  "taller",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const MAINTENANCE_VARIABLES = [
  "nombre",
  "instalacion",
  "direccion",
  "equipos",
  "fecha_revision",
  "taller",
] as const;
/** {modelo} y {matricula} se mantienen para las plantillas de las cuentas que venían de talleres. */
export const BOOKING_VARIABLES = [
  "nombre",
  "instalacion",
  "modelo",
  "matricula",
  "fecha_cita",
  "hora_cita",
  "taller",
] as const;
export const PCI_VARIABLES: Record<PciKind, readonly string[]> = {
  action_upcoming: [
    "nombre",
    "instalacion",
    "direccion",
    "orden",
    "fecha_visita",
    "hora_visita",
    "taller",
  ],
  service_completed: [
    "nombre",
    "instalacion",
    "orden",
    "fecha_servicio",
    "resumen",
    "taller",
  ],
  incident_detected: [
    "nombre",
    "instalacion",
    "incidencia",
    "gravedad",
    "equipo",
    "taller",
  ],
  report_sent: ["nombre", "instalacion", "informe", "taller"],
};

export function variablesFor(kind: EmailKind): readonly string[] {
  if (kind === "reminder_maintenance") return MAINTENANCE_VARIABLES;
  if (kind.startsWith("reminder_")) return TEMPLATE_VARIABLES;
  if (kind.startsWith("booking_")) return BOOKING_VARIABLES;
  return PCI_VARIABLES[kind as PciKind];
}

/** Forma singular y plural de cada categoría para los textos de los correos. */
const CATEGORY_WORDS: Record<string, [string, string]> = {
  extinguisher: ["extintor", "extintores"],
  bie: ["BIE", "BIE"],
  hydrant: ["hidrante", "hidrantes"],
  dry_riser: ["columna seca", "columnas secas"],
  detection_alarm: [
    "equipo de detección y alarma",
    "equipos de detección y alarma",
  ],
  fixed_extinguishing: [
    "sistema fijo de extinción",
    "sistemas fijos de extinción",
  ],
  water_supply: ["abastecimiento de agua", "abastecimientos de agua"],
  smoke_control: [
    "sistema de control de humos y calor",
    "sistemas de control de humos y calor",
  ],
  luminescent_signage: ["señal luminiscente", "señales luminiscentes"],
  other: ["equipo", "equipos"],
};

/** «3 extintores y 1 BIE» a partir de los recuentos por categoría. */
export function equipmentSummary(
  counts: Array<{ code: string; n: number }>,
): string {
  const parts = counts
    .filter((c) => c.n > 0)
    .map((c) => {
      const [one, many] = CATEGORY_WORDS[c.code] ?? CATEGORY_WORDS.other;
      return `${c.n} ${c.n === 1 ? one : many}`;
    });
  if (!parts.length) return "sus equipos";
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
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
  /** Aviso de vencimiento de una instalación (PCI). */
  installation?: {
    name: string;
    address: string | null;
    equipment: string;
  } | null;
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
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export function vehicleLabel(
  make: string | null,
  model: string | null,
): string {
  return [make, model].filter(Boolean).join(" ").trim() || "vehículo";
}

function fill(
  text: string,
  vars: Record<string, string>,
  transform: (v: string) => string = (v) => v,
): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in vars ? transform(vars[key]) : match,
  );
}

/** Variables desconocidas en un texto de plantilla (para validarla al guardar). */
export function unknownVariables(
  text: string,
  kind: EmailKind = "reminder_service_date",
): string[] {
  const allowed = variablesFor(kind);
  return [...text.matchAll(/\{([a-z_]+)\}/g)]
    .map((m) => m[1])
    .filter((k) => !allowed.includes(k));
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
  const color =
    input.workshop.brandColor && SAFE_COLOR.test(input.workshop.brandColor)
      ? input.workshop.brandColor
      : "#c8102e";
  const name = escapeHtml(input.workshop.name);
  const showButton = input.template.buttonEnabled && Boolean(input.ctaHref);
  const contact = [
    input.workshop.address,
    input.workshop.phone,
    input.workshop.email,
  ].filter(Boolean) as string[];

  const htmlParagraphs = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${fill(escapeHtml(p), vars, escapeHtml).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const htmlNote = note
    ? `<p style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${color};background:#f4f5f7;font-size:14px;line-height:1.6">${escapeHtml(note).replace(/\n/g, "<br>")}</p>`
    : "";
  const vehicle = Boolean(vars.matricula);
  const footer = input.unsubscribeUrl
    ? `${vehicle ? `Recibes este aviso porque tu vehículo se revisa en ${name}.` : `Recibes este aviso porque ${name} se ocupa del mantenimiento de tus instalaciones de protección contra incendios.`} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#5b616e">No quiero recibir más avisos</a>.`
    : vehicle
      ? `Recibes este correo por tu cita en ${name}.`
      : `Recibes este correo por el servicio de mantenimiento de ${name}.`;

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
    showButton
      ? `${fill(input.template.buttonLabel, vars)}: ${input.ctaHref}`
      : null,
    contact.length ? contact.join("\n") : null,
    input.unsubscribeUrl
      ? `Para no recibir más avisos: ${input.unsubscribeUrl}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const inst = input.installation;
  return renderWorkshopEmail({
    template: input.template,
    vars: inst
      ? {
          nombre: input.customerFirstName.trim() || "cliente",
          instalacion: inst.name,
          direccion: inst.address ?? "",
          equipos: inst.equipment,
          fecha_revision: formatDate(input.dueDate),
          taller: input.workshop.name,
        }
      : {
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
