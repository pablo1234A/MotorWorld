/**
 * Fechas de negocio como texto ISO `AAAA-MM-DD` (sin horas ni zonas: una
 * revisión ocurre un día, no en un instante). Presentación en formato español.
 */

export const DEFAULT_TIMEZONE = "Europe/Madrid";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Día de hoy en la zona horaria indicada (por defecto Península). */
export function todayIn(timeZone = DEFAULT_TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** ¿Es una fecha de calendario real? (rechaza 2026-02-31) */
export function isValidIsoDate(value: string): boolean {
  const m = value.match(ISO_DATE);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** dd/mm/aaaa */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const m = isoDate.match(ISO_DATE);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

/** Días entre hoy y la fecha (negativo si ya pasó). */
export function daysUntil(isoDate: string, today = todayIn()): number {
  const [a, b] = [isoDate, today].map((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((a - b) / 86_400_000);
}

export function formatKm(km: number | null | undefined): string {
  return km == null ? "" : `${km.toLocaleString("es-ES")} km`;
}
