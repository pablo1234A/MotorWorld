import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingUnavailableError, normalizeEvent, StripeGateway, WebhookSignatureError } from '../src/modules/billing/gateway.js';
import { TEST_BILLING } from './fake-billing.js';

/*
 * La pasarela REAL (librería oficial de Stripe) contra un servidor HTTP local que imita la
 * API. Comprueba qué se envía de verdad a Stripe sin salir a la red ni usar credenciales:
 * la clave es ficticia y el servidor es 127.0.0.1.
 */

interface Captured {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  form: URLSearchParams;
}

const captured: Captured[] = [];
let failNext: { status: number; body: unknown } | null = null;
let server: Server;
let port = 0;

const subscriptionJson = (id: string) => ({
  id,
  object: 'subscription',
  customer: 'cus_testLocal01',
  status: 'active',
  livemode: false,
  cancel_at_period_end: false,
  trial_end: null,
  metadata: { company_id: '11111111-1111-4111-8111-111111111111' },
  items: {
    object: 'list',
    data: [{ id: 'si_testLocal01', object: 'subscription_item', price: { id: TEST_BILLING.prices.pro, object: 'price' }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }],
  },
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');
      captured.push({ method: req.method!, path: url.pathname, headers: req.headers, form: new URLSearchParams(body) });
      res.setHeader('content-type', 'application/json');
      if (failNext) {
        const f = failNext;
        failNext = null;
        res.statusCode = f.status;
        return res.end(JSON.stringify(f.body));
      }
      const path = url.pathname;
      if (path === '/v1/customers') return res.end(JSON.stringify({ id: 'cus_testLocal01', object: 'customer' }));
      if (path === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_test_local01', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_local01' }));
      if (path.startsWith('/v1/prices/')) {
        return res.end(JSON.stringify({ id: path.split('/').pop(), object: 'price', active: true, currency: 'eur', unit_amount: 5799, recurring: { interval: 'month' }, livemode: false }));
      }
      if (path.startsWith('/v1/subscriptions/')) return res.end(JSON.stringify(subscriptionJson(path.split('/').pop()!)));
      if (path === '/v1/billing_portal/sessions') return res.end(JSON.stringify({ id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test_local' }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'No such route' } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const gateway = () => new StripeGateway(TEST_BILLING, { host: '127.0.0.1', port, protocol: 'http' });
const last = () => captured.at(-1)!;

describe('pasarela de Stripe (librería oficial, API simulada en local)', () => {
  it('Checkout en modo suscripción con el precio del servidor, la empresa y sin impuestos automáticos', async () => {
    const session = await gateway().createCheckoutSession({
      companyId: '11111111-1111-4111-8111-111111111111',
      customerId: 'cus_testLocal01',
      plan: 'pro',
      priceId: TEST_BILLING.prices.pro,
      successUrl: 'https://app.ejemplo.test/configuracion/plan?pago=confirmando',
      cancelUrl: 'https://app.ejemplo.test/configuracion/plan?pago=cancelado',
    });
    expect(session).toEqual({ id: 'cs_test_local01', url: 'https://checkout.stripe.com/c/pay/cs_test_local01' });
    const req = last();
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/v1/checkout/sessions');
    expect(req.headers.authorization).toBe(`Bearer ${TEST_BILLING.secretKey}`);
    const f = Object.fromEntries(req.form);
    expect(f).toMatchObject({
      mode: 'subscription',
      customer: 'cus_testLocal01',
      client_reference_id: '11111111-1111-4111-8111-111111111111',
      'line_items[0][price]': TEST_BILLING.prices.pro,
      'line_items[0][quantity]': '1',
      'metadata[company_id]': '11111111-1111-4111-8111-111111111111',
      'subscription_data[metadata][company_id]': '11111111-1111-4111-8111-111111111111',
      locale: 'es',
    });
    expect(Object.keys(f).some((k) => k.startsWith('automatic_tax') || k.startsWith('tax'))).toBe(false);
  });

  it('cliente con clave de idempotencia; cambios de plan y cancelación con los parámetros acordados', async () => {
    const g = gateway();
    expect(await g.createCustomer({ companyId: 'abc', name: 'Empresa', email: 'p@ejemplo.test' })).toBe('cus_testLocal01');
    expect(last().headers['idempotency-key']).toBe('presupio-customer-abc');

    await g.changeSubscriptionPrice({ subscriptionId: 'sub_testLocal01', itemId: 'si_testLocal01', priceId: TEST_BILLING.prices.business, mode: 'upgrade', idempotencyKey: 'k1' });
    expect(last().path).toBe('/v1/subscriptions/sub_testLocal01');
    expect(Object.fromEntries(last().form)).toMatchObject({
      'items[0][id]': 'si_testLocal01',
      'items[0][price]': TEST_BILLING.prices.business,
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    });
    await g.changeSubscriptionPrice({ subscriptionId: 'sub_testLocal01', itemId: 'si_testLocal01', priceId: TEST_BILLING.prices.starter, mode: 'downgrade', idempotencyKey: 'k2' });
    expect(Object.fromEntries(last().form)).toMatchObject({ proration_behavior: 'none' });
    expect(last().form.has('payment_behavior')).toBe(false);

    await g.setCancelAtPeriodEnd('sub_testLocal01', true);
    expect(Object.fromEntries(last().form)).toEqual({ cancel_at_period_end: 'true' });
    expect(await g.createPortalSession({ customerId: 'cus_testLocal01', returnUrl: 'https://app.ejemplo.test/configuracion/plan' })).toEqual({
      url: 'https://billing.stripe.com/p/session/test_local',
    });
  });

  it('lee la suscripción con el periodo de su elemento y el precio', async () => {
    const sub = await gateway().retrieveSubscription('sub_testLocal01');
    expect(sub).toEqual({
      id: 'sub_testLocal01',
      customerId: 'cus_testLocal01',
      status: 'active',
      livemode: false,
      priceId: TEST_BILLING.prices.pro,
      itemId: 'si_testLocal01',
      currentPeriodStart: new Date(1_790_000_000_000),
      currentPeriodEnd: new Date(1_792_592_000_000),
      cancelAtPeriodEnd: false,
      trialEnd: null,
      metadataCompanyId: '11111111-1111-4111-8111-111111111111',
    });
    expect(await gateway().retrievePrice(TEST_BILLING.prices.pro)).toMatchObject({ unitAmount: 5799, currency: 'eur', interval: 'month', livemode: false });
  });

  it('los errores de Stripe se convierten en «no disponible» sin detalles internos', async () => {
    failNext = { status: 400, body: { error: { type: 'invalid_request_error', message: 'No such price: price_x' } } };
    await expect(gateway().retrievePrice('price_x')).rejects.toMatchObject({ name: 'BillingUnavailableError', kind: 'invalid_request' });
    failNext = { status: 401, body: { error: { type: 'invalid_request_error', message: 'Invalid API Key provided: sk_test_***' } } };
    const auth = await gateway().retrievePrice('price_x').catch((e) => e);
    expect(auth).toBeInstanceOf(BillingUnavailableError);
    expect(auth.kind).toBe('authentication');
    expect(auth.message).not.toMatch(/sk_test/);
    const closed = new StripeGateway(TEST_BILLING, { host: '127.0.0.1', port: 9, protocol: 'http' });
    await expect(closed.retrievePrice('price_x')).rejects.toMatchObject({ kind: 'connection' });
  }, 20_000);

  it('verifica la firma del webhook con el cuerpo original y extrae solo lo necesario', () => {
    const signer = new Stripe('sk_test_soloParaFirmarPruebas0000');
    const payload = JSON.stringify({
      id: 'evt_test_local',
      object: 'event',
      type: 'invoice.payment_failed',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'in_test', customer: 'cus_testLocal01', parent: { subscription_details: { subscription: 'sub_testLocal01' } } } },
    });
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: TEST_BILLING.webhookSecret });
    expect(gateway().parseWebhook(Buffer.from(payload), signature)).toEqual({
      id: 'evt_test_local',
      type: 'invoice.payment_failed',
      livemode: false,
      subscriptionId: 'sub_testLocal01',
      customerId: 'cus_testLocal01',
      companyHint: null,
    });
    // Un solo espacio de diferencia invalida la firma: por eso no se analiza el JSON antes.
    expect(() => gateway().parseWebhook(Buffer.from(payload.replace('{', '{ ')), signature)).toThrow(WebhookSignatureError);
    expect(() => gateway().parseWebhook(Buffer.from(payload), undefined)).toThrow(WebhookSignatureError);
    const checkout = normalizeEvent({
      id: 'evt_2',
      type: 'checkout.session.completed',
      livemode: false,
      data: { object: { subscription: 'sub_2', customer: { id: 'cus_2' }, client_reference_id: 'empresa' } },
    } as unknown as Stripe.Event);
    expect(checkout).toMatchObject({ subscriptionId: 'sub_2', customerId: 'cus_2', companyHint: 'empresa' });
  });

  it('nunca acepta una clave live', () => {
    expect(() => new StripeGateway({ ...TEST_BILLING, secretKey: 'sk_live_valorFicticio000000' })).toThrow(/prueba/);
    expect(() => new StripeGateway({ ...TEST_BILLING, secretKey: 'rk_live_valorFicticio000000' })).toThrow(/prueba/);
  });
});
