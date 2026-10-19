// Utilidades de fecha en hora local. Los días se representan como 'YYYY-MM-DD'.

export function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function toDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return toDay(new Date());
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** b - a en días */
export function diffDays(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86400000);
}

export function daysAgo(day: string | null): number | null {
  if (!day) return null;
  return diffDays(day, today());
}

export function startOfWeek(day: string): string {
  const d = parseDay(day);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return toDay(d);
}

export function startOfMonth(day: string): string {
  return day.slice(0, 8) + '01';
}

export function daysInMonth(day: string): number {
  const d = parseDay(day);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEKDAYS_MED = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function monthName(day: string) {
  const d = parseDay(day);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDay(day: string | null, opts: { weekday?: boolean } = {}): string {
  if (!day) return '—';
  const d = parseDay(day);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return opts.weekday ? `${WEEKDAYS[d.getDay()]}, ${base}` : base;
}

export function fmtLongDay(day: string): string {
  const d = parseDay(day);
  const s = `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relDay(day: string | null): string {
  if (!day) return 'Sin fecha';
  const n = diffDays(today(), day);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n < 0) return `Hace ${-n} días`;
  if (n < 7) return `En ${n} días`;
  return fmtDay(day);
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Días hábiles restantes del mes (incluido hoy) según los días laborables configurados. */
export function workDaysLeftInMonth(workDays: number[]): number {
  const t = today();
  const total = daysInMonth(t);
  const start = parseDay(t).getDate();
  let n = 0;
  for (let i = start; i <= total; i++) {
    const d = parseDay(t);
    d.setDate(i);
    if (workDays.includes(d.getDay())) n++;
  }
  return Math.max(1, n);
}
