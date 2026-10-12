// Utilidades de fecha/hora con zonas horarias IANA sin dependencias externas.
// Todo el cálculo de huecos se hace en "hora local del negocio" y se convierte a UTC.

const partsCache = new Map();

function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      })
    );
  }
  return partsCache.get(tz);
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

// Devuelve la hora "de pared" de un instante en la zona dada.
export function wallClock(ms, tz) {
  const out = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

function offsetMs(ms, tz) {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Convierte fecha local (YYYY-MM-DD) + minutos desde medianoche en un instante UTC (ms).
export function zonedToUtc(dateStr, minutes, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let t = guess - offsetMs(guess, tz);
  const off2 = offsetMs(t, tz);
  if (guess - off2 !== t) t = guess - off2;
  return t;
}

export function localDate(ms, tz) {
  const w = wallClock(ms, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function localTime(ms, tz) {
  const w = wallClock(ms, tz);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

// ISO 8601 con el offset de la zona (p. ej. 2026-10-14T10:30:00+02:00).
export function toZonedIso(ms, tz) {
  const off = Math.round(offsetMs(ms, tz) / 60000);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${localDate(ms, tz)}T${localTime(ms, tz)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

export function isDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function humanDate(dateStr, locale = 'es-ES') {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function pad(n) {
  return String(n).padStart(2, '0');
}
