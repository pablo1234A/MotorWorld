import Stripe from "stripe";
import { BillingInterval, PlanCode, SubscriptionStatus, type Plan, type Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { env } from "../../env";
import { AppError } from "../../http/errors";
import { logger } from "../../logger";
import { audit } from "../audit";
import { sendSystemEmail } from "../../email/system-mailer";
import { TRIAL_DAYS, TRIAL_EMAIL_CAP } from "@/config/plans";
import { ensureUsageRow } from "./entitlements";

export type IntervalT = "month" | "year";

function priceFor(plan: Plan, interval: IntervalT) {
  const id = interval === "year" ? plan.stripeAnnualPriceId : plan.stripePriceId;
  if (!id)
    throw new AppError(
      "NOT_CONFIGURED",
      interval === "year" ? "El pago anual no está configurado para este plan." : "El plan no está vinculado a un precio de Stripe (ejecuta npm run stripe:setup).",
    );
  return id;
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new AppError("NOT_CONFIGURED", "Los pagos no están configurados en el servidor (falta STRIPE_SECRET_KEY).");
  client ??= new Stripe(key, { appInfo: { name: "Resenalo" }, maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

/** Instancia sin clave real, solo para verificar firmas de webhooks (no hace llamadas de red). */
const verifier = new Stripe("sk_webhook_verification_only");

const STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  canceled: SubscriptionStatus.CANCELED,
  paused: SubscriptionStatus.PAUSED,
};

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

// ───────────────────────────── Checkout / portal ─────────────────────────────

async function ensureStripeCustomer(businessId: string, ownerEmail: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (business.stripeCustomerId) return business.stripeCustomerId;
  const customer = await stripe().customers.create(
    {
      email: ownerEmail,
      name: business.legalName || business.name,
      metadata: { businessId },
      preferred_locales: ["es"],
      ...(business.addressLine
        ? { address: { line1: business.addressLine, city: business.city ?? undefined, postal_code: business.postalCode ?? undefined, country: business.country } }
        : {}),
    },
    { idempotencyKey: `customer-${businessId}` },
  );
  await prisma.business.update({ where: { id: businessId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Crea la sesión de Stripe Checkout. El precio se toma SIEMPRE del plan en
 * servidor (nunca de la petición), así que manipular el frontend no tiene efecto.
 */
export async function createCheckoutSession(p: { businessId: string; ownerEmail: string; planCode: PlanCode; interval?: IntervalT; returnTo?: "onboarding" | "billing" }) {
  const plan = await prisma.plan.findUnique({ where: { code: p.planCode } });
  if (!plan || !plan.active) throw new AppError("NOT_FOUND", "Plan no disponible");
  const priceId = priceFor(plan, p.interval ?? "month");
  const business = await prisma.business.findUniqueOrThrow({ where: { id: p.businessId } });
  // Prueba gratuita: solo una vez por negocio.
  const trial = !business.trialUsedAt;
  const existing = await prisma.subscription.findUnique({ where: { businessId: p.businessId } });
  if (existing && !(["CANCELED", "INCOMPLETE_EXPIRED", "INCOMPLETE"] as SubscriptionStatus[]).includes(existing.status))
    throw new AppError("CONFLICT", "Ya tienes una suscripción. Usa «Cambiar de plan» o el portal de facturación.");

  const customerId = await ensureStripeCustomer(p.businessId, p.ownerEmail);
  const automaticTax = env().STRIPE_AUTOMATIC_TAX === "true";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: p.businessId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
        ...(!automaticTax && env().STRIPE_TAX_RATE_ID ? { tax_rates: [env().STRIPE_TAX_RATE_ID!] } : {}),
      },
    ],
    automatic_tax: { enabled: automaticTax },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
    locale: "es",
    allow_promotion_codes: false,
    payment_method_collection: "always",
    subscription_data: {
      metadata: { businessId: p.businessId, planCode: plan.code },
      ...(trial ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } } : {}),
    },
    ...(trial ? { custom_text: { submit: { message: `Hoy no se te cobra nada. La prueba dura ${TRIAL_DAYS} días (hasta ${TRIAL_EMAIL_CAP} correos) y puedes cancelarla en cualquier momento antes de que termine.` } } } : {}),
    metadata: { businessId: p.businessId, planCode: plan.code },
    success_url: `${env().APP_URL}${p.returnTo === "onboarding" ? "/onboarding" : "/app/facturacion"}?checkout=ok`,
    cancel_url: `${env().APP_URL}${p.returnTo === "onboarding" ? "/onboarding" : "/app/facturacion"}?checkout=cancelado`,
  });
  if (!session.url) throw new AppError("PROVIDER_ERROR", "Stripe no devolvió la URL de pago.");
  return session.url;
}

export async function createPortalSession(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (!b.stripeCustomerId) throw new AppError("NOT_FOUND", "Todavía no tienes datos de facturación.");
  const s = await stripe().billingPortal.sessions.create({ customer: b.stripeCustomerId, return_url: `${env().APP_URL}/app/facturacion`, locale: "es" });
  return s.url;
}

/**
 * Marca para sincronizaciones locales tras una llamada a Stripe: el segundo (truncado, como
 * `event.created`) en que se lanzó la petición. Los webhooks de ese cambio tienen created ≥ esta
 * marca y se aplican; los de eventos anteriores que lleguen tarde se descartan.
 */
const stripeSecond = () => new Date(Math.floor(Date.now() / 1000) * 1000);

/** Cambio de plan con prorrateo (Stripe calcula el importe proporcional). */
export async function changePlan(businessId: string, planCode: PlanCode, userId: string, interval?: IntervalT) {
  const sub = await prisma.subscription.findUnique({ where: { businessId }, include: { plan: true } });
  if (!sub || !(["ACTIVE", "TRIALING"] as SubscriptionStatus[]).includes(sub.status))
    throw new AppError("CONFLICT", "Necesitas una suscripción activa para cambiar de plan.");
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan no disponible.");
  const targetInterval: IntervalT = interval ?? (sub.billingInterval === BillingInterval.YEAR ? "year" : "month");
  const newPrice = priceFor(plan, targetInterval);
  if (newPrice === sub.stripePriceId) throw new AppError("CONFLICT", "Ya estás en ese plan.");
  const remote = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId);
  const item = remote.items.data[0];
  const requestedAt = stripeSecond();
  const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, {
    items: [{ id: item.id, price: newPrice }],
    proration_behavior: "always_invoice",
    payment_behavior: "pending_if_incomplete",
    cancel_at_period_end: false,
    metadata: { businessId, planCode: plan.code },
  });
  await syncSubscription(updated, requestedAt);
  await audit({ action: "billing.plan_changed", userId, businessId, meta: { from: sub.plan.code, to: plan.code, interval: targetInterval } });
}

export async function setCancelAtPeriodEnd(businessId: string, cancel: boolean, userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { businessId } });
  if (!sub) throw new AppError("NOT_FOUND", "No tienes suscripción.");
  const requestedAt = stripeSecond();
  const updated = await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: cancel });
  await syncSubscription(updated, requestedAt);
  await audit({ action: cancel ? "billing.cancel_scheduled" : "billing.cancel_reverted", userId, businessId });
}

export async function listStripeInvoices(businessId: string) {
  return prisma.invoice.findMany({ where: { businessId }, orderBy: { issuedAt: "desc" }, take: 36 });
}

// ───────────────────────────── Webhooks ─────────────────────────────

export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("NOT_CONFIGURED", "STRIPE_WEBHOOK_SECRET no configurado");
  if (!signature) throw new AppError("BAD_REQUEST", "Falta la firma de Stripe");
  try {
    return verifier.webhooks.constructEvent(rawBody, signature, secret, 300);
  } catch {
    throw new AppError("BAD_REQUEST", "Firma de webhook no válida");
  }
}

function periodOf(sub: Stripe.Subscription) {
  // API ≥ 2025-03-31 (basil/clover): el periodo vive en los items.
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined;
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  if (!start || !end) throw new Error("Suscripción sin periodo de facturación");
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}

async function resolveBusinessId(sub: Stripe.Subscription) {
  if (sub.metadata?.businessId) {
    const b = await prisma.business.findUnique({ where: { id: sub.metadata.businessId }, select: { id: true } });
    if (b) return b.id;
  }
  const customerId = idOf(sub.customer);
  if (customerId) {
    const b = await prisma.business.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
    if (b) return b.id;
  }
  return null;
}

/**
 * Sincroniza la suscripción local con el objeto de Stripe. Ignora eventos más
 * antiguos que el último aplicado (los webhooks pueden llegar desordenados).
 */
export async function syncSubscription(sub: Stripe.Subscription, eventCreated: Date | null) {
  const businessId = await resolveBusinessId(sub);
  if (!businessId) {
    logger.warn({ sub: sub.id }, "suscripción de Stripe sin negocio asociado");
    return null;
  }
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = priceId ? await prisma.plan.findFirst({ where: { OR: [{ stripePriceId: priceId }, { stripeAnnualPriceId: priceId }] } }) : null;
  if (!plan) throw new Error(`Precio de Stripe desconocido: ${priceId}`);
  const billingInterval = plan.stripeAnnualPriceId === priceId || sub.items.data[0]?.price?.recurring?.interval === "year" ? BillingInterval.YEAR : BillingInterval.MONTH;
  const { start, end } = periodOf(sub);
  const status = STATUS_MAP[sub.status];

  const current = await prisma.subscription.findUnique({ where: { businessId } });
  // Se compara con el último evento aplicado aunque sea de otra suscripción: un evento tardío de una
  // suscripción antigua (incluso en estado "active") no debe sustituir a la vigente.
  if (eventCreated && current && current.lastStripeEventAt && current.lastStripeEventAt > eventCreated) {
    logger.info({ sub: sub.id }, "evento de Stripe obsoleto ignorado");
    return current;
  }
  // Un evento tardío de OTRA suscripción (p. ej. un intento previo que pasa a incomplete_expired
  // o una suscripción antigua cancelada) no debe sustituir a la vigente.
  const TERMINAL: SubscriptionStatus[] = [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED];
  if (
    current &&
    current.stripeSubscriptionId !== sub.id &&
    !TERMINAL.includes(current.status) &&
    status !== SubscriptionStatus.ACTIVE &&
    status !== SubscriptionStatus.TRIALING
  ) {
    logger.info({ sub: sub.id, current: current.stripeSubscriptionId }, "evento de una suscripción no vigente ignorado");
    return current;
  }
  const data = {
    planId: plan.id,
    status,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    billingInterval,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    // Sin marca: no adelanta la del último evento, para no descartar webhooks posteriores.
    lastStripeEventAt: eventCreated ?? (current?.stripeSubscriptionId === sub.id ? current.lastStripeEventAt : null),
  };
  const saved = await prisma.$transaction(async (tx) => {
    const s = await tx.subscription.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
    if (sub.trial_end) await tx.business.updateMany({ where: { id: businessId, trialUsedAt: null }, data: { trialUsedAt: new Date() } });
    // Fila de consumo de la ventana vigente (nueva en cada renovación o mes → contador a cero);
    // se reaplican los límites por si cambió el plan o terminó la prueba.
    await ensureUsageRow(tx, s, plan, true);
    return s;
  });
  return saved;
}

async function upsertInvoice(inv: Stripe.Invoice) {
  const customerId = idOf(inv.customer);
  const business = customerId ? await prisma.business.findUnique({ where: { stripeCustomerId: customerId } }) : null;
  const tax = (inv.total_taxes ?? []).reduce((acc, t) => acc + (t.amount ?? 0), 0);
  const subtotalExcl = inv.total_excluding_tax ?? inv.total - tax;
  const data = {
    businessId: business?.id ?? null,
    number: inv.number ?? null,
    status: inv.status ?? "draft",
    currency: inv.currency,
    subtotalCents: subtotalExcl,
    taxCents: tax,
    totalCents: inv.total,
    amountPaidCents: inv.amount_paid ?? 0,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdfUrl: inv.invoice_pdf ?? null,
    periodStart: inv.lines?.data?.[0]?.period?.start ? new Date(inv.lines.data[0].period.start * 1000) : null,
    periodEnd: inv.lines?.data?.[0]?.period?.end ? new Date(inv.lines.data[0].period.end * 1000) : null,
    issuedAt: new Date((inv.status_transitions?.finalized_at ?? inv.created) * 1000),
    customerSnapshot: {
      name: inv.customer_name ?? null,
      email: inv.customer_email ?? null,
      address: (inv.customer_address as unknown as Prisma.InputJsonValue) ?? null,
      taxIds: (inv.customer_tax_ids as unknown as Prisma.InputJsonValue) ?? [],
    } as Prisma.InputJsonValue,
  };
  await prisma.invoice.upsert({ where: { stripeInvoiceId: inv.id! }, create: { stripeInvoiceId: inv.id!, ...data }, update: data });
  return business;
}

/**
 * Procesa un evento verificado de Stripe de forma idempotente
 * (registro en billing_events con stripeEventId único).
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const existing = await prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } });
  if (existing?.processedAt) return "duplicate";
  const record =
    existing ??
    (await prisma.billingEvent
      .create({ data: { stripeEventId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue } })
      .catch(async () => prisma.billingEvent.findUniqueOrThrow({ where: { stripeEventId: event.id } })));
  if (record.processedAt) return "duplicate";

  const created = new Date(event.created * 1000);
  let businessId: string | null = null;
  let handled = true;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.client_reference_id) {
          businessId = s.client_reference_id;
          const customerId = idOf(s.customer);
          if (customerId) await prisma.business.updateMany({ where: { id: s.client_reference_id, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
          // El estado definitivo llega en customer.subscription.created/updated.
          const subId = idOf(s.subscription);
          if (subId && env().STRIPE_SECRET_KEY) {
            const sub = await stripe().subscriptions.retrieve(subId);
            await syncSubscription(sub, created);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        const saved = await syncSubscription(sub, created);
        businessId = saved?.businessId ?? null;
        if (saved) await audit({ action: `billing.${event.type.replace("customer.", "")}`, businessId, meta: { status: saved.status } });
        break;
      }
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const bId = await resolveBusinessId(sub);
        businessId = bId;
        const b = bId ? await prisma.business.findUnique({ where: { id: bId }, include: { owner: true } }) : null;
        if (b && sub.trial_end)
          await sendSystemEmail({
            to: b.owner.email,
            subject: "Tu prueba gratuita de Reseñalo termina pronto",
            heading: "Tu prueba termina en 3 días",
            paragraphs: [
              `El ${new Date(sub.trial_end * 1000).toLocaleDateString("es-ES", { dateStyle: "long" })} se activará tu suscripción y se realizará el primer cobro.`,
              "Si quieres seguir, no tienes que hacer nada. Si no, puedes cancelarla antes de esa fecha sin coste.",
            ],
            action: { label: "Gestionar mi suscripción", url: `${env().APP_URL}/app/facturacion` },
          }).catch(() => undefined);
        break;
      }
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.voided":
      case "invoice.marked_uncollectible": {
        const inv = event.data.object as Stripe.Invoice;
        const b = await upsertInvoice(inv);
        businessId = b?.id ?? null;
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const b = await upsertInvoice(inv);
        businessId = b?.id ?? null;
        if (b) {
          await audit({ action: "billing.payment_failed", businessId: b.id, meta: { invoice: inv.id ?? null, attempt: inv.attempt_count ?? null } });
          const owner = await prisma.user.findUnique({ where: { id: b.ownerId } });
          if (owner)
            await sendSystemEmail({
              to: owner.email,
              subject: "No hemos podido cobrar tu suscripción de Reseñalo",
              heading: "Pago fallido",
              paragraphs: [
                "Tu banco ha rechazado el último cobro de la suscripción. Mientras el pago esté pendiente, los envíos automáticos quedan en pausa.",
                "Actualiza tu método de pago para reanudar el servicio. Stripe volverá a intentar el cobro automáticamente.",
              ],
              action: { label: "Actualizar método de pago", url: `${env().APP_URL}/app/facturacion` },
            }).catch(() => undefined);
        }
        break;
      }
      default:
        handled = false;
    }
    await prisma.billingEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), businessId, error: null } });
    return handled ? "processed" : "ignored";
  } catch (err) {
    await prisma.billingEvent.update({ where: { id: record.id }, data: { error: (err as Error).message.slice(0, 1000) } });
    throw err; // Stripe reintentará el webhook
  }
}

export { STATUS_MAP };
