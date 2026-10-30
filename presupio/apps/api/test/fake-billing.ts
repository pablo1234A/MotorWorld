import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import type { AppConfig } from '../src/config.js';
import {
  BillingUnavailableError,
  StripeGateway,
  type BillingGateway,
  type CheckoutInput,
  type ProviderEvent,
  type ProviderPrice,
  type ProviderSubscription,
} from '../src/modules/billing/gateway.js';

/**
 * PASARELA DE PAGOS SIMULADA — SOLO PARA PRUEBAS AUTOMATIZADAS.
 * No se conecta a Stripe ni a ninguna red: guarda en memoria lo que se le pide y devuelve
 * suscripciones preparadas por la prueba. La verificación de firmas de webhooks SÍ es la real
 * (la de la librería oficial de Stripe, que es un cálculo local HMAC-SHA256).
 */

export const TEST_BILLING: NonNullable<AppConfig['billing']['stripe']> = {
  // Valores ficticios con el formato de modo de prueba: no son credenciales reales.
  secretKey: 'sk_test_presupioFicticia000000',
  webhookSecret: 'whsec_presupioFicticio000000',
  prices: { starter: 'price_testStarter0001', pro: 'price_testPro000001', business: 'price_testBusiness001' },
};

export function enableTestBilling(c: AppConfig) {
  c.billing = { enabled: true, taxDisplay: 'pending', stripe: TEST_BILLING };
}

const signer = new Stripe('sk_test_soloParaFirmarPruebas0000');

export class FakeBillingGateway implements BillingGateway {
  readonly provider = 'stripe' as const;
  readonly calls: Array<{ method: string; input: any }> = [];
  readonly subscriptions = new Map<string, ProviderSubscription>();
  readonly prices = new Map<string, ProviderPrice>();
  /** Simula que Stripe no responde: toda llamada a la API falla (la firma sigue verificándose). */
  unavailable = false;
  /** Simula una respuesta inesperada: las páginas de pago y del portal en otro dominio. */
  foreignRedirects = false;
  /** Retiene la siguiente lectura de suscripción hasta llamar a release() (eventos desordenados). */
  private gate: Promise<void> | null = null;
  private openGate: (() => void) | null = null;
  private readonly verifier = new StripeGateway(TEST_BILLING);
  private seq = 0;

  constructor() {
    const amounts = { starter: 2799, pro: 5799, business: 12799 } as const;
    for (const [plan, id] of Object.entries(TEST_BILLING.prices)) {
      this.prices.set(id, { id, active: true, currency: 'eur', unitAmount: amounts[plan as keyof typeof amounts], interval: 'month', livemode: false });
    }
  }

  private record(method: string, input: any) {
    this.calls.push({ method, input });
    if (this.unavailable) throw new BillingUnavailableError('connection', 'No se pudo conectar con Stripe');
  }

  callsOf(method: string) {
    return this.calls.filter((c) => c.method === method).map((c) => c.input);
  }

  hold() {
    this.gate = new Promise((resolve) => (this.openGate = resolve));
  }

  release() {
    this.openGate?.();
    this.openGate = null;
  }

  async createCustomer(input: { companyId: string; name: string; email: string }) {
    this.record('createCustomer', input);
    return `cus_test${input.companyId.replace(/-/g, '').slice(0, 14)}`;
  }

  async createCheckoutSession(input: CheckoutInput) {
    this.record('createCheckoutSession', input);
    const id = `cs_test_${++this.seq}${randomBytes(4).toString('hex')}`;
    return { id, url: this.foreignRedirects ? `https://checkout.stripe.com.ejemplo.test/c/pay/${id}` : `https://checkout.stripe.com/c/pay/${id}` };
  }

  async expireCheckoutSession(id: string) {
    this.record('expireCheckoutSession', id);
  }

  async retrievePrice(id: string) {
    this.record('retrievePrice', id);
    const price = this.prices.get(id);
    if (!price) throw new BillingUnavailableError('invalid_request', 'Stripe rechazó la petición');
    return price;
  }

  async retrieveSubscription(id: string) {
    this.record('retrieveSubscription', id);
    // La retención afecta solo a la siguiente lectura: las demás siguen su curso.
    const gate = this.gate;
    this.gate = null;
    const snapshot = this.subscriptions.get(id);
    if (gate) await gate;
    if (!snapshot) throw new BillingUnavailableError('invalid_request', 'Stripe rechazó la petición');
    return { ...snapshot };
  }

  async changeSubscriptionPrice(input: { subscriptionId: string; itemId: string; priceId: string; mode: 'upgrade' | 'downgrade'; idempotencyKey: string }) {
    this.record('changeSubscriptionPrice', input);
  }

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
    this.record('setCancelAtPeriodEnd', { subscriptionId, cancel });
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    this.record('createPortalSession', input);
    return { url: `https://${this.foreignRedirects ? 'pagos.ejemplo.test' : 'billing.stripe.com'}/p/session/test_${randomBytes(6).toString('hex')}` };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent {
    return this.verifier.parseWebhook(rawBody, signature);
  }

  // ---- utilidades de la prueba --------------------------------------------

  /** Prepara (o cambia) el estado de una suscripción en el «Stripe» simulado. */
  setSubscription(sub: Partial<ProviderSubscription> & { id: string; customerId: string }) {
    const now = Date.now();
    const current = this.subscriptions.get(sub.id);
    const next: ProviderSubscription = {
      status: 'active',
      livemode: false,
      priceId: TEST_BILLING.prices.starter,
      itemId: `si_${sub.id.slice(4)}`,
      currentPeriodStart: new Date(now - 60_000),
      currentPeriodEnd: new Date(now + 30 * 86_400_000),
      cancelAtPeriodEnd: false,
      trialEnd: null,
      metadataCompanyId: null,
      ...current,
      ...sub,
    };
    this.subscriptions.set(sub.id, next);
    return next;
  }
}

/** Evento firmado como lo enviaría Stripe (con el secreto de pruebas o con otro). */
export function signedEvent(
  type: string,
  object: Record<string, unknown>,
  options: { id?: string; livemode?: boolean; secret?: string; timestamp?: number } = {},
) {
  const payload = JSON.stringify({
    id: options.id ?? `evt_test_${randomBytes(8).toString('hex')}`,
    object: 'event',
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    livemode: options.livemode ?? false,
    type,
    data: { object },
  });
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? TEST_BILLING.webhookSecret,
    ...(options.timestamp ? { timestamp: options.timestamp } : {}),
  });
  return { payload, signature, id: JSON.parse(payload).id as string };
}
