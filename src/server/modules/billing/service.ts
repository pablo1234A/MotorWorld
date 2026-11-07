import "server-only";

import { sql } from "kysely";
import type Stripe from "stripe";

import { PLANS, type PlanCode } from "@/lib/plans";
import type { OrgContext } from "@/server/auth/context";
import { assertOrgAdmin } from "@/server/auth/db-guards";
import { applySubscription } from "@/server/billing/apply";
import { assertTestMode, getStripe } from "@/server/billing/stripe";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Suscripción del taller con Stripe (modo TEST). Lo que ve y hace el
 * administrador: contratar con 7 días de prueba (tarjeta al empezar, sin
 * cobro hasta el final, una prueba por taller, P18), cambiar de plan (con
 * prorrateo, comprobando que cabe en el plan nuevo), portal de cliente
 * (tarjeta y facturas) y cancelar o reanudar al final del periodo.
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription"> & { user: { email: string } };
export type Interval = "month" | "year";

export const TRIAL_DAYS = 7;
const OPEN_STATUSES = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new DomainError("payments_not_configured");
  return stripe;
}

export interface BillingOverview {
  configured: boolean;
  subscription: {
    planCode: PlanCode;
    status: string;
    interval: Interval;
    stripeManaged: boolean;
    trialEnd: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    pastDueSince: Date | null;
    endedAt: Date | null;
  } | null;
  hasCustomer: boolean;
  trialEligible: boolean;
  dataRetentionUntil: string | null;
  prices: Array<{ planCode: PlanCode; interval: Interval }>;
  usage: { users: number; branches: number; customers: number; activeVehicles: number };
  invoices: Array<{ id: string; status: string; amountDueCents: number; amountPaidCents: number; currency: string; periodStart: Date | null; createdAt: Date; hostedUrl: string | null; pdfUrl: string | null }>;
}

async function usageOf(orgId: string) {
  return withSystem(async (tx) => {
    const { rows } = await sql<{ users: number; branches: number; customers: number; vehicles: number }>`
      select
        (select count(*)::int from organization_members where organization_id = ${orgId} and status = 'active')
          + (select count(*)::int from invitations where organization_id = ${orgId} and accepted_at is null and revoked_at is null and expires_at > now()) as users,
        (select count(*)::int from branches where organization_id = ${orgId} and status = 'active') as branches,
        (select count(*)::int from customers where organization_id = ${orgId} and deleted_at is null) as customers,
        (select count(*)::int from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active') as vehicles
    `.execute(tx);
    const r = rows[0];
    return { users: r.users, branches: r.branches, customers: r.customers, activeVehicles: r.vehicles };
  });
}

/** Lo que impide pasar a un plan (más usuarios, talleres, clientes o vehículos de los que admite). */
export function downgradeBlockers(plan: PlanCode, usage: BillingOverview["usage"]): string[] {
  const p = PLANS[plan];
  const out: string[] = [];
  if (p.maxUsers !== null && usage.users > p.maxUsers) out.push(`tienes ${usage.users} usuarios (contando invitaciones pendientes) y el plan ${p.name} admite ${p.maxUsers}`);
  if (p.maxBranches !== null && usage.branches > p.maxBranches) out.push(`tienes ${usage.branches} talleres y el plan ${p.name} admite ${p.maxBranches}`);
  if (p.maxCustomers !== null && usage.customers > p.maxCustomers) out.push(`tienes ${usage.customers} clientes y el plan ${p.name} admite ${p.maxCustomers}`);
  if (p.maxActiveVehicles !== null && usage.activeVehicles > p.maxActiveVehicles)
    out.push(`tienes ${usage.activeVehicles} vehículos activos y el plan ${p.name} admite ${p.maxActiveVehicles}`);
  return out;
}

export async function getOverview(ctx: Pick<Ctx, "auth" | "membership">): Promise<BillingOverview> {
  const orgId = ctx.membership.organizationId;
  const [sub, customer, invoices, prices, org, usage] = await Promise.all([
    withRls(ctx.auth, (tx) => tx.selectFrom("subscriptions").selectAll().where("organization_id", "=", orgId).executeTakeFirst()),
    withRls(ctx.auth, (tx) => tx.selectFrom("billing_customers").select("stripe_customer_id").where("organization_id", "=", orgId).executeTakeFirst()),
    withRls(ctx.auth, (tx) =>
      tx.selectFrom("billing_invoices").selectAll().where("organization_id", "=", orgId).where("status", "<>", "draft").orderBy("created_at", "desc").limit(24).execute(),
    ),
    withSystem((tx) => tx.selectFrom("billing_prices").select(["plan_code", "interval"]).where("livemode", "=", false).execute()),
    withRls(ctx.auth, (tx) => tx.selectFrom("organizations").select(sql<string | null>`data_retention_until::text`.as("retention")).where("id", "=", orgId).executeTakeFirst()),
    usageOf(orgId),
  ]);
  return {
    configured: getStripe() !== null,
    subscription: sub
      ? {
          planCode: sub.plan_code as PlanCode,
          status: sub.status,
          interval: sub.billing_interval as Interval,
          stripeManaged: Boolean(sub.stripe_subscription_id),
          trialEnd: sub.trial_end,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          pastDueSince: sub.past_due_since,
          endedAt: sub.ended_at,
        }
      : null,
    hasCustomer: Boolean(customer),
    // Una prueba por taller (P18): si ya tuvo una suscripción de Stripe o una prueba, no hay otra.
    trialEligible: !sub || (!sub.trial_start && !sub.stripe_subscription_id),
    dataRetentionUntil: org?.retention ?? null,
    prices: prices.map((p) => ({ planCode: p.plan_code as PlanCode, interval: p.interval as Interval })),
    usage,
    invoices: invoices.map((i) => ({
      id: i.stripe_invoice_id,
      status: i.status,
      amountDueCents: i.amount_due_cents,
      amountPaidCents: i.amount_paid_cents,
      currency: i.currency,
      periodStart: i.period_start,
      createdAt: i.created_at,
      hostedUrl: i.hosted_invoice_url,
      pdfUrl: i.invoice_pdf_url,
    })),
  };
}

async function priceId(plan: PlanCode, interval: Interval): Promise<string> {
  const row = await withSystem((tx) =>
    tx.selectFrom("billing_prices").select("stripe_price_id").where("plan_code", "=", plan).where("interval", "=", interval).where("livemode", "=", false).executeTakeFirst(),
  );
  if (!row) throw new DomainError("payments_not_configured", "prices");
  return row.stripe_price_id;
}

async function ensureCustomer(stripe: Stripe, ctx: Ctx): Promise<string> {
  const orgId = ctx.membership.organizationId;
  const existing = await withSystem((tx) => tx.selectFrom("billing_customers").select("stripe_customer_id").where("organization_id", "=", orgId).executeTakeFirst());
  if (existing) return existing.stripe_customer_id;
  const org = await withSystem((tx) =>
    tx.selectFrom("organizations").select(["trade_name", "legal_name", sql<string | null>`email::text`.as("email")]).where("id", "=", orgId).executeTakeFirstOrThrow(),
  );
  const customer = await stripe.customers.create(
    {
      name: org.legal_name ?? org.trade_name,
      email: org.email ?? ctx.user.email,
      preferred_locales: ["es"],
      metadata: { organization_id: orgId },
    },
    { idempotencyKey: `customer-${orgId}` },
  );
  assertTestMode(customer);
  await withSystem((tx) =>
    tx.insertInto("billing_customers").values({ organization_id: orgId, stripe_customer_id: customer.id, livemode: customer.livemode }).onConflict((oc) => oc.doNothing()).execute(),
  );
  return customer.id;
}

async function currentStripeSubscription(orgId: string) {
  return withSystem((tx) =>
    tx.selectFrom("subscriptions").select(["stripe_subscription_id", "status", "plan_code", "billing_interval"]).where("organization_id", "=", orgId).executeTakeFirst(),
  );
}

/** Página de pago de Stripe (Checkout). Devuelve la URL a la que redirigir. */
export async function startCheckout(ctx: Ctx, plan: PlanCode, interval: Interval, appUrl: string): Promise<string> {
  const stripe = requireStripe();
  await assertOrgAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  const current = await currentStripeSubscription(orgId);
  if (current?.stripe_subscription_id && OPEN_STATUSES.includes(current.status)) throw new DomainError("conflict", "subscription_exists");
  const blockers = downgradeBlockers(plan, await usageOf(orgId));
  if (blockers.length) throw new DomainError("validation_error", `plan_too_small:${blockers.join("; ")}`);

  const overview = await getOverview(ctx);
  const customer = await ensureCustomer(stripe, ctx);
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: orgId,
    line_items: [{ price: await priceId(plan, interval), quantity: 1 }],
    // Tarjeta al empezar y sin cobro hasta el final de la prueba (P18).
    payment_method_collection: "always",
    subscription_data: {
      metadata: { organization_id: orgId, plan_code: plan },
      ...(overview.trialEligible ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
    },
    metadata: { organization_id: orgId },
    locale: "es",
    allow_promotion_codes: false,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
    success_url: `${appUrl}/app/facturacion?pago=ok`,
    cancel_url: `${appUrl}/app/facturacion?pago=cancelado`,
  });
  assertTestMode(session);
  if (!session.url) throw new DomainError("internal_error");
  return session.url;
}

/** Portal de cliente de Stripe: tarjeta, datos de facturación y facturas. */
export async function openPortal(ctx: Ctx, appUrl: string): Promise<string> {
  const stripe = requireStripe();
  await assertOrgAdmin(ctx);
  const customer = await withSystem((tx) =>
    tx.selectFrom("billing_customers").select("stripe_customer_id").where("organization_id", "=", ctx.membership.organizationId).executeTakeFirst(),
  );
  if (!customer) throw new DomainError("not_found");
  const session = await stripe.billingPortal.sessions.create({ customer: customer.stripe_customer_id, return_url: `${appUrl}/app/facturacion`, locale: "es" });
  assertTestMode(session);
  return session.url;
}

async function updateAndApply(stripe: Stripe, subId: string, params: Stripe.SubscriptionUpdateParams, idempotencyKey: string): Promise<void> {
  const updated = await stripe.subscriptions.update(subId, params, { idempotencyKey });
  assertTestMode(updated);
  // Se refleja ya (el webhook llegará después y será idempotente).
  const outcome = await applySubscription(updated, new Date());
  if (outcome !== "applied") logger.warn("billing_apply_after_update", { outcome });
}

/** Cambio de plan o de periodicidad, con prorrateo. Bajar exige caber en el plan nuevo. */
export async function changePlan(ctx: Ctx, plan: PlanCode, interval: Interval): Promise<void> {
  const stripe = requireStripe();
  await assertOrgAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  const current = await currentStripeSubscription(orgId);
  if (!current?.stripe_subscription_id || !["trialing", "active", "past_due"].includes(current.status)) throw new DomainError("not_found");
  if (current.plan_code === plan && current.billing_interval === interval) return;
  const blockers = downgradeBlockers(plan, await usageOf(orgId));
  if (blockers.length) throw new DomainError("validation_error", `plan_too_small:${blockers.join("; ")}`);
  const sub = await stripe.subscriptions.retrieve(current.stripe_subscription_id);
  assertTestMode(sub);
  const item = sub.items.data[0];
  await updateAndApply(
    stripe,
    sub.id,
    { items: [{ id: item.id, price: await priceId(plan, interval) }], proration_behavior: "create_prorations", metadata: { organization_id: orgId, plan_code: plan } },
    `change-${sub.id}-${plan}-${interval}-${Date.now()}`,
  );
}

/** Cancelar al final del periodo (sigue teniendo acceso hasta entonces) o deshacerlo. */
export async function setCancelAtPeriodEnd(ctx: Ctx, cancel: boolean): Promise<void> {
  const stripe = requireStripe();
  await assertOrgAdmin(ctx);
  const current = await currentStripeSubscription(ctx.membership.organizationId);
  if (!current?.stripe_subscription_id || !["trialing", "active", "past_due"].includes(current.status)) throw new DomainError("not_found");
  await updateAndApply(stripe, current.stripe_subscription_id, { cancel_at_period_end: cancel }, `cancel-${current.stripe_subscription_id}-${cancel}-${Date.now()}`);
}

/** Proceso programado: vuelve a leer de Stripe las suscripciones (por si se perdió algún webhook). */
export async function reconcileSubscriptions(limit = 200): Promise<{ checked: number; applied: number; failed: number }> {
  const stats = { checked: 0, applied: 0, failed: 0 };
  const stripe = getStripe();
  if (!stripe) return stats;
  const subs = await withSystem((tx) =>
    tx
      .selectFrom("subscriptions")
      .select("stripe_subscription_id")
      .where("stripe_subscription_id", "is not", null)
      .where("status", "not in", ["canceled", "incomplete_expired"])
      .orderBy("updated_at")
      .limit(limit)
      .execute(),
  );
  for (const s of subs) {
    stats.checked++;
    try {
      const sub = await stripe.subscriptions.retrieve(s.stripe_subscription_id!);
      if ((await applySubscription(sub, new Date())) === "applied") stats.applied++;
    } catch (err) {
      stats.failed++;
      logger.warn("billing_reconcile_failed", { error: err });
    }
  }
  return stats;
}
