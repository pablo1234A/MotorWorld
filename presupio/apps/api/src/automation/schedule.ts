/**
 * Cálculo de fechas del seguimiento en la zona horaria de la empresa, sin dependencias:
 * se apoya en Intl (incluye los cambios de horario de verano/invierno).
 */

export interface ContactRules {
  timezone: string;
  /** Días ISO permitidos: 1 = lunes … 7 = domingo. */
  allowedWeekdays: number[];
  /** 'HH:MM' o 'HH:MM:SS' en hora local de la empresa. */
  windowStart: string;
  windowEnd: string;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAY_MS = 86_400_000;

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Fecha y hora locales de un instante en una zona horaria. */
export function localParts(date: Date, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY[get('weekday')]!,
  };
}

function offsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondiente a una fecha y hora locales en la zona indicada. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(new Date(guess), tz);
  let utc = guess - first;
  const second = offsetMs(new Date(utc), tz);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

function parseTime(value: string): { h: number; m: number } {
  const [h, m] = value.split(':').map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/** Suma días naturales a una fecha local (año, mes, día). */
function addLocalDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function isoWeekday(y: number, m: number, d: number): number {
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/**
 * Primer instante igual o posterior a `from` que cae dentro de un día permitido y de la
 * franja horaria de contacto. Devuelve null si las reglas no permiten ningún hueco.
 */
export function nextAllowedSlot(from: Date, rules: ContactRules): Date | null {
  if (!rules.allowedWeekdays.length) return null;
  const start = parseTime(rules.windowStart);
  const end = parseTime(rules.windowEnd);
  const local = localParts(from, rules.timezone);
  for (let i = 0; i < 15; i++) {
    const day = addLocalDays(local.year, local.month, local.day, i);
    if (!rules.allowedWeekdays.includes(isoWeekday(day.year, day.month, day.day))) continue;
    const windowStart = zonedTimeToUtc(day.year, day.month, day.day, start.h, start.m, rules.timezone);
    const windowEnd = zonedTimeToUtc(day.year, day.month, day.day, end.h, end.m, rules.timezone);
    if (from < windowStart) return windowStart;
    if (from < windowEnd) return from;
  }
  return null;
}

export function isWithinAllowedWindow(at: Date, rules: ContactRules): boolean {
  const slot = nextAllowedSlot(at, rules);
  return slot !== null && slot.getTime() === at.getTime();
}

/**
 * Fecha prevista de un paso: el día natural (en la zona de la empresa) del envío del
 * presupuesto más `offsetDays`, al inicio de la franja de contacto; si ese día no está
 * permitido, el siguiente hueco válido.
 */
export function stepDueAt(sentAt: Date, offsetDays: number, rules: ContactRules): Date | null {
  const sent = localParts(sentAt, rules.timezone);
  const day = addLocalDays(sent.year, sent.month, sent.day, offsetDays);
  const start = parseTime(rules.windowStart);
  const candidate = zonedTimeToUtc(day.year, day.month, day.day, start.h, start.m, rules.timezone);
  return nextAllowedSlot(candidate, rules);
}

/** Días naturales transcurridos entre dos instantes, contados en la zona de la empresa. */
export function localDaysBetween(from: Date, to: Date, tz: string): number {
  const a = localParts(from, tz);
  const b = localParts(to, tz);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}
