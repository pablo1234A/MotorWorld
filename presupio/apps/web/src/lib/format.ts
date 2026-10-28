const LOCALE = 'es-ES';
const DAY_MS = 86_400_000;

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents === null || cents === undefined) return '—';
  let f = currencyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: 'always' });
    currencyFormatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/** Importe compacto para espacios pequeños: 48.500 € → "48,5 mil €". */
export function formatMoneyCompact(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE, { useGrouping: 'always' }).format(n);
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseDate(value) : value;
  return dateFmt.format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return shortDateFmt.format(parseDate(value));
}

/** 'AAAA-MM-DD' se interpreta como fecha local (sin desplazamiento de zona horaria). */
function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** Días naturales completos transcurridos desde una fecha. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

export function formatDays(days: number): string {
  if (days === 0) return 'hoy';
  if (days === 1) return '1 día';
  return `${formatNumber(days)} días`;
}

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

export function formatRelative(iso: string, now = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return 'ahora mismo';
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return formatDate(iso);
}

/** Fecha local 'AAAA-MM-DD' para inputs de tipo date. */
export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convierte la fecha elegida en un input date a ISO. Hoy → ahora mismo (la API rechaza
 * fechas futuras); otro día → mediodía local de ese día.
 */
export function dateInputToIso(value: string, now = new Date()): string {
  if (value === toDateInput(now)) return now.toISOString();
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0).toISOString();
}

/** Como dateInputToIso, pero nunca anterior a `notBefore` (p. ej. la fecha de envío del presupuesto). */
export function dateInputToIsoAfter(value: string, notBefore: string | null, now = new Date()): string {
  const iso = dateInputToIso(value, now);
  return notBefore && new Date(iso) < new Date(notBefore) ? notBefore : iso;
}

/** 'AAAA-MM-DDTHH:MM' local (input datetime-local) → ISO con zona. */
export function dateTimeInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
