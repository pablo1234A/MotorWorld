import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { applyRetention } from '../src/automation/engine.js';
import { hitCounter } from '../src/lib/rate-limiter.js';
import { normalizeTrialEmail, trialCompanyDomain } from '../src/modules/auth/trial.js';
import { sendRetentionNotices } from '../src/modules/billing/retention.js';
import { sendTrialReminders, trialReminderStage } from '../src/modules/billing/trial-reminders.js';
import { API, Client, createTestApp, TEST_PASSWORD, uniqueEmail } from './helpers.js';
import { TcpProxy } from './tcp-proxy.js';

/*
 * P2-02 (límites compartidos y persistentes), P2-01 (abuso de la prueba gratuita) y P2-05
 * (avisos antes del fin de la prueba). Ningún email sale de la máquina (MemoryMailer).
 */

const DAY = 86_400_000;
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 3 });
afterAll(() => owner.end());

const register = (app: FastifyInstance, email: string) =>
  new Client(app).post('/auth/register', { fullName: 'Persona Prueba', email, password: TEST_PASSWORD, companyName: 'Prueba SL', acceptTerms: true });

describe('límites de peticiones compartidos (P2-02)', () => {
  const tight = (c: { rateLimits: Record<string, { max: number; windowMs: number }> }) => {
    c.rateLimits.loginPerEmail = { max: 3, windowMs: 60_000 };
    c.rateLimits.login = { max: 5, windowMs: 60_000 };
  };

  it('dos instancias comparten el límite y reiniciar una no lo borra', async () => {
    const a = await createTestApp(tight);
    const b = await createTestApp(tight, { keepRateLimitCounters: true });
    const email = uniqueEmail('limite');
    const login = (app: typeof a.app) => app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email, password: 'mala' }, remoteAddress: `10.0.0.${Math.floor(Math.random() * 200) + 1}` });
    // 3 intentos fallidos repartidos entre las dos instancias agotan el límite por email.
    expect((await login(a.app)).statusCode).toBe(401);
    expect((await login(b.app)).statusCode).toBe(401);
    expect((await login(a.app)).statusCode).toBe(401);
    expect((await login(b.app)).statusCode).toBe(429);
    // «Reinicio»: se cierra una instancia y arranca otra nueva; el bloqueo sigue.
    await a.app.close();
    const c = await createTestApp(tight, { keepRateLimitCounters: true });
    expect((await login(c.app)).statusCode).toBe(429);
    // Las claves se guardan resumidas: ni el email ni la IP en claro.
    const keys = (await owner.query('SELECT key_hash FROM rate_limit_counters')).rows.map((r) => r.key_hash as string);
    expect(keys.every((k) => /^[0-9a-f]{64}$/.test(k))).toBe(true);
    expect(JSON.stringify(keys)).not.toContain(email);
  });

  it('las peticiones simultáneas no se saltan el límite', async () => {
    const { app, db } = await createTestApp(tight);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => app.inject({ method: 'POST', url: `${API}/auth/login`, payload: { email: uniqueEmail(`c${i}`), password: 'mala' }, remoteAddress: '10.9.9.9' })),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c !== 429)).toHaveLength(5); // max del login por IP
    expect(codes.filter((c) => c === 429)).toHaveLength(15);
    // El contador atómico: 50 golpes simultáneos dan exactamente 1…50.
    const key = `prueba:${randomUUID()}`;
    const hits = await Promise.all(Array.from({ length: 50 }, () => hitCounter(db, key, 60_000)));
    expect(hits.map((h) => h.current).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('la ventana caduca y la retención limpia los contadores viejos', async () => {
    const { db, config } = await createTestApp();
    const key = `ventana:${randomUUID()}`;
    expect((await hitCounter(db, key, 200)).current).toBe(1);
    expect((await hitCounter(db, key, 200)).current).toBe(2);
    await new Promise((r) => setTimeout(r, 250));
    expect((await hitCounter(db, key, 200)).current).toBe(1); // ventana nueva
    await owner.query("UPDATE rate_limit_counters SET reset_at = now() - interval '2 hours'");
    const purged = await applyRetention({ db, config, provider: undefined as never });
    expect(purged.rateLimitCounters).toBeGreaterThanOrEqual(1);
    expect((await owner.query('SELECT count(*)::int AS n FROM rate_limit_counters')).rows[0].n).toBe(0);
  });

  it('si el almacén de límites falla, la petición falla (503) en vez de pasar sin límite; /health sigue vivo', async () => {
    const target = new URL(process.env.TEST_DATABASE_URL!);
    const proxy = new TcpProxy(target.hostname, Number(target.port || 5432));
    await proxy.start();
    try {
      const { app, db } = await createTestApp((c) => {
        c.databaseUrl = proxy.wrap(process.env.TEST_DATABASE_URL!);
      });
      // Un login con cuerpo no válido no llega a consultar datos (400): solo pasa por el límite.
      const invalidLogin = () => app.inject({ method: 'POST', url: `${API}/auth/login`, payload: {} });
      expect((await invalidLogin()).statusCode).toBe(400);
      // Una consulta EN CURSO cuando cae la base de datos (antes: excepción sin capturar → proceso terminado).
      const uncaught: unknown[] = [];
      const onUncaught = (e: unknown) => uncaught.push(e);
      process.on('uncaughtException', onUncaught);
      const longQuery = db.transaction().execute((trx) => sql`select pg_sleep(5)`.execute(trx));
      await new Promise((r) => setTimeout(r, 200));
      await proxy.stop();
      await expect(longQuery).rejects.toThrow();
      // Sin almacén de límites → 503; nunca se procesa la petición «sin límite».
      const during = await invalidLogin();
      expect(during.statusCode).toBe(503);
      expect(during.json().error.code).toBe('SERVICE_UNAVAILABLE');
      expect((await app.inject({ method: 'GET', url: `${API}/health` })).statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 100));
      process.off('uncaughtException', onUncaught);
      expect(uncaught).toEqual([]);
      await proxy.start(proxy.port);
      expect((await invalidLogin()).statusCode).toBe(400);
    } finally {
      await proxy.stop();
    }
  });
});

const trialCtx = await createTestApp((c) => {
  c.trialDomainRuleDays = 365;
});
const reminderCtx = await createTestApp();

describe('una prueba gratuita por persona y dominio (P2-01)', () => {
  const ctx = trialCtx;
  const status = async (client: Client) => (await client.get('/me')).body.subscription as { status: string; plan: string | null; hasActiveAccess: boolean };

  it('normaliza el email y distingue dominios de empresa de los gratuitos', () => {
    expect(normalizeTrialEmail('Ana.Perez+promo@GMAIL.com')).toBe('anaperez@gmail.com');
    expect(normalizeTrialEmail('ana.perez@googlemail.com')).toBe('anaperez@gmail.com');
    expect(normalizeTrialEmail('ana.perez+x@reformas.es')).toBe('ana.perez@reformas.es');
    expect(trialCompanyDomain('ana@gmail.com')).toBeNull();
    expect(trialCompanyDomain('ana@mailinator.com')).toBeNull();
    expect(trialCompanyDomain('ana@reformas-garcia.es')).toBe('reformas-garcia.es');
  });

  it('la misma bandeja de entrada (con puntos o +etiqueta) no obtiene una segunda prueba', async () => {
    const base = `ana${randomUUID().slice(0, 6)}`;
    const first = await register(ctx.app, `${base}@gmail.com`);
    expect(first.status).toBe(201);
    expect(first.body.trial).toMatchObject({ granted: true });
    const second = await register(ctx.app, `${base.slice(0, 2)}.${base.slice(2)}+otra@gmail.com`);
    expect(second.status).toBe(201); // el registro funciona…
    expect(second.body.trial).toEqual({ granted: false, endsAt: null }); // …pero sin prueba
    const client = new Client(ctx.app);
    await client.post('/auth/login', { email: `${base.slice(0, 2)}.${base.slice(2)}+otra@gmail.com`, password: TEST_PASSWORD });
    expect(await status(client)).toMatchObject({ status: 'none', plan: null, hasActiveAccess: false });
    // Solo lectura: puede consultar y contratar, no crear.
    expect((await client.post('/quotes', { title: 'X', contact: { fullName: 'X', phone: '+34600111222' } })).status).toBe(403);
    expect((await client.get('/quotes')).status).toBe(200);
    const log = await owner.query("SELECT metadata FROM activity_log WHERE company_id = $1 AND action = 'company.created'", [second.body.company.id]);
    expect(log.rows[0].metadata).toMatchObject({ trialDays: 0, trialDenied: 'email' });
  });

  it('dos personas del mismo proveedor gratuito sí obtienen su prueba', async () => {
    expect((await register(ctx.app, `luis${randomUUID().slice(0, 6)}@gmail.com`)).body.trial.granted).toBe(true);
    expect((await register(ctx.app, `marta${randomUUID().slice(0, 6)}@gmail.com`)).body.trial.granted).toBe(true);
  });

  it('un dominio de empresa abre una sola prueba al año, también con altas simultáneas', async () => {
    const domain = `reformas-${randomUUID().slice(0, 6)}.es`;
    const results = await Promise.all([register(ctx.app, `ana@${domain}`), register(ctx.app, `luis@${domain}`)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results.map((r) => r.body.trial.granted).sort()).toEqual([false, true]);
    const third = await register(ctx.app, `pedro@${domain}`);
    expect(third.body.trial.granted).toBe(false);
    // Pasado el plazo (huella de hace más de un año) vuelve a poder.
    await owner.query("UPDATE trial_claims SET claimed_at = now() - interval '400 days' WHERE kind = 'domain'");
    expect((await register(ctx.app, `marta@${domain}`)).body.trial.granted).toBe(true);
  });

  it('el correo desechable no abre prueba', async () => {
    const res = await register(ctx.app, `x${randomUUID().slice(0, 6)}@mailinator.com`);
    expect(res.status).toBe(201);
    expect(res.body.trial.granted).toBe(false);
  });

  it('solo guarda huellas, reconoce las huellas anteriores a la migración y las borra a los 24 meses', async () => {
    const email = `antigua${randomUUID().slice(0, 6)}@gmail.com`;
    const claims = await owner.query('SELECT value_hash FROM trial_claims');
    expect(JSON.stringify(claims.rows)).not.toMatch(/@|gmail/);
    // Huella como la que crea la migración 0010 para las cuentas existentes (solo minúsculas).
    await owner.query("INSERT INTO trial_claims (kind, value_hash) VALUES ('email', encode(sha256(convert_to('presupio-trial:email:' || lower($1), 'UTF8')), 'hex'))", [email]);
    expect((await register(ctx.app, email.toUpperCase())).body.trial.granted).toBe(false);
    // La aplicación no puede borrar ni alterar huellas directamente.
    await expect(ctx.db.deleteFrom('trialClaims').execute()).rejects.toThrow(/permission denied/);
    await owner.query("UPDATE trial_claims SET claimed_at = now() - interval '731 days'");
    const purged = await applyRetention({ db: ctx.db, config: ctx.config, provider: undefined as never });
    expect(purged.trialClaims).toBeGreaterThanOrEqual(1);
    expect((await owner.query('SELECT count(*)::int AS n FROM trial_claims')).rows[0].n).toBe(0);
  });

  it('una empresa no ve las huellas de otra', async () => {
    const res = await register(ctx.app, `aislada${randomUUID().slice(0, 6)}@gmail.com`);
    const seen = await ctx.db.transaction().execute(async (trx) => {
      await sql`select set_config('app.company_id', ${res.body.company.id}, true)`.execute(trx);
      return trx.selectFrom('trialClaims').select(['companyId']).execute();
    });
    expect(seen.length).toBe(1);
    expect(seen.every((r) => r.companyId === res.body.company.id)).toBe(true);
  });
});

describe('avisos antes del fin de la prueba (P2-05)', () => {
  const ctx = reminderCtx;
  const setTrialEnd = (companyId: string, msFromNow: number) =>
    owner.query('UPDATE subscriptions SET trial_ends_at = now() + make_interval(secs => $2) WHERE company_id = $1', [companyId, msFromNow / 1000]);
  const sentTo = (email: string) => ctx.mailer.outbox.filter((m) => m.to === email && m.template === 'trial_reminder');

  it('elige la etapa vigente según los días configurados', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const at = (ms: number) => new Date(now.getTime() + ms);
    expect(trialReminderStage(at(5 * DAY), now, [3, 1])).toBeNull();
    expect(trialReminderStage(at(2.5 * DAY), now, [3, 1])).toEqual({ stage: '3_days', days: 3 });
    expect(trialReminderStage(at(0.5 * DAY), now, [3, 1])).toEqual({ stage: '1_day', days: 1 });
    expect(trialReminderStage(at(-1), now, [3, 1])).toBeNull();
    expect(trialReminderStage(at(6 * DAY), now, [7])).toEqual({ stage: '7_days', days: 7 });
  });

  it('avisa una vez por etapa, en la zona horaria de la empresa, y distinto del aviso de conservación', async () => {
    const email = uniqueEmail('aviso');
    const res = await register(ctx.app, email);
    const companyId = res.body.company.id as string;
    await owner.query("UPDATE companies SET timezone = 'America/Los_Angeles' WHERE id = $1", [companyId]);
    const run = () => sendTrialReminders({ db: ctx.db, config: ctx.config, mailer: ctx.mailer });
    await run();
    expect(sentTo(email)).toHaveLength(0); // quedan 14 días
    await setTrialEnd(companyId, 2.5 * DAY);
    await run();
    await run(); // repetir el trabajo no duplica
    expect(sentTo(email)).toHaveLength(1);
    const ends = (await owner.query('SELECT trial_ends_at FROM subscriptions WHERE company_id = $1', [companyId])).rows[0].trial_ends_at as Date;
    const local = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(ends);
    expect(sentTo(email)[0]!.text).toContain(local);
    expect(sentTo(email)[0]!.subject).toMatch(/termina en 3 días/);
    expect(sentTo(email)[0]!.text).toMatch(/solo lectura/);
    await setTrialEnd(companyId, 0.5 * DAY);
    await run();
    expect(sentTo(email)).toHaveLength(2);
    expect(sentTo(email)[1]!.subject).toMatch(/termina mañana/);
    const notices = await owner.query('SELECT stage, delivery, recipients FROM trial_notices WHERE company_id = $1 ORDER BY created_at', [companyId]);
    expect(notices.rows).toEqual([
      { stage: '3_days', delivery: 'sent', recipients: 1 },
      { stage: '1_day', delivery: 'sent', recipients: 1 },
    ]);
    expect(ctx.mailer.outbox.filter((m) => m.to === email && m.template === 'retention_notice')).toHaveLength(0);
  });

  it('no avisa a quien ya contrató ni a una prueba terminada; sin días configurados no hay avisos', async () => {
    const paid = uniqueEmail('pagada');
    const paidRes = await register(ctx.app, paid);
    await setTrialEnd(paidRes.body.company.id, 2 * DAY);
    await owner.query("UPDATE subscriptions SET status = 'active', provider_subscription_id = 'sub_prueba_" + randomUUID().slice(0, 8) + "' WHERE company_id = $1", [paidRes.body.company.id]);
    const ended = uniqueEmail('terminada');
    const endedRes = await register(ctx.app, ended);
    await setTrialEnd(endedRes.body.company.id, -DAY);
    await sendTrialReminders({ db: ctx.db, config: ctx.config, mailer: ctx.mailer });
    expect(sentTo(paid)).toHaveLength(0);
    expect(sentTo(ended)).toHaveLength(0);
    const quiet = uniqueEmail('sinavisos');
    const quietRes = await register(ctx.app, quiet);
    await setTrialEnd(quietRes.body.company.id, 0.5 * DAY);
    const stats = await sendTrialReminders({ db: ctx.db, config: { ...ctx.config, trialReminderDays: [] }, mailer: ctx.mailer });
    expect(stats.candidates).toBe(0);
    expect(sentTo(quiet)).toHaveLength(0);
  });

  it('el aviso de conservación usa también la zona horaria de la empresa', async () => {
    const email = uniqueEmail('conserva');
    const res = await register(ctx.app, email);
    const companyId = res.body.company.id as string;
    await owner.query("UPDATE companies SET timezone = 'America/Los_Angeles' WHERE id = $1", [companyId]);
    // Plazo de borrado dentro de 25 días a las 23:30 UTC: en Los Ángeles es el mismo día; en Madrid, el siguiente.
    const due = new Date(Date.now() + 25 * DAY);
    due.setUTCHours(23, 30, 0, 0);
    await owner.query('UPDATE subscriptions SET trial_ends_at = $2 WHERE company_id = $1', [companyId, new Date(due.getTime() - 90 * DAY)]);
    await sendRetentionNotices({ db: ctx.db, config: ctx.config, mailer: ctx.mailer });
    const mail = ctx.mailer.outbox.find((m) => m.to === email && m.template === 'retention_notice');
    const la = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' }).format(due);
    const madrid = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(due);
    expect(la).not.toBe(madrid);
    expect(mail?.text).toContain(la);
  });
});
