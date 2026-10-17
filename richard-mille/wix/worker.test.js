'use strict';
/**
 * Comprueba que el worker de Wix responde igual que el servidor Node.
 * Con el worker en marcha (npx wrangler dev -c wix/wrangler.toml, o la URL publicada):
 *   WORKER_URL=http://127.0.0.1:8787 node --test wix/worker.test.js
 * Sin WORKER_URL las pruebas se omiten.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const RM = require('../assets/js/core.js');
const R = require('../server/render.js');

const BASE = (process.env.WORKER_URL || '').replace(/\/+$/, '');
const opts = { skip: !BASE && 'define WORKER_URL para probar el worker' };
const get = (p, o) => fetch(BASE + p, o);

function freeSlot(boutique) {
  for (let i = 1; i <= RM.BOOKING_WINDOW_DAYS; i++) {
    const date = RM.toISODate(RM.addDays(new Date(), i));
    const av = RM.getAvailability(boutique, date);
    const slot = av.slots && av.slots.find((s) => s.available);
    if (slot) return { date, time: slot.time, taken: av.slots.find((s) => !s.available) };
  }
  throw new Error('sin huecos');
}

test('API: salud, boutiques y disponibilidad', opts, async () => {
  assert.equal((await (await get('/api/health')).json()).ok, true);
  const j = await (await get('/api/boutiques?region=europa')).json();
  assert.ok(j.boutiques.length > 0 && j.boutiques.every((b) => b.region === 'europa'));
  assert.equal((await get('/api/boutiques/tokyo')).status, 200);
  assert.equal((await get('/api/boutiques/nope')).status, 404);
  const s = freeSlot('madrid');
  const av = await get('/api/availability?boutique=madrid&date=' + s.date);
  assert.equal(av.status, 200);
  assert.deepEqual((await av.json()).slots, RM.getAvailability('madrid', s.date).slots); // misma lógica que el navegador
  assert.equal((await get('/api/availability?boutique=madrid&date=ayer')).status, 400);
});

test('API: citas simuladas, errores y límites', opts, async () => {
  const s = freeSlot('paris');
  const body = {
    boutique: 'paris', reason: 'discover', interest: 'tourbillon', date: s.date, time: s.time,
    firstName: 'Ana', lastName: 'García López', email: 'ana@example.com', phone: '', language: 'es', message: '', consent: true
  };
  const post = (b, type = 'application/json') => get('/api/appointments', {
    method: 'POST', headers: { 'Content-Type': type }, body: typeof b === 'string' ? b : JSON.stringify(b)
  });
  const ok = await post(body);
  assert.equal(ok.status, 201);
  const j = await ok.json();
  assert.match(j.reference, /^RM-PAR-\d{6}-[A-Z0-9]{4}$/);
  assert.equal(j.status, 'simulated');
  assert.equal((await post(Object.assign({}, body, { email: 'x', consent: false }))).status, 422);
  if (s.taken) assert.equal((await post(Object.assign({}, body, { time: s.taken.time }))).status, 409);
  assert.equal((await post('{roto')).status, 400);
  assert.equal((await post('{}', 'text/plain')).status, 415);
  assert.equal((await post(JSON.stringify({ message: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await get('/api/appointments')).status, 405);
});

test('Páginas por idioma, SEO y cabeceras', opts, async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const hash = crypto.createHash('sha256').update(R.inlineScript(src)).digest('base64');
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.ok(home.headers.get('content-security-policy').includes("'sha256-" + hash + "'"), 'CSP desactualizada');
  const es = await home.text();
  assert.match(es, /<html lang="es"[^>]*data-server="1"/);
  const en = await get('/en/');
  assert.equal(en.headers.get('content-language'), 'en');
  const html = await en.text();
  assert.match(html, /<title>Richard Mille — A racing machine on the wrist<\/title>/);
  assert.ok(!/Dónde encontrarnos/.test(html));
  for (const l of ['es', 'en', 'fr', 'de', 'it', 'x-default']) assert.match(html, new RegExp('hreflang="' + l + '"'));
  assert.match(html, /<h3>Geneva<\/h3>/);
  for (const [l, t] of [['fr', 'Où nous trouver\\.'], ['de', 'Wo Sie uns finden\\.'], ['it', 'Dove trovarci\\.']]) {
    assert.match(await (await get('/' + l + '/')).text(), new RegExp(t));
  }
  const redir = await get('/fr', { redirect: 'manual' });
  assert.equal(redir.status, 301);
  assert.equal(redir.headers.get('location'), '/fr/');
  assert.match(await (await get('/robots.txt')).text(), /Disallow: \/api\//);
  assert.equal(((await (await get('/sitemap.xml')).text()).match(/<loc>/g) || []).length, 5);
});

test('Recursos estáticos y rutas privadas', opts, async () => {
  for (const p of ['/assets/js/core.js', '/assets/css/styles.css', '/assets/img/rm-assembled.webp', '/de/assets/js/main.js']) {
    assert.equal((await get(p)).status, 200, p);
  }
  for (const p of ['/server/server.js', '/package.json', '/assets/../server/server.js', '/wix/worker.js']) {
    assert.equal((await get(p)).status, 404, p);
  }
});
