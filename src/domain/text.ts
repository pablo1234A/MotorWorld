/** Utilidades de texto puras usadas por el generador, los adaptadores y las exportaciones. */

export function collapseWhitespace(value: string): string {
  return value.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Elimina etiquetas HTML y caracteres de control. El contenido de usuario se trata siempre como texto plano. */
export function sanitizeText(value: string | null | undefined, maxLength = 20000): string {
  if (!value) return "";
  return value
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeLine(value: string | null | undefined, maxLength = 300): string {
  return sanitizeText(value, maxLength * 2).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Recorta sin partir palabras. Añade "…" solo si hay espacio para ello. */
export function truncateAtWord(value: string, max: number, ellipsis = true): string {
  const text = value.trim();
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const limit = ellipsis && max > 12 ? max - 1 : max;
  let cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > limit * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[\s,;:·|\-–(]+$/u, "");
  return ellipsis && max > 12 ? `${cut}…` : cut;
}

export function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function includesNormalized(haystack: string, needle: string): boolean {
  const target = normalizeForCompare(needle);
  return target !== "" && ` ${normalizeForCompare(haystack)} `.includes(` ${target} `);
}

export function firstSentences(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [text];
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > maxLength) break;
    result += sentence;
  }
  return result.trim() || truncateAtWord(text, maxLength);
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeForCompare(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/** Convierte texto plano con viñetas en HTML seguro (párrafos y listas). */
export function plainToHtml(value: string): string {
  const blocks = value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const bullets = lines.filter((line) => /^[•\-✓*]\s+/.test(line));
      if (bullets.length > 0 && bullets.length >= lines.length - 1) {
        const heading = lines.find((line) => !/^[•\-✓*]\s+/.test(line));
        const items = bullets.map((line) => `<li>${escapeHtml(line.replace(/^[•\-✓*]\s+/, ""))}</li>`).join("");
        return `${heading ? `<p><strong>${escapeHtml(heading)}</strong></p>` : ""}<ul>${items}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
    })
    .join("\n");
}

export function htmlToPlain(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\s*\/\s*(p|ul|ol|li|div|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeHtml(value: string): boolean {
  return /<\s*(p|ul|li|br|strong)\b[^>]*>/i.test(value);
}
