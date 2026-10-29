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
import { billingPeriodFor, recordRecovery } from '../src/modules/usage/service.js';
import { FakeProvider } from './fake-provider.js';
import { addMember, API, createQuote, createTestApp, registerAccount, type RegisteredAccount } from './helpers.js';

/*
 * Fase 4: límites de los planes, recuperaciones, métricas, aislamiento, errores y migraciones.
 * Los planes se asignan como lo haría el personal de operación: con el rol propietario del
 * esquema (el rol de la aplicación no puede modificarlos).
 */

const OPS_TOKEN = 'token-de-supervision-de-pruebas-0123456789abcdef';
const fake = new FakeProvider();
const { app, db, config } = await createTestApp(
  (c) => {
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
    c.dbPoolMax = 10;
    c.opsStatusToken = OPS_TOKEN;
  },
  { followUpProvider: fake },
);
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 3 });
afterAll(() => owner.end());

async function setPlan(companyId: string, plan: 'starter' | 'pro' | 'business', status = 'active') {
  await owner.query('UPDATE subscriptions SET plan = $2, status = $3, trial_ends_at = NULL WHERE company_id = $1', [companyId, plan, status]);
}

/** Prepara el contador del periodo vigente (como si ya se hubieran contado `used` recuperaciones). */
async function presetUsage(acc: RegisteredAccount, used: number) {
  const usage = (await acc.client.get('/usage')).body.usage;
  await owner.query(
    `INSERT INTO usage_periods (company_id, period_start, period_end, plan, recovery_limit, recoveries_counted)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (company_id, period_start) DO UPDATE SET recoveries_counted = EXCLUDED.recoveries_counted, recovery_limit = EXCLUDED.recovery_limit`,
    [acc.companyId, usage.period.start, usage.period.end, usage.plan.id, usage.recoveries.limit, used],
  );
}

/** Presupuesto enviado con un seguimiento realizado: listo para que la respuesta cuente. */
async function quoteWithFollowUp(acc: RegisteredAccount) {
  const q = await createQuote(acc.client);
  const fu = await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed', outcome: 'left_message' });
  expect(fu.status).toBe(201);
  return q;
}

async function respond(acc: RegisteredAccount, quoteId: string, status: 'responded' | 'accepted' = 'responded') {
  const res = await acc.client.post(`/quotes/${quoteId}/status`, status === 'accepted' ? { status, evidence: 'Contrato firmado' } : { status });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

// ---------------------------------------------------------------------------
// 1-4. Límites de los planes
// ---------------------------------------------------------------------------

describe('límites de recuperaciones por plan', () => {
  it('Starter no supera 25 recuperaciones en el periodo (y la respuesta 26 se registra igualmente)', async () => {
    const acc = await registerAccount(app); // prueba gratuita = límites de Starter
    const results: string[] = [];
    for (let i = 0; i < 26; i++) {
      const q = await quoteWithFollowUp(acc);
      results.push((await respond(acc, q.id)).recovery.status);
    }
    expect(results.filter((s) => s === 'counted')).toHaveLength(25);
    expect(results.at(-1)).toBe('over_limit');

    const usage = (await acc.client.get('/usage')).body.usage;
    expect(usage).toMatchObject({ plan: { id: 'starter', monthlyRecoveryLimit: 25 }, status: 'trialing' });
    expect(usage.recoveries).toMatchObject({ used: 25, limit: 25, remaining: 0, overLimit: 1, level: 'reached' });
    expect(usage.recoveries.limitReachedAt).toBeTruthy();
    expect(usage.events).toHaveLength(26);
    // Los datos siguen consultables y la respuesta 26 quedó registrada.
    expect((await acc.client.get('/quotes?status=responded&limit=100')).body.items).toHaveLength(26);
    expect((await acc.client.get('/quotes/summary')).body.summary.reactivated).toBe(26);
    const activity = (await acc.client.get('/activity')).body.items.map((a: any) => a.action);
    expect(activity).toContain('usage.limit_reached');
  });

  it('avisa al acercarse al límite (80 %)', async () => {
    const acc = await registerAccount(app);
    await presetUsage(acc, 19);
    expect((await acc.client.get('/usage')).body.usage.recoveries).toMatchObject({ used: 19, warningAt: 20, level: 'ok' });
    await respond(acc, (await quoteWithFollowUp(acc)).id);
    expect((await acc.client.get('/usage')).body.usage.recoveries).toMatchObject({ used: 20, remaining: 5, level: 'warning' });
  });

  it('Pro no supera 65 recuperaciones', async () => {
    const acc = await registerAccount(app);
    await setPlan(acc.companyId, 'pro');
    await presetUsage(acc, 64);
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery).toEqual({ status: 'counted', used: 65, limit: 65 });
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery.status).toBe('over_limit');
    expect((await acc.client.get('/usage')).body.usage.recoveries).toMatchObject({ used: 65, limit: 65, overLimit: 1 });
  });

  it('Business aplica su límite publicado de uso razonable (300) y su límite técnico diario', async () => {
    expect(PLANS.business).toMatchObject({ monthlyRecoveryLimit: 300, dailyAutomaticEmailLimit: 400, fairUse: true });
    const acc = await registerAccount(app);
    await setPlan(acc.companyId, 'business');
    await presetUsage(acc, 299);
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery).toEqual({ status: 'counted', used: 300, limit: 300 });
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery.status).toBe('over_limit');
    const usage = (await acc.client.get('/usage')).body.usage;
    expect(usage.automaticEmails.dailyLimit).toBe(400);
  });

  it('peticiones simultáneas no superan el límite', async () => {
    const acc = await registerAccount(app);
    await presetUsage(acc, 22);
    const quotes = [];
    for (let i = 0; i < 8; i++) quotes.push(await quoteWithFollowUp(acc));
    const responses = await Promise.all(quotes.map((q) => acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const statuses = responses.map((r) => r.body.recovery.status);
    expect(statuses.filter((s) => s === 'counted')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'over_limit')).toHaveLength(5);
    const { rows } = await owner.query('SELECT recoveries_counted, recoveries_over_limit FROM usage_periods WHERE company_id = $1', [acc.companyId]);
    expect(rows).toEqual([{ recoveries_counted: 25, recoveries_over_limit: 5 }]);
    // La base de datos también lo impide por sí misma.
    await expect(owner.query('UPDATE usage_periods SET recoveries_counted = 26 WHERE company_id = $1', [acc.companyId])).rejects.toThrow(
      /usage_periods_within_limit/,
    );
  });

  it('solo cuenta con un seguimiento verificable previo y en los 30 días anteriores a la respuesta', async () => {
    const acc = await registerAccount(app);
    // Sin seguimiento: respuesta, pero no recuperación.
    const plain = await createQuote(acc.client);
    expect((await respond(acc, plain.id)).recovery).toBeNull();
    // Una tarea interna no cuenta.
    const task = await createQuote(acc.client);
    await acc.client.post(`/quotes/${task.id}/follow-ups`, { channel: 'task', title: 'Revisar', status: 'completed' });
    expect((await respond(acc, task.id)).recovery).toBeNull();
    // Seguimiento de hace 40 días: fuera de la ventana de atribución.
    const old = await createQuote(acc.client, { sentAt: new Date(Date.now() - 60 * 86_400_000).toISOString() });
    await acc.client.post(`/quotes/${old.id}/follow-ups`, {
      channel: 'phone',
      status: 'completed',
      completedAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });
    const late = await respond(acc, old.id);
    expect(late.reactivated).toBe(false);
    expect(late.recovery).toBeNull();
    // Una vez por presupuesto: volver a «pendiente» y responder otra vez no cuenta de nuevo.
    const q = await quoteWithFollowUp(acc);
    expect((await respond(acc, q.id)).recovery.status).toBe('counted');
    await acc.client.post(`/quotes/${q.id}/status`, { status: 'sent' });
    await acc.client.post(`/quotes/${q.id}/follow-ups`, { channel: 'phone', status: 'completed' });
    expect((await respond(acc, q.id)).recovery).toBeNull();
    expect((await acc.client.get('/usage')).body.usage.recoveries.used).toBe(1);
  });

  it('sin plan activo, la respuesta se registra pero no consume (ni hay periodo)', async () => {
    const acc = await registerAccount(app);
    await owner.query("UPDATE subscriptions SET status = 'canceled' WHERE company_id = $1", [acc.companyId]);
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery.status).toBe('no_active_plan');
    expect((await acc.client.get('/usage')).body.usage.recoveries).toMatchObject({ used: 0, level: 'no_plan' });
  });
});

// ---------------------------------------------------------------------------
// 5. Por empresa y por periodo
// ---------------------------------------------------------------------------

describe('consumo por empresa y por periodo', () => {
  it('cada empresa tiene su propio contador', async () => {
    const a = await registerAccount(app);
    const b = await registerAccount(app);
    await respond(a, (await quoteWithFollowUp(a)).id);
    await respond(a, (await quoteWithFollowUp(a)).id);
    await respond(b, (await quoteWithFollowUp(b)).id);
    expect((await a.client.get('/usage')).body.usage.recoveries.used).toBe(2);
    expect((await b.client.get('/usage')).body.usage.recoveries.used).toBe(1);
    expect((await b.client.get('/usage')).body.usage.events).toHaveLength(1);
  });

  it('el periodo es el mes natural en la zona horaria de la empresa (o el del proveedor de pagos)', () => {
    const sub = { currentPeriodStart: null, currentPeriodEnd: null };
    // 31 oct 2026 23:30 en Madrid es 22:30 UTC (horario de invierno desde el 25 oct).
    const oct = billingPeriodFor(sub, 'Europe/Madrid', new Date('2026-10-31T22:30:00Z'));
    expect(oct).toEqual({ start: new Date('2026-09-30T22:00:00Z'), end: new Date('2026-10-31T23:00:00Z'), source: 'calendar_month' });
    // 31 oct 2026 23:30 UTC ya es 1 de noviembre en Madrid.
    expect(billingPeriodFor(sub, 'Europe/Madrid', new Date('2026-10-31T23:30:00Z')).start).toEqual(new Date('2026-10-31T23:00:00Z'));
    // Diciembre → enero.
    expect(billingPeriodFor(sub, 'Atlantic/Canary', new Date('2026-12-15T12:00:00Z')).end).toEqual(new Date('2027-01-01T00:00:00Z'));
    // Periodo del proveedor (fase 5) si incluye la fecha.
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
    const fu = async (quoteId: string) =>
      (await acc.client.get(`/quotes/${quoteId}/follow-ups?status=all`)).body.items[0] as { id: string; completedAt: string };
    const record = async (quoteId: string, now: Date) => {
      const f = await fu(quoteId);
      return inCompany(db, acc.companyId, (trx) =>
        recordRecovery(
          trx,
          { companyId: acc.companyId, userId: acc.userId },
          { quoteId, respondedAt: new Date(f.completedAt), responseStatus: 'responded', followUp: { id: f.id, source: 'manual', channel: 'phone', at: new Date(f.completedAt) } },
          now,
        ),
      );
    };
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 12));
    expect(await record(q1.id, now)).toMatchObject({ status: 'counted', used: 1 });
    expect(await record(q2.id, nextMonth)).toMatchObject({ status: 'counted', used: 1 });
    const { rows } = await owner.query('SELECT recoveries_counted FROM usage_periods WHERE company_id = $1 ORDER BY period_start', [acc.companyId]);
    expect(rows.map((r) => r.recoveries_counted)).toEqual([1, 1]);
  });

  it('una subida de plan amplía el límite en el periodo en curso', async () => {
    const acc = await registerAccount(app);
    await presetUsage(acc, 25);
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery.status).toBe('over_limit');
    await setPlan(acc.companyId, 'pro');
    expect((await respond(acc, (await quoteWithFollowUp(acc)).id)).recovery).toEqual({ status: 'counted', used: 26, limit: 65 });
  });
});

// ---------------------------------------------------------------------------
// 6. El plan no se puede cambiar desde el navegador
// ---------------------------------------------------------------------------

describe('el plan solo lo controla el servidor', () => {
  it('ninguna petición del navegador puede cambiar el plan ni el consumo', async () => {
    const acc = await registerAccount(app);
    const attempts = [
      acc.client.patch('/company', { plan: 'business' }),
      acc.client.patch('/company/settings', { plan: 'business' }),
      acc.client.patch('/company/settings', { monthlyRecoveryLimit: 1000 }),
      acc.client.post('/company/subscription', { plan: 'business', status: 'active' }),
      acc.client.patch('/company/subscription', { plan: 'business' }),
      acc.client.post('/usage', { used: 0 }),
      acc.client.patch('/me', { plan: 'business' }),
      acc.client.post('/auth/register', { fullName: 'X', email: 'x@ejemplo.test', password: 'Contraseña-de-prueba-1', companyName: 'Y', acceptTerms: true, plan: 'business' }),
    ];
    for (const res of await Promise.all(attempts)) expect([400, 404]).toContain(res.status);
    const usage = (await acc.client.get('/usage')).body.usage;
    expect(usage).toMatchObject({ plan: { id: 'starter' }, status: 'trialing' });
    // Ninguna ruta de la API escribe en la suscripción.
    const writes = app.routeTable.filter((r) => r.method !== 'GET' && /subscription|usage|plan/i.test(r.url));
    expect(writes).toEqual([]);
  });

  it('ni siquiera la base de datos lo permite al rol de la aplicación', async () => {
    const acc = await registerAccount(app);
    await expect(
      inCompany(db, acc.companyId, (trx) => trx.updateTable('subscriptions').set({ plan: 'business', status: 'active' }).where('companyId', '=', acc.companyId).execute()),
    ).rejects.toThrow(/permission denied/);
    await expect(inCompany(db, acc.companyId, (trx) => trx.deleteFrom('recoveryEvents').where('companyId', '=', acc.companyId).execute())).rejects.toThrow(
      /permission denied/,
    );
  });
});

// ---------------------------------------------------------------------------
// 7-8. Métricas: coinciden con los datos y están aisladas
// ---------------------------------------------------------------------------

describe('métricas', () => {
  it('coinciden con los datos almacenados', async () => {
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
    expect(m.recoveries).toEqual({ counted: 2, overLimit: 0, noActivePlan: 0 });
    // Sin muestra suficiente no hay porcentaje.
    expect(m.responseRate).toMatchObject({ quotesWithFollowUp: 2, respondedAfterFollowUp: 2, rate: null, minSample: 10 });

    // Comprobación independiente contra la base de datos.
    const { rows } = await owner.query(
      `SELECT
         (SELECT count(*) FROM quotes WHERE company_id = $1)::int AS registered,
         (SELECT count(*) FROM quotes WHERE company_id = $1 AND sent_at IS NOT NULL)::int AS sent,
         (SELECT count(*) FROM quotes WHERE company_id = $1 AND reactivated_at IS NOT NULL)::int AS reactivated,
         (SELECT count(*) FROM recovery_events WHERE company_id = $1 AND status = 'counted')::int AS counted,
         (SELECT count(*) FROM follow_ups WHERE company_id = $1 AND status = 'completed' AND channel <> 'task')::int AS contacts`,
      [acc.companyId],
    );
    expect(rows[0]).toEqual({ registered: 5, sent: 4, reactivated: 2, counted: 2, contacts: 2 });

    const month = res.body.history.at(-1);
    expect(res.body.history).toHaveLength(6);
    expect(month).toMatchObject({ quotesSent: 4, followUpsDone: 2, respondedAfterFollowUp: 2, acceptedAfterFollowUp: 1, recoveriesCounted: 2 });
    expect(res.body.history.slice(0, 5).every((h: any) => h.quotesSent === 0 && h.recoveriesCounted === 0)).toBe(true);
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
    await respond(a, (await quoteWithFollowUp(a)).id);
    const mb = (await b.client.get('/metrics')).body.metrics;
    expect(mb.quotes.registered).toBe(0);
    expect(mb.recoveries.counted).toBe(0);
    expect((await b.client.get('/usage')).body.usage.events).toEqual([]);
    const exported = (await b.client.get('/company/export')).body;
    expect(exported.quotes.items).toEqual([]);
    expect(JSON.stringify(exported)).not.toContain(a.companyId);
    // RLS directamente en PostgreSQL.
    for (const table of ['recoveryEvents', 'usagePeriods'] as const) {
      const rows = await inCompany(db, b.companyId, (trx) => trx.selectFrom(table).select('companyId').execute());
      expect(rows.every((r) => r.companyId === b.companyId), table).toBe(true);
    }
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
    expect(res.body).toMatchObject({ format: 'presupio-export', version: 1, company: { id: acc.companyId } });
    expect(res.body.quotes.items).toHaveLength(1);
    expect(res.body.recoveries.items).toHaveLength(1);
    expect(res.body.members.map((m: any) => m.email).sort()).toEqual([acc.email, member.email].sort());
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/argon2|passwordHash|tokenHash|unsubscribeTokenHash/);
  });
});

// ---------------------------------------------------------------------------
// 9. Errores sin secretos
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
        expect((await migrate({ connectionString: url, appRole })).applied).toEqual(['0003_usage_limits']);
        const { rows: events } = await c.query('SELECT status, period_start, follow_up_id IS NOT NULL AS has_follow_up FROM recovery_events');
        expect(events).toEqual([{ status: 'historical', period_start: null, has_follow_up: true }]);
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
});

// ---------------------------------------------------------------------------
// 12. Motor: límite alcanzado, límite diario y sin duplicados
// ---------------------------------------------------------------------------

describe('motor de seguimiento con límites', () => {
  async function automated(acc: RegisteredAccount) {
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
  const sentDaysAgo = (acc: RegisteredAccount, days: number) =>
    createQuote(acc.client, { sentAt: new Date(Date.now() - days * 86_400_000 - 3_600_000).toISOString() });
  const deps = (database: Db = db): EngineDeps => ({ db: database, config, provider: fake, now: () => new Date() });

  it('al alcanzar el límite se cancelan los emails pendientes y no sale ninguno más', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    expect((await planCompany(deps(), acc.companyId)).scheduled).toBe(1);
    await presetUsage(acc, 25);
    expect((await planCompany(deps(), acc.companyId)).cancelled).toBe(1);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 0 });
    const steps = (await acc.client.get(`/quotes/${q.id}/follow-ups?status=all`)).body.items;
    expect(steps[0]).toMatchObject({ status: 'cancelled', cancelReason: 'plan_limit_reached' });
    expect(fake.sentTo(q.contact.email)).toHaveLength(0);
    // Con el límite alcanzado no se programa nada nuevo.
    await sentDaysAgo(acc, 3);
    expect((await planCompany(deps(), acc.companyId)).scheduled).toBe(0);
    await acc.client.post('/automation/disable');
  });

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
    expect(new Set(sent.map((m) => m.to)).size).toBe(2); // sin duplicados
    expect((await acc.client.get('/usage')).body.usage.automaticEmails.today).toBe(2);
    await acc.client.post('/automation/disable');
  });

  it('una respuesta tras un email automático cuenta como recuperación atribuida a ese email', async () => {
    const acc = await registerAccount(app);
    await automated(acc);
    const q = await sentDaysAgo(acc, 3);
    await planCompany(deps(), acc.companyId);
    expect(await dispatchCompany(deps(), acc.companyId)).toMatchObject({ sent: 1 });
    expect((await respond(acc, q.id)).recovery.status).toBe('counted');
    const event = (await acc.client.get('/usage')).body.usage.events[0];
    expect(event).toMatchObject({ quoteId: q.id, followUpSource: 'rule', followUpChannel: 'email', status: 'counted' });
    await acc.client.post('/automation/disable');
  });
});
