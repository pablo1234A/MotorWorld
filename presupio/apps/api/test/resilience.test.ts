import { spawn } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatchCompany, planCompany, recoverStuckDeliveries, type EngineDeps } from '../src/automation/engine.js';
import type { DeliveryLookup, OutgoingEmail, SendResult } from '../src/automation/providers.js';
import { runCycle } from '../src/automation/runner.js';
import { reconcileUnknownDeliveries } from '../src/automation/unknown.js';
import { FakeProvider } from './fake-provider.js';
import { addMember, createQuote, createTestApp, registerAccount, verifyEmail, type RegisteredAccount } from './helpers.js';
import { TcpProxy } from './tcp-proxy.js';

/*
 * P1-01 y P2-07: caídas de PostgreSQL y envíos interrumpidos.
 * La base de datos «cae» cortando un proxy TCP local entre la aplicación y PostgreSQL: el
 * servidor real sigue funcionando para las demás pruebas. Ningún email sale de la máquina.
 */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const target = new URL(process.env.TEST_DATABASE_URL!);
const proxy = new TcpProxy(target.hostname, Number(target.port || 5432));
await proxy.start();

const fake = new FakeProvider('resiliencia');
const { app, db, config, mailer } = await createTestApp(
  (c) => {
    c.databaseUrl = proxy.wrap(process.env.TEST_DATABASE_URL!);
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
    c.dbPoolMax = 6;
  },
  { followUpProvider: fake },
);
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 2 });
afterAll(async () => {
  await owner.end();
  await proxy.stop();
});
const deps = (now = new Date(), extra: Partial<EngineDeps> = {}): EngineDeps => ({ db, config, provider: fake, now: () => now, ...extra });
const ready = async () => (await app.inject({ method: 'GET', url: '/api/v1/health/ready' })).statusCode;

async function automated(acc: RegisteredAccount) {
  await verifyEmail(app, mailer, acc);
  expect(
    (
      await acc.client.patch('/company/settings', {
        allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
        contactWindowStart: '00:00',
        contactWindowEnd: '23:59',
        requireManualApproval: false,
        legalBasisNote: 'Clientes que han pedido presupuesto (interés legítimo).',
        replyToEmail: 'oficina@ejemplo.test',
      })
    ).status,
  ).toBe(200);
  expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(200);
}
const sentDaysAgo = (acc: RegisteredAccount, days: number) => createQuote(acc.client, { sentAt: new Date(Date.now() - days * DAY - 3_600_000).toISOString() });
const attemptStatus = async (quoteId: string) => (await owner.query('SELECT status FROM attempt_events WHERE quote_id = $1', [quoteId])).rows.map((r) => r.status);
const ruleStep = async (quoteId: string) => (await owner.query("SELECT id, status, failure_reason FROM follow_ups WHERE quote_id = $1 AND source = 'rule' ORDER BY created_at", [quoteId])).rows;

describe('caída y vuelta de PostgreSQL (P1-01)', () => {
  it('la API no se cae: /health/ready responde 503 durante el corte y 200 al volver, sin reiniciar', async () => {
    expect(await ready()).toBe(200);
    await proxy.stop(); // corta también las conexiones inactivas del pool (antes: evento «error» sin manejar → proceso terminado)
    expect(await ready()).toBe(503);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a@ejemplo.test', password: 'x' } });
    expect(login.statusCode).toBe(503);
    expect(login.json().error.code).toBe('SERVICE_UNAVAILABLE');
    await proxy.start(proxy.port);
    expect(await ready()).toBe(200);
  });

  it.skipIf(!process.env.DATABASE_ADMIN_URL)('el cierre de conexiones por el servidor (57P01, el error de la auditoría) no termina el proceso', async () => {
    expect(await ready()).toBe(200); // deja conexiones inactivas en el pool
    const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    await admin.connect();
    try {
      const { rows } = await admin.query(
        "SELECT count(pg_terminate_backend(pid))::int AS n FROM pg_stat_activity WHERE datname = $1 AND application_name = 'presupio-api' AND usename = $2",
        [target.pathname.slice(1), decodeURIComponent(target.username)],
      );
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      await admin.end();
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(await ready()).toBe(200);
  });

  it('un ciclo del motor durante el corte falla sin efectos; el siguiente funciona', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await proxy.stop();
    await expect(runCycle(deps())).rejects.toThrow();
    await proxy.start(proxy.port);
    const result = await runCycle(deps());
    expect(result.dispatched.sent).toBeGreaterThanOrEqual(1);
    expect(fake.sentTo(q.contact.email)).toHaveLength(1);
    expect(await attemptStatus(q.id)).toEqual(['counted']);
    await acc.client.post('/automation/disable');
  });

  it('el proceso real del worker sigue vivo durante el corte y vuelve a trabajar al restablecerse', async () => {
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      DATABASE_URL: proxy.wrap(process.env.TEST_DATABASE_URL!),
      WORKER_INTERVAL_SECONDS: '5',
    };
    const worker = spawn('npx', ['tsx', 'src/worker.ts'], { cwd: process.cwd(), env });
    let out = '';
    worker.stdout.on('data', (d) => (out += d));
    worker.stderr.on('data', (d) => (out += d));
    let exitCode: number | null = null;
    worker.on('exit', (code) => (exitCode = code));
    try {
      await expect.poll(() => out.includes('Ciclo del motor completado'), { timeout: 20_000, interval: 250 }).toBe(true);
      await proxy.stop();
      await expect.poll(() => out.includes('Ciclo del motor fallido'), { timeout: 15_000, interval: 250 }).toBe(true);
      expect(exitCode).toBeNull();
      await proxy.start(proxy.port);
      const before = out.lastIndexOf('Ciclo del motor fallido');
      await expect.poll(() => out.indexOf('Ciclo del motor completado', before) > before, { timeout: 20_000, interval: 250 }).toBe(true);
      expect(exitCode).toBeNull();
      expect(out).not.toContain("Unhandled 'error' event");
    } finally {
      worker.kill('SIGTERM');
      await new Promise((r) => worker.once('exit', r));
    }
  }, 70_000);
});

describe('envíos interrumpidos y resultado desconocido (P2-07)', () => {
  it('si la base de datos cae a mitad de envío: lo no enviado vuelve a la cola y lo dudoso queda pendiente de revisión, sin duplicados ni cobro', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q1 = await sentDaysAgo(acc, 3);
    const q2 = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);

    const hung = new FakeProvider('colgado');
    hung.hold();
    const inFlight = dispatchCompany(deps(new Date(), { provider: hung }), acc.companyId);
    await expect.poll(() => hung.sent.length).toBe(1);
    await proxy.stop(); // el proveedor acepta el primero, pero no se puede guardar el resultado
    hung.release();
    await expect(inFlight).rejects.toThrow();
    expect(hung.sent).toHaveLength(1); // el segundo nunca se llegó a enviar
    await proxy.start(proxy.port);

    const first = hung.sent[0]!.to === q1.contact.email ? q1 : q2;
    const second = first === q1 ? q2 : q1;
    expect(await recoverStuckDeliveries(deps(new Date(Date.now() + 20 * MIN)))).toBe(2);
    expect((await ruleStep(first.id))[0]).toMatchObject({ status: 'unknown', failure_reason: 'unknown_outcome' });
    expect((await ruleStep(second.id))[0]).toMatchObject({ status: 'pending', failure_reason: 'interrupted_before_send' });
    expect(await attemptStatus(first.id)).toEqual(['unverified']);
    expect(await attemptStatus(second.id)).toEqual(['released']);

    // Ciclos siguientes: el no enviado sale una vez; el dudoso NO se reenvía.
    await dispatchCompany(deps(new Date(Date.now() + 21 * MIN)), acc.companyId);
    await dispatchCompany(deps(new Date(Date.now() + 22 * MIN)), acc.companyId);
    expect(fake.sentTo(second.contact.email)).toHaveLength(1);
    expect(fake.sentTo(first.contact.email)).toHaveLength(0);
    expect(await attemptStatus(second.id)).toEqual(['counted']);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(1);

    // Revisión manual: permisos, aislamiento y resultado auditable.
    const [unknownStep] = await ruleStep(first.id);
    const member = await addMember(app, acc, 'member');
    expect((await member.client.post(`/follow-ups/${unknownStep.id}/resolve`, { outcome: 'sent' })).status).toBe(403);
    const other = await registerAccount(app);
    expect((await other.client.post(`/follow-ups/${unknownStep.id}/resolve`, { outcome: 'sent' })).status).toBe(404);
    expect((await acc.client.post(`/follow-ups/${unknownStep.id}/resolve`, { outcome: 'quizá' })).status).toBe(400);
    const listed = await acc.client.get('/follow-ups?status=unknown');
    expect(listed.body.items.map((f: { id: string }) => f.id)).toContain(unknownStep.id);
    const resolved = await acc.client.post(`/follow-ups/${unknownStep.id}/resolve`, { outcome: 'sent' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolution).toEqual({ outcome: 'sent', attemptCounted: true });
    expect(await attemptStatus(first.id)).toEqual(['counted']);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(2);
    expect((await acc.client.post(`/follow-ups/${unknownStep.id}/resolve`, { outcome: 'not_sent' })).status).toBe(409);
    const log = (await acc.client.get(`/quotes/${first.id}/activity`)).body.items.map((a: { action: string }) => a.action);
    expect(log).toEqual(expect.arrayContaining(['follow_up.unknown_outcome', 'follow_up.unknown_resolved']));
    const [delivery] = (await owner.query('SELECT review_outcome, reviewed_by_user_id FROM message_deliveries WHERE follow_up_id = $1', [unknownStep.id])).rows;
    expect(delivery).toEqual({ review_outcome: 'sent', reviewed_by_user_id: acc.userId });
    await acc.client.post('/automation/disable');
  });

  it('la reconciliación con el proveedor resuelve lo que puede y deja el resto para revisión', async () => {
    class LookupProvider extends FakeProvider {
      answers = new Map<string, 'accepted' | 'rejected' | 'not_found'>();
      async lookup(query: DeliveryLookup) {
        return this.answers.get(query.recipient) ?? 'not_found';
      }
      override async send(email: OutgoingEmail): Promise<SendResult> {
        return super.send(email);
      }
    }
    const acc = await registerAccount(app);
    await automated(acc);
    const quotes = [await sentDaysAgo(acc, 3), await sentDaysAgo(acc, 3), await sentDaysAgo(acc, 3)];
    await planCompany(deps(), acc.companyId);
    const hung = new LookupProvider('colgado');
    hung.hold();
    const inFlight = dispatchCompany(deps(new Date(), { provider: hung }), acc.companyId);
    await expect.poll(() => hung.sent.length).toBe(1);
    // Sin cortar la base de datos: la llamada no vuelve (proceso colgado) y pasan 20 min.
    expect(await recoverStuckDeliveries(deps(new Date(Date.now() + 20 * MIN)))).toBe(3);
    const unknownQuote = quotes.find((q) => q.contact.email === hung.sent[0]!.to)!;
    expect((await ruleStep(unknownQuote.id))[0].status).toBe('unknown');

    const provider = new LookupProvider('colgado');
    provider.answers.set(unknownQuote.contact.email, 'not_found');
    expect(await reconcileUnknownDeliveries(deps(new Date(), { provider }))).toEqual({ checked: 1, sent: 0, notSent: 0 });
    expect((await ruleStep(unknownQuote.id))[0].status).toBe('unknown'); // sin prueba, sigue pendiente
    provider.answers.set(unknownQuote.contact.email, 'accepted');
    expect(await reconcileUnknownDeliveries(deps(new Date(), { provider }))).toEqual({ checked: 1, sent: 1, notSent: 0 });
    expect((await ruleStep(unknownQuote.id))[0].status).toBe('sent');
    expect(await attemptStatus(unknownQuote.id)).toEqual(['counted']);
    const [delivery] = (await owner.query("SELECT d.review_outcome FROM message_deliveries d JOIN follow_ups f ON f.id = d.follow_up_id WHERE f.quote_id = $1 AND d.status = 'sent'", [unknownQuote.id])).rows;
    expect(delivery.review_outcome).toBe('provider_sent');
    // Si la llamada original vuelve tarde, ya está resuelto: no se duplica ni se vuelve a contar.
    hung.release();
    await inFlight.catch(() => {});
    expect(await attemptStatus(unknownQuote.id)).toEqual(['counted']);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(1);
    await acc.client.post('/automation/disable');
  });

  it('si la llamada colgada vuelve después de darse por desconocida, su resultado la resuelve (y cuenta una vez)', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    const hung = new FakeProvider('colgado');
    hung.hold();
    const inFlight = dispatchCompany(deps(new Date(), { provider: hung }), acc.companyId);
    await expect.poll(() => hung.sent.length).toBe(1);
    await recoverStuckDeliveries(deps(new Date(Date.now() + 20 * MIN)));
    expect((await ruleStep(q.id))[0].status).toBe('unknown');
    hung.release();
    expect(await inFlight).toMatchObject({ sent: 1 });
    expect((await ruleStep(q.id))[0].status).toBe('sent');
    expect(await attemptStatus(q.id)).toEqual(['counted']);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(1);
    await acc.client.post('/automation/disable');
  });

  it('«no enviado» libera el intento, no se reenvía solo y la base de datos impide deshacer un intento contado', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    const hung = new FakeProvider('colgado');
    hung.hold();
    const inFlight = dispatchCompany(deps(new Date(), { provider: hung }), acc.companyId);
    await expect.poll(() => hung.sent.length).toBe(1);
    await recoverStuckDeliveries(deps(new Date(Date.now() + 20 * MIN)));
    const [step] = await ruleStep(q.id);
    const res = await acc.client.post(`/follow-ups/${step.id}/resolve`, { outcome: 'not_sent' });
    expect(res.body.resolution).toEqual({ outcome: 'not_sent', attemptCounted: false });
    expect((await ruleStep(q.id))[0]).toMatchObject({ status: 'failed', failure_reason: 'not_sent_confirmed' });
    expect(await attemptStatus(q.id)).toEqual(['released']);
    await dispatchCompany(deps(new Date(Date.now() + 30 * MIN)), acc.companyId);
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(0);
    // Un resultado tardío de la llamada original no reabre lo ya resuelto.
    hung.release();
    await inFlight.catch(() => {});
    expect((await ruleStep(q.id))[0].status).toBe('failed');
    // La base de datos impide deshacer un intento contado (aunque lo pida la aplicación).
    const counted = await registerAccount(app);
    await automated(counted);
    const cq = await sentDaysAgo(counted, 3);
    await planCompany(deps(), counted.companyId);
    await dispatchCompany(deps(), counted.companyId);
    const app_ = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await app_.connect();
    try {
      await app_.query('BEGIN');
      await app_.query("SELECT set_config('app.company_id', $1, true)", [counted.companyId]);
      await expect(app_.query("UPDATE attempt_events SET status = 'unverified' WHERE quote_id = $1", [cq.id])).rejects.toThrow(/no permitido/);
      await app_.query('ROLLBACK');
    } finally {
      await app_.end();
    }
    await counted.client.post('/automation/disable');
    await acc.client.post('/automation/disable');
  });
});

beforeAll(() => {
  expect(proxy.port).toBeGreaterThan(0);
});
