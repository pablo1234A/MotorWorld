import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { navigate, registerViaUi, watchConsole } from './support';

/*
 * P1-06 / P2-06: suscripciones de extremo a extremo con PAGOS SIMULADOS.
 *
 * La API (segunda instancia, pagos activados) usa la librería oficial de Stripe contra un
 * SIMULADOR LOCAL (e2e/fake-stripe.mjs) que firma los webhooks como Stripe. Las páginas
 * alojadas por Stripe (checkout.stripe.com, billing.stripe.com) se sustituyen en el navegador
 * por una página local: no se contacta con Stripe, no hay dinero ni claves reales.
 * Esto NO equivale a una prueba con Stripe real (docs/facturacion.md, «Pendiente»).
 */

const WEB = 'http://127.0.0.1:4175';
const FAKE_STRIPE = 'http://127.0.0.1:3103';

test.describe.configure({ mode: 'serial' });
test.use({ baseURL: WEB });

interface Delivery {
  eventId: string;
  type: string;
  status: number;
  outcome: string | null;
}

async function control<T = { deliveries: Delivery[] }>(path: string): Promise<T> {
  const res = await fetch(`${FAKE_STRIPE}/__control/${path}`, { method: 'POST' });
  expect(res.ok, `control ${path}`).toBe(true);
  return (await res.json()) as T;
}

async function stripeContext(browser: Browser): Promise<{ context: BrowserContext; page: Page; problems: string[]; stripePages: string[] }> {
  const context = await browser.newContext({ baseURL: WEB });
  const stripePages: string[] = [];
  // Nunca se sale a Internet: cualquier petición a stripe.com se sirve en local.
  await context.route(/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//, (route) => {
    stripePages.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Stripe (simulado)</title><h1>Página alojada de Stripe (simulada)</h1>' });
  });
  const page = await context.newPage();
  return { context, page, problems: watchConsole(page), stripePages };
}

async function subscription(page: Page) {
  const res = await page.request.get('/api/v1/billing');
  expect(res.status()).toBe(200);
  return (await res.json()).subscription as { plan: string | null; status: string; hasActiveAccess: boolean; readOnly: boolean; cancelAtPeriodEnd: boolean };
}

async function attemptLimit(page: Page) {
  return ((await (await page.request.get('/api/v1/usage')).json()) as { usage: { attempts: { limit: number } } }).usage.attempts.limit;
}

/** Contrata un plan desde la interfaz y devuelve el id de la sesión de pago creada. */
async function startCheckout(page: Page, planName: string): Promise<string> {
  await navigate(page, '/configuracion/plan');
  await page.getByRole('button', { name: `Contratar ${planName}` }).click();
  await page.getByRole('button', { name: 'Ir al pago seguro' }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_[0-9a-f]+$/);
  return page.url().split('/').pop()!;
}

test('contratar, cambiar de plan y cancelar: el plan solo cambia con webhooks firmados', async ({ browser }) => {
  const a = await stripeContext(browser);
  const { page } = a;
  await registerViaUi(page, 'Reformas Pagos SL');
  expect(await subscription(page)).toMatchObject({ status: 'trialing', plan: 'starter' });

  // 1) Ir a pagar y volver SIN pagar: «confirmando», pero el plan no cambia.
  const sessionId = await startCheckout(page, 'Pro');
  expect(a.stripePages).toHaveLength(1);
  await navigate(page, '/configuracion/plan?pago=confirmando');
  await expect(page.getByText('Estamos confirmando el pago con Stripe')).toBeVisible();
  expect(await subscription(page)).toMatchObject({ status: 'trialing', plan: 'starter' });

  // 2) Un webhook con firma falsa no activa nada.
  const forged = await control<{ delivery: Delivery }>('forged/none');
  expect(forged.delivery.status).toBe(400);

  // 3) El cliente paga en Stripe: llegan los webhooks firmados y la página se actualiza sola.
  const paid = await control<{ subscriptionId: string; deliveries: Delivery[] }>(`checkout/${sessionId}/pay`);
  expect(paid.deliveries.map((d) => d.status)).toEqual([200, 200, 200]);
  expect(paid.deliveries[0]!.outcome).toBe('applied');
  await expect(page.getByText('Suscripción activa')).toBeVisible();
  await expect(page.locator('.kv dd.strong')).toContainText('Pro');
  await expect(page.locator('.kv dd.strong')).toContainText('57,99');
  expect(await subscription(page)).toMatchObject({ status: 'active', plan: 'pro', hasActiveAccess: true });
  expect(await attemptLimit(page)).toBe(65);

  // 4) Un evento repetido no se aplica dos veces.
  const replay = await control<{ delivery: Delivery }>(`replay/${paid.deliveries[0]!.eventId}`);
  expect(replay.delivery).toMatchObject({ status: 200, outcome: 'duplicate' });

  // 5) Subida a Business: el límite sube cuando Stripe confirma.
  await page.getByRole('button', { name: 'Cambiar a Business' }).click();
  await page.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(page.getByText(/Cambio solicitado/)).toBeVisible();
  await expect.poll(async () => (await subscription(page)).plan).toBe('business');
  await expect.poll(() => attemptLimit(page)).toBe(300);

  // 6) Cancelación al final del periodo: se mantiene el acceso hasta entonces.
  await page.reload();
  await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
  await page.getByRole('button', { name: 'Cancelar al final del periodo' }).click();
  await expect(page.getByText('Cancelación programada')).toBeVisible();
  expect(await subscription(page)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true, hasActiveAccess: true });

  // 7) Termina el periodo: solo lectura, exportación disponible, sin escrituras.
  await control(`subscriptions/${paid.subscriptionId}/end_period`);
  await expect.poll(async () => (await subscription(page)).status).toBe('canceled');
  await page.reload();
  await expect(page.getByText('Tu suscripción ha terminado: la cuenta está en modo de solo lectura')).toBeVisible();
  const write = await page.request.post('/api/v1/quotes', { data: { title: 'Bloqueado', contact: { fullName: 'X', phone: '+34600111222' } } });
  expect(write.status()).toBe(403);
  expect((await page.request.get('/api/v1/company/export')).status()).toBe(200);

  // 8) El portal de Stripe se abre en su dominio (simulado).
  await page.getByRole('button', { name: 'Método de pago y facturas' }).click();
  await page.waitForURL(/^https:\/\/billing\.stripe\.com\/p\/session\/test_/);

  expect(a.problems).toEqual([]);
  await a.context.close();
});

test('cobro fallido: aviso durante la gracia, recuperación y, si queda impagada, solo lectura', async ({ browser }) => {
  const b = await stripeContext(browser);
  const { page } = b;
  await registerViaUi(page, 'Reformas Impago SL');
  const sessionId = await startCheckout(page, 'Starter');
  const paid = await control<{ subscriptionId: string; deliveries: Delivery[] }>(`checkout/${sessionId}/pay`);
  expect(paid.deliveries.every((d) => d.status === 200)).toBe(true);
  expect(await subscription(page)).toMatchObject({ status: 'active', plan: 'starter' });
  expect(await attemptLimit(page)).toBe(25);

  await control(`subscriptions/${paid.subscriptionId}/fail_payment`);
  await navigate(page, '/configuracion/plan');
  await expect(page.getByText('No hemos podido cobrar la última factura')).toBeVisible();
  expect(await subscription(page)).toMatchObject({ status: 'past_due', hasActiveAccess: true });

  await control(`subscriptions/${paid.subscriptionId}/recover_payment`);
  await expect.poll(async () => (await subscription(page)).status).toBe('active');

  await control(`subscriptions/${paid.subscriptionId}/fail_payment`);
  await control(`subscriptions/${paid.subscriptionId}/unpaid`);
  await expect.poll(async () => (await subscription(page)).status).toBe('unpaid');
  expect(await subscription(page)).toMatchObject({ hasActiveAccess: false, readOnly: true });
  await navigate(page, '/');
  await expect(page.getByText(/la cuenta está en modo de solo lectura/)).toBeVisible();
  expect(b.problems).toEqual([]);
  await b.context.close();
});

test('aislamiento: los pagos de una empresa no afectan a otra; pago cancelado sin cambios', async ({ browser }) => {
  const c = await stripeContext(browser);
  const d = await stripeContext(browser);
  await registerViaUi(c.page, 'Reformas Uno SL');
  await registerViaUi(d.page, 'Reformas Dos SL');

  // C abandona el pago: vuelve a «cancelado», sin cambios.
  const cSession = await startCheckout(c.page, 'Pro');
  await navigate(c.page, '/configuracion/plan?pago=cancelado');
  await expect(c.page.getByText('Pago cancelado')).toBeVisible();
  expect(await subscription(c.page)).toMatchObject({ status: 'trialing', plan: 'starter' });

  // D paga su plan: C sigue en prueba; D no ve nada de C.
  const dSession = await startCheckout(d.page, 'Business');
  expect(dSession).not.toBe(cSession);
  const paid = await control<{ deliveries: Delivery[] }>(`checkout/${dSession}/pay`);
  expect(paid.deliveries.every((x) => x.status === 200)).toBe(true);
  expect(await subscription(d.page)).toMatchObject({ status: 'active', plan: 'business' });
  expect(await subscription(c.page)).toMatchObject({ status: 'trialing', plan: 'starter' });
  // C no tiene suscripción de pago: no puede cancelar ni cambiar la de D.
  expect((await c.page.request.post('/api/v1/billing/cancel', { data: {} })).status()).toBe(409);
  expect((await c.page.request.post('/api/v1/billing/change-plan', { data: { plan: 'pro' } })).status()).toBe(409);
  // La sesión de pago de C sigue siendo de C: si la paga más tarde, solo C cambia.
  const lateC = await control<{ deliveries: Delivery[] }>(`checkout/${cSession}/pay`);
  expect(lateC.deliveries[0]!.outcome).toBe('applied');
  expect(await subscription(c.page)).toMatchObject({ status: 'active', plan: 'pro' });
  expect(await subscription(d.page)).toMatchObject({ status: 'active', plan: 'business' });

  expect([...c.problems, ...d.problems]).toEqual([]);
  await c.context.close();
  await d.context.close();
});
