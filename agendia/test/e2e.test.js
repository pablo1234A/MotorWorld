// Prueba de extremo a extremo: servidor real + API de Claude simulada + calendario demo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requests = [];

const CONFIG = {
  businessName: 'Peluquería Lúa',
  businessType: 'peluquería',
  assistantName: 'Lúa',
  language: 'es',
  timezone: 'Europe/Madrid',
  tone: 'Cercano',
  welcomeMessage: '¡Hola! ¿Te reservo cita?',
  services: [{ name: 'Corte', durationMinutes: 30, price: '15 €', description: '' }],
  weeklyHours: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({ day, open: true, ranges: [{ start: '11:00', end: '14:00' }] })),
  slotIntervalMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 0,
  maxDaysAhead: 60,
  closedDates: [],
  collectPhone: false,
  policies: '',
  faqs: [],
  extraInstructions: '',
  quickReplies: ['Reservar'],
  brandColor: '#aa3366',
  assumptions: ['Supuse la duración del corte'],
};

// Fecha de mañana (zona Madrid) para que el hueco siempre sea futuro.
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

function msg(content, stop_reason) {
  return { id: `msg_${Math.random()}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
}

// Simula a Claude: decide la respuesta según el último mensaje.
function fakeClaude(body) {
  if (body.output_config?.format) return msg([{ type: 'text', text: JSON.stringify(CONFIG) }], 'end_turn');
  const last = body.messages.at(-1);
  if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
    const r = JSON.parse(last.content[0].content);
    if (r.ok === true) return msg([{ type: 'text', text: `Hecho, código **${r.booking.code}**.` }], 'end_turn');
    if (r.ok === false) return msg([{ type: 'text', text: `Lo siento, ${r.reason_text || r.error}.` }], 'end_turn');
    return msg([{ type: 'text', text: `Tengo: ${r.days[0].available_times.slice(0, 3).join(', ')}` }], 'end_turn');
  }
  const text = typeof last.content === 'string' ? last.content : '';
  if (text.startsWith('hueco')) {
    return msg([{ type: 'tool_use', id: 'tu_1', name: 'check_availability', input: { service: 'Corte', from_date: tomorrow, days: 1 } }], 'tool_use');
  }
  if (text.startsWith('reserva')) {
    const [, email] = text.split(' ');
    return msg([{ type: 'tool_use', id: 'tu_2', name: 'create_booking', input: { service: 'corte', date: tomorrow, time: '12:00', name: 'Ana Pérez', email, phone: '', notes: '' } }], 'tool_use');
  }
  return msg([{ type: 'text', text: '¡Hola!' }], 'end_turn');
}

let mock;
let server;
let base;

before(async () => {
  mock = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const body = JSON.parse(data || '{}');
      requests.push({ headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(fakeClaude(body)));
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const port = 4300 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'agendia-e2e-')),
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.address().port}`,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ADMIN_PASSWORD: '',
      PUBLIC_URL: base,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((resolve) => server.stdout.on('data', (d) => d.toString().includes('Agendia listo') && resolve()));
});

after(() => {
  server?.kill();
  mock?.close();
});

const call = async (p, body, method) => {
  const res = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

test('flujo completo: correo → calendario → prompt → chatbot que reserva', async () => {
  const created = await call('/api/bots', { businessEmail: 'hola@lua.es' });
  assert.equal(created.status, 200);
  const id = created.data.id;

  const bad = await call('/api/bots', { businessEmail: 'no-es-email' });
  assert.equal(bad.status, 400);

  const gen = await call(`/api/bots/${id}/generate`, { description: 'Peluquería en Madrid con cortes de 30 minutos, abierta todos los días.' });
  assert.equal(gen.status, 200, JSON.stringify(gen.data));
  assert.equal(gen.data.status, 'live');
  assert.equal(gen.data.config.businessName, 'Peluquería Lúa');

  const genReq = requests.find((r) => r.body.output_config?.format);
  assert.equal(genReq.body.model, 'claude-opus-5-5');
  assert.equal(genReq.body.fallbacks, 'default');
  assert.match(genReq.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);

  const pub = await call(`/api/public/bots/${id}`);
  assert.equal(pub.data.assistantName, 'Lúa');
  assert.equal(pub.data.demo, true);

  // 1) Consulta disponibilidad
  const c1 = await call(`/api/public/bots/${id}/chat`, { message: 'hueco mañana?' });
  assert.equal(c1.status, 200, JSON.stringify(c1.data));
  assert.match(c1.data.reply, /Tengo: /);
  assert.ok(c1.data.slots.days[0].times.includes('12:00'));
  const chatReq = requests.at(-1).body;
  assert.equal(chatReq.tools.length, 4);
  assert.ok(chatReq.tools.every((t) => t.strict === true));
  assert.equal(chatReq.output_config.effort, 'low');

  // 2) Reserva
  const c2 = await call(`/api/public/bots/${id}/chat`, { sessionId: c1.data.sessionId, message: 'reserva ana@example.com' });
  assert.equal(c2.status, 200, JSON.stringify(c2.data));
  assert.ok(c2.data.booking, JSON.stringify(c2.data));
  assert.equal(c2.data.booking.time, '12:00');
  assert.equal(c2.data.booking.service, 'Corte');

  // 3) Otro cliente intenta la misma hora → no disponible
  const c3 = await call(`/api/public/bots/${id}/chat`, { message: 'reserva otro@example.com' });
  assert.equal(c3.data.booking, null);
  assert.match(c3.data.reply, /no está disponible|ya no/);

  // 4) La hora ya no aparece como libre
  const c4 = await call(`/api/public/bots/${id}/chat`, { message: 'hueco otra vez' });
  assert.ok(!c4.data.slots.days[0].times.includes('12:00'));

  // 5) Panel: reserva registrada y emails (demo) al cliente y al negocio
  const admin = await call(`/api/bots/${id}`);
  assert.equal(admin.data.bookings.filter((b) => b.status === 'confirmed').length, 1);
  await new Promise((r) => setTimeout(r, 100));
  const admin2 = await call(`/api/bots/${id}`);
  const to = admin2.data.outbox.map((m) => m.to).sort();
  assert.deepEqual(to, ['ana@example.com', 'hola@lua.es']);
  assert.equal(JSON.stringify(admin2.data).includes('refreshToken'), false);

  // 6) Cancelación desde el panel libera el hueco
  const code = c2.data.booking.code;
  const cancel = await call(`/api/bots/${id}/bookings/${code}/cancel`, {});
  assert.equal(cancel.status, 200);
  const c5 = await call(`/api/public/bots/${id}/chat`, { message: 'hueco de nuevo' });
  assert.ok(c5.data.slots.days[0].times.includes('12:00'));

  // 7) Bot pausado no es accesible públicamente... salvo para el admin (vista previa)
  await call(`/api/bots/${id}`, { status: 'paused' }, 'PATCH');
  const paused = await call(`/api/public/bots/${id}`);
  assert.equal(paused.status, 200, 'sin ADMIN_PASSWORD el panel es admin, así que la vista previa sigue funcionando');
});
