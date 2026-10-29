import Stripe from 'stripe';
import type { AppConfig } from '../../config.js';

/*
 * Pasarela de pagos. Presupio solo habla con Stripe a través de esta interfaz: así las pruebas
 * automatizadas usan una pasarela simulada (sin red) y el resto del código no depende de los
 * tipos de la librería. Solo se transmiten identificadores y estados: nunca datos de tarjeta,
 * que Stripe recoge directamente en su página de pago.
 */

export interface ProviderSubscription {
  id: string;
  customerId: string;
  /** Estado tal como lo devuelve Stripe (active, trialing, past_due, unpaid, canceled, incomplete…). */
  status: string;
  livemode: boolean;
  priceId: string | null;
  itemId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  /** Empresa indicada al crear el pago (metadata.company_id), si la hay. */
  metadataCompanyId: string | null;
}

export interface ProviderEvent {
  id: string;
  type: string;
  livemode: boolean;
  subscriptionId: string | null;
  customerId: string | null;
  /** Empresa indicada en la sesión de pago (client_reference_id), si la hay. */
  companyHint: string | null;
}

export interface ProviderPrice {
  id: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  livemode: boolean;
}

export interface CheckoutInput {
  companyId: string;
  customerId: string;
  plan: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingGateway {
  readonly provider: 'stripe';
  createCustomer(input: { companyId: string; name: string; email: string }): Promise<string>;
  createCheckoutSession(input: CheckoutInput): Promise<{ id: string; url: string }>;
  expireCheckoutSession(id: string): Promise<void>;
  retrievePrice(id: string): Promise<ProviderPrice>;
  retrieveSubscription(id: string): Promise<ProviderSubscription>;
  changeSubscriptionPrice(input: { subscriptionId: string; itemId: string; priceId: string; mode: 'upgrade' | 'downgrade'; idempotencyKey: string }): Promise<void>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Verifica la firma con el cuerpo ORIGINAL de la petición. Lanza WebhookSignatureError. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent;
}

/** Stripe no responde, rechaza la clave o devuelve un error: no se ha cambiado nada. */
export class BillingUnavailableError extends Error {
  constructor(
    readonly kind: 'connection' | 'authentication' | 'rate_limit' | 'invalid_request' | 'provider',
    message: string,
  ) {
    super(message);
    this.name = 'BillingUnavailableError';
  }
}

export class WebhookSignatureError extends Error {
  constructor() {
    super('Firma del webhook no válida');
    this.name = 'WebhookSignatureError';
  }
}

const toDate = (seconds: number | null | undefined) => (typeof seconds === 'number' ? new Date(seconds * 1000) : null);
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : (value?.id ?? null));

/** Normaliza una suscripción de Stripe (el periodo vive en el elemento de la suscripción). */
export function normalizeSubscription(sub: Stripe.Subscription): ProviderSubscription {
  const item = sub.items?.data?.[0];
  return {
    id: sub.id,
    customerId: idOf(sub.customer as string | { id: string })!,
    status: sub.status,
    livemode: sub.livemode,
    priceId: item?.price?.id ?? null,
    itemId: item?.id ?? null,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEnd: toDate(sub.trial_end),
    metadataCompanyId: sub.metadata?.company_id ?? null,
  };
}

/** Extrae de un evento solo lo necesario para localizar la suscripción a sincronizar. */
export function normalizeEvent(event: Stripe.Event): ProviderEvent {
  const object = event.data.object as unknown as Record<string, unknown>;
  let subscriptionId: string | null = null;
  let companyHint: string | null = null;
  if (event.type.startsWith('customer.subscription.')) {
    subscriptionId = (object.id as string) ?? null;
  } else if (event.type.startsWith('checkout.session.')) {
    subscriptionId = idOf(object.subscription as string | { id: string } | null);
    companyHint = (object.client_reference_id as string | null) ?? null;
  } else if (event.type.startsWith('invoice.')) {
    const parent = object.parent as { subscription_details?: { subscription?: string | { id: string } } } | null;
    subscriptionId = idOf(parent?.subscription_details?.subscription ?? null);
  }
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    subscriptionId,
    customerId: idOf(object.customer as string | { id: string } | null),
    companyHint,
  };
}

function mapStripeError(error: unknown): BillingUnavailableError {
  const type = (error as { type?: string })?.type;
  if (type === 'StripeConnectionError') return new BillingUnavailableError('connection', 'No se pudo conectar con Stripe');
  if (type === 'StripeAuthenticationError' || type === 'StripePermissionError') return new BillingUnavailableError('authentication', 'Stripe rechazó la clave configurada');
  if (type === 'StripeRateLimitError') return new BillingUnavailableError('rate_limit', 'Stripe limitó las peticiones');
  if (type === 'StripeInvalidRequestError') return new BillingUnavailableError('invalid_request', 'Stripe rechazó la petición');
  return new BillingUnavailableError('provider', 'Error de Stripe');
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapStripeError(error);
  }
}

export interface StripeGatewayOptions {
  /** Solo para pruebas: servidor HTTP local que imita la API (nunca la API real). */
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
}

export class StripeGateway implements BillingGateway {
  readonly provider = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(
    private readonly settings: NonNullable<AppConfig['billing']['stripe']>,
    options: StripeGatewayOptions = {},
  ) {
    // Defensa adicional a config.ts: nunca una clave live.
    if (!/^(sk|rk)_test_/.test(settings.secretKey)) throw new Error('Solo se admiten claves de prueba de Stripe');
    this.stripe = new Stripe(settings.secretKey, {
      maxNetworkRetries: 2,
      timeout: 15_000,
      appInfo: { name: 'Presupio' },
      ...(options.host ? { host: options.host } : {}),
      ...(options.port ? { port: options.port } : {}),
      ...(options.protocol ? { protocol: options.protocol } : {}),
    });
  }

  createCustomer(input: { companyId: string; name: string; email: string }): Promise<string> {
    return call(async () => {
      const customer = await this.stripe.customers.create(
        { name: input.name.slice(0, 256), email: input.email, metadata: { company_id: input.companyId }, preferred_locales: ['es'] },
        // Dos clics simultáneos no crean dos clientes.
        { idempotencyKey: `presupio-customer-${input.companyId}` },
      );
      return customer.id;
    });
  }

  createCheckoutSession(input: CheckoutInput): Promise<{ id: string; url: string }> {
    return call(async () => {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.companyId,
        // El precio sale de la configuración del servidor: el navegador solo eligió el plan.
        line_items: [{ price: input.priceId, quantity: 1 }],
        metadata: { company_id: input.companyId, plan: input.plan },
        subscription_data: { metadata: { company_id: input.companyId, plan: input.plan } },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        locale: 'es',
        // Sin cálculo automático de impuestos (decisión fiscal pendiente, docs/facturacion.md).
      });
      if (!session.url) throw new BillingUnavailableError('provider', 'Stripe no devolvió la dirección de pago');
      return { id: session.id, url: session.url };
    });
  }

  expireCheckoutSession(id: string): Promise<void> {
    return call(async () => {
      await this.stripe.checkout.sessions.expire(id);
    });
  }

  retrievePrice(id: string): Promise<ProviderPrice> {
    return call(async () => {
      const price = await this.stripe.prices.retrieve(id);
      return {
        id: price.id,
        active: price.active,
        currency: price.currency,
        unitAmount: price.unit_amount,
        interval: price.recurring?.interval ?? null,
        livemode: price.livemode,
      };
    });
  }

  retrieveSubscription(id: string): Promise<ProviderSubscription> {
    return call(async () => normalizeSubscription(await this.stripe.subscriptions.retrieve(id)));
  }

  changeSubscriptionPrice(input: { subscriptionId: string; itemId: string; priceId: string; mode: 'upgrade' | 'downgrade'; idempotencyKey: string }): Promise<void> {
    return call(async () => {
      await this.stripe.subscriptions.update(
        input.subscriptionId,
        input.mode === 'upgrade'
          ? {
              items: [{ id: input.itemId, price: input.priceId }],
              // Subida: se cobra ya la parte proporcional; si el cobro no se completa, Stripe
              // no aplica el cambio (y Presupio no sube el plan).
              proration_behavior: 'always_invoice',
              payment_behavior: 'pending_if_incomplete',
            }
          : {
              items: [{ id: input.itemId, price: input.priceId }],
              // Bajada: sin abonos por el periodo en curso; el precio nuevo se cobra en la
              // siguiente renovación y el límite de intentos del periodo actual se mantiene.
              proration_behavior: 'none',
            },
        { idempotencyKey: input.idempotencyKey },
      );
    });
  }

  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void> {
    return call(async () => {
      await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
    });
  }

  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    return call(async () => {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
        locale: 'es',
        ...(this.settings.portalConfigurationId ? { configuration: this.settings.portalConfigurationId } : {}),
      });
      return { url: session.url };
    });
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent {
    if (!signature) throw new WebhookSignatureError();
    let event: Stripe.Event;
    try {
      // Tolerancia de 5 minutos: protege de reenvíos de peticiones antiguas.
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.settings.webhookSecret, 300);
    } catch {
      throw new WebhookSignatureError();
    }
    return normalizeEvent(event);
  }
}

export function createBillingGateway(config: AppConfig): BillingGateway | null {
  return config.billing.enabled && config.billing.stripe ? new StripeGateway(config.billing.stripe) : null;
}
