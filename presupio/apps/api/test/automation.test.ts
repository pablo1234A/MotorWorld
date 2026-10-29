import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyRetention,
  dispatchCompany,
  inCompany,
  planCompany,
  recoverStuckDeliveries,
  type EngineDeps,
} from '../src/automation/engine.js';
import { runCycle } from '../src/automation/runner.js';
import { localParts, stepDueAt, zonedTimeToUtc } from '../src/automation/schedule.js';
import { createDb, type Db } from '../src/db/database.js';
import { FakeProvider } from './fake-provider.js';
import { API, addMember, createQuote, createTestApp, registerAccount, type RegisteredAccount, verifyEmail, type TestContext } from './helpers.js';

/*
 * Pruebas del motor de seguimiento contra PostgreSQL real.
 * El envío usa un PROVEEDOR SIMULADO (FakeProvider) o servidores locales: ninguna prueba
 * envía correos reales ni equivale a haber probado un proveedor real.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TZ = 'Europe/Madrid';

/** Reloj de referencia: el último mediodía (hora de Madrid) ya pasado, para que todo sea determinista. */
function lastNoon(): Date {
  const now = new Date();
  const p = localParts(now, TZ);
  let noon = zonedTimeToUtc(p.year, p.month, p.day, 12, 0, TZ);
  if (noon > now) {
    const y = localParts(new Date(noon.getTime() - DAY), TZ);
    noon = zonedTimeToUtc(y.year, y.month, y.day, 12, 0, TZ);
  }
  return noon;
}
const T0 = lastNoon();
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

const fake = new FakeProvider();
const { app, db, config, mailer } = await createTestApp(
  (c) => {
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
    c.dbPoolMax = 10;
  },
  { followUpProvider: fake },
);
const deps = (now: Date, extra: Partial<EngineDeps> = {}): EngineDeps => ({ db, config, provider: fake, now: () => now, ...extra });

const LEGAL = 'Clientes que nos han pedido presupuesto: interés legítimo (art. 6.1.f RGPD) y relación precontractual.';
const REPLY_TO = 'oficina@reformas.ejemplo.test';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

async function configure(acc: RegisteredAccount, opts: { approval?: boolean; schedule?: number[]; weekdays?: number[]; window?: [string, string] } = {}) {
  const res = await acc.client.patch('/company/settings', {
    followUpScheduleDays: opts.schedule ?? [3, 7, 14],
    allowedWeekdays: opts.weekdays ?? ALL_DAYS,
    contactWindowStart: opts.window?.[0] ?? '00:00',
    contactWindowEnd: opts.window?.[1] ?? '23:59',
    requireManualApproval: opts.approval ?? false,
    legalBasisNote: LEGAL,
    replyToEmail: REPLY_TO,
    senderName: 'Laura Martín',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

/** Empresa con el envío automático activado (requisitos completos y confirmación legal). */
async function automatedCompany(opts: Parameters<typeof configure>[1] = {}, target: Pick<TestContext, 'app' | 'mailer'> = { app, mailer }) {
  const acc = await registerAccount(target.app);
  await verifyEmail(target.app, target.mailer, acc);
  await configure(acc, opts);
  const res = await acc.client.post('/automation/enable', { confirmLegalBasis: true });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return acc;
}

/** Presupuesto enviado hace `days` días (a las 11:00 de Madrid de aquel día). */
function sentQuote(acc: RegisteredAccount, days: number, overrides: Record<string, unknown> = {}) {
  return createQuote(acc.client, { sentAt: at(-days * DAY - HOUR).toISOString(), ...overrides });
}

async function ruleSteps(acc: RegisteredAccount, quoteId: string): Promise<any[]> {
  const res = await acc.client.get(`/quotes/${quoteId}/follow-ups?status=all`);
  expect(res.status).toBe(200);
  return res.body.items.filter((f: any) => f.source === 'rule').sort((a: any, b: any) => a.sequenceStep - b.sequenceStep);
}

async function deliveries(acc: RegisteredAccount, followUpId: string): Promise<any[]> {
  const res = await acc.client.get(`/follow-ups/${followUpId}/deliveries`);
  expect(res.status).toBe(200);
  return res.body.items;
}

const MADRID_ALL_DAY = { timezone: TZ, allowedWeekdays: ALL_DAYS, windowStart: '00:00', windowEnd: '23:59' };

// ---------------------------------------------------------------------------
// Ejecución concurrente y reinicios (primero: runCycle recorre todas las empresas activas)
// ---------------------------------------------------------------------------

describe('fiabilidad del proceso de trabajos', () => {
  it('varios ciclos simultáneos (tres procesos) no duplican ni planificaciones ni envíos', async () => {
    const acc = await automatedCompany();
    const quotes = [await sentQuote(acc, 3), await sentQuote(acc, 3), await sentQuote(acc, 4)];
    const pools: Db[] = [createDb(config.databaseUrl, 5), createDb(config.databaseUrl, 5), createDb(config.databaseUrl, 5)];
    fake.delayMs = 30;
    try {
      await Promise.all(pools.map((pool) => runCycle(deps(T0, { db: pool }))));
      // Un segundo asalto simultáneo (como un reintento del cron) tampoco envía nada más.
      await Promise.all(pools.map((pool) => runCycle(deps(at(MIN), { db: pool }))));
    } finally {
      fake.delayMs = 0;
      await Promise.all(pools.map((p) => p.destroy()));
    }
    for (const q of quotes) {
      expect(fake.sentTo(q.contact.email)).toHaveLength(1);
      const steps = await ruleSteps(acc, q.id);
      // Paso 1 enviado y, como mucho, un paso siguiente pendiente.
      expect(steps.filter((s) => s.sequenceStep === 1)).toHaveLength(1);
      expect(steps[0]).toMatchObject({ status: 'sent', attemptCount: 1 });
      expect(await deliveries(acc, steps[0].id)).toHaveLength(1);
      expect(steps.filter((s) => s.status === 'pending')).toHaveLength(1);
    }
  });

  it('planificaciones simultáneas de la misma empresa crean un único paso por presupuesto', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 2);
    const pools = [createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3)];
    try {
      const stats = await Promise.all(pools.map((pool) => planCompany(deps(T0, { db: pool }), acc.companyId)));
      expect(stats.reduce((n, s) => n + s.scheduled, 0)).toBe(1);
    } finally {
      await Promise.all(pools.map((p) => p.destroy()));
    }
    expect(await ruleSteps(acc, q.id)).toHaveLength(1);
    await acc.client.post('/automation/disable');
  });

  it('lo programado sobrevive a un reinicio: otro proceso lo envía después', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    const first = createDb(config.databaseUrl, 2);
    expect((await planCompany(deps(T0, { db: first }), acc.companyId)).scheduled).toBe(1);
    await first.destroy(); // el proceso "se detiene"

    const second = createDb(config.databaseUrl, 2);
    try {
      expect((await dispatchCompany(deps(at(10 * MIN), { db: second }), acc.companyId)).sent).toBe(1);
    } finally {
      await second.destroy();
    }
    expect(fake.sentTo(q.contact.email)).toHaveLength(1);
    await acc.client.post('/automation/disable');
  });

  it('si el proceso muere a mitad de envío, el intento queda como "resultado desconocido" y no se reenvía', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);

    const hung = new FakeProvider('colgado');
    hung.hold();
    const inFlight = dispatchCompany(deps(T0, { provider: hung }), acc.companyId);
    await expect.poll(() => hung.sent.length).toBe(1);

    // El estado "enviando" se guardó ANTES de llamar al proveedor.
    let [step] = await ruleSteps(acc, q.id);
    expect(step.status).toBe('sending');
    expect((await deliveries(acc, step.id))[0].status).toBe('sending');

    // La antigüedad se mide con la hora real de la base de datos (created_at).
    expect(await recoverStuckDeliveries(deps(new Date(Date.now() + 5 * MIN)))).toBe(0);
    expect(await recoverStuckDeliveries(deps(new Date(Date.now() + 20 * MIN)))).toBeGreaterThanOrEqual(1);
    [step] = await ruleSteps(acc, q.id);
    expect(step).toMatchObject({ status: 'failed', failureReason: 'unknown_outcome' });
    expect((await deliveries(acc, step.id))[0]).toMatchObject({ status: 'unknown', errorCode: 'unknown_outcome' });

    // Nuevos ciclos no lo reenvían (como mucho una vez: preferimos no duplicar).
    await dispatchCompany(deps(at(30 * MIN)), acc.companyId);
    await planCompany(deps(at(30 * MIN)), acc.companyId);
    await dispatchCompany(deps(at(31 * MIN)), acc.companyId);
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);

    hung.release();
    await inFlight;
    await acc.client.post('/automation/disable');
  });
});

// ---------------------------------------------------------------------------
// Pruebas obligatorias del motor
// ---------------------------------------------------------------------------

describe('motor de seguimiento', () => {
  it('un presupuesto enviado y pendiente programa sus seguimientos (3, 7 y 14 días)', async () => {
    const acc = await automatedCompany();
    const due = await sentQuote(acc, 3);
    const fresh = await sentQuote(acc, 1);

    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(2);
    // Idempotente: planificar otra vez no crea nada.
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(0);

    const [freshStep] = await ruleSteps(acc, fresh.id);
    expect(freshStep).toMatchObject({ status: 'pending', sequenceStep: 1, channel: 'email', attemptCount: 0 });
    expect(new Date(freshStep.dueAt).toISOString()).toBe(stepDueAt(new Date(fresh.sentAt), 3, MADRID_ALL_DAY)!.toISOString());

    const d = await dispatchCompany(deps(T0), acc.companyId);
    expect(d).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(fake.sentTo(fresh.contact.email)).toHaveLength(0);

    const [msg] = fake.sentTo(due.contact.email);
    expect(msg).toMatchObject({ replyTo: REPLY_TO, subject: `Tu presupuesto de ${due.title}`, from: '"Laura Martín" <seguimiento@envios.ejemplo.test>' });
    expect(msg!.text).toContain('Hola, Cliente Ficticio:');
    expect(msg!.text).toContain('Laura Martín');
    expect(msg!.text).toMatch(/darte de baja aquí: http:\/\/localhost:5173\/baja\?token=[A-Za-z0-9_-]{43}/);
    expect(msg!.unsubscribeUrl).toMatch(/\/api\/v1\/public\/unsubscribe\?token=[A-Za-z0-9_-]{43}$/);

    const [sent] = await ruleSteps(acc, due.id);
    expect(sent).toMatchObject({ status: 'sent', attemptCount: 1, failureReason: null });
    expect(sent.sentAt).toBeTruthy();
    const [delivery] = await deliveries(acc, sent.id);
    expect(delivery).toMatchObject({ status: 'sent', attemptNumber: 1, provider: 'fake', templateStep: 1, templateVersion: 1, recipient: due.contact.email });
    expect(delivery.providerMessageId).toBeTruthy();
    expect(delivery.deliveredAt).toBeNull(); // el proveedor simulado no confirma entregas

    const quote = (await acc.client.get(`/quotes/${due.id}`)).body.quote;
    expect(quote.lastFollowUpAt).toBeTruthy();

    // Tras el primero se programa el segundo (día 7).
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(1);
    const steps = await ruleSteps(acc, due.id);
    expect(steps.map((s) => [s.sequenceStep, s.status])).toEqual([
      [1, 'sent'],
      [2, 'pending'],
    ]);
    expect(new Date(steps[1].dueAt).toISOString()).toBe(stepDueAt(new Date(due.sentAt), 7, MADRID_ALL_DAY)!.toISOString());

    const activity = (await acc.client.get(`/quotes/${due.id}/activity`)).body.items.map((a: any) => a.action);
    expect(activity).toEqual(expect.arrayContaining(['follow_up.scheduled', 'follow_up.sent']));
  });

  it('si el motor se activa tarde, no envía de golpe los pasos ya pasados', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 9); // ya pasaron los días 3 y 7
    await planCompany(deps(T0), acc.companyId);
    const steps = await ruleSteps(acc, q.id);
    expect(steps.map((s) => s.sequenceStep)).toEqual([2]);
    const old = await sentQuote(acc, 40); // fuera de secuencia
    await planCompany(deps(T0), acc.companyId);
    expect(await ruleSteps(acc, old.id)).toHaveLength(0);
  });

  it('un presupuesto respondido no genera seguimientos y cancela los pendientes', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })).status).toBe(200);
    expect((await ruleSteps(acc, q.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'quote_responded' });

    const other = await sentQuote(acc, 3);
    await acc.client.post(`/quotes/${other.id}/status`, { status: 'responded' });
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(0);
    expect(await ruleSteps(acc, other.id)).toHaveLength(0);
    expect((await dispatchCompany(deps(T0), acc.companyId)).sent).toBe(0);
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);
  });

  it('comprueba de nuevo justo antes de enviar (respuesta registrada por otra vía)', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    // Cambio directo en la base de datos, sin pasar por la API que cancela los pendientes.
    await inCompany(db, acc.companyId, (trx) =>
      trx.updateTable('quotes').set({ status: 'responded', respondedAt: new Date(), statusChangedAt: new Date() }).where('id', '=', q.id).execute(),
    );
    const d = await dispatchCompany(deps(T0), acc.companyId);
    expect(d).toMatchObject({ sent: 0, cancelled: 1 });
    expect((await ruleSteps(acc, q.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'quote_responded' });
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);
  });

  it('aceptar o rechazar el presupuesto cancela los seguimientos pendientes', async () => {
    const acc = await automatedCompany();
    const accepted = await sentQuote(acc, 3);
    const rejected = await sentQuote(acc, 3);
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(2);

    expect((await acc.client.post(`/quotes/${accepted.id}/status`, { status: 'accepted', evidence: 'Contrato firmado' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${rejected.id}/status`, { status: 'rejected', rejectionReason: 'Elige otra empresa' })).status).toBe(200);

    expect((await ruleSteps(acc, accepted.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'quote_accepted' });
    expect((await ruleSteps(acc, rejected.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'quote_rejected' });
    expect((await dispatchCompany(deps(T0), acc.companyId)).sent).toBe(0);
    expect((await planCompany(deps(at(5 * DAY)), acc.companyId)).scheduled).toBe(0);
  });

  it('la baja del cliente (enlace del email) impide envíos futuros', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    await dispatchCompany(deps(T0), acc.companyId);
    await planCompany(deps(T0), acc.companyId); // paso 2 pendiente
    const [msg] = fake.sentTo(q.contact.email);

    // Baja de un clic (RFC 8058) desde el cliente de correo.
    const url = new URL(msg!.unsubscribeUrl);
    const res = await app.inject({
      method: 'POST',
      url: `${url.pathname}${url.search}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().companyName).toBe('Reformas Prueba SL');

    const steps = await ruleSteps(acc, q.id);
    expect(steps[1]).toMatchObject({ status: 'cancelled', cancelReason: 'contact_excluded' });
    // La baja queda en el historial del presupuesto que originó el email.
    const history = (await acc.client.get(`/quotes/${q.id}/activity`)).body.items;
    expect(history.find((a: any) => a.action === 'exclusion.created')?.metadata).toMatchObject({ via: 'unsubscribe_link', reason: 'opt_out_request' });

    // La página de baja ve que ya está dada de baja; repetir es idempotente.
    const token = msg!.text.match(/baja\?token=([A-Za-z0-9_-]{43})/)![1];
    const preview = await app.inject({ method: 'POST', url: `${API}/public/unsubscribe/preview`, payload: { token } });
    expect(preview.json()).toEqual({ companyName: 'Reformas Prueba SL', alreadyUnsubscribed: true });
    expect((await app.inject({ method: 'POST', url: `${API}/public/unsubscribe`, payload: { token } })).statusCode).toBe(200);
    const exclusions = (await acc.client.get('/exclusions')).body.items.filter((e: any) => e.contactId === q.contact.id);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ channel: 'email', reason: 'opt_out_request' });

    // Más adelante (día 8, 15…) no se programa ni se envía nada.
    for (const later of [5 * DAY, 12 * DAY]) {
      expect((await planCompany(deps(at(later)), acc.companyId)).scheduled).toBe(0);
      await dispatchCompany(deps(at(later)), acc.companyId);
    }
    expect(fake.sentTo(q.contact.email)).toHaveLength(1);

    // Un token falso no da información.
    const bad = await app.inject({ method: 'POST', url: `${API}/public/unsubscribe/preview`, payload: { token: 'x'.repeat(43) } });
    expect(bad.statusCode).toBe(400);
  });

  it('un error del proveedor queda registrado con su motivo, sin datos personales', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    fake.push({ ok: false, retryable: false, code: 'rejected_400', detail: "'to' parameter is not a valid address: [email]" });
    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ sent: 0, failed: 1, retried: 0 });

    const [step] = await ruleSteps(acc, q.id);
    expect(step).toMatchObject({ status: 'failed', failureReason: 'rejected_400', sentAt: null });
    const [delivery] = await deliveries(acc, step.id);
    expect(delivery).toMatchObject({ status: 'failed', errorCode: 'rejected_400', attemptNumber: 1 });
    expect(delivery.errorDetail).not.toContain(q.contact.email);
    expect(delivery.failedAt).toBeTruthy();
    const activity = (await acc.client.get(`/quotes/${q.id}/activity`)).body.items;
    expect(activity.find((a: any) => a.action === 'follow_up.failed')?.metadata).toMatchObject({ reason: 'rejected_400', attempts: 1 });

    // Una excepción inesperada del proveedor también se registra (y se reintenta).
    const q2 = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    fake.push(new Error('socket hang up'));
    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ retried: 1 });
    expect((await ruleSteps(acc, q2.id))[0]).toMatchObject({ status: 'pending', failureReason: 'provider_exception' });

    // Visible en la lista de fallidos de la interfaz.
    const failed = await acc.client.get('/follow-ups?status=failed');
    expect(failed.body.items.map((f: any) => f.id)).toContain(step.id);
  });

  it('los reintentos respetan el límite y las esperas', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    fake.push(
      { ok: false, retryable: true, code: 'provider_503', detail: '' },
      { ok: false, retryable: true, code: 'provider_503', detail: '' },
      { ok: false, retryable: true, code: 'provider_503', detail: '' },
    );
    expect(config.automation.maxAttempts).toBe(3);

    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ retried: 1 });
    let [step] = await ruleSteps(acc, q.id);
    expect(step).toMatchObject({ status: 'pending', attemptCount: 1 });
    expect(new Date(step.dueAt).getTime()).toBe(T0.getTime() + 5 * MIN);

    expect((await dispatchCompany(deps(at(4 * MIN)), acc.companyId)).claimed).toBe(0); // aún no toca
    expect(await dispatchCompany(deps(at(5 * MIN)), acc.companyId)).toMatchObject({ retried: 1 });
    [step] = await ruleSteps(acc, q.id);
    expect(new Date(step.dueAt).getTime()).toBe(T0.getTime() + 35 * MIN);

    expect(await dispatchCompany(deps(at(35 * MIN)), acc.companyId)).toMatchObject({ failed: 1, retried: 0 });
    [step] = await ruleSteps(acc, q.id);
    expect(step).toMatchObject({ status: 'failed', attemptCount: 3, failureReason: 'provider_503' });

    expect((await dispatchCompany(deps(at(10 * HOUR)), acc.companyId)).claimed).toBe(0);
    expect(fake.sentTo(q.contact.email)).toHaveLength(3);
    expect((await deliveries(acc, step.id)).map((d) => [d.attemptNumber, d.status])).toEqual([
      [1, 'failed'],
      [2, 'failed'],
      [3, 'failed'],
    ]);
  });

  it('aísla los datos entre empresas', async () => {
    const a = await automatedCompany();
    const b = await automatedCompany();
    const q = await sentQuote(a, 3);
    expect((await planCompany(deps(T0), b.companyId)).scheduled).toBe(0); // B no ve los presupuestos de A
    await planCompany(deps(T0), a.companyId);
    await dispatchCompany(deps(T0), a.companyId);
    const [step] = await ruleSteps(a, q.id);
    expect(step.status).toBe('sent');

    for (const path of [`/follow-ups/${step.id}/preview`, `/follow-ups/${step.id}/deliveries`, `/follow-ups/${step.id}`]) {
      expect((await b.client.get(path)).status, path).toBe(404);
    }
    expect((await b.client.post(`/follow-ups/${step.id}/approve`)).status).toBe(404);
    expect((await b.client.get('/automation')).body.counts).toMatchObject({ sent30d: 0, scheduled: 0 });
    expect((await a.client.get('/automation')).body.counts.sent30d).toBe(1);

    // Las plantillas son de cada empresa.
    await a.client.request('PUT' as 'POST', '/automation/templates/1', { subject: 'Asunto de A', body: 'Hola, {{nombre_cliente}}' });
    expect((await b.client.get('/automation/templates')).body.items[0].subject).not.toBe('Asunto de A');

    // A nivel de base de datos (RLS): sin filtrar por empresa, B no ve ningún envío de A.
    const rows = await inCompany(db, b.companyId, (trx) => trx.selectFrom('messageDeliveries').select(['companyId']).execute());
    expect(rows.every((r) => r.companyId === b.companyId)).toBe(true);
    const tpl = await inCompany(db, b.companyId, (trx) => trx.selectFrom('messageTemplateVersions').select(['companyId']).execute());
    expect(tpl.every((r) => r.companyId === b.companyId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aprobación, franjas, activación y controles
// ---------------------------------------------------------------------------

describe('aprobación manual y reglas de contacto', () => {
  it('con aprobación obligatoria no se envía nada hasta aprobar, y se envía exactamente lo aprobado', async () => {
    const acc = await automatedCompany({ approval: true });
    const viewer = await addMember(app, acc, 'viewer');
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);

    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ sent: 0, waiting: 1 });
    const awaiting = (await acc.client.get('/follow-ups?approval=awaiting')).body.items;
    expect(awaiting).toHaveLength(1);
    const id = awaiting[0].id;

    const preview = (await acc.client.get(`/follow-ups/${id}/preview`)).body.preview;
    expect(preview).toMatchObject({ to: q.contact.email, replyTo: REPLY_TO, approved: false, templateStep: 1, templateVersion: 1 });
    expect(preview.text).toContain('darte de baja');

    expect((await viewer.client.post(`/follow-ups/${id}/approve`)).status).toBe(403);
    // Los emails automáticos no se marcan "hechos" a mano.
    expect((await acc.client.post(`/follow-ups/${id}/complete`, { outcome: 'no_answer' })).status).toBe(409);

    const approved = await acc.client.post(`/follow-ups/${id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.followUp.approvedAt).toBeTruthy();

    // Cambiar la plantilla después no altera lo aprobado.
    const put = await acc.client.request('PUT' as 'POST', '/automation/templates/1', { subject: 'Asunto nuevo', body: 'Texto nuevo, {{nombre_cliente}}' });
    expect(put.status).toBe(200);
    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ sent: 1 });
    expect(fake.sentTo(q.contact.email)[0]!.subject).toBe(`Tu presupuesto de ${q.title}`);
    const activity = (await acc.client.get(`/quotes/${q.id}/activity`)).body.items.map((a: any) => a.action);
    expect(activity).toContain('follow_up.approved');
  });

  it('un paso sin aprobar caduca a las 72 h de su fecha prevista', async () => {
    const acc = await automatedCompany({ approval: true });
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    expect(await dispatchCompany(deps(at(73 * HOUR)), acc.companyId)).toMatchObject({ cancelled: 1 });
    expect((await ruleSteps(acc, q.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'approval_expired' });
  });

  it('fuera de la franja o en día no permitido, espera al siguiente hueco', async () => {
    const acc = await automatedCompany({ weekdays: [1, 2, 3, 4, 5], window: ['09:00', '11:00'] });
    // El presupuesto se envió hace 10 días: el paso 2 (día 7) está vencido.
    const q = await sentQuote(acc, 10);
    await planCompany(deps(T0), acc.companyId); // mediodía: fuera de la franja 9-11
    const [step] = await ruleSteps(acc, q.id);
    expect(step.sequenceStep).toBe(2);
    expect(await dispatchCompany(deps(T0), acc.companyId)).toMatchObject({ sent: 0 });
    const due = new Date((await ruleSteps(acc, q.id))[0].dueAt);
    const local = localParts(due, TZ);
    expect([local.hour, local.minute]).toEqual([9, 0]);
    expect(local.weekday).toBeLessThanOrEqual(5);
    expect(due.getTime()).toBeGreaterThan(T0.getTime());
    expect(await dispatchCompany(deps(due), acc.companyId)).toMatchObject({ sent: 1 });
  });

  it('deja al menos 48 h entre dos contactos con el mismo cliente', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    const manual = await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', title: 'Llamada', dueAt: new Date().toISOString() });
    expect(manual.status).toBe(201);
    expect((await acc.client.post(`/follow-ups/${manual.body.followUp.id}/complete`, { outcome: 'no_answer' })).status).toBe(200);
    expect(await dispatchCompany(deps(new Date()), acc.companyId)).toMatchObject({ sent: 0, waiting: 1 });
    const [step] = await ruleSteps(acc, q.id);
    expect(new Date(step.dueAt).getTime()).toBeGreaterThan(Date.now() + 47 * HOUR);
  });

  it('activar exige requisitos y permisos; desactivar cancela lo pendiente', async () => {
    const acc = await registerAccount(app);
    const member = await addMember(app, acc, 'member');
    expect((await member.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(403);
    expect((await acc.client.post('/automation/enable', {})).status).toBe(400);
    const missing = await acc.client.post('/automation/enable', { confirmLegalBasis: true });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.map((d: any) => d.path).sort()).toEqual(['emailVerified', 'legalBasisNote', 'replyToEmail']);

    await configure(acc);
    // Sin email confirmado no se puede activar (evita cuentas falsas para enviar spam).
    expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).body.error.details.map((d: any) => d.path)).toEqual(['emailVerified']);
    expect((await acc.client.get('/automation')).body.automation.requirements.emailVerified).toBe(false);
    await verifyEmail(app, mailer, acc);
    expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(200);
    const status = (await acc.client.get('/automation')).body;
    expect(status.automation).toMatchObject({ enabled: true, requireApproval: false, schedule: [3, 7, 14] });
    expect(status.provider).toMatchObject({ name: 'fake', configured: true, fromDomain: 'envios.ejemplo.test' });

    // Mientras está activo no se puede quitar la dirección de respuesta ni la base legal.
    expect((await acc.client.patch('/company/settings', { replyToEmail: null })).status).toBe(400);

    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    const off = await acc.client.post('/automation/disable');
    expect(off.body).toEqual({ enabled: false, cancelledFollowUps: 1 });
    expect((await ruleSteps(acc, q.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'automation_disabled' });
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(0);
  });

  it('se puede desactivar el envío automático de un presupuesto concreto', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    const res = await acc.client.patch(`/quotes/${q.id}`, { autoFollowUpEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.quote.autoFollowUpEnabled).toBe(false);
    expect((await ruleSteps(acc, q.id))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'quote_auto_disabled' });
    expect((await planCompany(deps(T0), acc.companyId)).scheduled).toBe(0);
  });

  it('sin proveedor configurado no se puede activar ni se envía nada', async () => {
    const { app: bare } = await createTestApp(); // proveedor "disabled" por defecto
    const acc = await registerAccount(bare);
    await configure(acc);
    const res = await acc.client.post('/automation/enable', { confirmLegalBasis: true });
    expect(res.status).toBe(409);
    expect((await acc.client.get('/automation')).body.provider).toMatchObject({ name: 'disabled', configured: false });
    expect((await acc.client.post('/automation/test-email')).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Plantillas por la API
// ---------------------------------------------------------------------------

describe('plantillas y variables', () => {
  it('versiona, valida y previsualiza con datos reales sin enviar nada', async () => {
    const acc = await automatedCompany();
    const list = (await acc.client.get('/automation/templates')).body;
    expect(list.items.map((t: any) => [t.step, t.offsetDays, t.version])).toEqual([
      [1, 3, 1],
      [2, 7, 1],
      [3, 14, 1],
    ]);
    expect(Object.keys(list.variables)).toEqual(['nombre_cliente', 'titulo_presupuesto', 'referencia', 'fecha_envio', 'empresa', 'remitente']);

    const bad = await acc.client.request('PUT' as 'POST', '/automation/templates/2', { subject: 'Hola', body: 'Te hacemos un {{descuento}}' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].message).toContain('{{descuento}}');

    const body = 'Hola, {{nombre_cliente}}:\n\n¿Pudiste revisar «{{titulo_presupuesto}}» ({{referencia}}), enviado el {{fecha_envio}}?\n\n{{remitente}} · {{empresa}}';
    const saved = await acc.client.request('PUT' as 'POST', '/automation/templates/2', { subject: 'Seguimos a tu disposición', body });
    expect(saved.body.template.version).toBe(2);
    // Guardar lo mismo no crea otra versión.
    expect((await acc.client.request('PUT' as 'POST', '/automation/templates/2', { subject: 'Seguimos a tu disposición', body })).body.template.version).toBe(2);
    expect((await acc.client.get('/automation/templates/2/versions')).body.items.map((v: any) => v.version)).toEqual([2, 1]);

    const q = await sentQuote(acc, 3, { title: 'Reforma de baño <b>', reference: 'P-2026-77' });
    const preview = await acc.client.post('/automation/templates/preview', { subject: 'Seguimos a tu disposición', body, quoteId: q.id });
    expect(preview.status).toBe(200);
    const fecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(q.sentAt));
    expect(preview.body.preview.text).toContain(`Hola, Cliente Ficticio:\n\n¿Pudiste revisar «Reforma de baño <b>» (P-2026-77), enviado el ${fecha}?\n\nLaura Martín · Reformas Prueba SL`);
    expect(preview.body.preview.html).toContain('Reforma de baño &lt;b&gt;');
    expect(preview.body.preview.sample).toBe(false);
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);

    const activity = (await acc.client.get('/activity')).body.items.map((a: any) => a.action);
    expect(activity).toContain('template.updated');
  });

  it('el email de prueba solo va a la persona que lo pide', async () => {
    const acc = await automatedCompany();
    const res = await acc.client.post('/automation/test-email');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ delivery: 'sent', to: acc.email });
    const [msg] = fake.sentTo(acc.email);
    expect(msg!.subject).toMatch(/^\[Prueba\] /);
  });
});

// ---------------------------------------------------------------------------
// Webhooks de Mailgun (servidor HTTP local en lugar de Mailgun: no es una prueba real)
// ---------------------------------------------------------------------------

describe('Mailgun: envío y webhooks firmados (contra un servidor local, no contra Mailgun)', async () => {
  const SIGNING_KEY = 'clave-de-firma-de-prueba';
  const sent: URLSearchParams[] = [];
  let counter = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      sent.push(new URLSearchParams(raw));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: `<prueba-${++counter}@mg.ejemplo.test>`, message: 'Queued. Thank you.' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const mg = await createTestApp((c) => {
    c.automation.provider = 'mailgun';
    c.automation.fromEmail = 'seguimiento@mg.ejemplo.test';
    c.automation.mailgun = {
      apiKey: 'clave-api-de-prueba',
      domain: 'mg.ejemplo.test',
      apiBase: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      webhookSigningKey: SIGNING_KEY,
    };
  });
  const mgDeps = (now: Date): EngineDeps => ({ db: mg.db, config: mg.config, provider: mg.app.followUpProvider, now: () => now });

  function signed(eventData: Record<string, unknown>, opts: { key?: string; timestamp?: number; token?: string } = {}) {
    const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
    const token = opts.token ?? randomBytes(25).toString('hex');
    const signature = createHmac('sha256', opts.key ?? SIGNING_KEY).update(timestamp + token).digest('hex');
    return { signature: { timestamp, token, signature }, 'event-data': eventData };
  }
  const post = (payload: unknown) => mg.app.inject({ method: 'POST', url: `${API}/webhooks/mailgun`, payload: payload as object });

  async function sentViaMailgun() {
    const acc = await automatedCompany({}, mg);
    const q = await sentQuote(acc, 3);
    await planCompany(mgDeps(T0), acc.companyId);
    expect(await dispatchCompany(mgDeps(T0), acc.companyId)).toMatchObject({ sent: 1 });
    const [step] = await ruleSteps(acc, q.id);
    const [delivery] = await deliveries(acc, step.id);
    return { acc, q, step, delivery };
  }

  it('envía por la API HTTP y registra el id del proveedor', async () => {
    const { q, delivery } = await sentViaMailgun();
    const form = sent.at(-1)!;
    expect(form.get('to')).toBe(q.contact.email);
    expect(form.get('h:Reply-To')).toBe(REPLY_TO);
    expect(form.get('v:presupio_delivery_id')).toBe(delivery.id);
    expect(delivery).toMatchObject({ provider: 'mailgun', status: 'sent', providerMessageId: `prueba-${counter}@mg.ejemplo.test` });
  });

  it('"entregado" solo se registra con un webhook firmado y válido, una sola vez', async () => {
    const { acc, step, delivery } = await sentViaMailgun();
    const event = { event: 'delivered', message: { headers: { 'message-id': delivery.providerMessageId } } };

    expect((await post(signed(event, { key: 'clave-falsa' }))).statusCode).toBe(401);
    expect((await post(signed(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).statusCode).toBe(401);
    expect((await post({ 'event-data': event })).statusCode).toBe(401);
    expect((await deliveries(acc, step.id))[0].status).toBe('sent');

    const payload = signed(event);
    expect((await post(payload)).json()).toEqual({ status: 'processed' });
    expect((await post(payload)).json()).toEqual({ status: 'duplicate' }); // repetición del mismo token
    const [d] = await deliveries(acc, step.id);
    expect(d.status).toBe('delivered');
    expect(d.deliveredAt).toBeTruthy();
    expect((await acc.client.get('/automation')).body.counts.delivered30d).toBe(1);
  });

  it('un rebote permanente marca el intento como fallido y excluye la dirección; uno temporal no cambia nada', async () => {
    const { acc, q, step, delivery } = await sentViaMailgun();
    const ref = { 'user-variables': { presupio_delivery_id: delivery.id } };
    expect((await post(signed({ event: 'failed', severity: 'temporary', ...ref }))).json()).toEqual({ status: 'processed' });
    expect((await deliveries(acc, step.id))[0].status).toBe('sent');

    await post(signed({ event: 'failed', severity: 'permanent', reason: 'bounce', 'delivery-status': { code: 550, description: `No such user ${q.contact.email}` }, ...ref }));
    const [d] = await deliveries(acc, step.id);
    expect(d).toMatchObject({ status: 'failed', errorCode: 'bounced' });
    expect(d.errorDetail).not.toContain(q.contact.email);
    const exclusions = (await acc.client.get('/exclusions')).body.items.filter((e: any) => e.contactId === q.contact.id);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0].reason).toBe('bounced');
    // El paso 2 ya no se programa.
    expect((await planCompany(mgDeps(at(5 * DAY)), acc.companyId)).scheduled).toBe(0);
  });

  it('una queja por spam da de baja al contacto', async () => {
    const { acc, q, delivery } = await sentViaMailgun();
    await planCompany(mgDeps(T0), acc.companyId); // paso 2 pendiente
    await post(signed({ event: 'complained', message: { headers: { 'message-id': `<${delivery.providerMessageId}>` } } }));
    const exclusions = (await acc.client.get('/exclusions')).body.items.filter((e: any) => e.contactId === q.contact.id);
    expect(exclusions[0]).toMatchObject({ reason: 'opt_out_request', channel: 'email' });
    expect((await ruleSteps(acc, q.id))[1]).toMatchObject({ status: 'cancelled', cancelReason: 'contact_excluded' });
  });

  it('el webhook no existe si el proveedor no es Mailgun', async () => {
    expect((await app.inject({ method: 'POST', url: `${API}/webhooks/mailgun`, payload: signed({ event: 'delivered' }) })).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Conservación (último: afecta a todos los envíos de la base de pruebas)
// ---------------------------------------------------------------------------

describe('conservación de datos', () => {
  it('borra el contenido de los mensajes pasado el plazo y conserva los metadatos', async () => {
    const acc = await automatedCompany();
    const q = await sentQuote(acc, 3);
    await planCompany(deps(T0), acc.companyId);
    await dispatchCompany(deps(T0), acc.companyId);
    const [step] = await ruleSteps(acc, q.id);

    const early = await applyRetention(deps(at(30 * DAY)));
    expect(early.purgedContent).toBe(0);
    const result = await applyRetention(deps(at((config.automation.contentRetentionDays + 1) * DAY)));
    expect(result.purgedContent).toBeGreaterThanOrEqual(1);
    const [d] = await deliveries(acc, step.id);
    expect(d).toMatchObject({ subject: null, bodyText: null, status: 'sent', recipient: q.contact.email });
    expect(d.contentPurgedAt).toBeTruthy();
  });
});
