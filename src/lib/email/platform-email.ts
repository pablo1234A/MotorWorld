import { escapeHtml } from "./reminder-email";

/**
 * Correos de RevisaYa al propio taller (resumen, avisos de consumo). Función
 * pura: todo el contenido variable se escapa.
 */
export interface PlatformEmailInput {
  title: string;
  intro: string;
  rows?: Array<[label: string, value: string]>;
  notes?: string[];
  link?: { href: string; label: string };
}

export function renderPlatformEmail(input: PlatformEmailInput): { html: string; text: string } {
  const rows = input.rows ?? [];
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#14161a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#14161a;padding:18px 28px;color:#ffffff;font-size:16px;font-weight:700">RevisaYa</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(input.intro)}</p>
${
  rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 0;border-bottom:1px solid #e6e8ec;color:#5b616e">${escapeHtml(label)}</td><td style="padding:6px 0;border-bottom:1px solid #e6e8ec;text-align:right;font-weight:600">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${(input.notes ?? []).map((n) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3a3f4a">${escapeHtml(n)}</p>`).join("")}
${input.link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(input.link.href)}" style="display:inline-block;background:#1f4fd8;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${escapeHtml(input.link.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 28px;background:#f4f5f7;font-size:12px;color:#5b616e">Recibes este correo porque administras un taller en RevisaYa. Puedes cambiar la frecuencia del resumen en Configuración → Correo.</td></tr>
</table></body></html>`;
  const text = [
    input.title,
    input.intro,
    ...rows.map(([l, v]) => `${l}: ${v}`),
    ...(input.notes ?? []),
    input.link ? `${input.link.label}: ${input.link.href}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
