import type { RenderedBlock, RenderedDocument } from "./engine";

export interface OutputMeta {
  documentTypeName: string;
  ownerName: string;
  /** Sitio web al que se aplica el documento (se muestra en la cabecera). */
  website?: string;
  generatedAt: Date;
  templateVersionLabel: string;
  /** Plantilla de demostración: el documento no tiene validez jurídica. */
  isDemo: boolean;
  /** Vista previa antes de la compra. */
  isPreview?: boolean;
  /** Referencia de revisión jurídica de la plantilla (si está aprobada). */
  reviewSummary?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa el texto y convierte en enlaces las URL https y los emails. */
export function richText(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:)]/g, (url) => `<a href="${url}" rel="noopener noreferrer">${url}</a>`)
    .replace(
      /(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?=$|[\s.,;:)])/g,
      (_m, pre: string, email: string) => `${pre}<a href="mailto:${email}">${email}</a>`,
    );
}

function blockHtml(b: RenderedBlock): string {
  switch (b.type) {
    case "paragraph":
      return `<p>${richText(b.text)}</p>`;
    case "heading":
      return `<h3>${escapeHtml(b.text)}</h3>`;
    case "callout":
      return `<aside class="lg-callout lg-callout-${b.tone}"><p>${richText(b.text)}</p></aside>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((i) => `<li>${richText(i)}</li>`).join("")}</${tag}>`;
    }
    case "table":
      return `<div class="lg-table" tabindex="0" role="region" aria-label="Tabla"><table><thead><tr>${b.columns
        .map((c) => `<th scope="col">${escapeHtml(c)}</th>`)
        .join("")}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td>${richText(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
  }
}

export function demoNotice(meta: OutputMeta): string | null {
  if (meta.isDemo) {
    return "DOCUMENTO DE DEMOSTRACIÓN. Generado con una plantilla que todavía no ha sido revisada ni aprobada por un profesional jurídico. No tiene validez y no debe publicarse.";
  }
  if (meta.isPreview) return "VISTA PREVIA. Completa la compra para descargar la versión final del documento.";
  return null;
}

/** Fragmento HTML para insertar en una web existente o mostrar en el panel. */
export function renderHtmlFragment(doc: RenderedDocument, meta: OutputMeta): string {
  const notice = demoNotice(meta);
  const parts: string[] = [`<article class="legalito-doc" lang="es">`];
  if (notice) parts.push(`<p class="lg-notice" role="note"><strong>${escapeHtml(notice)}</strong></p>`);
  parts.push(`<h1>${escapeHtml(doc.title)}</h1>`);
  const metaLine = [meta.ownerName && `Titular: ${escapeHtml(meta.ownerName)}`, meta.website && `Sitio web: ${richText(meta.website)}`].filter(Boolean);
  if (metaLine.length) parts.push(`<p class="lg-meta">${metaLine.join(" · ")}</p>`);
  // Índice navegable en los documentos largos (los identificadores llevan prefijo para no chocar con la web del cliente).
  if (doc.sections.length >= 5) {
    parts.push(
      `<nav class="lg-toc" aria-label="Índice"><p class="lg-toc-title">Índice</p><ol>${doc.sections
        .map((s) => `<li><a href="#lg-${escapeHtml(s.id)}">${escapeHtml(s.heading)}</a></li>`)
        .join("")}</ol></nav>`,
    );
  }
  parts.push(...doc.intro.map(blockHtml));
  for (const s of doc.sections) {
    parts.push(`<section id="lg-${escapeHtml(s.id)}"><h2>${s.number}. ${escapeHtml(s.heading)}</h2>`);
    parts.push(...s.blocks.map(blockHtml));
    parts.push(`</section>`);
  }
  parts.push(...doc.closing.map(blockHtml));
  parts.push(`</article>`);
  return parts.join("\n");
}

const STYLES = `
  .legalito-doc{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1d2533;line-height:1.65;max-width:780px;margin:0 auto;padding:40px 24px;font-size:16px}
  .legalito-doc h1{font-size:30px;line-height:1.2;color:#1F3A5F;margin:0 0 24px;letter-spacing:-.01em}
  .legalito-doc h2{font-size:19px;color:#1F3A5F;margin:36px 0 12px}
  .legalito-doc h3{font-size:16px;margin:20px 0 8px}
  .legalito-doc p{margin:0 0 12px}
  .legalito-doc li{margin:0 0 6px}
  .legalito-doc ul,.legalito-doc ol{padding-left:22px;margin:0 0 16px}
  .legalito-doc a{color:#2F5D8C;word-break:break-word}
  .legalito-doc .lg-table{overflow-x:auto;margin:0 0 16px}
  .legalito-doc table{border-collapse:collapse;width:100%;font-size:14px}
  .legalito-doc th,.legalito-doc td{border:1px solid #d9dee6;padding:8px 10px;text-align:left;vertical-align:top}
  .legalito-doc th{background:#F4F1EA;color:#1F3A5F}
  .legalito-doc .lg-notice{background:#fff4e5;border:1px solid #f0b458;color:#7a4a00;padding:12px 16px;border-radius:8px}
  .legalito-doc .lg-meta{color:#5d6878;font-size:14px;margin:-12px 0 24px;padding-bottom:16px;border-bottom:1px solid #e6e2d9}
  .legalito-doc .lg-toc{background:#f8f6f1;border:1px solid #e6e2d9;border-radius:10px;padding:16px 20px;margin:0 0 28px}
  .legalito-doc .lg-toc-title{font-weight:600;color:#1F3A5F;margin:0 0 8px}
  .legalito-doc .lg-toc ol{margin:0;padding-left:20px;columns:2;column-gap:32px;font-size:14px}
  .legalito-doc .lg-toc li{margin:0 0 4px;break-inside:avoid}
  @media (max-width:600px){.legalito-doc .lg-toc ol{columns:1}}
  .legalito-doc .lg-callout{border-left:3px solid #2F5D8C;background:#f3f6fa;padding:10px 14px;margin:0 0 16px}
  .legalito-doc .lg-callout-warning{border-color:#c77700;background:#fff8ee}
`;

/** Documento HTML completo y autocontenido para descargar. */
export function renderHtmlDocument(doc: RenderedDocument, meta: OutputMeta): string {
  const title = `${doc.title} · ${meta.ownerName}`;
  const robots = meta.isDemo || meta.isPreview ? `\n<meta name="robots" content="noindex">` : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>${robots}
<style>${STYLES}</style>
</head>
<body>
${renderHtmlFragment(doc, meta)}
<!-- Generado con Legalito · Plantilla ${escapeHtml(meta.templateVersionLabel)} · ${meta.generatedAt.toISOString()} -->
</body>
</html>
`;
}
