/** Utilidades de fecha con zona horaria IANA sin dependencias externas. */

function partsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Desfase (ms) de la zona respecto a UTC en un instante dado. */
function offsetMs(date: Date, timeZone: string) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondiente a una hora local (y/m/d h:00) en la zona dada. */
function zonedToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const off1 = offsetMs(new Date(guess), timeZone);
  const t = guess - off1;
  const off2 = offsetMs(new Date(t), timeZone);
  return new Date(guess - off2);
}

/**
 * Ajusta una fecha a la siguiente ventana horaria permitida [start, end) en
 * hora local del negocio. Si no hay ventana, devuelve la fecha sin cambios.
 */
export function applySendWindow(date: Date, timeZone: string, start: number | null, end: number | null): Date {
  if (start == null || end == null) return date;
  const p = partsInZone(date, timeZone);
  if (p.hour >= start && p.hour < end) return date;
  if (p.hour < start) return zonedToUtc(p.year, p.month, p.day, start, timeZone);
  // Después de la ventana: al inicio de la ventana del día siguiente.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), start, timeZone);
}

export function localHour(date: Date, timeZone: string) {
  return partsInZone(date, timeZone).hour;
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
