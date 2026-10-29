import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { dispatchCompany, planCompany, type EngineDeps } from '../src/automation/engine.js';
import { loadConfig } from '../src/config.js';
import { classifyInbound, inboundTokenFrom, referencedIds } from '../src/modules/inbound/service.js';
import { API, createQuote, createTestApp, registerAccount, verifyEmail, type RegisteredAccount, type TestContext } from './helpers.js';

/*
 * P1-04: detección de respuestas por correo entrante (adaptador de Mailgun).
 * El envío usa un servidor HTTP local que imita la API de Mailgun y los mensajes entrantes
 * se construyen aquí con el formato de formulario de Mailgun: no equivale a una prueba con
 * Mailgun real (pendiente: docs/automatizacion.md).
 */

const SIGNING_KEY = 'clave-de-firma-entrante-de-prueba';
const DOMAIN = 'respuestas.ejemplo.test';
const DAY = 86_400_000;
let counter = 0;
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `<mg-${++counter}-${randomBytes(3).toString('hex')}@mg.ejemplo.test>`, message: 'Queued.' }));
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ctx: TestContext = await createTestApp((c) => {
  c.automation.provider = 'mailgun';
  c.automation.fromEmail = 'seguimiento@mg.ejemplo.test';
  c.automation.mailgun = { apiKey: 'clave', domain: 'mg.ejemplo.test', apiBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, webhookSigningKey: SIGNING_KEY };
  c.automation.inboundDomain = DOMAIN;
});
const { app, db, config, mailer } = ctx;
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 2 });
afterAll(() => owner.end());
const deps = (now = new Date()): EngineDeps => ({ db, config, provider: app.followUpProvider, now: () => now });

async function automated(acc: RegisteredAccount) {
  await verifyEmail(app, mailer, acc);
  await acc.client.patch('/company/settings', {
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    contactWindowStart: '00:00',
    contactWindowEnd: '23:59',
    requireManualApproval: false,
    legalBasisNote: 'Clientes que han pedido presupuesto (interés legítimo).',
    replyToEmail: 'oficina@ejemplo.test',
  });
  expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(200);
}

/** Empresa con un email automático enviado y el paso siguiente ya programado. */
async function companyWithSentEmail() {
  const acc = await registerAccount(app);
  await automated(acc);
  const q = await createQuote(acc.client, { sentAt: new Date(Date.now() - 3 * DAY - 3_600_000).toISOString() });
  await planCompany(deps(), acc.companyId);
  expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
  await planCompany(deps(new Date(Date.now() + 4 * DAY)), acc.companyId); // paso 2 pendiente
  const [delivery] = (await owner.query('SELECT id, provider_message_id FROM message_deliveries WHERE quote_id = $1', [q.id])).rows;
  const address = (await acc.client.get('/automation')).body.replyDetection.address as string;
  return { acc, q, delivery: delivery as { id: string; provider_message_id: string }, address };
}

interface InboundOpts {
  to: string;
  from: string;
  subject?: string;
  inReplyTo?: string;
  messageId?: string;
  extraHeaders?: Array<[string, string]>;
  key?: string;
  token?: string;
  timestamp?: number;
  format?: 'multipart' | 'urlencoded';
}

async function postInbound(o: InboundOpts) {
  const timestamp = String(o.timestamp ?? Math.floor(Date.now() / 1000));
  const token = o.token ?? randomBytes(25).toString('hex');
  const signature = createHmac('sha256', o.key ?? SIGNING_KEY).update(timestamp + token).digest('hex');
  const headers: Array<[string, string]> = [
    ['From', `Cliente <${o.from}>`],
    ['To', o.to],
    ['Subject', o.subject ?? 'Re: Su presupuesto'],
    ['Message-Id', o.messageId ?? `<respuesta-${randomBytes(6).toString('hex')}@cliente.ejemplo.test>`],
    ['Date', new Date().toUTCString()],
    ...(o.inReplyTo ? ([['In-Reply-To', o.inReplyTo], ['References', o.inReplyTo]] as Array<[string, string]>) : []),
    ...(o.extraHeaders ?? []),
  ];
  const fields: Record<string, string> = {
    recipient: o.to,
    sender: o.from,
    subject: o.subject ?? 'Re: Su presupuesto',
    'body-plain': 'Sí, nos interesa. Llámenme.',
    'message-headers': JSON.stringify(headers),
    timestamp,
    token,
    signature,
  };
  let payload: Buffer;
  let contentType: string;
  if (o.format === 'urlencoded') {
    payload = Buffer.from(new URLSearchParams(fields).toString());
    contentType = 'application/x-www-form-urlencoded';
  } else {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const encoded = new Response(form);
    payload = Buffer.from(await encoded.arrayBuffer());
    contentType = encoded.headers.get('content-type')!;
  }
  const res = await app.inject({ method: 'POST', url: `${API}/webhooks/inbound/mailgun`, headers: { 'content-type': contentType }, payload });
  return { status: res.statusCode, body: res.json(), token };
}

const quoteState = async (id: string) => (await owner.query('SELECT status, responded_at FROM quotes WHERE id = $1', [id])).rows[0];
const ruleSteps = async (id: string) => (await owner.query("SELECT status, cancel_reason FROM follow_ups WHERE quote_id = $1 AND source = 'rule' ORDER BY sequence_step", [id])).rows;

describe('detección de respuestas por correo entrante', () => {
  it('una respuesta auténtica al email automático registra la respuesta y detiene los seguimientos', async () => {
    const { acc, q, delivery, address } = await companyWithSentEmail();
    expect(address).toMatch(new RegExp(`^respuestas\\+[0-9a-f]{32}@${DOMAIN.replace(/\./g, '\\.')}$`));
    const res = await postInbound({ to: address, from: q.contact.email, inReplyTo: `<${delivery.provider_message_id}>` });
    expect(res).toMatchObject({ status: 200, body: { status: 'responded' } });
    expect((await quoteState(q.id)).status).toBe('responded');
    expect(await ruleSteps(q.id)).toEqual([
      { status: 'sent', cancel_reason: null },
      { status: 'cancelled', cancel_reason: 'quote_responded' },
    ]);
    const log = (await acc.client.get(`/quotes/${q.id}/activity`)).body.items.map((a: { action: string }) => a.action);
    expect(log).toEqual(expect.arrayContaining(['quote.reply_detected', 'quote.status_changed', 'recovery.registered']));
    // Sin contenido del mensaje: solo el emparejamiento y el resultado.
    const [row] = (await owner.query('SELECT * FROM inbound_replies WHERE quote_id = $1', [q.id])).rows;
    expect(row).toMatchObject({ match_method: 'message_id', outcome: 'responded', delivery_id: delivery.id, sender_domain: 'ejemplo.test' });
    expect(JSON.stringify(row)).not.toMatch(/interesa|Llámenme/);
    await acc.client.post('/automation/disable');
  });

  it('rechaza firmas no válidas o caducadas y no procesa dos veces la misma entrega ni el mismo mensaje', async () => {
    const { acc, q, delivery, address } = await companyWithSentEmail();
    const base = { to: address, from: q.contact.email, inReplyTo: `<${delivery.provider_message_id}>` };
    expect((await postInbound({ ...base, key: 'otra-clave' })).status).toBe(401);
    expect((await postInbound({ ...base, timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await quoteState(q.id)).status).toBe('sent');
    const messageId = '<mismo-mensaje@cliente.ejemplo.test>';
    const first = await postInbound({ ...base, messageId });
    expect(first.body.status).toBe('responded');
    expect((await postInbound({ ...base, messageId, token: first.token })).body.status).toBe('duplicate'); // misma entrega
    expect((await postInbound({ ...base, messageId })).body.status).toBe('duplicate'); // mismo mensaje, otra entrega
    expect((await owner.query('SELECT count(*)::int n FROM inbound_replies WHERE quote_id = $1', [q.id])).rows[0].n).toBe(1);
    await acc.client.post('/automation/disable');
  });

  it('una respuesta enviada a la dirección de otra empresa no toca los datos de la primera', async () => {
    const a = await companyWithSentEmail();
    const b = await companyWithSentEmail();
    const res = await postInbound({ to: b.address, from: a.q.contact.email, inReplyTo: `<${a.delivery.provider_message_id}>` });
    expect(res.body.status).toBe('unmatched');
    expect((await quoteState(a.q.id)).status).toBe('sent');
    expect((await quoteState(b.q.id)).status).toBe('sent');
    expect((await postInbound({ to: `respuestas+${'0'.repeat(32)}@${DOMAIN}`, from: a.q.contact.email, inReplyTo: `<${a.delivery.provider_message_id}>` })).body.status).toBe('unknown_recipient');
    await a.acc.client.post('/automation/disable');
    await b.acc.client.post('/automation/disable');
  });

  it('las respuestas automáticas y los rebotes no cuentan como respuesta: los seguimientos continúan', async () => {
    const { acc, q, delivery, address } = await companyWithSentEmail();
    const ref = { to: address, from: q.contact.email, inReplyTo: `<${delivery.provider_message_id}>` };
    expect((await postInbound({ ...ref, extraHeaders: [['Auto-Submitted', 'auto-replied']] })).body.status).toBe('auto_reply');
    expect((await postInbound({ ...ref, subject: 'Respuesta automática: Fuera de la oficina' })).body.status).toBe('auto_reply');
    expect((await postInbound({ ...ref, from: 'mailer-daemon@mx.ejemplo.test' })).body.status).toBe('bounce');
    expect((await quoteState(q.id)).status).toBe('sent');
    expect((await ruleSteps(q.id))[1].status).toBe('pending');
    await acc.client.post('/automation/disable');
  });

  it('empareja por remitente si faltan las cabeceras de respuesta, por el id propio (SMTP) y acepta formulario urlencoded', async () => {
    const s = await companyWithSentEmail();
    expect((await postInbound({ to: s.address, from: s.q.contact.email, format: 'urlencoded' })).body.status).toBe('responded');
    const [row] = (await owner.query('SELECT match_method FROM inbound_replies WHERE quote_id = $1', [s.q.id])).rows;
    expect(row.match_method).toBe('sender');
    const t = await companyWithSentEmail();
    expect((await postInbound({ to: t.address, from: 'otra.direccion@ejemplo.test', inReplyTo: `<${t.delivery.id}@envios.ejemplo.test>` })).body.status).toBe('responded');
    // Un remitente desconocido y sin cabeceras no se empareja.
    const u = await companyWithSentEmail();
    expect((await postInbound({ to: u.address, from: 'desconocido@ejemplo.test' })).body.status).toBe('unmatched');
    expect((await quoteState(u.q.id)).status).toBe('sent');
    for (const x of [s, t, u]) await x.acc.client.post('/automation/disable');
  });

  it('si el presupuesto ya no estaba pendiente, solo queda anotado; el registro manual sigue funcionando', async () => {
    const { acc, q, delivery, address } = await companyWithSentEmail();
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })).status).toBe(200); // manual
    expect((await postInbound({ to: address, from: q.contact.email, inReplyTo: `<${delivery.provider_message_id}>` })).body.status).toBe('already_answered');
    await acc.client.post('/automation/disable');
  });
});

describe('configuración y unidades', () => {
  it('sin correo entrante configurado la ruta no existe y la interfaz lo indica', async () => {
    const plain = await createTestApp();
    const res = await plain.app.inject({ method: 'POST', url: `${API}/webhooks/inbound/mailgun`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'a=b' });
    expect(res.statusCode).toBe(404);
    const acc = await registerAccount(plain.app);
    expect((await acc.client.get('/automation')).body.replyDetection).toEqual({ configured: false, address: null });
  });

  it('INBOUND_EMAIL_DOMAIN exige Mailgun con clave de firma', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@localhost:5432/x' };
    expect(() => loadConfig({ ...base, INBOUND_EMAIL_DOMAIN: DOMAIN })).toThrow(/INBOUND_EMAIL_DOMAIN requiere/);
    expect(() => loadConfig({ ...base, INBOUND_EMAIL_DOMAIN: 'no es dominio' })).toThrow();
    const ok = loadConfig({
      ...base,
      INBOUND_EMAIL_DOMAIN: DOMAIN,
      FOLLOWUP_EMAIL_PROVIDER: 'mailgun',
      FOLLOWUP_FROM_EMAIL: 'a@mg.ejemplo.test',
      MAILGUN_API_KEY: 'k',
      MAILGUN_DOMAIN: 'mg.ejemplo.test',
      MAILGUN_WEBHOOK_SIGNING_KEY: 'firma',
    });
    expect(ok.automation.inboundDomain).toBe(DOMAIN);
  });

  it('clasifica, extrae el token y los identificadores citados', () => {
    const base = { recipients: [], sender: 'cliente@ejemplo.test', subject: 'Re: presupuesto', messageId: null, inReplyTo: null, references: null, date: null, headers: {} };
    expect(classifyInbound(base)).toBe('reply');
    expect(classifyInbound({ ...base, headers: { 'auto-submitted': 'no' } })).toBe('reply');
    expect(classifyInbound({ ...base, headers: { precedence: 'bulk' } })).toBe('auto_reply');
    expect(classifyInbound({ ...base, subject: 'Out of Office: presupuesto' })).toBe('auto_reply');
    expect(classifyInbound({ ...base, headers: { 'content-type': 'multipart/report; report-type=delivery-status' } })).toBe('bounce');
    const token = 'a'.repeat(32);
    expect(inboundTokenFrom([`Oficina <respuestas+${token}@${DOMAIN}>`], DOMAIN)).toBe(token);
    expect(inboundTokenFrom([`respuestas+${token}@otro.dominio.test`], DOMAIN)).toBeNull();
    expect(referencedIds({ inReplyTo: '<a@x>', references: '<b@y> <a@x>' })).toEqual(['a@x', 'b@y']);
  });
});
