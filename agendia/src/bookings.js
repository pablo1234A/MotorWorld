// Reservas: crear (con doble comprobación de disponibilidad), buscar y cancelar. Envía los emails.
import crypto from 'node:crypto';
import { saveBooking, listBookings, getBooking } from './db.js';
import { createEvent, deleteEvent, sendEmail } from './google.js';
import { isSlotFree, findService } from './availability.js';
import { localDate, localTime, humanDate, toZonedIso } from './time.js';

export const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[a-z]{2,}$/i;

// Un candado por bot evita que dos clientes reserven el mismo hueco a la vez.
const locks = new Map();
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

function code() {
  // Código corto y legible, sin caracteres ambiguos.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

export function publicBooking(b, tz) {
  return {
    code: b.id,
    service: b.service,
    date: localDate(Date.parse(b.start), tz),
    time: localTime(Date.parse(b.start), tz),
    endTime: localTime(Date.parse(b.end), tz),
    name: b.customer.name,
    status: b.status,
  };
}

export async function createBooking(bot, input) {
  const config = bot.config;
  const service = findService(config, input.service);
  if (!service) {
    return { ok: false, error: 'service_not_found', services: config.services.map((s) => s.name) };
  }
  const email = String(input.email || '').trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' };
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) return { ok: false, error: 'missing_name' };
  const phone = String(input.phone || '').trim().slice(0, 40);
  if (config.collectPhone && !phone) return { ok: false, error: 'missing_phone' };

  return withLock(bot.id, async () => {
    const check = await isSlotFree(bot, service, input.date, input.time);
    if (!check.ok) {
      return {
        ok: false,
        error: 'slot_unavailable',
        reason: check.reason,
        alternatives_same_day: check.day.times.slice(0, 8),
      };
    }
    const id = code();
    const tz = config.timezone;
    const notes = String(input.notes || '').trim().slice(0, 500);
    const booking = {
      id,
      botId: bot.id,
      service: service.name,
      start: new Date(check.slot.start).toISOString(),
      end: new Date(check.slot.end).toISOString(),
      customer: { name, email, phone },
      notes,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    const ev = await createEvent(bot, {
      bookingId: id,
      summary: `${service.name} · ${name}`,
      description: [
        `Reserva ${id} creada por el asistente de ${config.businessName}.`,
        `Cliente: ${name}`,
        `Email: ${email}`,
        phone && `Teléfono: ${phone}`,
        notes && `Notas: ${notes}`,
      ]
        .filter(Boolean)
        .join('\n'),
      start: check.slot.start,
      end: check.slot.end,
      timeZone: tz,
      attendeeEmail: email,
      attendeeName: name,
    });
    booking.eventId = ev.eventId;
    booking.htmlLink = ev.htmlLink;
    saveBooking(booking);

    notify(bot, booking, 'confirmed');
    return { ok: true, booking: publicBooking(booking, tz), startIso: toZonedIso(check.slot.start, tz) };
  });
}

export function findBookingsByEmail(bot, email) {
  const now = Date.now();
  const e = String(email || '').trim().toLowerCase();
  return listBookings(bot.id)
    .filter((b) => b.status === 'confirmed' && b.customer.email.toLowerCase() === e && Date.parse(b.end) > now)
    .map((b) => publicBooking(b, bot.config.timezone));
}

export async function cancelBooking(bot, { code: id, email }, { byAdmin = false } = {}) {
  const b = getBooking(String(id || '').trim().toUpperCase());
  if (!b || b.botId !== bot.id) return { ok: false, error: 'not_found' };
  if (!byAdmin && b.customer.email.toLowerCase() !== String(email || '').trim().toLowerCase()) {
    return { ok: false, error: 'email_mismatch' };
  }
  if (b.status !== 'confirmed') return { ok: false, error: 'already_cancelled' };
  if (Date.parse(b.start) < Date.now()) return { ok: false, error: 'already_started' };
  await deleteEvent(bot, b.eventId);
  b.status = 'cancelled';
  b.cancelledAt = new Date().toISOString();
  saveBooking(b);
  notify(bot, b, 'cancelled');
  return { ok: true, booking: publicBooking(b, bot.config.timezone) };
}

// ---------- Emails ----------
function notify(bot, b, kind) {
  const tz = bot.config.timezone;
  const when = `${humanDate(localDate(Date.parse(b.start), tz))} a las ${localTime(Date.parse(b.start), tz)}`;
  const color = bot.config.brandColor || '#3b5bfd';
  const biz = bot.config.businessName;
  const tasks = [];
  if (kind === 'confirmed') {
    tasks.push(
      sendEmail(bot, {
        to: b.customer.email,
        subject: `Reserva confirmada · ${biz}`,
        html: emailHtml(color, biz, `¡Listo, ${esc(b.customer.name)}!`, `Tu cita de <b>${esc(b.service)}</b> está confirmada para el <b>${esc(when)}</b>.`, [
          ['Código de reserva', b.id],
          ['Servicio', b.service],
          ['Cuándo', when],
        ], `Si necesitas cancelar, escribe al asistente con tu código <b>${b.id}</b> o responde a este correo.`),
      })
    );
  } else {
    tasks.push(
      sendEmail(bot, {
        to: b.customer.email,
        subject: `Reserva cancelada · ${biz}`,
        html: emailHtml(color, biz, 'Reserva cancelada', `Hemos cancelado tu cita de <b>${esc(b.service)}</b> del <b>${esc(when)}</b>.`, [['Código', b.id]], '¿Quieres otra fecha? Vuelve a escribir al asistente cuando quieras.'),
      })
    );
  }
  if (bot.businessEmail) {
    tasks.push(
      sendEmail(bot, {
        to: bot.businessEmail,
        subject: `${kind === 'confirmed' ? 'Nueva reserva' : 'Cancelación'}: ${b.service} · ${when}`,
        html: emailHtml(color, biz, kind === 'confirmed' ? 'Nueva reserva' : 'Reserva cancelada', `${esc(b.customer.name)} — ${esc(b.service)} — ${esc(when)}`, [
          ['Código', b.id],
          ['Email', b.customer.email],
          ['Teléfono', b.customer.phone || '—'],
          ['Notas', b.notes || '—'],
        ], kind === 'confirmed' ? 'Ya está en tu Google Calendar.' : 'El evento se ha eliminado de tu Google Calendar.'),
      })
    );
  }
  Promise.allSettled(tasks).then((rs) => {
    for (const r of rs) if (r.status === 'rejected') console.error('[email]', r.reason?.message || r.reason);
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function emailHtml(color, biz, title, lead, rows, foot) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16161d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="height:6px;background:${esc(color)}"></td></tr>
<tr><td style="padding:28px 32px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b78">${esc(biz)}</td></tr>
<tr><td style="padding:0 32px;font-size:24px;font-weight:700">${title}</td></tr>
<tr><td style="padding:12px 32px 20px;font-size:15px;line-height:1.55;color:#3a3a46">${lead}</td></tr>
<tr><td style="padding:0 32px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ececf1">
${rows.map(([k, v]) => `<tr><td style="padding:10px 0;font-size:13px;color:#6b6b78;border-bottom:1px solid #ececf1">${esc(k)}</td><td align="right" style="padding:10px 0;font-size:14px;font-weight:600;border-bottom:1px solid #ececf1">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:20px 32px 28px;font-size:13px;line-height:1.55;color:#6b6b78">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}
