'use strict';
// Ejecutar con:  npm test   (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createRateLimiter } = require('./server.js');
const RM = require('../assets/js/core.js');

const NOW = new Date('2026-10-17T09:00:00Z');

function start(opts) {
  const server = createApp(Object.assign({ now: () => NOW, quiet: true }, opts));
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}
function url(server, p) { return 'http://127.0.0.1:' + server.address().port + p; }

/** Primer hueco libre de una boutique a partir de mañana. */
function firstFreeSlot(boutique) {
  for (let i = 1; i <= RM.BOOKING_WINDOW_DAYS; i++) {
    const date = RM.toISODate(RM.addDays(new Date(Date.UTC(2026, 9, 17)), i));
    const av = RM.getAvailability(boutique, date, NOW);
    const slot = av.slots && av.slots.find((s) => s.available);
    if (slot) return { date, time: slot.time, taken: av.slots.find((s) => !s.available) };
  }
  throw new Error('sin huecos');
}

function validPayload(over) {
  const s = firstFreeSlot('paris');
  return Object.assign({
    boutique: 'paris', reason: 'discover', interest: 'tourbillon', date: s.date, time: s.time,
    firstName: 'Ana', lastName: 'García López', email: 'ana@example.com', phone: '+34 600 000 000',
    language: 'es', message: '', consent: true
  }, over);
}

test('núcleo: la disponibilidad es determinista y respeta los cierres', () => {
  const a = RM.getAvailability('paris', '2026-10-20', NOW);
  const b = RM.getAvailability('paris', '2026-10-20', NOW);
  assert.deepEqual(a, b);
  assert.ok(a.slots.length > 0 && a.slots.some((s) => s.available));
  assert.equal(RM.getAvailability('paris', '2026-10-18', NOW).closed, true); // domingo
  assert.ok(RM.getAvailability('paris', '2026-10-17', NOW).error); // hoy: fuera de rango
  assert.ok(RM.getAvailability('paris', '2026-02-31', NOW).error); // fecha imposible
  assert.ok(RM.getAvailability('atlantis', '2026-10-20', NOW).error);
});

test('núcleo: validación de la cita', () => {
  assert.equal(RM.validateAppointment(validPayload(), NOW).ok, true);
  const bad = RM.validateAppointment({ boutique: 'paris', email: 'x', consent: false }, NOW);
  assert.equal(bad.ok, false);
  for (const f of ['reason', 'date', 'firstName', 'lastName', 'email', 'consent']) assert.ok(bad.errors[f], f);
});

test('GET /api/health y /api/boutiques', async (t) => {
  const s = await start(); t.after(() => s.close());
  const h = await (await fetch(url(s, '/api/health'))).json();
  assert.equal(h.ok, true);
  const r = await fetch(url(s, '/api/boutiques?region=europa'));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.boutiques.length > 0 && j.boutiques.every((b) => b.region === 'europa'));
  assert.equal((await fetch(url(s, '/api/boutiques/tokyo'))).status, 200);
  assert.equal((await fetch(url(s, '/api/boutiques/nope'))).status, 404);
});

test('GET /api/availability', async (t) => {
  const s = await start(); t.after(() => s.close());
  const ok = await fetch(url(s, '/api/availability?boutique=madrid&date=2026-10-21'));
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray((await ok.json()).slots));
  assert.equal((await fetch(url(s, '/api/availability?boutique=madrid&date=ayer'))).status, 400);
});

test('POST /api/appointments: simulación, errores y límites', async (t) => {
  const s = await start({ postLimit: 50 }); t.after(() => s.close());
  const post = (body, type = 'application/json') => fetch(url(s, '/api/appointments'), {
    method: 'POST', headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body)
  });

  const created = await post(validPayload());
  assert.equal(created.status, 201);
  const j = await created.json();
  assert.match(j.reference, /^RM-PAR-\d{6}-[A-Z0-9]{4}$/);
  assert.equal(j.status, 'simulated');

  const invalid = await post(validPayload({ email: 'no-es-un-correo', consent: false }));
  assert.equal(invalid.status, 422);
  const e = (await invalid.json()).errors;
  assert.ok(e.email && e.consent);

  const slot = firstFreeSlot('paris');
  if (slot.taken) assert.equal((await post(validPayload({ date: slot.date, time: slot.taken.time }))).status, 409);

  assert.equal((await post('{roto')).status, 400);
  assert.equal((await post('{}', 'text/plain')).status, 415);
  assert.equal((await post(JSON.stringify({ message: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await fetch(url(s, '/api/appointments'))).status, 405);
});

test('estáticos: sirve la web y bloquea rutas fuera de lo público', async (t) => {
  const s = await start(); t.after(() => s.close());
  const home = await fetch(url(s, '/'));
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(url(s, '/assets/js/core.js'))).status, 200);
  assert.equal((await fetch(url(s, '/server/server.js'))).status, 404);
  assert.equal((await fetch(url(s, '/package.json'))).status, 404);
  assert.equal((await fetch(url(s, '/assets/..%2f..%2fserver/server.js'))).status, 404);
});

test('CSP: autoriza exactamente el script en línea actual de index.html', async (t) => {
  const s = await start(); t.after(() => s.close());
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = require('crypto').createHash('sha256').update(inline).digest('base64');
  const csp = (await fetch(url(s, '/'))).headers.get('content-security-policy');
  assert.ok(csp.includes("'sha256-" + hash + "'"), 'la CSP no coincide con el script de index.html');
});

test('limitador de peticiones', () => {
  const allow = createRateLimiter(2, 1000);
  assert.equal(allow('a', 0), true);
  assert.equal(allow('a', 10), true);
  assert.equal(allow('a', 20), false);
  assert.equal(allow('a', 1500), true);
});
