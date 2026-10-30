import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dispatchCompany, inCompany, planCompany, type EngineDeps } from '../src/automation/engine.js';
import { loadConfig } from '../src/config.js';
import { DATA_RETENTION_DAYS, hasActiveAccess, PAST_DUE_GRACE_DAYS } from '../src/domain/plans.js';
import { sendRetentionNotices } from '../src/modules/billing/retention.js';
import { resetPriceChecks } from '../src/modules/billing/service.js';
import { attemptCapacity, loadPlanContext } from '../src/modules/usage/service.js';
import { enableTestBilling, FakeBillingGateway, signedEvent, TEST_BILLING } from './fake-billing.js';
import { FakeProvider } from './fake-provider.js';
import { addMember, API, Client, createQuote, createTestApp, registerAccount, verifyEmail, WEB_ORIGIN, type RegisteredAccount } from './helpers.js';

/*
 * Fase 5: suscripciones con Stripe EN MODO DE PRUEBA, sin red. La pasarela es simulada
 * (test/fake-billing.ts) salvo la verificación de firmas, que es la de la librería oficial.
 * No se realiza ningún pago ni se contacta con Stripe.
 */

const OPS_TOKEN = 'token-de-supervision-de-pruebas-facturacion-0123456789';
const gateway = new FakeBillingGateway();
const provider = new FakeProvider('billing');
const { app, db, config, mailer } = await createTestApp(
  (c) => {
    enableTestBilling(c);
    c.automation.fromEmail = 'seguimiento@envios.ejemplo.test';
    c.opsStatusToken = OPS_TOKEN;
  },
  { billingGateway: gateway, followUpProvider: provider },
);
const owner = new pg.Pool({ connectionString: process.env.TEST_MIGRATION_DATABASE_URL, max: 3 });
afterAll(() => owner.end());
beforeEach(() => {
  gateway.unavailable = false;
  resetPriceChecks();
});

const DAY = 86_400_000;
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

async function postWebhook(payload: string, signature?: string) {
  const res = await app.inject({
    method: 'POST',
    url: `${API}/webhooks/stripe`,
    headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
    payload,
  });
  return { status: res.statusCode, body: res.json() };
}

async function deliver(type: string, object: Record<string, unknown>, options: Parameters<typeof signedEvent>[2] = {}) {
  const event = signedEvent(type, object, options);
  return { ...(await postWebhook(event.payload, event.signature)), id: event.id };
}

async function subRow(companyId: string) {
  return (await owner.query('SELECT * FROM subscriptions WHERE company_id = $1', [companyId])).rows[0];
}

let subSeq = 0;
/** Contrata un plan de principio a fin: Checkout en el servidor + webhook verificado. */
async function subscribe(acc: RegisteredAccount, plan: 'starter' | 'pro' | 'business' = 'pro') {
  const res = await acc.client.post('/billing/checkout', { plan });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const customerId = (await subRow(acc.companyId)).provider_customer_id as string;
  const subscriptionId = `sub_test${Date.now()}${++subSeq}`;
  gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices[plan], metadataCompanyId: acc.companyId });
  const done = await deliver('checkout.session.completed', { id: 'cs_test_x', object: 'checkout.session', subscription: subscriptionId, customer: customerId, client_reference_id: acc.companyId });
  expect(done.body.outcome).toBe('applied');
  return { customerId, subscriptionId };
}

const subscriptionUpdated = (subscriptionId: string, customerId: string) =>
  deliver('customer.subscription.updated', { id: subscriptionId, object: 'subscription', customer: customerId });

// ---------------------------------------------------------------------------
// 1. Checkout en modo de prueba
// ---------------------------------------------------------------------------

describe('contratación con Stripe Checkout (modo de prueba)', () => {
  it('crea la sesión de pago en el servidor con el precio configurado y NO concede acceso al volver', async () => {
    const acc = await registerAccount(app, 'Reformas Checkout SL');
    const res = await acc.client.post('/billing/checkout', { plan: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body.checkout.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [customer] = gateway.callsOf('createCustomer').filter((c) => c.companyId === acc.companyId);
    expect(customer).toMatchObject({ email: acc.email, name: 'Reformas Checkout SL' });
    const session = gateway.callsOf('createCheckoutSession').filter((c) => c.companyId === acc.companyId).at(-1);
    expect(session).toMatchObject({ plan: 'pro', priceId: TEST_BILLING.prices.pro, successUrl: `${WEB_ORIGIN}/configuracion/plan?pago=confirmando` });
    expect(gateway.callsOf('retrievePrice')).toContain(TEST_BILLING.prices.pro); // precio verificado contra el catálogo
    // Volver de la página de pago no cambia nada: sigue la prueba gratuita.
    const row = await subRow(acc.companyId);
    expect(row).toMatchObject({ status: 'trialing', plan: 'starter', provider: 'stripe', provider_subscription_id: null });
    expect(row.provider_customer_id).toMatch(/^cus_/);
    // Un segundo intento reutiliza el cliente y cierra la sesión de pago anterior.
    await acc.client.post('/billing/checkout', { plan: 'pro' });
    expect(gateway.callsOf('createCustomer').filter((c) => c.companyId === acc.companyId)).toHaveLength(1);
    expect(gateway.callsOf('expireCheckoutSession')).toContain(row.provider_checkout_session_id);
    const activity = (await acc.client.get('/activity')).body.items.map((a: any) => a.action);
    expect(activity).toContain('subscription.checkout_started');
  });

  it('el plan se activa solo con el webhook verificado y el periodo pagado empieza con su cupo completo', async () => {
    const acc = await registerAccount(app);
    // Consumo durante la prueba (mes natural): 20 intentos.
    const usage = (await acc.client.get('/usage')).body.usage;
    await owner.query(
      `INSERT INTO usage_periods (company_id, period_start, period_end, plan, recovery_limit, attempt_limit, attempts_counted) VALUES ($1, $2, $3, 'starter', 0, 25, 20)`,
      [acc.companyId, usage.period.start, usage.period.end],
    );
    await subscribe(acc, 'pro');
    const row = await subRow(acc.companyId);
    expect(row).toMatchObject({ status: 'active', plan: 'pro', provider_price_id: TEST_BILLING.prices.pro, cancel_at_period_end: false });
    expect(row.current_period_start).toBeTruthy();
    const after = (await acc.client.get('/usage')).body.usage;
    expect(after.period.source).toBe('provider');
    expect(after.attempts).toMatchObject({ used: 0, limit: 65 });
    // El periodo de la prueba se cierra donde empieza el pagado y conserva su consumo.
    const { rows } = await owner.query('SELECT period_source, attempts_counted FROM usage_periods WHERE company_id = $1 ORDER BY period_start', [acc.companyId]);
    expect(rows[0]).toEqual({ period_source: 'calendar_month', attempts_counted: 20 });
    const view = (await acc.client.get('/billing')).body;
    expect(view.subscription).toMatchObject({ status: 'active', hasActiveAccess: true, readOnly: false, managedByProvider: true, paymentsEnabled: true });
    expect(view.events[0]).toMatchObject({ eventType: 'checkout.session.completed', outcome: 'applied' });
    // Con una suscripción viva no se puede abrir otro pago (evita cobros dobles).
    expect((await acc.client.post('/billing/checkout', { plan: 'business' })).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// 2 y 13. Permisos y aislamiento
// ---------------------------------------------------------------------------

describe('permisos y aislamiento entre empresas', () => {
  it('solo el propietario gestiona la suscripción y el navegador no puede elegir precio ni importe', async () => {
    const acc = await registerAccount(app);
    const admin = await addMember(app, acc, 'admin');
    const member = await addMember(app, acc, 'member');
    const viewer = await addMember(app, acc, 'viewer');
    const before = gateway.calls.length;
    for (const who of [admin, member, viewer]) {
      for (const path of ['/billing/checkout', '/billing/change-plan', '/billing/cancel', '/billing/portal']) {
        expect((await who.client.post(path, { plan: 'pro' })).status, path).toBe(403);
      }
    }
    expect((await new Client(app).post('/billing/checkout', { plan: 'pro' })).status).toBe(401);
    for (const body of [{ plan: 'pro', priceId: 'price_otro' }, { plan: 'pro', amount: 1 }, { plan: 'gold' }, { price: TEST_BILLING.prices.pro }, {}]) {
      expect((await acc.client.post('/billing/checkout', body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(gateway.calls.length).toBe(before); // nada llegó a Stripe
    // Cualquiera de la empresa puede ver el estado.
    expect((await viewer.client.get('/billing')).status).toBe(200);
  });

  it('una empresa no ve ni puede tocar la suscripción de otra', async () => {
    const a = await registerAccount(app);
    const b = await registerAccount(app);
    const subA = await subscribe(a, 'pro');
    // Evento con el cliente de A pero que dice ser de B: se rechaza y no cambia nada.
    gateway.setSubscription({ id: subA.subscriptionId, customerId: subA.customerId, priceId: TEST_BILLING.prices.business });
    const forged = await deliver('checkout.session.completed', { id: 'cs_test_y', subscription: subA.subscriptionId, customer: subA.customerId, client_reference_id: b.companyId });
    expect(forged.body.outcome).toBe('error');
    expect(await subRow(b.companyId)).toMatchObject({ status: 'trialing', provider_subscription_id: null });
    expect(await subRow(a.companyId)).toMatchObject({ plan: 'pro' });
    // B no tiene suscripción: sus acciones no alcanzan la de A.
    const cancels = gateway.callsOf('setCancelAtPeriodEnd').length;
    expect((await b.client.post('/billing/cancel')).status).toBe(409);
    expect(gateway.callsOf('setCancelAtPeriodEnd')).toHaveLength(cancels);
    expect((await b.client.get('/billing')).body.events).toEqual([]);
    const rows = await inCompany(db, b.companyId, (trx) => trx.selectFrom('billingEvents').select('companyId').execute());
    expect(rows).toEqual([]);
    gateway.setSubscription({ id: subA.subscriptionId, customerId: subA.customerId, priceId: TEST_BILLING.prices.pro });
  });
});

// ---------------------------------------------------------------------------
// 3, 4 y desorden: webhooks
// ---------------------------------------------------------------------------

describe('webhooks de Stripe', () => {
  it('rechaza firmas inválidas, ausentes, de otro secreto, cuerpos alterados y eventos caducados', async () => {
    const acc = await registerAccount(app);
    const object = { id: 'sub_test_firma', object: 'subscription', customer: 'cus_testfirma' };
    const good = signedEvent('customer.subscription.updated', object);
    const otherSecret = signedEvent('customer.subscription.updated', object, { secret: 'whsec_otroSecretoDistinto0000' });
    const old = signedEvent('customer.subscription.updated', object, { timestamp: Math.floor(Date.now() / 1000) - 600 });
    const reads = gateway.callsOf('retrieveSubscription').length;
    const cases = [
      await postWebhook(good.payload),
      await postWebhook(good.payload, 't=1,v1=00'),
      await postWebhook(otherSecret.payload, otherSecret.signature),
      await postWebhook(good.payload.replace('customer.subscription.updated', 'customer.subscription.deleted'), good.signature),
      await postWebhook(old.payload, old.signature),
    ];
    for (const r of cases) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('INVALID_SIGNATURE');
    }
    expect(gateway.callsOf('retrieveSubscription')).toHaveLength(reads);
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM billing_events WHERE provider_event_id = ANY($1)', [[good.id, otherSecret.id, old.id]]);
    expect(rows[0].n).toBe(0);
    expect(await subRow(acc.companyId)).toMatchObject({ status: 'trialing' });
  });

  it('un evento repetido (también a la vez) no duplica efectos', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices.business });
    const event = signedEvent('customer.subscription.updated', { id: subscriptionId, customer: customerId });
    const results = await Promise.all([1, 2, 3].map(() => postWebhook(event.payload, event.signature)));
    const again = await postWebhook(event.payload, event.signature);
    const outcomes = [...results, again].map((r) => r.body.outcome).sort();
    expect(outcomes).toEqual(['applied', 'duplicate', 'duplicate', 'duplicate']);
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM billing_events WHERE provider_event_id = $1', [event.id]);
    expect(rows[0].n).toBe(1);
    const changes = (await acc.client.get('/activity')).body.items.filter((a: any) => a.action === 'subscription.changed' && a.metadata.to.plan === 'business');
    expect(changes).toHaveLength(1);
  });

  it('con eventos desordenados se queda el estado más reciente', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    // El evento A lee el estado «activa», pero tarda en aplicarse.
    gateway.hold();
    const reads = gateway.callsOf('retrieveSubscription').length;
    const slow = subscriptionUpdated(subscriptionId, customerId);
    while (gateway.callsOf('retrieveSubscription').length === reads) await new Promise((r) => setTimeout(r, 5));
    // Mientras tanto la suscripción se cancela y el evento B llega y se aplica antes.
    gateway.setSubscription({ id: subscriptionId, customerId, status: 'canceled' });
    expect((await deliver('customer.subscription.deleted', { id: subscriptionId, customer: customerId })).body.outcome).toBe('applied');
    gateway.release();
    expect((await slow).body.outcome).toBe('stale');
    expect(await subRow(acc.companyId)).toMatchObject({ status: 'canceled' });
  });

  it('modo real, tipos no usados, precios desconocidos, clientes ajenos y segundas suscripciones no se aplican', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    expect((await deliver('customer.subscription.updated', { id: subscriptionId, customer: customerId }, { livemode: true })).body.outcome).toBe('ignored');
    expect((await deliver('charge.succeeded', { id: 'ch_test', customer: customerId })).body.outcome).toBe('ignored');
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: 'price_desconocido01' });
    expect((await subscriptionUpdated(subscriptionId, customerId)).body.outcome).toBe('error');
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices.pro });
    gateway.setSubscription({ id: 'sub_test_huerfana', customerId: 'cus_testdesconocido' });
    expect((await subscriptionUpdated('sub_test_huerfana', 'cus_testdesconocido')).body.outcome).toBe('unmatched');
    // Otra suscripción viva para el mismo cliente: no sustituye a la actual, se avisa.
    gateway.setSubscription({ id: 'sub_test_segunda', customerId, priceId: TEST_BILLING.prices.business });
    expect((await subscriptionUpdated('sub_test_segunda', customerId)).body.outcome).toBe('duplicate_subscription');
    expect(await subRow(acc.companyId)).toMatchObject({ plan: 'pro', status: 'active', provider_subscription_id: subscriptionId });
    const ops = (await app.inject({ method: 'GET', url: `${API}/ops/status`, headers: { authorization: `Bearer ${OPS_TOKEN}` } })).json();
    expect(ops.alerts).toEqual(expect.arrayContaining(['billing_events_failed', 'billing_duplicate_subscription']));
    expect(JSON.stringify(ops)).not.toMatch(/cus_|sub_|@/);
  });
});

// ---------------------------------------------------------------------------
// 5-8. Cambio de plan, cancelación, pagos fallidos y estados
// ---------------------------------------------------------------------------

describe('cambio de plan, cancelación y pagos fallidos', () => {
  it('subida: se pide a Stripe con cobro proporcional y el límite sube al confirmarse; bajada: desde el periodo siguiente', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    const up = await acc.client.post('/billing/change-plan', { plan: 'business' });
    expect(up.status).toBe(200);
    expect(up.body.change).toEqual({ status: 'pending_confirmation', mode: 'upgrade', limitAppliesFrom: 'confirmation' });
    expect(gateway.callsOf('changeSubscriptionPrice').at(-1)).toMatchObject({ subscriptionId, priceId: TEST_BILLING.prices.business, mode: 'upgrade' });
    expect(await subRow(acc.companyId)).toMatchObject({ plan: 'pro' }); // aún sin confirmar
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices.business });
    await subscriptionUpdated(subscriptionId, customerId);
    expect(await subRow(acc.companyId)).toMatchObject({ plan: 'business' });
    expect((await acc.client.get('/usage')).body.usage.attempts.limit).toBe(300);

    const down = await acc.client.post('/billing/change-plan', { plan: 'starter' });
    expect(down.body.change).toMatchObject({ mode: 'downgrade', limitAppliesFrom: 'next_period' });
    expect(gateway.callsOf('changeSubscriptionPrice').at(-1)).toMatchObject({ mode: 'downgrade', priceId: TEST_BILLING.prices.starter });
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices.starter });
    await subscriptionUpdated(subscriptionId, customerId);
    expect(await subRow(acc.companyId)).toMatchObject({ plan: 'starter' });
    expect((await acc.client.get('/usage')).body.usage.attempts.limit).toBe(300); // el periodo pagado en curso se respeta
    const next = new Date(Date.now() + 40 * DAY);
    const nextLimit = await inCompany(db, acc.companyId, async (trx) => (await attemptCapacity(trx, await loadPlanContext(trx, acc.companyId, next), next)).period!.attemptLimit);
    expect(nextLimit).toBe(25);
    expect((await acc.client.post('/billing/change-plan', { plan: 'starter' })).status).toBe(409); // ya es su plan
  });

  it('cancelación: se mantiene el acceso hasta el final del periodo y después queda en solo lectura', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    const res = await acc.client.post('/billing/cancel');
    expect(res.status).toBe(200);
    expect(gateway.callsOf('setCancelAtPeriodEnd').at(-1)).toEqual({ subscriptionId, cancel: true });
    gateway.setSubscription({ id: subscriptionId, customerId, cancelAtPeriodEnd: true });
    await subscriptionUpdated(subscriptionId, customerId);
    expect((await acc.client.get('/billing')).body.subscription).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, hasActiveAccess: true });
    expect((await acc.client.post('/billing/resume')).status).toBe(200);
    expect(gateway.callsOf('setCancelAtPeriodEnd').at(-1)).toEqual({ subscriptionId, cancel: false });
    // Fin del periodo: Stripe elimina la suscripción.
    gateway.setSubscription({ id: subscriptionId, customerId, status: 'canceled' });
    await deliver('customer.subscription.deleted', { id: subscriptionId, customer: customerId });
    const view = (await acc.client.get('/billing')).body.subscription;
    expect(view).toMatchObject({ status: 'canceled', hasActiveAccess: false, readOnly: true });
    expect(Date.parse(view.dataRetentionUntil) - Date.parse(view.accessEndedAt)).toBe(DATA_RETENTION_DAYS * DAY);
    expect((await createQuoteRaw(acc)).status).toBe(403);
    expect((await acc.client.post('/billing/portal')).status).toBe(200); // puede gestionar sus pagos
  });

  it('pago fallido: acceso durante la gracia, solo lectura al agotarla y recuperación al pagar', async () => {
    const acc = await registerAccount(app);
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    const invoice = { id: 'in_test', object: 'invoice', customer: customerId, parent: { subscription_details: { subscription: subscriptionId } } };
    gateway.setSubscription({ id: subscriptionId, customerId, status: 'past_due' });
    expect((await deliver('invoice.payment_failed', invoice)).body.outcome).toBe('applied');
    const row = await subRow(acc.companyId);
    expect(row.status).toBe('past_due');
    expect(row.past_due_since).toBeTruthy();
    expect((await createQuoteRaw(acc)).status).toBe(201); // en gracia
    // Agotados los días de gracia: solo lectura aunque Stripe aún no la haya cancelado.
    await owner.query("UPDATE subscriptions SET past_due_since = now() - make_interval(days => $2) WHERE company_id = $1", [acc.companyId, PAST_DUE_GRACE_DAYS + 1]);
    const blocked = await createQuoteRaw(acc);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    // Se paga la factura: vuelve el acceso.
    gateway.setSubscription({ id: subscriptionId, customerId, status: 'active' });
    expect((await deliver('invoice.paid', invoice)).body.outcome).toBe('applied');
    expect(await subRow(acc.companyId)).toMatchObject({ status: 'active', past_due_since: null });
    expect((await createQuoteRaw(acc)).status).toBe(201);
    // Un cambio de plan con el pago pendiente no se permite.
    gateway.setSubscription({ id: subscriptionId, customerId, status: 'past_due' });
    await subscriptionUpdated(subscriptionId, customerId);
    expect((await acc.client.post('/billing/change-plan', { plan: 'business' })).status).toBe(409);
  });

  it('suscripción activa frente a cancelada, impagada o con el primer pago incompleto', async () => {
    const now = new Date();
    const cases: Array<[Parameters<typeof hasActiveAccess>[0], boolean]> = [
      [{ status: 'active', trialEndsAt: null }, true],
      [{ status: 'trialing', trialEndsAt: new Date(now.getTime() + DAY) }, true],
      [{ status: 'trialing', trialEndsAt: new Date(now.getTime() - 1) }, false],
      [{ status: 'past_due', trialEndsAt: null, pastDueSince: new Date(now.getTime() - DAY) }, true],
      [{ status: 'past_due', trialEndsAt: null, pastDueSince: new Date(now.getTime() - (PAST_DUE_GRACE_DAYS + 1) * DAY) }, false],
      [{ status: 'past_due', trialEndsAt: null, pastDueSince: null }, false],
      [{ status: 'canceled', trialEndsAt: null }, false],
      [{ status: 'unpaid', trialEndsAt: null }, false],
      [{ status: 'incomplete', trialEndsAt: null }, false],
      [{ status: 'none', trialEndsAt: null }, false],
    ];
    for (const [sub, expected] of cases) expect(hasActiveAccess(sub, now), JSON.stringify(sub)).toBe(expected);

    // El primer pago incompleto no quita la prueba gratuita ni da acceso de pago.
    const acc = await registerAccount(app);
    await acc.client.post('/billing/checkout', { plan: 'pro' });
    const customerId = (await subRow(acc.companyId)).provider_customer_id;
    gateway.setSubscription({ id: 'sub_test_incompleta', customerId, status: 'incomplete' });
    expect((await subscriptionUpdated('sub_test_incompleta', customerId)).body.outcome).toBe('ignored');
    expect(await subRow(acc.companyId)).toMatchObject({ status: 'trialing', provider_subscription_id: null });
    // Impagada: solo lectura.
    const other = await registerAccount(app);
    const s = await subscribe(other, 'starter');
    gateway.setSubscription({ id: s.subscriptionId, customerId: s.customerId, status: 'unpaid' });
    await subscriptionUpdated(s.subscriptionId, s.customerId);
    expect((await createQuoteRaw(other)).status).toBe(403);
  });
});

function createQuoteRaw(acc: RegisteredAccount) {
  return acc.client.post('/quotes', { title: 'Obra', contact: { fullName: 'Cliente', phone: '+34600111222' } });
}

// ---------------------------------------------------------------------------
// 9-11. Fin de la prueba: solo lectura, automatización detenida y exportación
// ---------------------------------------------------------------------------

describe('fin de la prueba y modo de solo lectura', () => {
  const endTrial = (companyId: string, msAgo = 3_600_000) =>
    owner.query('UPDATE subscriptions SET trial_ends_at = now() - make_interval(secs => $2) WHERE company_id = $1', [companyId, msAgo / 1000]);

  it('al terminar la prueba sin pago, el servidor bloquea las escrituras y deja consultar', async () => {
    const acc = await registerAccount(app);
    const q = await createQuote(acc.client);
    await endTrial(acc.companyId);
    const blocked = await acc.client.post('/quotes', { title: 'Nueva', contact: { fullName: 'X', phone: '+34600111222' } });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect((await acc.client.patch('/company', { name: 'Otro nombre' })).status).toBe(403);
    expect((await acc.client.post(`/quotes/${q.id}/status`, { status: 'responded' })).status).toBe(403); // no se crean recuperaciones
    expect((await acc.client.get('/quotes')).status).toBe(200);
    expect((await acc.client.get(`/quotes/${q.id}`)).status).toBe(200);
    // Cumplimiento y salida de la solo lectura siguen disponibles.
    expect((await acc.client.post('/exclusions', { contactId: q.contact.id, channel: 'email', reason: 'opt_out_request' })).status).toBe(201);
    expect((await acc.client.patch('/me', { fullName: 'Nombre corregido' })).status).toBe(200);
    expect((await acc.client.post('/billing/checkout', { plan: 'starter' })).status).toBe(200);
    const view = (await acc.client.get('/company/subscription')).body.subscription;
    expect(view).toMatchObject({ status: 'trialing', hasActiveAccess: false, readOnly: true });
    expect(Date.parse(view.dataRetentionUntil) - Date.parse(view.trialEndsAt)).toBe(DATA_RETENTION_DAYS * DAY);
  });

  it('todas las rutas que modifican datos exigen plan activo salvo las excepciones explícitas', async () => {
    const acc = await registerAccount(app);
    await endTrial(acc.companyId);
    const allowed = app.routeTable.filter((r) => r.method !== 'GET' && r.auth !== 'none' && r.readOnlyAllowed).map((r) => `${r.method} ${r.url}`);
    expect(allowed.sort()).toEqual(
      [
        'POST /api/v1/auth/logout',
        'POST /api/v1/auth/password/change',
        'POST /api/v1/auth/email/verification',
        'POST /api/v1/auth/switch-company',
        'POST /api/v1/auth/invitations/accept',
        'PATCH /api/v1/me',
        'POST /api/v1/exclusions',
        // Supresión de datos (RGPD): debe poder atenderse sin plan activo.
        'POST /api/v1/contacts/:id/anonymize',
        'POST /api/v1/quotes/:id/erase',
        'POST /api/v1/automation/disable',
        'POST /api/v1/automation/templates/preview',
        'PATCH /api/v1/members/:userId',
        'DELETE /api/v1/members/:userId',
        'DELETE /api/v1/members/invitations/:id',
        'POST /api/v1/billing/checkout',
        'POST /api/v1/billing/change-plan',
        'POST /api/v1/billing/cancel',
        'POST /api/v1/billing/resume',
        'POST /api/v1/billing/portal',
      ].sort(),
    );
    const guarded = app.routeTable.filter((r) => r.method !== 'GET' && r.auth === 'required' && !r.readOnlyAllowed);
    expect(guarded.length).toBeGreaterThan(15);
    for (const r of guarded) {
      const url = r.url.replace(/:step/g, '1').replace(/:[A-Za-z]+/g, FAKE_ID);
      const res = await acc.client.request(r.method as 'POST', url, {});
      expect(res.status, `${r.method} ${r.url}`).toBe(403);
      expect(res.body.error.code, `${r.method} ${r.url}`).toBe('SUBSCRIPTION_REQUIRED');
    }
  });

  it('se detienen las automatizaciones y no sale ningún email tras perder el acceso', async () => {
    const acc = await registerAccount(app);
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
    const q = await createQuote(acc.client, { sentAt: new Date(Date.now() - 3 * DAY - 3_600_000).toISOString() });
    const deps: EngineDeps = { db, config, provider };
    expect((await planCompany(deps, acc.companyId)).scheduled).toBe(1);
    await endTrial(acc.companyId);
    expect((await planCompany(deps, acc.companyId)).cancelled).toBe(1);
    expect(await dispatchCompany(deps, acc.companyId)).toMatchObject({ claimed: 0, sent: 0 });
    expect(provider.sentTo(q.contact.email)).toHaveLength(0);
    const steps = (await acc.client.get(`/quotes/${q.id}/follow-ups?status=all`)).body.items;
    expect(steps[0]).toMatchObject({ status: 'cancelled', cancelReason: 'no_active_plan' });
    expect((await planCompany(deps, acc.companyId)).scheduled).toBe(0);
    for (const path of ['/automation/enable', '/automation/test-email', `/quotes/${q.id}/follow-ups`]) {
      const res = await acc.client.post(path, path.endsWith('enable') ? { confirmLegalBasis: true } : { channel: 'phone', status: 'completed' });
      expect(res.status, path).toBe(403);
    }
    expect((await acc.client.post('/automation/disable')).status).toBe(200);
    expect((await acc.client.get('/usage')).body.usage.attempts.used).toBe(0);
  });

  it('en solo lectura se pueden consultar y exportar todos los datos', async () => {
    const acc = await registerAccount(app);
    await createQuote(acc.client);
    await endTrial(acc.companyId);
    const exported = await acc.client.get('/company/export');
    expect(exported.status).toBe(200);
    expect(exported.body.quotes.items).toHaveLength(1);
    for (const path of ['/metrics', '/usage', '/activity', '/contacts', '/billing']) expect((await acc.client.get(path)).status, path).toBe(200);
  });

  it('avisa a los propietarios antes del borrado (30, 7 y 1 día), una vez por etapa, y nunca borra', async () => {
    const acc = await registerAccount(app, 'Empresa sin plan SL');
    const run = () => sendRetentionNotices({ db, config, mailer });
    // Prueba terminada hace 65 días → quedan 25 para el plazo de 90.
    await endTrial(acc.companyId, 65 * DAY);
    await run();
    const first = mailer.outbox.filter((m) => m.to === acc.email && m.template === 'retention_notice');
    expect(first).toHaveLength(1);
    expect(first[0]!.text).toMatch(/solo lectura/);
    await run();
    expect(mailer.outbox.filter((m) => m.to === acc.email && m.template === 'retention_notice')).toHaveLength(1);
    await endTrial(acc.companyId, 85 * DAY); // quedan 5 días
    await run();
    expect(mailer.outbox.filter((m) => m.to === acc.email && m.template === 'retention_notice')).toHaveLength(2);
    // Plazo cumplido: ni avisos ni borrado automático.
    await endTrial(acc.companyId, 95 * DAY);
    const stats = await run();
    expect(stats.pastDeadline).toBeGreaterThanOrEqual(1);
    expect(mailer.outbox.filter((m) => m.to === acc.email && m.template === 'retention_notice')).toHaveLength(2);
    expect((await owner.query('SELECT count(*)::int AS n FROM quotes q JOIN companies c ON c.id = q.company_id WHERE c.id = $1', [acc.companyId])).rows[0].n).toBe(0);
    expect((await owner.query('SELECT count(*)::int AS n FROM companies WHERE id = $1', [acc.companyId])).rows[0].n).toBe(1);
    const notices = (await owner.query('SELECT stage, delivery FROM retention_notices WHERE company_id = $1 ORDER BY created_at', [acc.companyId])).rows;
    expect(notices).toEqual([
      { stage: '30_days', delivery: 'sent' },
      { stage: '7_days', delivery: 'sent' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 14. Configuración y disponibilidad de Stripe
// ---------------------------------------------------------------------------

describe('configuración y disponibilidad de Stripe', () => {
  const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@localhost:5432/x', LOG_LEVEL: 'silent' };
  const valid = {
    PAYMENTS_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_valorFicticioDePrueba01',
    STRIPE_WEBHOOK_SECRET: 'whsec_valorFicticioDePrueba01',
    STRIPE_PRICE_STARTER: 'price_ficticioStarter',
    STRIPE_PRICE_PRO: 'price_ficticioPro01',
    STRIPE_PRICE_BUSINESS: 'price_ficticioBusiness',
  };

  it('rechaza claves live y configuraciones incompletas o mal formadas al arrancar', () => {
    expect(loadConfig({ ...base, ...valid }).billing).toMatchObject({ enabled: true, taxDisplay: 'pending' });
    expect(loadConfig(base).billing).toEqual({ enabled: false, taxDisplay: 'pending' });
    expect(() => loadConfig({ ...base, ...valid, STRIPE_SECRET_KEY: 'sk_live_valorFicticio000000' })).toThrow(/live/);
    expect(() => loadConfig({ ...base, STRIPE_SECRET_KEY: 'rk_live_valorFicticio000000' })).toThrow(/live/); // aunque los pagos estén desactivados
    expect(() => loadConfig({ ...base, PAYMENTS_ENABLED: 'true' })).toThrow(/requiere STRIPE_SECRET_KEY/);
    expect(() => loadConfig({ ...base, ...valid, STRIPE_WEBHOOK_SECRET: 'secreto' })).toThrow(/whsec_/);
    expect(() => loadConfig({ ...base, ...valid, STRIPE_PRICE_PRO: valid.STRIPE_PRICE_STARTER })).toThrow(/repetidos/);
    expect(() => loadConfig({ ...base, ...valid, STRIPE_PRICE_BUSINESS: '12799' })).toThrow(/price_/);
    expect(() => loadConfig({ ...base, ...valid, PRICES_TAX_DISPLAY: 'iva21' })).toThrow();
  });

  it('el simulador local de Stripe (STRIPE_API_BASE) solo se admite fuera de producción y en local', () => {
    expect(loadConfig({ ...base, ...valid, STRIPE_API_BASE: 'http://127.0.0.1:3103' }).billing.stripe?.apiBase).toEqual({ host: '127.0.0.1', port: 3103, protocol: 'http' });
    expect(() => loadConfig({ ...base, ...valid, STRIPE_API_BASE: 'https://api.ejemplo.test' })).toThrow(/simulador local/);
    const prod = {
      ...base,
      ...valid,
      NODE_ENV: 'production',
      APP_WEB_URL: 'https://app.ejemplo.test',
      LEGAL_TERMS_URL: 'https://ejemplo.test/terminos',
      LEGAL_PRIVACY_URL: 'https://ejemplo.test/privacidad',
    };
    expect(loadConfig(prod).billing.stripe?.apiBase).toBeUndefined();
    expect(() => loadConfig({ ...prod, STRIPE_API_BASE: 'http://127.0.0.1:3103' })).toThrow(/STRIPE_API_BASE solo se admite en pruebas/);
  });

  it('solo redirige a las páginas alojadas por Stripe (checkout.stripe.com, billing.stripe.com)', async () => {
    const acc = await registerAccount(app, 'Reformas Redirección SL');
    gateway.foreignRedirects = true;
    try {
      const checkout = await acc.client.post('/billing/checkout', { plan: 'pro' });
      expect(checkout.status).toBe(503);
      expect(JSON.stringify(checkout.body)).not.toContain('ejemplo.test');
      const portal = await acc.client.post('/billing/portal', {});
      expect(portal.status).toBe(503);
      expect(JSON.stringify(portal.body)).not.toContain('ejemplo.test');
    } finally {
      gateway.foreignRedirects = false;
    }
    expect((await acc.client.post('/billing/checkout', { plan: 'pro' })).body.checkout.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  it('sin pagos configurados Presupio sigue funcionando y las rutas de pago no hacen nada', async () => {
    const { app: plain } = await createTestApp();
    const acc = await registerAccount(plain);
    expect((await acc.client.post('/billing/checkout', { plan: 'pro' })).body.error.code).toBe('PAYMENTS_DISABLED');
    const event = signedEvent('customer.subscription.updated', { id: 'sub_x', customer: 'cus_x' });
    const hook = await plain.inject({ method: 'POST', url: `${API}/webhooks/stripe`, headers: { 'content-type': 'application/json', 'stripe-signature': event.signature }, payload: event.payload });
    expect(hook.statusCode).toBe(404);
    expect((await acc.client.get('/company/subscription')).body.subscription).toMatchObject({ paymentsEnabled: false, status: 'trialing', hasActiveAccess: true });
    expect((await createQuoteRaw(acc)).status).toBe(201);
  });

  it('si Stripe no responde: 503 sin cambios, y el webhook se puede reintentar después', async () => {
    const acc = await registerAccount(app);
    gateway.unavailable = true;
    const res = await acc.client.post('/billing/checkout', { plan: 'pro' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAYMENTS_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/sk_test|stripe\.com|Error:/);
    expect(await subRow(acc.companyId)).toMatchObject({ status: 'trialing', provider_customer_id: null });
    gateway.unavailable = false;
    const { subscriptionId, customerId } = await subscribe(acc, 'pro');
    gateway.setSubscription({ id: subscriptionId, customerId, priceId: TEST_BILLING.prices.business });
    const event = signedEvent('customer.subscription.updated', { id: subscriptionId, customer: customerId });
    gateway.unavailable = true;
    expect((await postWebhook(event.payload, event.signature)).status).toBe(503);
    expect((await owner.query('SELECT count(*)::int AS n FROM billing_events WHERE provider_event_id = $1', [event.id])).rows[0].n).toBe(0);
    gateway.unavailable = false;
    expect((await postWebhook(event.payload, event.signature)).body.outcome).toBe('applied'); // reintento de Stripe
    expect(await subRow(acc.companyId)).toMatchObject({ plan: 'business' });
  });

  it('si el precio configurado en Stripe no coincide con el publicado, no se inicia ningún pago', async () => {
    const acc = await registerAccount(app);
    const original = gateway.prices.get(TEST_BILLING.prices.pro)!;
    gateway.prices.set(TEST_BILLING.prices.pro, { ...original, unitAmount: 4999 });
    try {
      const sessions = gateway.callsOf('createCheckoutSession').length;
      const res = await acc.client.post('/billing/checkout', { plan: 'pro' });
      expect(res.status).toBe(409);
      expect(gateway.callsOf('createCheckoutSession')).toHaveLength(sessions);
      gateway.prices.set(TEST_BILLING.prices.pro, { ...original, livemode: true });
      resetPriceChecks();
      expect((await acc.client.post('/billing/checkout', { plan: 'pro' })).status).toBe(409);
    } finally {
      gateway.prices.set(TEST_BILLING.prices.pro, original);
    }
  });
});
