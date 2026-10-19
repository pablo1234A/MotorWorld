export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// useGrouping 'always' → "3.000 €" (es-ES no agrupa números de 4 cifras por defecto)
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return eur.format(n);
}

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
export const fmtNum = (n: number) => nf.format(n);

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Pasa a minúscula la primera letra salvo que sea una sigla (CTA, SEO…). */
export function lowerFirst(s: string) {
  return /^[A-ZÁÉÍÓÚÑ]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

export function upperFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function initials(s: string) {
  return (
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '·'
  );
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function matches(haystack: string, needle: string) {
  const n = normalize(needle.trim());
  if (!n) return true;
  return normalize(haystack).includes(n);
}

export function cleanUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function waLink(phone: string, text = ''): string {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  const num = digits.length === 9 ? `34${digits}` : digits; // España por defecto
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function igLink(handle: string): string {
  const h = handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  return `https://instagram.com/${h}`;
}
