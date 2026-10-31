// Motor de plantillas de correo. Compartido entre servidor (envío real) y
// cliente (vista previa del editor), de modo que lo que se previsualiza es
// exactamente lo que se envía.

export const TEMPLATE_VARIABLES = [
  { key: "nombre_cliente", label: "Nombre del cliente", example: "Laura" },
  { key: "nombre_negocio", label: "Nombre del negocio", example: "Clínica Dental Sonrisa" },
  { key: "enlace_resena", label: "Enlace para dejar la reseña", example: "https://g.page/r/ejemplo/review" },
  { key: "nombre_servicio", label: "Servicio o producto", example: "limpieza dental" },
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]["key"];

export type TemplateFields = {
  subject: string;
  greeting: string;
  body: string;
  closing: string;
  signature: string;
  buttonLabel: string;
};

export type RenderContext = {
  customerName: string;
  businessName: string;
  reviewUrl: string;
  serviceName?: string | null;
  /** Enlace de baja (obligatorio en envíos reales, LSSI art. 21). */
  unsubscribeUrl?: string | null;
  /** Identificación del remitente que aparece al pie (nombre, dirección). */
  footerLines?: string[];
};

export const DEFAULT_TEMPLATE: TemplateFields = {
  subject: "¿Qué te ha parecido nuestro servicio?",
  greeting: "Hola {{nombre_cliente}},",
  body:
    "Desde {{nombre_negocio}} queremos agradecerte que hayas confiado en nosotros.\n\n" +
    "Nos ayudaría muchísimo conocer tu experiencia, sea cual sea. Si tienes un momento, puedes dejarnos tu opinión aquí:\n\n" +
    "{{enlace_resena}}",
  closing: "¡Muchas gracias por tu confianza!",
  signature: "El equipo de {{nombre_negocio}}",
  buttonLabel: "Dejar mi opinión",
};

export const FIELD_LIMITS: Record<keyof TemplateFields, number> = {
  subject: 160,
  greeting: 200,
  body: 4000,
  closing: 500,
  signature: 300,
  buttonLabel: 40,
};

const VAR_RE = /\{\{\s*([a-zA-Z_ñÑ]+)\s*\}\}/g;
const KNOWN = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));

export function findUnknownVariables(fields: Partial<TemplateFields>): string[] {
  const unknown = new Set<string>();
  for (const value of Object.values(fields)) {
    if (typeof value !== "string") continue;
    for (const m of value.matchAll(VAR_RE)) if (!KNOWN.has(m[1])) unknown.add(m[1]);
  }
  return [...unknown];
}

export function templateHasReviewLink(fields: Pick<TemplateFields, "body">) {
  return /\{\{\s*enlace_resena\s*\}\}/.test(fields.body);
}

/**
 * Detecta lenguaje que ofrezca incentivos o condicione la reseña. Reseñalo
 * solo permite solicitudes neutrales; se usa para bloquear el guardado.
 */
const INCENTIVE_PATTERNS: RegExp[] = [
  /\b(descuento|cup[oó]n|regalo|sorteo|premio|recompensa|gratis|obsequio)\b/i,
  /\b5\s*estrellas\b/i,
  /\bcinco\s+estrellas\b/i,
  /\bsolo\s+si\s+(est[aá]s|has\s+quedado)\s+(satisfech|content)/i,
  /\bsi\s+no\s+est[aá]s\s+satisfech[oa].{0,40}(escr[ií]benos|cont[aá]ctanos)\s+(a\s+nosotros\s+)?(en\s+lugar|antes)/i,
];

export function detectIncentiveLanguage(fields: Partial<TemplateFields>): string[] {
  const hits = new Set<string>();
  for (const value of Object.values(fields)) {
    if (typeof value !== "string") continue;
    for (const re of INCENTIVE_PATTERNS) {
      const m = value.match(re);
      if (m) hits.add(m[0]);
    }
  }
  return [...hits];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function values(ctx: RenderContext): Record<TemplateVariable, string> {
  return {
    nombre_cliente: (ctx.customerName ?? "").trim(),
    nombre_negocio: (ctx.businessName ?? "").trim(),
    enlace_resena: ctx.reviewUrl,
    nombre_servicio: (ctx.serviceName ?? "").trim() || "nuestro servicio",
  };
}

function substitute(text: string, vals: Record<string, string>): string {
  return tidy(text.replace(VAR_RE, (_m, key: string) => vals[key] ?? ""));
}

/** Limpia artefactos cuando una variable está vacía ("Hola ," → "Hola,"). */
function tidy(s: string) {
  return s.replace(/[ \t]+([,.;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
}

/** Elimina saltos de línea y caracteres de control: evita inyección de cabeceras. */
export function sanitizeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function isSafeUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderTemplate(fields: TemplateFields, ctx: RenderContext): RenderedEmail {
  const vals = values(ctx);
  if (!isSafeUrl(ctx.reviewUrl)) throw new Error("El enlace de reseña no es una URL válida");

  const subject = sanitizeHeader(substitute(fields.subject, vals)).slice(0, 200);
  const greeting = substitute(fields.greeting, vals);
  const body = substitute(fields.body, vals);
  const closing = substitute(fields.closing, vals);
  const signature = substitute(fields.signature, vals);
  const buttonLabel = sanitizeHeader(substitute(fields.buttonLabel || "Dejar mi opinión", vals));

  // ── Texto plano ──
  const footer = [...(ctx.footerLines ?? [])].filter(Boolean);
  const textParts = [greeting, body, closing, signature].filter((p) => p.trim().length);
  let text = textParts.join("\n\n");
  if (footer.length || ctx.unsubscribeUrl) {
    text += "\n\n--\n" + footer.join("\n");
    if (ctx.unsubscribeUrl) text += `${footer.length ? "\n" : ""}Si no deseas recibir más solicitudes de opinión: ${ctx.unsubscribeUrl}`;
  }

  // ── HTML ──
  // Se escapa TODO el contenido del usuario; solo el enlace de reseña se convierte en <a>.
  const linkToken = "\u0000LINK\u0000";
  const paragraphsHtml = (raw: string) => {
    const withToken = raw.split(vals.enlace_resena).join(linkToken);
    return withToken
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => {
        if (para === linkToken) return button(vals.enlace_resena, buttonLabel);
        const html = escapeHtml(para)
          .split(linkToken)
          .join(`<a href="${escapeHtml(vals.enlace_resena)}" style="color:#2b2523;text-decoration:underline;">${escapeHtml(vals.enlace_resena)}</a>`)
          .replace(/\n/g, "<br>");
        return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2523;">${html}</p>`;
      })
      .join("");
  };

  const bodyHasLink = body.includes(vals.enlace_resena);
  const footerHtml = footer.length
    ? `<p style="margin:0 0 6px;">${footer.map(escapeHtml).join("<br>")}</p>`
    : "";
  const unsubHtml = ctx.unsubscribeUrl
    ? `<p style="margin:0;">Si no deseas recibir más solicitudes de opinión, <a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#7a716d;">date de baja aquí</a>.</p>`
    : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f2ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ea;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ebe4d8;border-radius:12px;">
<tr><td style="padding:28px 32px 8px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 20px;font-size:13px;font-weight:bold;letter-spacing:.02em;color:#7a716d;">${escapeHtml(vals.nombre_negocio)}</p>
${paragraphsHtml(greeting)}
${paragraphsHtml(body)}
${bodyHasLink ? "" : button(vals.enlace_resena, buttonLabel)}
${paragraphsHtml(closing)}
${paragraphsHtml(signature)}
</td></tr>
<tr><td style="padding:16px 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a716d;border-top:1px solid #f0ebe2;">
${footerHtml}${unsubHtml}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}

function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#2b2523;">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}
