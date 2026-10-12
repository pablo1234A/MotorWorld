// Cálculo de huecos libres: horario del negocio ∩ ventana de reserva − ocupado en Google Calendar.
import { getBusy } from './google.js';
import { zonedToUtc, localDate, localTime, weekdayOf, addDays, parseHHMM, WEEKDAYS, isDateStr } from './time.js';

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findService(config, name) {
  const services = config.services || [];
  if (!services.length) return null;
  if (!name) return services.length === 1 ? services[0] : null;
  const n = normalize(name);
  return (
    services.find((s) => normalize(s.name) === n) ||
    services.find((s) => normalize(s.name).includes(n) || n.includes(normalize(s.name))) ||
    services.find((s) => n.split(' ').some((w) => w.length > 3 && normalize(s.name).includes(w))) ||
    null
  );
}

function rangesFor(config, dateStr) {
  const day = WEEKDAYS[weekdayOf(dateStr)];
  const entry = (config.weeklyHours || []).find((d) => d.day === day);
  if (!entry || !entry.open) return [];
  return (entry.ranges || [])
    .map((r) => ({ start: parseHHMM(r.start), end: parseHHMM(r.end) }))
    .filter((r) => r.start != null && r.end != null && r.end > r.start);
}

// Genera los huecos candidatos (sin mirar el calendario) para una fecha local.
export function candidateSlots(config, dateStr, durationMinutes, now = Date.now()) {
  const tz = config.timezone;
  const today = localDate(now, tz);
  if (dateStr < today) return { slots: [], reason: 'past' };
  if (dateStr > addDays(today, config.maxDaysAhead ?? 60)) return { slots: [], reason: 'too_far' };
  if ((config.closedDates || []).includes(dateStr)) return { slots: [], reason: 'closed_date' };
  const ranges = rangesFor(config, dateStr);
  if (!ranges.length) return { slots: [], reason: 'closed_day' };

  const step = Math.max(5, config.slotIntervalMinutes || 30);
  const earliest = now + (config.minNoticeHours ?? 2) * 3_600_000;
  const slots = [];
  for (const r of ranges) {
    for (let m = r.start; m + durationMinutes <= r.end; m += step) {
      const start = zonedToUtc(dateStr, m, tz);
      if (start < earliest) continue;
      slots.push({ start, end: start + durationMinutes * 60_000 });
    }
  }
  return { slots, reason: slots.length ? null : 'no_time_left' };
}

function overlaps(slot, busy, bufferMs) {
  return busy.some((b) => slot.start - bufferMs < b.end && slot.end + bufferMs > b.start);
}

// Disponibilidad real para varios días consecutivos. Una sola consulta free/busy para todo el rango.
export async function availability(bot, { service, fromDate, days = 1, now = Date.now() }) {
  const config = bot.config;
  const tz = config.timezone;
  const start = isDateStr(fromDate) ? fromDate : localDate(now, tz);
  const n = Math.min(Math.max(1, days | 0), 14);
  const duration = service.durationMinutes;

  const perDay = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    perDay.push({ date, ...candidateSlots(config, date, duration, now) });
  }
  const all = perDay.flatMap((d) => d.slots);
  let busy = [];
  if (all.length) {
    const bufferMs = (config.bufferMinutes || 0) * 60_000;
    busy = await getBusy(bot, all[0].start - bufferMs, all[all.length - 1].end + bufferMs);
  }
  const bufferMs = (config.bufferMinutes || 0) * 60_000;
  return perDay.map((d) => {
    const free = d.slots.filter((s) => !overlaps(s, busy, bufferMs));
    let reason = d.reason;
    if (!reason && !free.length) reason = 'fully_booked';
    return { date: d.date, times: free.map((s) => localTime(s.start, tz)), reason, _free: free };
  });
}

// Comprueba si una hora concreta está libre ahora mismo (se usa justo antes de crear el evento).
export async function isSlotFree(bot, service, dateStr, timeStr, now = Date.now()) {
  const [day] = await availability(bot, { service, fromDate: dateStr, days: 1, now });
  const minutes = parseHHMM(timeStr);
  if (minutes == null) return { ok: false, reason: 'bad_time', day };
  const start = zonedToUtc(dateStr, minutes, bot.config.timezone);
  const slot = day._free.find((s) => s.start === start);
  return slot ? { ok: true, slot, day } : { ok: false, reason: day.reason || 'taken', day };
}

export const REASONS_ES = {
  past: 'esa fecha ya ha pasado',
  too_far: 'todavía no se puede reservar tan lejos',
  closed_date: 'el negocio cierra ese día',
  closed_day: 'el negocio no abre ese día de la semana',
  no_time_left: 'ya no quedan horas con suficiente antelación ese día',
  fully_booked: 'está todo reservado ese día',
  taken: 'esa hora ya no está disponible',
  bad_time: 'la hora no tiene un formato válido',
};
