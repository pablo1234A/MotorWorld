import { formatDate } from "@/lib/dates";

/**
 * Correo de recordatorio: plantilla (por defecto o del taller), variables y
 * maquetación con la marca del taller. Función pura (se prueba sin red).
 *
 * Seguridad: el texto del taller y los datos del cliente se ESCAPAN antes de
 * insertarse en el HTML (sin XSS) y el asunto se limpia de saltos de línea
 * (sin inyección de cabeceras).
 */

export type ReminderKind = "reminder_service_date" | "reminder_service_km";

export interface TemplateContent {
  subject: string;
  body: string;
  buttonLabel: string;
  buttonEnabled: boolean;
}

/** Plantillas originales (PDF §8). "Restaurar plantilla" vuelve a estas. */
export const DEFAULT_TEMPLATES: Record<ReminderKind, TemplateContent> = {
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
};

export const TEMPLATE_VARIABLES = ["nombre", "modelo", "matricula", "fecha_revision", "taller"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export interface ReminderEmailInput {
  template: TemplateContent;
  customerFirstName: string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  plate: string;
  dueDate: string; // AAAA-MM-DD
  workshop: {
    name: string;
    brandColor?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    /** URL pública absoluta del logo (o relativa en la vista previa del panel). */
    logoUrl?: string | null;
  };
  /** Destino del botón (mailto: o página de cita). Sin destino, no hay botón. */
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

function variables(input: ReminderEmailInput): Record<TemplateVariable, string> {
  const vehicle = [input.vehicleMake, input.vehicleModel].filter(Boolean).join(" ").trim();
  return {
    nombre: input.customerFirstName.trim() || "cliente",
    modelo: vehicle || "vehículo",
    matricula: input.plate,
    fecha_revision: formatDate(input.dueDate),
    taller: input.workshop.name,
  };
}

function fill(text: string, vars: Record<string, string>, transform: (v: string) => string = (v) => v): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? transform(vars[key]) : match));
}

/** Variables desconocidas en un texto de plantilla (para validarla al guardar). */
export function unknownVariables(text: string): string[] {
  return [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !(TEMPLATE_VARIABLES as readonly string[]).includes(k));
}

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const vars = variables(input);
  const subject = fill(input.template.subject, vars)
    .replace(/[\r\n\t\u0000-\u001f]+/g, " ")
    .trim()
    .slice(0, 200);

  const paragraphs = input.template.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const color = input.workshop.brandColor && SAFE_COLOR.test(input.workshop.brandColor) ? input.workshop.brandColor : "#1f4fd8";
  const name = escapeHtml(input.workshop.name);
  const showButton = input.template.buttonEnabled && Boolean(input.ctaHref);
  const contact = [input.workshop.address, input.workshop.phone, input.workshop.email].filter(Boolean) as string[];

  const htmlParagraphs = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${fill(escapeHtml(p), vars, escapeHtml).replace(/\n/g, "<br>")}</p>`)
    .join("");

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
${
  showButton
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.ctaHref!)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${escapeHtml(fill(input.template.buttonLabel, vars))}</a></p>`
    : ""
}
${contact.length ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b616e">${contact.map(escapeHtml).join("<br>")}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f5f7;font-size:12px;line-height:1.6;color:#5b616e">
Recibes este aviso porque tu vehículo se revisa en ${name}. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#5b616e">No quiero recibir más avisos</a>.
</td></tr>
</table>
</body></html>`;

  const text = [
    ...paragraphs.map((p) => fill(p, vars)),
    showButton ? `${fill(input.template.buttonLabel, vars)}: ${input.ctaHref}` : null,
    contact.length ? contact.join("\n") : null,
    `Para no recibir más avisos: ${input.unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
