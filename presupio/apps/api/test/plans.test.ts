import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { dispatchCompany, inCompany, planCompany, type EngineDeps } from '../src/automation/engine.js';
import { runCycle } from '../src/automation/runner.js';
import { createDb, type Db } from '../src/db/database.js';
import { MIGRATIONS_DIR, migrate } from '../src/db/migrator.js';
import { PLANS } from '../src/domain/plans.js';
import { safeErrorSerializer } from '../src/lib/log.js';
import { attemptCapacity, billingPeriodFor, confirmAttempt, loadPlanContext, reserveAttempt } from '../src/modules/usage/service.js';
import { FakeProvider } from './fake-provider.js';
import { addMember, API, createQuote, createTestApp, registerAccount, verifyEmail, type RegisteredAccount } from './helpers.js';

/*
 * Límites de los planes por INTENTOS (regla comercial de la fase 5), recuperaciones como
 * métrica, fechas declaradas (D4), métricas, aislamiento, errores y migraciones.
 * Los planes se asignan como lo haría el personal de operación: con el rol propietario del
 * esquema (el rol de la aplicación no puede modificarlos).
 */

const OPS_TOKEN = 'token-de-supervision-de-pruebas-0123456789abcdef';
const fake = new FakeProvider();
const { app, db, config, mailer } = await createTestApp(
  (c) => {
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
    c.dbPoolMax = 10;
    c.opsStatusToken = OPS_TOKEN;
  },
  { followUpProvider: fake },
);
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 3 });
afterAll(() => owner.end());

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

async function setPlan(companyId: string, plan: 'starter' | 'pro' | 'business', status = 'active') {
  await owner.query('UPDATE subscriptions SET plan = $2, status = $3, trial_ends_at = NULL WHERE company_id = $1', [companyId, plan, status]);
}

/** Prepara el periodo vigente como si ya se hubieran contado `used` intentos (rol propietario). */
async function presetAttempts(acc: RegisteredAccount, used: number) {
  const usage = (await acc.client.get('/usage')).body.usage;
  await owner.query(
    `INSERT INTO usage_periods (company_id, period_start, period_end, plan, recovery_limit, attempt_limit, attempts_counted)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     ON CONFLICT (company_id, period_start) DO UPDATE SET attempts_counted = EXCLUDED.attempts_counted, attempt_limit = EXCLUDED.attempt_limit`,
    [acc.companyId, usage.period.start, usage.period.end, usage.plan.id, usage.attempts.limit, used],
  );
}

/** Presupuesto enviado con un seguimiento manual realizado. */
async function quoteWithFollowUp(acc: RegisteredAccount) {
  const q = await createQuote(acc.client);
  const fu = await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'left_message' });
  expect(fu.status).toBe(201);
  return q;
}

async function respond(acc: RegisteredAccount, quoteId: string, status: 'responded' | 'accepted' | 'rejected' = 'responded') {
  const res = await acc.client.post(`/quotes/${quoteId}/status`, status === 'accepted' ? { status, evidence: 'Contrato firmado' } : { status });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

/** Activa el envío automático con una franja que admite cualquier hora. */
async function automated(acc: RegisteredAccount) {
  await verifyEmail(app, mailer, acc);
  const s = await acc.client.patch('/company/settings', {
    allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
    contactWindowStart: '00:00',
    contactWindowEnd: '23:59',
    requireManualApproval: false,
    legalBasisNote: 'Clientes que han pedido presupuesto (interés legítimo).',
    replyToEmail: 'oficina@ejemplo.test',
  });
  expect(s.status).toBe(200);
  expect((await acc.client.post('/automation/enable', { confirmLegalBasis: true })).status).toBe(200);
}
const sentDaysAgo = (acc: RegisteredAccount, days: number) => createQuote(acc.client, { sentAt: new Date(Date.now() - days * DAY - 3_600_000).toISOString() });
const deps = (database: Db = db, now?: Date): EngineDeps => ({ db: database, config, provider: fake, now: () => now ?? new Date() });
const usageOf = async (acc: RegisteredAccount) => (await acc.client.get('/usage')).body.usage;
const stepsOf = async (acc: RegisteredAccount, quoteId: string) => (await acc.client.get(`/quotes/${quoteId}/follow-ups?status=all`)).body.items;

// ---------------------------------------------------------------------------
// Regla comercial: se cuentan intentos de seguimiento, no recuperaciones
// ---------------------------------------------------------------------------

describe('límites de intentos por plan', () => {
  it('Starter: 25 intentos al mes; al agotarlos no sale ningún email más', async () => {
    const acc = await registerAccount(app); // prueba gratuita = límites de Starter
    await automated(acc);
    expect(PLANS.starter).toMatchObject({ monthlyAttemptLimit: 25, priceCents: 2799 });
    await presetAttempts(acc, 24);
    const q1 = await sentDaysAgo(acc, 3);
    const q2 = await sentDaysAgo(acc, 3);
    expect((await planCompany(deps(), acc.companyId)).scheduled).toBe(2);
    const sent = await dispatchCompany(deps(), acc.companyId);
    expect(sent).toMatchObject({ sent: 1 });
    expect([...fake.sentTo(q1.contact.email), ...fake.sentTo(q2.contact.email)]).toHaveLength(1);

    const usage = await usageOf(acc);
    expect(usage).toMatchObject({ plan: { id: 'starter', monthlyAttemptLimit: 25 }, status: 'trialing' });
    expect(usage.attempts).toMatchObject({ used: 25, inProgress: 0, limit: 25, remaining: 0, level: 'reached' });
    expect(usage.attempts.limitReachedAt).toBeTruthy();
    // El paso que quedaba se cancela y no se programa nada nuevo hasta el periodo siguiente.
    expect((await planCompany(deps(), acc.companyId)).cancelled).toBe(1);
    const cancelled = [...(await stepsOf(acc, q1.id)), ...(await stepsOf(acc, q2.id))].filter((s: any) => s.status === 'cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].cancelReason).toBe('plan_limit_reached');
    await sentDaysAgo(acc, 3);
    expect((await planCompany(deps(), acc.companyId)).scheduled).toBe(0);
    const activity = (await acc.client.get('/activity')).body.items.map((a: any) => a.action);
    expect(activity).toContain('usage.limit_reached');
    // Los datos siguen consultables y se pueden seguir registrando respuestas.
    expect((await acc.client.post(`/quotes/${q2.id}/status`, { status: 'responded' })).status).toBe(200);
    await acc.client.post('/automation/disable');
  });

  it('avisa al acercarse al límite (80 %)', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    await presetAttempts(acc, 19);
    expect((await usageOf(acc)).attempts).toMatchObject({ used: 19, warningAt: 20, level: 'ok' });
    await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    await dispatchCompany(deps(), acc.companyId);
    expect((await usageOf(acc)).attempts).toMatchObject({ used: 20, remaining: 5, level: 'warning' });
    await acc.client.post('/automation/disable');
  });

  it('Pro: 65 intentos', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    await setPlan(acc.companyId, 'pro');
    await presetAttempts(acc, 64);
    await sentDaysAgo(acc, 3);
    await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    expect((await usageOf(acc)).attempts).toMatchObject({ used: 65, limit: 65, remaining: 0 });
    await acc.client.post('/automation/disable');
  });

  it('Business: 300 intentos al mes y, aparte, 400 emails automáticos al día', async () => {
    expect(PLANS.business).toMatchObject({ monthlyAttemptLimit: 300, dailyAutomaticEmailLimit: 400, fairUse: true, priceCents: 12799 });
    expect(PLANS.pro).toMatchObject({ monthlyAttemptLimit: 65, priceCents: 5799 });
    const acc = await registerAccount(app);
    await automated(acc);
    await setPlan(acc.companyId, 'business');
    await presetAttempts(acc, 299);
    await sentDaysAgo(acc, 3);
    await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    const usage = await usageOf(acc);
    expect(usage.attempts).toMatchObject({ used: 300, limit: 300 });
    // Dos límites distintos: 300 intentos (mes) no son 300 emails ni el límite diario de 400.
    expect(usage.automaticEmails).toMatchObject({ dailyLimit: 400 });
    await acc.client.post('/automation/disable');
  });

  it('un intento cuenta aunque el cliente no responda o rechace; las respuestas no consumen', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const silent = await sentDaysAgo(acc, 3);
    const rejecting = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 2 });
    await respond(acc, rejecting.id, 'rejected');
    // Contactos manuales y respuestas no son intentos de envío de Presupio.
    const manual = await quoteWithFollowUp(acc);
    expect((await respond(acc, manual.id)).recovery).toEqual({ status: 'recorded' });
    const usage = await usageOf(acc);
    expect(usage.attempts.used).toBe(2);
    expect(usage.recoveriesRecorded).toBe(1);
    expect(usage.events.map((e: any) => e.quoteId).sort()).toEqual([silent.id, rejecting.id].sort());
    expect(usage.events.every((e: any) => e.status === 'counted' && e.sentAt)).toBe(true);
    await acc.client.post('/automation/disable');
  });

  it('no cuentan los programados que se cancelan ni los fallos antes del envío; los reintentos no duplican', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const archived = await sentDaysAgo(acc, 3);
    const retried = await sentDaysAgo(acc, 3);
    const rejected = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    // 1) Cancelado antes de enviarse (presupuesto archivado).
    expect((await acc.client.post(`/quotes/${archived.id}/archive`)).status).toBe(200);
    // 2) Fallo temporal y luego envío correcto; 3) rechazo definitivo del proveedor.
    const byTo = new Map<string, { ok: false; retryable: boolean; code: string; detail: string }>([
      [retried.contact.email, { ok: false, retryable: true, code: 'smtp_timeout', detail: 'Tiempo de espera agotado' }],
      [rejected.contact.email, { ok: false, retryable: false, code: 'rejected', detail: 'Destinatario rechazado' }],
    ]);
    const originalSend = fake.send.bind(fake);
    fake.send = async (email) => {
      const scripted = byTo.get(email.to);
      byTo.delete(email.to);
      if (scripted) {
        fake.sent.push(email);
        return scripted;
      }
      return originalSend(email);
    };
    try {
      expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 0, retried: 1, failed: 1 });
      expect((await usageOf(acc)).attempts).toMatchObject({ used: 0, inProgress: 0 });
      // Reintento del MISMO seguimiento tras la espera: se envía y cuenta una sola vez.
      expect(await dispatchCompany(deps(db, new Date(Date.now() + 6 * 60_000)), acc.companyId)).toMatchObject({ sent: 1 });
    } finally {
      fake.send = originalSend;
    }
    expect((await usageOf(acc)).attempts).toMatchObject({ used: 1, inProgress: 0 });
    const { rows } = await owner.query(
      `SELECT q.id AS quote_id, a.status, (SELECT count(*)::int FROM message_deliveries d WHERE d.follow_up_id = a.follow_up_id) AS deliveries
       FROM attempt_events a JOIN quotes q ON q.id = a.quote_id WHERE a.company_id = $1`,
      [acc.companyId],
    );
    const byQuote = Object.fromEntries(rows.map((r) => [r.quote_id, r]));
    expect(byQuote[archived.id]).toBeUndefined(); // nunca se reservó
    expect(byQuote[retried.id]).toMatchObject({ status: 'counted', deliveries: 2 }); // dos envíos técnicos, un intento
    expect(byQuote[rejected.id]).toMatchObject({ status: 'released', deliveries: 1 });
    await acc.client.post('/automation/disable');
  });

  it('dos seguimientos distintos del mismo presupuesto cuentan como dos intentos', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    // Cinco días después toca el segundo email de la secuencia (día 7).
    const later = new Date(Date.now() + 5 * DAY);
    expect((await planCompany(deps(db, later), acc.companyId)).scheduled).toBe(1);
    expect(await dispatchCompany(deps(db, later), acc.companyId)).toMatchObject({ sent: 1 });
    const { rows } = await owner.query("SELECT count(*)::int AS n FROM attempt_events WHERE quote_id = $1 AND status = 'counted'", [q.id]);
    expect(rows[0].n).toBe(2);
    expect(fake.sentTo(q.contact.email)).toHaveLength(2);
    await acc.client.post('/automation/disable');
  });

  it('varios procesos a la vez no superan el límite de intentos (y la base de datos lo impide)', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    await presetAttempts(acc, 23);
    const quotes = [];
    for (let i = 0; i < 5; i++) quotes.push(await sentDaysAgo(acc, 3));
    const pools = [createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3)];
    try {
      await planCompany(deps(), acc.companyId);
      await Promise.all(pools.map((p) => dispatchCompany(deps(p), acc.companyId)));
      await Promise.all(pools.map((p) => runCycle(deps(p))));
    } finally {
      await Promise.all(pools.map((p) => p.destroy()));
    }
    expect(quotes.flatMap((q) => fake.sentTo(q.contact.email))).toHaveLength(2);
    const { rows } = await owner.query('SELECT attempts_counted, attempts_reserved FROM usage_periods WHERE company_id = $1', [acc.companyId]);
    expect(rows).toEqual([{ attempts_counted: 25, attempts_reserved: 0 }]);
    await expect(owner.query('UPDATE usage_periods SET attempts_counted = 26 WHERE company_id = $1', [acc.companyId])).rejects.toThrow(
      /usage_periods_attempts_within_limit/,
    );
    await acc.client.post('/automation/disable');
  });
});

// ---------------------------------------------------------------------------
// Recuperaciones (métrica) y fechas declaradas por la empresa (decisión D4)
// ---------------------------------------------------------------------------

describe('recuperaciones y fechas declaradas (D4)', () => {
  it('una recuperación exige un seguimiento verificable previo, en los 30 días anteriores, y se registra una vez', async () => {
    const acc = await registerAccount(app);
    expect((await respond(acc, (await createQuote(acc.client)).id)).recovery).toBeNull();
    const task = await createQuote(acc.client);
    await acc.client.post(`/quotes/${task.id}/follow-ups`, { channel: 'task', title: 'Revisar', status: 'completed' });
    expect((await respond(acc, task.id)).recovery).toBeNull();
    const old = await createQuote(acc.client, { sentAt: daysAgo(60) });
    await acc.client.post(`/quotes/${old.id}/follow-ups`, { channel: 'phone', status: 'completed', completedAt: daysAgo(40) });
    expect(await respond(acc, old.id)).toMatchObject({ reactivated: false, recovery: null });
    const q = await quoteWithFollowUp(acc);
    expect((await respond(acc, q.id)).recovery).toEqual({ status: 'recorded' });
    await acc.client.post(`/quotes/${q.id}/status`, { status: 'sent' });
    await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed' });
    expect((await respond(acc, q.id)).recovery).toBeNull();
    const usage = await usageOf(acc);
    expect(usage.recoveriesRecorded).toBe(1);
    expect(usage.attempts.used).toBe(0); // las recuperaciones no consumen el plan
  });

  it('una respuesta fechada antes del seguimiento no cuenta, queda constancia y se puede revisar', async () => {
    const acc = await registerAccount(app);
    const q = await createQuote(acc.client, { sentAt: daysAgo(5) });
    const fu = await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', completedAt: daysAgo(2) });
    const res = await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded', occurredAt: daysAgo(3) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reactivated: false, recovery: null, recoveryNotCounted: 'response_dated_before_follow_up' });
    const entry = (await acc.client.get(`/quotes/${q.id}/activity`)).body.items.find((a: any) => a.action === 'recovery.not_counted');
    expect(entry.metadata).toMatchObject({ reason: 'response_dated_before_follow_up', followUpId: fu.body.followUp.id, automatic: false });
    expect(entry.metadata.backdatedHours).toBeGreaterThanOrEqual(71);
    expect(entry.actor.id).toBe(acc.userId);
    // Revisión manual acordada (D4): el personal autorizado lo ve en la supervisión.
    const ops = (await app.inject({ method: 'GET', url: `${API}/ops/status`, headers: { authorization: `Bearer ${OPS_TOKEN}` } })).json();
    expect(ops.recoveries.notCountedBackdatedLast30d).toBeGreaterThanOrEqual(1);
    expect(ops.review).toContain('recoveries_backdated_review');
  });

  it('con su fecha real (posterior al seguimiento) sí cuenta; un seguimiento de hace más de 30 días se explica', async () => {
    const acc = await registerAccount(app);
    const q = await createQuote(acc.client, { sentAt: daysAgo(5) });
    await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', completedAt: daysAgo(2) });
    const res = await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded', occurredAt: daysAgo(1) });
    expect(res.body).toMatchObject({ reactivated: true, recovery: { status: 'recorded' }, recoveryNotCounted: null });
    const far = await createQuote(acc.client, { sentAt: daysAgo(60) });
    await acc.client.post(`/quotes/${far.id}/follow-ups`, { channel: 'phone', status: 'completed', completedAt: daysAgo(45) });
    expect((await acc.client.post(`/quotes/${far.id}/status`, { status: 'responded' })).body).toMatchObject({ recovery: null, recoveryNotCounted: 'follow_up_outside_window' });
  });

  it('la fecha declarada no altera los intentos contados, los periodos de facturación ni los límites', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    // Un email automático enviado (intento contado).
    const auto = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    // Un presupuesto antiguo con una llamada de hace 35 días (muy probablemente otro mes).
    const old = await createQuote(acc.client, { sentAt: daysAgo(50) });
    await acc.client.post(`/quotes/${old.id}/follow-ups`, { channel: 'phone', status: 'completed', completedAt: daysAgo(35) });
    const snapshot = async () => ({
      periods: (await owner.query('SELECT period_start, period_end, attempt_limit, attempts_counted, attempts_reserved FROM usage_periods WHERE company_id = $1 ORDER BY 1', [acc.companyId])).rows,
      attempts: (await owner.query('SELECT follow_up_id, status, sent_at, period_start FROM attempt_events WHERE company_id = $1 ORDER BY 1', [acc.companyId])).rows,
    });
    const before = await snapshot();
    expect(before.periods).toHaveLength(1);
    expect(before.attempts).toHaveLength(1);

    // 1) Respuesta retroactiva, anterior al email automático: no es recuperación, queda anotada.
    const backdated = await acc.client.post(`/quotes/${auto.id}/status`, { status: 'responded', occurredAt: new Date(Date.parse(auto.sentAt) + 60_000).toISOString() });
    expect(backdated.body).toMatchObject({ recovery: null, recoveryNotCounted: 'response_dated_before_follow_up' });
    // 2) Respuesta con fecha de hace 34 días (otro periodo): se registra HOY, en el periodo actual.
    expect((await acc.client.post(`/quotes/${old.id}/status`, { status: 'responded', occurredAt: daysAgo(34) })).body.recovery).toEqual({ status: 'recorded' });
    // 3) Correcciones y fechas imposibles.
    expect((await acc.client.post(`/quotes/${auto.id}/status`, { status: 'sent' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${auto.id}/status`, { status: 'responded', occurredAt: daysAgo(400) })).status).toBe(400);
    expect((await acc.client.post(`/quotes/${auto.id}/status`, { status: 'responded', occurredAt: new Date(Date.now() + DAY).toISOString() })).status).toBe(400);

    // Nada de lo anterior cambia el consumo, el periodo ni el límite, ni crea periodos pasados.
    expect(await snapshot()).toEqual(before);
    const { rows } = await owner.query('SELECT registered_at, responded_at FROM recovery_events WHERE quote_id = $1', [old.id]);
    expect(rows[0].registered_at.getTime()).toBeGreaterThanOrEqual(new Date(before.periods[0].period_start).getTime());
    expect(rows[0].responded_at.getTime()).toBeLessThan(Date.now() - 33 * DAY);
    await acc.client.post('/automation/disable');
  });

  it('una recuperación no se deshace, las respuestas simultáneas se registran una vez y los campos internos no se aceptan', async () => {
    const acc = await registerAccount(app);
    const q = await quoteWithFollowUp(acc);
    const responses = await Promise.all(Array.from({ length: 6 }, () => acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(5);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'accepted', evidence: 'Contrato firmado' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'sent' })).status).toBe(200);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded', occurredAt: q.sentAt })).body.recovery).toBeNull();
    const { rows } = await owner.query('SELECT status FROM recovery_events WHERE quote_id = $1', [q.id]);
    expect(rows).toEqual([{ status: 'recorded' }]);

    const other = await quoteWithFollowUp(acc);
    const forged = [
      acc.client.patch(`/quotes/${other.id}`, { reactivatedAt: new Date().toISOString() }),
      acc.client.patch(`/quotes/${other.id}`, { respondedAt: new Date().toISOString() }),
      acc.client.post(`/quotes/${other.id}/status`, { status: 'responded', reactivated: true }),
      acc.client.post(`/quotes/${other.id}/status`, { status: 'responded', recovery: { status: 'counted' } }),
      acc.client.post(`/quotes/${other.id}/status`, { status: 'responded', registeredAt: new Date().toISOString() }),
      acc.client.post(`/quotes/${other.id}/status`, { status: 'responded', attempts: 0 }),
    ];
    for (const r of await Promise.all(forged)) expect(r.status).toBe(400);
    await respond(acc, other.id);
    expect((await acc.client.patch(`/quotes/${other.id}`, { sentAt: new Date().toISOString() })).status).toBe(400);
  });

  it('el consumo no puede bajar ni moverse de periodo, un intento contado no se deshace y una empresa no toca el de otra', async () => {
    const a = await registerAccount(app);
    const b = await registerAccount(app);
    await automated(a);
    await sentDaysAgo(a, 3);
    await planCompany(deps(), a.companyId);
    await dispatchCompany(deps(), a.companyId);
    expect((await usageOf(a)).attempts.used).toBe(1);
    const asApp = <T>(companyId: string, fn: Parameters<typeof inCompany<T>>[2]) => inCompany(db, companyId, fn);
    await expect(asApp(a.companyId, (trx) => trx.updateTable('usagePeriods').set({ attemptsCounted: 0 }).where('companyId', '=', a.companyId).execute())).rejects.toThrow(
      /no pueden disminuir/,
    );
    await expect(asApp(a.companyId, (trx) => trx.updateTable('usagePeriods').set({ attemptLimit: 1 }).where('companyId', '=', a.companyId).execute())).rejects.toThrow(
      /no puede bajar/,
    );
    await expect(
      asApp(a.companyId, (trx) => trx.updateTable('usagePeriods').set({ periodEnd: new Date(Date.now() - 1000) }).where('companyId', '=', a.companyId).execute()),
    ).rejects.toThrow(/fechas de un periodo/);
    await expect(asApp(a.companyId, (trx) => trx.updateTable('attemptEvents').set({ status: 'released' }).where('companyId', '=', a.companyId).execute())).rejects.toThrow(
      /no permitido/,
    );
    await expect(asApp(a.companyId, (trx) => trx.updateTable('attemptEvents').set({ sentAt: new Date(0) }).where('companyId', '=', a.companyId).execute())).rejects.toThrow(
      /no se puede modificar/,
    );
    await expect(asApp(a.companyId, (trx) => trx.deleteFrom('attemptEvents').where('companyId', '=', a.companyId).execute())).rejects.toThrow(/permission denied/);
    // Desde la empresa B, las filas de A no existen (RLS).
    const touched = await asApp(b.companyId, (trx) => trx.updateTable('usagePeriods').set({ attemptsCounted: 999 }).where('companyId', '=', a.companyId).executeTakeFirst());
    expect(Number(touched.numUpdatedRows)).toBe(0);
    const anyFollowUp = (await owner.query('SELECT id, quote_id FROM follow_ups WHERE company_id = $1 LIMIT 1', [a.companyId])).rows[0];
    await expect(
      asApp(b.companyId, (trx) =>
        trx
          .insertInto('attemptEvents')
          .values({ companyId: a.companyId, followUpId: anyFollowUp.id, quoteId: anyFollowUp.quote_id, deliveryId: null, status: 'historical', periodStart: null, reservedAt: null, sentAt: new Date(), releasedAt: null, releaseReason: null })
          .execute(),
      ),
    ).rejects.toThrow(/row-level security/);
    expect((await usageOf(a)).attempts.used).toBe(1);
    // El personal autorizado (rol propietario) sí puede corregir tras una reclamación.
    await owner.query('UPDATE usage_periods SET attempts_counted = 0 WHERE company_id = $1', [a.companyId]);
    expect((await usageOf(a)).attempts.used).toBe(0);
    await a.client.post('/automation/disable');
  });
});

describe('consumo por empresa y por periodo', () => {
  it('cada empresa tiene su propio contador', async () => {
    const a = await registerAccount(app);
    const b = await registerAccount(app);
    await automated(a);
    await automated(b);
    await sentDaysAgo(a, 3);
    await sentDaysAgo(a, 3);
    await sentDaysAgo(b, 3);
    for (const acc of [a, b]) {
      await planCompany(deps(), acc.companyId);
      await dispatchCompany(deps(), acc.companyId);
    }
    expect((await usageOf(a)).attempts.used).toBe(2);
    expect((await usageOf(b)).attempts.used).toBe(1);
    expect((await usageOf(b)).events).toHaveLength(1);
    await a.client.post('/automation/disable');
    await b.client.post('/automation/disable');
  });

  it('el periodo es el mes natural en la zona horaria de la empresa (o el del proveedor de pagos)', () => {
    const sub = { currentPeriodStart: null, currentPeriodEnd: null };
    // 31 oct 2026 23:30 en Madrid es 22:30 UTC (horario de invierno desde el 25 oct).
    const oct = billingPeriodFor(sub, 'Europe/Madrid', new Date('2026-10-31T22:30:00Z'));
    expect(oct).toEqual({ start: new Date('2026-09-30T22:00:00Z'), end: new Date('2026-10-31T23:00:00Z'), source: 'calendar_month' });
    expect(billingPeriodFor(sub, 'Europe/Madrid', new Date('2026-10-31T23:30:00Z')).start).toEqual(new Date('2026-10-31T23:00:00Z'));
    expect(billingPeriodFor(sub, 'Atlantic/Canary', new Date('2026-12-15T12:00:00Z')).end).toEqual(new Date('2027-01-01T00:00:00Z'));
    const provider = { currentPeriodStart: new Date('2026-10-10T08:00:00Z'), currentPeriodEnd: new Date('2026-11-10T08:00:00Z') };
    expect(billingPeriodFor(provider, 'Europe/Madrid', new Date('2026-11-01T00:00:00Z'))).toEqual({
      start: provider.currentPeriodStart,
      end: provider.currentPeriodEnd,
      source: 'provider',
    });
  });

  it('al cambiar de periodo el contador empieza de cero', async () => {
    const acc = await registerAccount(app);
    await setPlan(acc.companyId, 'starter');
    const q1 = await quoteWithFollowUp(acc);
    const q2 = await quoteWithFollowUp(acc);
    const followUp = async (quoteId: string) => (await stepsOf(acc, quoteId))[0] as { id: string };
    const count = async (quoteId: string, now: Date) => {
      const f = await followUp(quoteId);
      return inCompany(db, acc.companyId, async (trx) => {
        const { period } = await attemptCapacity(trx, await loadPlanContext(trx, acc.companyId, now), now);
        expect(await reserveAttempt(trx, acc.companyId, period!, { id: f.id, quoteId }, now)).toBe(true);
        return (await confirmAttempt(trx, acc.companyId, f.id, f.id, now))!.attemptsCounted;
      });
    };
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 12));
    expect(await count(q1.id, now)).toBe(1);
    expect(await count(q2.id, nextMonth)).toBe(1);
    const { rows } = await owner.query('SELECT attempts_counted FROM usage_periods WHERE company_id = $1 ORDER BY period_start', [acc.companyId]);
    expect(rows.map((r) => r.attempts_counted)).toEqual([1, 1]);
  });

  it('una subida de plan amplía el límite en el periodo en curso; una bajada se aplica en el siguiente', async () => {
    const acc = await registerAccount(app);
    await setPlan(acc.companyId, 'starter');
    await presetAttempts(acc, 25);
    const capacity = () => inCompany(db, acc.companyId, async (trx) => (await attemptCapacity(trx, await loadPlanContext(trx, acc.companyId, new Date()), new Date())).available);
    expect(await capacity()).toBe(0);
    await setPlan(acc.companyId, 'pro');
    expect(await capacity()).toBe(40);
    await setPlan(acc.companyId, 'starter');
    expect(await capacity()).toBe(40); // el límite de este periodo no baja
    expect((await usageOf(acc)).attempts.limit).toBe(65);
  });
});

// ---------------------------------------------------------------------------
// El plan no se puede cambiar desde el navegador
// ---------------------------------------------------------------------------

describe('el plan solo lo controla el servidor', () => {
  it('ninguna petición del navegador puede fijar el plan, el precio ni el consumo', async () => {
    const acc = await registerAccount(app);
    const forged = [
      acc.client.patch('/company', { plan: 'business' }),
      acc.client.patch('/company/settings', { plan: 'business' }),
      acc.client.patch('/company/settings', { monthlyAttemptLimit: 1000 }),
      acc.client.post('/company/subscription', { plan: 'business', status: 'active' }),
      acc.client.patch('/company/subscription', { plan: 'business' }),
      acc.client.post('/usage', { used: 0 }),
      acc.client.patch('/me', { plan: 'business' }),
      acc.client.post('/auth/register', { fullName: 'X', email: 'x@ejemplo.test', password: 'Contraseña-de-prueba-1', companyName: 'Y', acceptTerms: true, plan: 'business' }),
    ];
    for (const res of await Promise.all(forged)) expect([400, 404]).toContain(res.status);
    expect(await usageOf(acc)).toMatchObject({ plan: { id: 'starter' }, status: 'trialing' });
    // Las únicas rutas de escritura relacionadas son las de facturación: solo piden cambios al
    // proveedor (el plan cambia por webhook verificado), son del propietario y aquí, sin pagos
    // activos, no hacen nada.
    const writes = app.routeTable.filter((r) => r.method !== 'GET' && /subscription|usage|plan|billing/i.test(r.url));
    expect(writes.map((r) => r.url).sort()).toEqual(
      ['/api/v1/billing/cancel', '/api/v1/billing/change-plan', '/api/v1/billing/checkout', '/api/v1/billing/portal', '/api/v1/billing/resume'].sort(),
    );
    expect(writes.every((r) => r.permission === 'billing:manage')).toBe(true);
    const disabled = await acc.client.post('/billing/checkout', { plan: 'business' });
    expect(disabled.status).toBe(409);
    expect(disabled.body.error.code).toBe('PAYMENTS_DISABLED');
    expect((await acc.client.post('/billing/checkout', { plan: 'business', priceId: 'price_x', amount: 1 })).status).toBe(400);
    expect(await usageOf(acc)).toMatchObject({ plan: { id: 'starter' }, status: 'trialing' });
  });

  it('ni siquiera la base de datos lo permite al rol de la aplicación', async () => {
    const acc = await registerAccount(app);
    await expect(
      inCompany(db, acc.companyId, (trx) => trx.updateTable('subscriptions').set({ plan: 'business', status: 'active' }).where('companyId', '=', acc.companyId).execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(inCompany(db, acc.companyId, (trx) => trx.deleteFrom('recoveryEvents').where('companyId', '=', acc.companyId).execute())).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      inCompany(db, acc.companyId, (trx) =>
        trx.insertInto('billingEvents').values({ companyId: acc.companyId, provider: 'stripe', providerEventId: 'evt_x', eventType: 'x', outcome: 'applied', subscriptionStatus: 'active', plan: 'business', detail: null }).execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Métricas: coinciden con los datos y están aisladas
// ---------------------------------------------------------------------------

describe('métricas', () => {
  it('coinciden con los datos almacenados (intentos y recuperaciones por separado)', async () => {
    const acc = await registerAccount(app);
    const responded = await quoteWithFollowUp(acc);
    const sold = await quoteWithFollowUp(acc);
    const direct = await createQuote(acc.client);
    await createQuote(acc.client); // sigue pendiente
    await createQuote(acc.client, { status: 'draft' });
    await respond(acc, responded.id);
    await respond(acc, sold.id, 'accepted');
    await respond(acc, direct.id); // respondió sin seguimiento

    const res = await acc.client.get('/metrics');
    expect(res.status).toBe(200);
    const m = res.body.metrics;
    expect(m.quotes).toEqual({ registered: 5, sent: 4, pendingNow: 1 });
    expect(m.followUps).toMatchObject({ manualContacts: 2, automaticSent: 0, automaticFailed: 0 });
    expect(m.outcomes).toMatchObject({
      responded: 3,
      respondedAfterFollowUp: 2,
      respondedWithoutFollowUp: 1,
      accepted: 1,
      acceptedAfterFollowUp: 1,
      acceptedAfterFollowUpAmountCents: 1_850_000,
      amountSource: 'declared_by_company',
    });
    expect(m.recoveries).toEqual({ recorded: 2 });
    expect(m.attempts).toEqual({ counted: 0 });
    expect(m.responseRate).toMatchObject({ quotesWithFollowUp: 2, respondedAfterFollowUp: 2, rate: null, minSample: 10 });

    const { rows } = await owner.query(
      `SELECT
         (SELECT count(*) FROM quotes WHERE company_id = $1)::int AS registered,
         (SELECT count(*) FROM quotes WHERE company_id = $1 AND sent_at IS NOT NULL)::int AS sent,
         (SELECT count(*) FROM quotes WHERE company_id = $1 AND reactivated_at IS NOT NULL)::int AS reactivated,
         (SELECT count(*) FROM recovery_events WHERE company_id = $1 AND status = 'recorded')::int AS recorded,
         (SELECT count(*) FROM attempt_events WHERE company_id = $1)::int AS attempts,
         (SELECT count(*) FROM follow_ups WHERE company_id = $1 AND status = 'completed' AND channel <> 'task')::int AS contacts`,
      [acc.companyId],
    );
    expect(rows[0]).toEqual({ registered: 5, sent: 4, reactivated: 2, recorded: 2, attempts: 0, contacts: 2 });

    const month = res.body.history.at(-1);
    expect(res.body.history).toHaveLength(6);
    expect(month).toMatchObject({ quotesSent: 4, followUpsDone: 2, respondedAfterFollowUp: 2, acceptedAfterFollowUp: 1, attemptsCounted: 0 });
    expect(res.body.history.slice(0, 5).every((h: any) => h.quotesSent === 0 && h.attemptsCounted === 0)).toBe(true);
  });

  it('periodos vacíos devuelven ceros, y los meses futuros o mal escritos se rechazan', async () => {
    const acc = await registerAccount(app);
    const res = await acc.client.get('/metrics?month=2025-01');
    expect(res.status).toBe(200);
    expect(res.body.metrics.period).toMatchObject({ month: '2025-01', inProgress: false, beforeAccountCreated: true });
    expect(res.body.metrics.quotes).toEqual({ registered: 0, sent: 0, pendingNow: 0 });
    expect(res.body.metrics.responseRate.rate).toBeNull();
    const future = new Date();
    future.setUTCMonth(future.getUTCMonth() + 2);
    expect((await acc.client.get(`/metrics?month=${future.toISOString().slice(0, 7)}`)).status).toBe(400);
    expect((await acc.client.get('/metrics?month=2026-13')).status).toBe(400);
    expect((await acc.client.get('/metrics?desde=2026-01')).status).toBe(400);
  });

  it('los datos de empresas distintas permanecen aislados', async () => {
    const a = await registerAccount(app);
    const b = await registerAccount(app);
    await automated(a);
    await sentDaysAgo(a, 3);
    await planCompany(deps(), a.companyId);
    await dispatchCompany(deps(), a.companyId);
    await respond(a, (await quoteWithFollowUp(a)).id);
    const mb = (await b.client.get('/metrics')).body.metrics;
    expect(mb.quotes.registered).toBe(0);
    expect(mb.recoveries.recorded).toBe(0);
    expect(mb.attempts.counted).toBe(0);
    expect((await usageOf(b)).events).toEqual([]);
    const exported = (await b.client.get('/company/export')).body;
    expect(exported.quotes.items).toEqual([]);
    expect(exported.attempts.items).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain(a.companyId);
    for (const table of ['recoveryEvents', 'usagePeriods', 'attemptEvents', 'billingEvents', 'retentionNotices'] as const) {
      const rows = await inCompany(db, b.companyId, (trx) => trx.selectFrom(table).select('companyId').execute());
      expect(rows.every((r) => r.companyId === b.companyId), table).toBe(true);
    }
    await a.client.post('/automation/disable');
  });
});

// ---------------------------------------------------------------------------
// Exportación de datos
// ---------------------------------------------------------------------------

describe('exportación de datos de la empresa', () => {
  it('propietarios y administradores exportan todo, sin secretos; el resto no puede', async () => {
    const acc = await registerAccount(app);
    const member = await addMember(app, acc, 'member');
    await respond(acc, (await quoteWithFollowUp(acc)).id);
    expect((await member.client.get('/company/export')).status).toBe(403);
    const res = await acc.client.get('/company/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="presupio-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.body).toMatchObject({ format: 'presupio-export', version: 2, company: { id: acc.companyId } });
    expect(res.body.quotes.items).toHaveLength(1);
    expect(res.body.recoveries.items).toHaveLength(1);
    expect(res.body).toHaveProperty('attempts.items');
    expect(res.body).toHaveProperty('billingEvents.items');
    expect(res.body.members.map((m: any) => m.email).sort()).toEqual([acc.email, member.email].sort());
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/argon2|passwordHash|tokenHash|unsubscribeTokenHash|sk_test|whsec_/);
  });
});

// ---------------------------------------------------------------------------
// Errores sin secretos
// ---------------------------------------------------------------------------

describe('errores y supervisión sin datos sensibles', () => {
  it('si la base de datos no está disponible, responde 503 sin detalles internos', async () => {
    const secretUrl = 'postgres://presupio_app:clave-super-secreta@127.0.0.1:1/presupio_test';
    const { app: broken } = await createTestApp((c) => {
      c.databaseUrl = secretUrl;
    });
    for (const req of [
      { method: 'POST' as const, url: `${API}/auth/login`, payload: { email: 'a@ejemplo.test', password: 'x' } },
      { method: 'GET' as const, url: `${API}/health/ready` },
    ]) {
      const res = await broken.inject(req);
      expect(res.statusCode, req.url).toBe(503);
      expect(res.body).not.toMatch(/clave-super-secreta|postgres:\/\/|127\.0\.0\.1|ECONNREFUSED|at \w+ \(|stack/i);
    }
    const login = await broken.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email: 'a@ejemplo.test', password: 'x' } });
    expect(login.json().error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(login.headers['retry-after']).toBe('30');
  });

  it('los errores en los logs no llevan datos personales', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "contacts_company_email_key"'), {
      code: '23505',
      constraint: 'contacts_company_email_key',
      detail: 'Key (company_id, email)=(…, ana.perez@cliente.test) already exists.',
      parameters: ['ana.perez@cliente.test'],
    });
    const out = JSON.stringify(safeErrorSerializer(pgError));
    expect(out).toContain('contacts_company_email_key');
    expect(out).not.toContain('ana.perez@cliente.test');
    expect(out).not.toContain('detail');
    expect(JSON.stringify(safeErrorSerializer(new Error('No se pudo enviar a juan@ejemplo.test')))).toContain('[email]');
  });

  it('la supervisión exige token y solo devuelve cifras agregadas', async () => {
    const url = `${API}/ops/status`;
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer otro-token-cualquiera' } })).statusCode).toBe(404);
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${OPS_TOKEN}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ database: 'ok', followUps: expect.any(Object), deliveries: expect.any(Object), jobs: expect.any(Object) });
    expect(['ok', 'degraded']).toContain(body.status);
    expect(res.body).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/i); // ni emails ni identificadores
    // Sin token configurado, la ruta no existe.
    const { app: noOps } = await createTestApp();
    expect((await noOps.inject({ method: 'GET', url, headers: { authorization: `Bearer ${OPS_TOKEN}` } })).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 11. Migraciones seguras sobre datos existentes
// ---------------------------------------------------------------------------

describe('migraciones', () => {
  it('0003 se aplica sobre una base con datos, conserva lo existente y es idempotente', async () => {
    const schema = `mig_${randomBytes(4).toString('hex')}`;
    const base = process.env.TEST_MIGRATION_DATABASE_URL!;
    const url = `${base}${base.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
    const appRole = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL!).username);
    await owner.query(`CREATE SCHEMA ${schema}`);
    try {
      // 1) Estado de la fase 3: solo 0001 y 0002.
      const oldDir = mkdtempSync(path.join(tmpdir(), 'presupio-mig-'));
      for (const f of ['0001_init.sql', '0002_follow_up_engine.sql']) cpSync(path.join(MIGRATIONS_DIR, f), path.join(oldDir, f));
      expect((await migrate({ connectionString: url, appRole, dir: oldDir })).applied).toEqual(['0001_init', '0002_follow_up_engine']);

      // 2) Datos reales de esa fase: una oportunidad reactivada tras una llamada.
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try {
        const { rows: co } = await c.query(`INSERT INTO companies (name) VALUES ('Empresa previa') RETURNING id`);
        const companyId = co[0].id;
        const { rows: ct } = await c.query(`INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'Cliente', 'cliente@ejemplo.test') RETURNING id`, [companyId]);
        const { rows: qt } = await c.query(
          `INSERT INTO quotes (company_id, contact_id, title, status, sent_at, responded_at, reactivated_at)
           VALUES ($1, $2, 'Cocina', 'responded', now() - interval '10 days', now() - interval '1 day', now() - interval '1 day') RETURNING id`,
          [companyId, ct[0].id],
        );
        await c.query(
          `INSERT INTO follow_ups (company_id, quote_id, channel, status, title, completed_at) VALUES ($1, $2, 'phone', 'completed', 'Llamada', now() - interval '3 days')`,
          [companyId, qt[0].id],
        );

        // 3) Migración de la fase 4 sobre esos datos.
        expect((await migrate({ connectionString: url, appRole })).applied).toEqual(['0003_usage_limits', '0004_recovery_integrity', '0005_attempts_and_billing']);
        const { rows: events } = await c.query('SELECT status, period_start, follow_up_id IS NOT NULL AS has_follow_up FROM recovery_events');
        expect(events).toEqual([{ status: 'historical', period_start: null, has_follow_up: true }]);
        // Sin emails automáticos previos no hay intentos históricos.
        expect((await c.query('SELECT count(*)::int AS n FROM attempt_events')).rows[0].n).toBe(0);
        expect((await c.query('SELECT count(*)::int AS n FROM quotes')).rows[0].n).toBe(1);

        // 4) Idempotente: volver a migrar no cambia nada.
        expect((await migrate({ connectionString: url, appRole })).applied).toEqual([]);
      } finally {
        await c.end();
      }
    } finally {
      await owner.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
  it('0005 se aplica sobre una base de la fase 4 con consumo y emails enviados, sin reclasificar nada', async () => {
    const schema = `mig_${randomBytes(4).toString('hex')}`;
    const base = process.env.TEST_MIGRATION_DATABASE_URL!;
    const url = `${base}${base.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
    const appRole = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL!).username);
    await owner.query(`CREATE SCHEMA ${schema}`);
    try {
      const oldDir = mkdtempSync(path.join(tmpdir(), 'presupio-mig-'));
      for (const f of ['0001_init.sql', '0002_follow_up_engine.sql', '0003_usage_limits.sql', '0004_recovery_integrity.sql']) cpSync(path.join(MIGRATIONS_DIR, f), path.join(oldDir, f));
      expect((await migrate({ connectionString: url, appRole, dir: oldDir })).applied).toHaveLength(4);
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try {
        // Estado real de la fase 4: un periodo con 3 recuperaciones contadas y un email automático enviado.
        const { rows: co } = await c.query(`INSERT INTO companies (name) VALUES ('Empresa fase 4') RETURNING id`);
        const companyId = co[0].id;
        await c.query(`INSERT INTO subscriptions (company_id, plan, status) VALUES ($1, 'pro', 'past_due')`, [companyId]);
        const { rows: ct } = await c.query(`INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'Cliente', 'cliente@ejemplo.test') RETURNING id`, [companyId]);
        const { rows: qt } = await c.query(
          `INSERT INTO quotes (company_id, contact_id, title, status, sent_at) VALUES ($1, $2, 'Baño', 'sent', now() - interval '5 days') RETURNING id`,
          [companyId, ct[0].id],
        );
        const { rows: fu } = await c.query(
          `INSERT INTO follow_ups (company_id, quote_id, channel, status, source, title, sequence_step, sequence_key, dedupe_key, sent_at)
           VALUES ($1, $2, 'email', 'sent', 'rule', 'Email automático 1 de 3', 1, 'k', 'auto:x', now() - interval '2 days') RETURNING id`,
          [companyId, qt[0].id],
        );
        await c.query(
          `INSERT INTO usage_periods (company_id, period_start, period_end, plan, recovery_limit, recoveries_counted)
           VALUES ($1, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 'pro', 65, 3)`,
          [companyId],
        );
        const before = (await c.query('SELECT recovery_limit, recoveries_counted, recoveries_over_limit FROM usage_periods')).rows;

        expect((await migrate({ connectionString: url, appRole })).applied).toEqual(['0005_attempts_and_billing']);
        // Los contadores de recuperaciones se conservan tal cual (dato histórico de la regla anterior).
        expect((await c.query('SELECT recovery_limit, recoveries_counted, recoveries_over_limit FROM usage_periods')).rows).toEqual(before);
        // El periodo recibe el límite de intentos de su plan y empieza sin consumo.
        expect((await c.query('SELECT attempt_limit, attempts_counted, attempts_reserved FROM usage_periods')).rows).toEqual([
          { attempt_limit: 65, attempts_counted: 0, attempts_reserved: 0 },
        ]);
        // El email ya enviado queda como intento histórico: registrado, pero sin consumir.
        expect((await c.query('SELECT follow_up_id, status, period_start, sent_at IS NOT NULL AS sent FROM attempt_events')).rows).toEqual([
          { follow_up_id: fu[0].id, status: 'historical', period_start: null, sent: true },
        ]);
        // Un cobro pendiente previo recibe la fecha desde la que cuentan los días de gracia.
        expect((await c.query('SELECT past_due_since IS NOT NULL AS has FROM subscriptions')).rows).toEqual([{ has: true }]);
        expect((await migrate({ connectionString: url, appRole })).applied).toEqual([]);
        // Borrar una empresa (herramienta de operación) sigue funcionando con los nuevos registros.
        await c.query('DELETE FROM companies WHERE id = $1', [companyId]);
        expect((await c.query('SELECT count(*)::int AS n FROM attempt_events')).rows[0].n).toBe(0);
      } finally {
        await c.end();
      }
    } finally {
      await owner.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
});


// ---------------------------------------------------------------------------
// Motor: límite diario y atribución de respuestas
// ---------------------------------------------------------------------------

describe('motor de seguimiento con límites', () => {
  it('el límite técnico diario se respeta aunque haya varios procesos a la vez', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const original = PLANS.starter.dailyAutomaticEmailLimit;
    PLANS.starter.dailyAutomaticEmailLimit = 2; // solo en esta prueba, para no crear 60 envíos
    const quotes = [];
    for (let i = 0; i < 5; i++) quotes.push(await sentDaysAgo(acc, 3));
    const pools = [createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3), createDb(config.databaseUrl, 3)];
    try {
      await planCompany(deps(), acc.companyId);
      await Promise.all(pools.map((p) => dispatchCompany(deps(p), acc.companyId)));
      await Promise.all(pools.map((p) => runCycle(deps(p))));
    } finally {
      PLANS.starter.dailyAutomaticEmailLimit = original;
      await Promise.all(pools.map((p) => p.destroy()));
    }
    const sent = quotes.flatMap((q) => fake.sentTo(q.contact.email));
    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((m) => m.to)).size).toBe(2);
    const usage = await usageOf(acc);
    expect(usage.automaticEmails.today).toBe(2);
    expect(usage.attempts.used).toBe(2);
    await acc.client.post('/automation/disable');
  });

  it('una respuesta tras un email automático es una recuperación atribuida a ese email y no consume otro intento', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    expect((await respond(acc, q.id)).recovery).toEqual({ status: 'recorded' });
    const { rows } = await owner.query('SELECT follow_up_source, follow_up_channel, status FROM recovery_events WHERE quote_id = $1', [q.id]);
    expect(rows).toEqual([{ follow_up_source: 'rule', follow_up_channel: 'email', status: 'recorded' }]);
    expect((await usageOf(acc)).attempts.used).toBe(1);
    await acc.client.post('/automation/disable');
  });
});
