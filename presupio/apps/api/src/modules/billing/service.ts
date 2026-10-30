import type { FastifyBaseLogger } from 'fastify';
import { sql } from 'kysely';
import type { AppConfig } from '../../config.js';
import { withTenant, type Db, type Trx } from '../../db/database.js';
import type { SubscriptionPlan, SubscriptionStatus } from '../../db/types.js';
import { accessEndedAt, dataRetentionUntil, hasActiveAccess, PLANS } from '../../domain/plans.js';
import { errors } from '../../lib/errors.js';
import type { AuthContext } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { ensureUsagePeriod, loadPlanContext } from '../usage/service.js';
import { BillingUnavailableError, STRIPE_CHECKOUT_URL, STRIPE_PORTAL_URL, type BillingGateway, type ProviderEvent } from './gateway.js';

/** Eventos de Stripe que sincronizan la suscripción. El resto se registra como ignorado. */
export const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
]);

/**
 * Estado de Stripe → estado de Presupio. Solo `active`, `trialing` (hasta su fin) y
 * `past_due` (durante los días de gracia) dan acceso. `incomplete` (primer pago sin completar)
 * nunca da acceso ni quita el que hubiera. `paused` se trata como impagada (sin acceso).
 */
export function mapProviderStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
    case 'paused':
      return 'unpaid';
    default:
      return 'incomplete'; // incomplete, incomplete_expired y cualquier estado desconocido
  }
}

export function planForPrice(config: AppConfig, priceId: string | null): SubscriptionPlan | null {
  const prices = config.billing.stripe?.prices;
  if (!prices || !priceId) return null;
  return (Object.entries(prices).find(([, id]) => id === priceId)?.[0] as SubscriptionPlan | undefined) ?? null;
}

export interface BillingDeps {
  db: Db;
  config: AppConfig;
  gateway: BillingGateway | null;
  log: FastifyBaseLogger;
}

function requireGateway(deps: BillingDeps): BillingGateway {
  if (!deps.config.billing.enabled || !deps.gateway) throw errors.paymentsDisabled();
  return deps.gateway;
}

/** Ejecuta una llamada a Stripe y traduce su indisponibilidad en un 503 sin detalles. */
async function provider<T>(deps: BillingDeps, action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      deps.log.error({ action, kind: error.kind }, 'Stripe no disponible');
      throw errors.paymentsUnavailable();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Estado para la interfaz
// ---------------------------------------------------------------------------

async function subscriptionRow(trx: Trx, companyId: string) {
  return trx
    .selectFrom('subscriptions as s')
    .innerJoin('companies as c', 'c.id', 's.companyId')
    .select([
      's.plan',
      's.status',
      's.trialEndsAt',
      's.pastDueSince',
      's.endedAt',
      's.currentPeriodStart',
      's.currentPeriodEnd',
      's.cancelAtPeriodEnd',
      's.providerCustomerId',
      's.providerSubscriptionId',
      'c.name as companyName',
      'c.createdAt',
    ])
    .where('s.companyId', '=', companyId)
    .executeTakeFirstOrThrow();
}

type SubscriptionRow = Awaited<ReturnType<typeof subscriptionRow>>;

/** ¿Tiene la empresa una suscripción de pago viva en el proveedor? */
export function hasLiveProviderSubscription(s: Pick<SubscriptionRow, 'providerSubscriptionId' | 'status' | 'endedAt'>): boolean {
  return !!s.providerSubscriptionId && ['active', 'past_due', 'trialing'].includes(s.status) && !s.endedAt;
}

export async function subscriptionView(trx: Trx, config: AppConfig, auth: Pick<AuthContext, 'companyId'>, now = new Date()) {
  const s = await subscriptionRow(trx, auth.companyId);
  const access = hasActiveAccess(s, now);
  const endedAt = accessEndedAt(s, now);
  return {
    plan: s.plan,
    status: s.status,
    trialEndsAt: s.trialEndsAt,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    pastDueSince: s.pastDueSince,
    hasActiveAccess: access,
    readOnly: !access,
    accessEndedAt: endedAt,
    // Fecha a partir de la cual los datos podrían borrarse (borrado manual con aviso previo).
    dataRetentionUntil: dataRetentionUntil(endedAt),
    planDetails: s.plan ? PLANS[s.plan] : null,
    paymentsEnabled: config.billing.enabled,
    managedByProvider: hasLiveProviderSubscription(s),
    hasBillingAccount: !!s.providerCustomerId,
    taxDisplay: config.billing.taxDisplay,
  };
}

export async function recentBillingEvents(trx: Trx, companyId: string) {
  return trx
    .selectFrom('billingEvents')
    .select(['id', 'eventType', 'outcome', 'subscriptionStatus', 'plan', 'createdAt'])
    .where('companyId', '=', companyId)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .execute();
}

// ---------------------------------------------------------------------------
// Acciones del propietario (el estado definitivo SIEMPRE llega por webhook)
// ---------------------------------------------------------------------------

const PRICE_CHECK_TTL_MS = 10 * 60_000;
const priceChecks = new Map<string, { ok: boolean; at: number }>();

/**
 * Antes de mandar a nadie a pagar, se comprueba que el precio configurado en Stripe es el que
 * Presupio muestra: mensual, en euros, con el mismo importe, activo y en modo de prueba.
 */
async function assertPriceMatchesCatalog(deps: BillingDeps, gateway: BillingGateway, plan: SubscriptionPlan, priceId: string) {
  const cached = priceChecks.get(priceId);
  if (cached && Date.now() - cached.at < PRICE_CHECK_TTL_MS && cached.ok) return;
  const price = await provider(deps, 'retrieve_price', () => gateway.retrievePrice(priceId));
  const def = PLANS[plan];
  const ok = price.active && !price.livemode && price.currency.toLowerCase() === def.currency.toLowerCase() && price.unitAmount === def.priceCents && price.interval === def.interval;
  priceChecks.set(priceId, { ok, at: Date.now() });
  if (!ok) {
    deps.log.error({ plan, priceId, currency: price.currency, unitAmount: price.unitAmount, interval: price.interval, livemode: price.livemode, active: price.active }, 'El precio de Stripe no coincide con el catálogo');
    throw errors.conflict('La configuración de precios no coincide con el plan publicado. No se ha iniciado ningún pago; avisa al equipo de Presupio.');
  }
}

export function resetPriceChecks() {
  priceChecks.clear();
}

export async function startCheckout(deps: BillingDeps, auth: AuthContext, plan: SubscriptionPlan) {
  const gateway = requireGateway(deps);
  const prices = deps.config.billing.stripe!.prices;
  const sub = await withCompany(deps.db, auth, (trx) => subscriptionRow(trx, auth.companyId));
  if (hasLiveProviderSubscription(sub)) {
    throw errors.conflict('Ya tienes una suscripción de pago. Para cambiar de plan usa «Cambiar a este plan».');
  }
  await assertPriceMatchesCatalog(deps, gateway, plan, prices[plan]);

  let customerId = sub.providerCustomerId;
  if (!customerId) {
    const created = await provider(deps, 'create_customer', () => gateway.createCustomer({ companyId: auth.companyId, name: sub.companyName, email: auth.email }));
    customerId = await withCompany(deps.db, auth, async (trx) => {
      const { rows } = await sql<{ id: string }>`select app_billing_link_customer(${created}) as id`.execute(trx);
      return rows[0]!.id;
    });
  }

  const base = `${deps.config.appWebUrl}/configuracion/plan`;
  const session = await provider(deps, 'create_checkout', () =>
    gateway.createCheckoutSession({
      companyId: auth.companyId,
      customerId: customerId!,
      plan,
      priceId: prices[plan],
      successUrl: `${base}?pago=confirmando`,
      cancelUrl: `${base}?pago=cancelado`,
    }),
  );
  // Solo la página de pago de Stripe (antes bastaba con https://, cualquier dominio).
  if (!STRIPE_CHECKOUT_URL.test(session.url)) {
    deps.log.error({ action: 'create_checkout' }, 'Stripe devolvió una dirección de pago inesperada');
    throw errors.paymentsUnavailable();
  }

  const previous = await withCompany(deps.db, auth, async (trx) => {
    const { rows } = await sql<{ previous: string | null }>`select app_billing_set_checkout_session(${session.id}) as previous`.execute(trx);
    await logActivity(trx, auth, { action: 'subscription.checkout_started', entityType: 'company', entityId: auth.companyId, metadata: { plan } });
    return rows[0]?.previous ?? null;
  });
  // Una sola sesión de pago abierta por empresa: la anterior se cierra (si ya no lo estaba).
  if (previous && previous !== session.id) {
    await gateway.expireCheckoutSession(previous).catch(() => deps.log.info({ action: 'expire_checkout' }, 'La sesión de pago anterior ya estaba cerrada'));
  }
  return { url: session.url };
}

async function liveSubscription(deps: BillingDeps, auth: AuthContext) {
  const sub = await withCompany(deps.db, auth, (trx) => subscriptionRow(trx, auth.companyId));
  if (!hasLiveProviderSubscription(sub)) throw errors.conflict('No tienes una suscripción de pago activa.');
  return sub as SubscriptionRow & { providerSubscriptionId: string };
}

export async function changePlan(deps: BillingDeps, auth: AuthContext, plan: SubscriptionPlan) {
  const gateway = requireGateway(deps);
  const sub = await liveSubscription(deps, auth);
  if (sub.status !== 'active') throw errors.conflict('Hay un pago pendiente. Actualiza el método de pago antes de cambiar de plan.');
  // Se lee el estado actual en Stripe (no el guardado) para no actuar sobre datos antiguos.
  const current = await provider(deps, 'retrieve_subscription', () => gateway.retrieveSubscription(sub.providerSubscriptionId));
  const currentPlan = planForPrice(deps.config, current.priceId);
  if (!current.itemId || !currentPlan) throw errors.conflict('No se puede identificar el plan actual en el proveedor de pagos. Contacta con soporte.');
  if (currentPlan === plan) throw errors.conflict('Ya tienes ese plan.');
  const priceId = deps.config.billing.stripe!.prices[plan];
  await assertPriceMatchesCatalog(deps, gateway, plan, priceId);
  const mode = PLANS[plan].priceCents > PLANS[currentPlan].priceCents ? 'upgrade' : 'downgrade';
  // Clave de idempotencia por minuto: un doble clic no genera dos cambios.
  const idempotencyKey = `presupio-change-${sub.providerSubscriptionId}-${plan}-${Math.floor(Date.now() / 60_000)}`;
  await provider(deps, 'change_plan', () => gateway.changeSubscriptionPrice({ subscriptionId: sub.providerSubscriptionId, itemId: current.itemId!, priceId, mode, idempotencyKey }));
  await withCompany(deps.db, auth, (trx) =>
    logActivity(trx, auth, { action: 'subscription.change_requested', entityType: 'company', entityId: auth.companyId, metadata: { from: currentPlan, to: plan, mode } }),
  );
  return {
    status: 'pending_confirmation' as const,
    mode,
    // Subida: el límite sube cuando Stripe confirma el cobro. Bajada: el límite de intentos se
    // mantiene hasta el final del periodo en curso; el precio nuevo se cobra en la renovación.
    limitAppliesFrom: mode === 'upgrade' ? ('confirmation' as const) : ('next_period' as const),
  };
}

export async function setCancellation(deps: BillingDeps, auth: AuthContext, cancel: boolean) {
  const gateway = requireGateway(deps);
  const sub = await liveSubscription(deps, auth);
  await provider(deps, cancel ? 'cancel' : 'resume', () => gateway.setCancelAtPeriodEnd(sub.providerSubscriptionId, cancel));
  await withCompany(deps.db, auth, (trx) =>
    logActivity(trx, auth, {
      action: cancel ? 'subscription.cancel_requested' : 'subscription.resume_requested',
      entityType: 'company',
      entityId: auth.companyId,
      metadata: { periodEnd: sub.currentPeriodEnd },
    }),
  );
  return { status: 'pending_confirmation' as const, accessUntil: cancel ? sub.currentPeriodEnd : null };
}

export async function openPortal(deps: BillingDeps, auth: AuthContext) {
  const gateway = requireGateway(deps);
  const sub = await withCompany(deps.db, auth, (trx) => subscriptionRow(trx, auth.companyId));
  if (!sub.providerCustomerId) throw errors.conflict('Todavía no tienes datos de pago en Presupio.');
  const session = await provider(deps, 'portal', () =>
    gateway.createPortalSession({ customerId: sub.providerCustomerId!, returnUrl: `${deps.config.appWebUrl}/configuracion/plan` }),
  );
  if (!STRIPE_PORTAL_URL.test(session.url)) {
    deps.log.error({ action: 'portal' }, 'Stripe devolvió una dirección de portal inesperada');
    throw errors.paymentsUnavailable();
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhooks: la única fuente del estado de pago
// ---------------------------------------------------------------------------

export type WebhookOutcome = 'applied' | 'ignored' | 'stale' | 'unmatched' | 'error' | 'duplicate_subscription' | 'duplicate';

async function recordEvent(db: Db, event: ProviderEvent, outcome: 'ignored' | 'unmatched' | 'error', detail: string): Promise<WebhookOutcome> {
  const { rows } = await sql<{ r: string }>`
    select app_billing_record_event(${event.id}, ${event.type}, ${event.customerId}, ${outcome}, ${detail}) as r`.execute(db);
  return rows[0]?.r === 'duplicate' ? 'duplicate' : outcome;
}

/**
 * Procesa un evento YA verificado. Para no depender del orden de llegada, no se usa el
 * contenido del evento: se lee la suscripción actual en Stripe y se aplica ese estado
 * (con su hora de lectura). Si Stripe no responde se lanza BillingUnavailableError y el
 * webhook responde 503 para que Stripe lo reintente; nada queda registrado a medias.
 */
export async function processWebhookEvent(deps: BillingDeps, event: ProviderEvent): Promise<WebhookOutcome> {
  const gateway = deps.gateway!;
  if (event.livemode) return recordEvent(deps.db, event, 'ignored', 'Evento en modo real: esta versión solo procesa el modo de prueba');
  if (!HANDLED_EVENTS.has(event.type)) return recordEvent(deps.db, event, 'ignored', 'Tipo de evento no utilizado');
  if (!event.subscriptionId) return recordEvent(deps.db, event, 'ignored', 'Evento sin suscripción');

  const syncedAt = new Date();
  const sub = await gateway.retrieveSubscription(event.subscriptionId);
  if (sub.livemode) return recordEvent(deps.db, event, 'ignored', 'Suscripción en modo real');
  const status = mapProviderStatus(sub.status);
  if (status === 'incomplete') return recordEvent(deps.db, { ...event, customerId: sub.customerId }, 'ignored', 'Suscripción pendiente del primer pago: no da acceso');
  const plan = planForPrice(deps.config, sub.priceId);
  if (!plan) {
    deps.log.error({ eventId: event.id, priceId: sub.priceId }, 'Precio de Stripe desconocido');
    return recordEvent(deps.db, { ...event, customerId: sub.customerId }, 'error', 'Precio desconocido: no corresponde a ningún plan configurado');
  }
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
    return recordEvent(deps.db, { ...event, customerId: sub.customerId }, 'error', 'La suscripción no tiene periodo de facturación');
  }
  const hint = event.companyHint ?? sub.metadataCompanyId;
  const validHint = hint && /^[0-9a-f-]{36}$/i.test(hint) ? hint : null;

  const { rows } = await sql<{ r: { outcome: WebhookOutcome; companyId: string | null } }>`
    select app_billing_apply_subscription(
      ${event.id}, ${event.type}, ${validHint}::uuid, ${sub.customerId}, ${sub.id},
      ${status}::subscription_status, ${plan}::subscription_plan, ${sub.priceId},
      ${sub.currentPeriodStart}, ${sub.currentPeriodEnd}, ${sub.cancelAtPeriodEnd},
      ${status === 'trialing' ? sub.trialEnd : null}, ${syncedAt}
    ) as r`.execute(deps.db);
  const result = rows[0]!.r;
  if (result.outcome === 'applied' && result.companyId) {
    // El periodo de uso se fija ya con el plan confirmado: una subida amplía el límite en el
    // acto y, si después hay una bajada, el periodo pagado conserva su límite hasta el final.
    const companyId = result.companyId;
    await withTenant(deps.db, { companyId, userId: null }, async (trx) => {
      const ctx = await loadPlanContext(trx, companyId, new Date());
      if (ctx.hasAccess && ctx.plan) await ensureUsagePeriod(trx, ctx, new Date());
    });
  }
  if (result.outcome === 'duplicate_subscription' || result.outcome === 'unmatched' || result.outcome === 'error') {
    deps.log.warn({ eventId: event.id, type: event.type, outcome: result.outcome }, 'Evento de facturación que requiere revisión');
  }
  return result.outcome;
}

function withCompany<T>(db: Db, auth: Pick<AuthContext, 'companyId' | 'userId'>, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return withTenant(db, { companyId: auth.companyId, userId: auth.userId }, fn);
}
