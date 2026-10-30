#!/usr/bin/env node
/*
 * SIMULADOR LOCAL de la API de Stripe, SOLO para las pruebas E2E. La API de Presupio usa la
 * librería oficial de Stripe apuntando aquí (STRIPE_API_BASE, prohibido en producción). No hay
 * red, ni dinero, ni claves reales. Los webhooks se firman como Stripe (cabecera
 * Stripe-Signature con HMAC-SHA256) usando el secreto de prueba de la API de E2E.
 *
 * NO equivale a una prueba contra Stripe: reproduce los objetos y eventos que Presupio usa,
 * no el comportamiento completo de Stripe (reintentos, 3DS, facturas, impuestos…).
 *
 *   node fake-stripe.mjs <puerto> <url del webhook> <secreto whsec_> '<{"price_x": {"amount": 2799}}>'
 *
 * Rutas de control (/__control/…) para que la prueba simule lo que haría el cliente en Stripe:
 * pagar, fallar un cobro, terminar el periodo, reenviar un evento…
 */
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';

const [port, webhookUrl, webhookSecret, pricesJson] = process.argv.slice(2);
const PRICES = JSON.parse(pricesJson);
const DAY = 86_400;
const id = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;
const now = () => Math.floor(Date.now() / 1000);

const state = { customers: new Map(), sessions: new Map(), subscriptions: new Map(), events: [], deliveries: [] };

function subscriptionObject(sub) {
  return {
    id: sub.id,
    object: 'subscription',
    customer: sub.customer,
    status: sub.status,
    livemode: false,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    trial_end: null,
    metadata: sub.metadata,
    items: {
      object: 'list',
      data: [{ id: sub.itemId, object: 'subscription_item', price: { id: sub.price, object: 'price' }, current_period_start: sub.periodStart, current_period_end: sub.periodEnd }],
    },
  };
}

function invoiceObject(sub, status) {
  return { id: id('in'), object: 'invoice', customer: sub.customer, status, parent: { subscription_details: { subscription: sub.id } } };
}

/** Envía un evento firmado al webhook de la API (como Stripe, en segundo plano). */
async function deliver(type, object, { signature } = {}) {
  const event = { id: id('evt'), object: 'event', type, livemode: false, created: now(), api_version: '2026-09-30.endive', data: { object } };
  state.events.push(event);
  return send(event, signature);
}

async function send(event, signature) {
  const payload = JSON.stringify(event);
  const t = now();
  const v1 = createHmac('sha256', webhookSecret).update(`${t}.${payload}`).digest('hex');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? `t=${t},v1=${v1}` },
    body: payload,
  });
  const body = await res.json().catch(() => null);
  const delivery = { eventId: event.id, type: event.type, status: res.status, outcome: body?.outcome ?? body?.error?.code ?? null };
  state.deliveries.push(delivery);
  return delivery;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const notFound = (res, what) => json(res, 404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: `No such ${what}` } });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const raw = await readBody(req);
  const form = new URLSearchParams(req.headers['content-type']?.includes('json') ? '' : raw);
  const parts = url.pathname.split('/').filter(Boolean);

  // ---- API de Stripe (lo que usa la librería oficial desde Presupio) ----
  if (parts[0] === 'v1') {
    if (req.headers.authorization !== 'Bearer sk_test_simuladorE2E0123456789') return json(res, 401, { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } });
    const [, resource, rid, action] = parts;
    if (resource === 'customers' && req.method === 'POST') {
      const customer = { id: id('cus'), object: 'customer', name: form.get('name'), email: form.get('email'), metadata: { company_id: form.get('metadata[company_id]') } };
      state.customers.set(customer.id, customer);
      return json(res, 200, customer);
    }
    if (resource === 'prices' && req.method === 'GET') {
      const p = PRICES[rid];
      if (!p) return notFound(res, 'price');
      return json(res, 200, { id: rid, object: 'price', active: true, currency: 'eur', unit_amount: p.amount, recurring: { interval: 'month' }, livemode: false });
    }
    if (resource === 'checkout' && rid === 'sessions' && req.method === 'POST' && !parts[3]) {
      const session = {
        id: id('cs_test'),
        object: 'checkout.session',
        status: 'open',
        customer: form.get('customer'),
        client_reference_id: form.get('client_reference_id'),
        price: form.get('line_items[0][price]'),
        metadata: { company_id: form.get('subscription_data[metadata][company_id]'), plan: form.get('subscription_data[metadata][plan]') },
        success_url: form.get('success_url'),
        cancel_url: form.get('cancel_url'),
        subscription: null,
      };
      session.url = `https://checkout.stripe.com/c/pay/${session.id}`;
      state.sessions.set(session.id, session);
      return json(res, 200, session);
    }
    if (resource === 'checkout' && rid === 'sessions' && parts[4] === 'expire') {
      const session = state.sessions.get(parts[3]);
      if (!session) return notFound(res, 'checkout session');
      if (session.status !== 'open') return json(res, 400, { error: { type: 'invalid_request_error', message: 'Session is not open' } });
      session.status = 'expired';
      return json(res, 200, session);
    }
    if (resource === 'subscriptions' && req.method === 'GET') {
      const sub = state.subscriptions.get(rid);
      return sub ? json(res, 200, subscriptionObject(sub)) : notFound(res, 'subscription');
    }
    if (resource === 'subscriptions' && req.method === 'POST' && !action) {
      const sub = state.subscriptions.get(rid);
      if (!sub) return notFound(res, 'subscription');
      const events = [];
      if (form.has('items[0][price]')) {
        const upgrade = PRICES[form.get('items[0][price]')].amount > PRICES[sub.price].amount;
        sub.price = form.get('items[0][price]');
        events.push(['customer.subscription.updated']);
        if (upgrade) events.push(['invoice.paid', 'paid']);
      }
      if (form.has('cancel_at_period_end')) {
        sub.cancelAtPeriodEnd = form.get('cancel_at_period_end') === 'true';
        events.push(['customer.subscription.updated']);
      }
      json(res, 200, subscriptionObject(sub));
      // Como Stripe: los webhooks llegan después, por separado.
      setTimeout(async () => {
        for (const [type, invoice] of events) await deliver(type, invoice ? invoiceObject(sub, invoice) : subscriptionObject(sub));
      }, 50);
      return;
    }
    if (resource === 'billing_portal' && rid === 'sessions' && req.method === 'POST') {
      return json(res, 200, { id: id('bps'), object: 'billing_portal.session', customer: form.get('customer'), url: `https://billing.stripe.com/p/session/test_${randomBytes(8).toString('hex')}` });
    }
    return notFound(res, req.method + ' ' + url.pathname);
  }

  // ---- Control de la prueba (lo que haría el cliente en las páginas de Stripe) ----
  if (parts[0] === '__control') {
    const [, kind, rid, action] = parts;
    if (kind === 'state') {
      return json(res, 200, {
        sessions: [...state.sessions.values()],
        subscriptions: [...state.subscriptions.values()],
        deliveries: state.deliveries,
      });
    }
    if (kind === 'checkout' && action === 'pay') {
      const session = state.sessions.get(rid);
      if (!session || session.status !== 'open') return json(res, 409, { error: 'Sesión no abierta' });
      const start = now();
      const sub = {
        id: id('sub'),
        customer: session.customer,
        status: 'active',
        price: session.price,
        itemId: id('si'),
        periodStart: start,
        periodEnd: start + 30 * DAY,
        cancelAtPeriodEnd: false,
        metadata: session.metadata,
      };
      state.subscriptions.set(sub.id, sub);
      session.status = 'complete';
      session.subscription = sub.id;
      const deliveries = [
        await deliver('checkout.session.completed', { ...session, url: null }),
        await deliver('customer.subscription.created', subscriptionObject(sub)),
        await deliver('invoice.paid', invoiceObject(sub, 'paid')),
      ];
      return json(res, 200, { subscriptionId: sub.id, successUrl: session.success_url, deliveries });
    }
    const sub = kind === 'subscriptions' ? state.subscriptions.get(rid) : null;
    if (kind === 'subscriptions' && !sub) return json(res, 404, { error: 'Suscripción desconocida' });
    if (sub && action === 'fail_payment') {
      sub.status = 'past_due';
      return json(res, 200, { deliveries: [await deliver('invoice.payment_failed', invoiceObject(sub, 'open')), await deliver('customer.subscription.updated', subscriptionObject(sub))] });
    }
    if (sub && action === 'recover_payment') {
      sub.status = 'active';
      return json(res, 200, { deliveries: [await deliver('invoice.paid', invoiceObject(sub, 'paid'))] });
    }
    if (sub && action === 'unpaid') {
      sub.status = 'unpaid';
      return json(res, 200, { deliveries: [await deliver('customer.subscription.updated', subscriptionObject(sub))] });
    }
    if (sub && action === 'end_period') {
      if (!sub.cancelAtPeriodEnd) return json(res, 409, { error: 'No hay cancelación programada' });
      sub.status = 'canceled';
      return json(res, 200, { deliveries: [await deliver('customer.subscription.deleted', subscriptionObject(sub))] });
    }
    if (kind === 'replay') {
      const event = state.events.find((e) => e.id === rid);
      if (!event) return json(res, 404, { error: 'Evento desconocido' });
      return json(res, 200, { delivery: await send(event) });
    }
    if (kind === 'forged') {
      // Un evento con firma falsa (p. ej. alguien que intenta activar un plan sin pagar).
      const target = state.subscriptions.get(rid);
      const event = { id: id('evt'), object: 'event', type: 'customer.subscription.updated', livemode: false, created: now(), data: { object: target ? subscriptionObject(target) : {} } };
      return json(res, 200, { delivery: await send(event, `t=${now()},v1=${'0'.repeat(64)}`) });
    }
    return json(res, 404, { error: 'Acción desconocida' });
  }
  return json(res, 404, { error: 'Ruta desconocida' });
});

server.listen(Number(port), '127.0.0.1', () => console.log(`Simulador de Stripe en http://127.0.0.1:${port}`));
