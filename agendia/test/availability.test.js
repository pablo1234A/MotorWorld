import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agendia-test-'));
const { zonedToUtc, localDate, localTime, toZonedIso, weekdayOf } = await import('../src/time.js');
const { candidateSlots, findService, availability } = await import('../src/availability.js');
const { sanitizeConfig } = await import('../src/ai.js');
const { loadDb, saveBooking } = await import('../src/db.js');

loadDb();

const config = sanitizeConfig({
  businessName: 'Test',
  timezone: 'Europe/Madrid',
  services: [
    { name: 'Corte de pelo', durationMinutes: 30, price: '15 €' },
    { name: 'Color', durationMinutes: 90, price: '' },
  ],
  weeklyHours: [
    { day: 'monday', open: false, ranges: [] },
    { day: 'tuesday', open: true, ranges: [{ start: '10:00', end: '14:00' }, { start: '16:00', end: '20:00' }] },
    { day: 'wednesday', open: true, ranges: [{ start: '10:00', end: '14:00' }] },
    { day: 'thursday', open: true, ranges: [{ start: '10:00', end: '14:00' }] },
    { day: 'friday', open: true, ranges: [{ start: '10:00', end: '14:00' }] },
    { day: 'saturday', open: true, ranges: [{ start: '09:00', end: '13:00' }] },
    { day: 'sunday', open: false, ranges: [] },
  ],
  slotIntervalMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  maxDaysAhead: 30,
  closedDates: ['2026-10-16'],
});

// Lunes 12 oct 2026, 09:00 en Madrid (CEST, UTC+2)
const NOW = Date.parse('2026-10-12T07:00:00Z');

test('zonedToUtc respeta horario de verano e invierno', () => {
  assert.equal(new Date(zonedToUtc('2026-07-01', 600, 'Europe/Madrid')).toISOString(), '2026-07-01T08:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-12-01', 600, 'Europe/Madrid')).toISOString(), '2026-12-01T09:00:00.000Z');
  assert.equal(new Date(zonedToUtc('2026-10-14', 630, 'America/New_York')).toISOString(), '2026-10-14T14:30:00.000Z');
  const t = zonedToUtc('2026-10-25', 600, 'Europe/Madrid'); // día del cambio de hora
  assert.equal(localTime(t, 'Europe/Madrid'), '10:00');
  assert.equal(toZonedIso(zonedToUtc('2026-10-14', 600, 'Europe/Madrid'), 'Europe/Madrid'), '2026-10-14T10:00:00+02:00');
});

test('weekdayOf y localDate', () => {
  assert.equal(weekdayOf('2026-10-12'), 1);
  assert.equal(localDate(NOW, 'Europe/Madrid'), '2026-10-12');
});

test('día cerrado de la semana', () => {
  assert.equal(candidateSlots(config, '2026-10-12', 30, NOW).reason, 'closed_day');
});

test('fecha cerrada concreta y fechas pasadas o lejanas', () => {
  assert.equal(candidateSlots(config, '2026-10-16', 30, NOW).reason, 'closed_date');
  assert.equal(candidateSlots(config, '2026-10-10', 30, NOW).reason, 'past');
  assert.equal(candidateSlots(config, '2026-12-30', 30, NOW).reason, 'too_far');
});

test('jornada partida y duración que cabe en el tramo', () => {
  const { slots } = candidateSlots(config, '2026-10-13', 90, NOW);
  const times = slots.map((s) => localTime(s.start, 'Europe/Madrid'));
  assert.equal(times[0], '10:00');
  assert.ok(times.includes('12:30'));
  assert.ok(!times.includes('13:00'), 'una cita de 90 min no puede empezar a las 13:00 si se cierra a las 14:00');
  assert.ok(times.includes('16:00'));
  assert.equal(times.at(-1), '18:30');
});

test('antelación mínima', () => {
  const tue10 = Date.parse('2026-10-13T08:00:00Z'); // martes 10:00 Madrid
  const times = candidateSlots(config, '2026-10-13', 30, tue10).slots.map((s) => localTime(s.start, 'Europe/Madrid'));
  assert.equal(times[0], '12:00');
});

test('findService tolera variaciones', () => {
  assert.equal(findService(config, 'corte').name, 'Corte de pelo');
  assert.equal(findService(config, 'COLOR').name, 'Color');
  assert.equal(findService(config, 'manicura'), null);
});

test('availability descuenta lo ocupado del calendario (modo demo)', async () => {
  const bot = { id: 'bot_test', config };
  saveBooking({
    id: 'AAAAAA',
    botId: 'bot_test',
    service: 'Corte de pelo',
    start: new Date(zonedToUtc('2026-10-14', 600, 'Europe/Madrid')).toISOString(),
    end: new Date(zonedToUtc('2026-10-14', 660, 'Europe/Madrid')).toISOString(),
    customer: { name: 'A', email: 'a@a.com' },
    status: 'confirmed',
  });
  const [day] = await availability(bot, { service: config.services[0], fromDate: '2026-10-14', days: 1, now: NOW });
  assert.ok(!day.times.includes('10:00'));
  assert.ok(!day.times.includes('10:30'));
  assert.ok(day.times.includes('11:00'));
  assert.ok(day.times.includes('09:30') === false);
});

test('sanitizeConfig rellena valores por defecto seguros', () => {
  const c = sanitizeConfig({ timezone: 'Mars/Base', brandColor: 'red', weeklyHours: [{ day: 'monday', open: true, ranges: [{ start: '20:00', end: '10:00' }] }] });
  assert.equal(c.timezone, 'Europe/Madrid');
  assert.equal(c.brandColor, '#3b5bfd');
  assert.equal(c.weeklyHours.length, 7);
  assert.equal(c.weeklyHours[0].open, false);
  assert.equal(c.services.length, 1);
});
