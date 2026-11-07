import "server-only";

import { sql } from "kysely";
import type Stripe from "stripe";

import { withSystem } from "@/server/db/client";
import { logger } from "@/server/logger";

import { notifyBilling } from "./notify";
import { assertTestMode, getStripe, LiveModeBlockedError } from "./stripe";

/**
 * Stripe → base de datos. Stripe es la fuente de verdad de la suscripción;
 * aquí se refleja (solo con la conexión del sistema):
 *  - idempotente: cada evento se procesa una vez (stripe_events);
 *  - sin retroceder: un evento más antiguo que el último aplicado se ignora
 *    (subscriptions.last_stripe_event_at);
 *  - modo TEST: un objeto live se rechaza (assertTestMode).
 * El acceso (plan y límites) lo calcula la BD a partir de esta fila
 * (app.subscription_is_active: 7 días de gracia en impago, P7).
 */

const STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]);
/** Conservación de los datos tras la baja (P9). */
export const RETENTION_DAYS = 60;

const ts = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export type ApplyOutcome = "applied" | "stale" | "unknown_org" | "unknown_price" | "other_subscription";

async function orgForCustomer(customerId: string | null, metadataOrg: string | undefined): Promise<string | null> {
  return withSystem(async (tx) => {
    if (customerId) {
      const byCustomer = await tx.selectFrom("billing_customers").select("organization_id").where("stripe_customer_id", "=", customerId).executeTakeFirst();
      if (byCustomer) return byCustomer.organization_id;
    }
    if (metadataOrg && /^[0-9a-f-]{36}$/i.test(metadataOrg)) {
      const org = await tx.selectFrom("organizations").select("id").where("id", "=", metadataOrg).executeTakeFirst();
      if (org && customerId) {
        await tx
          .insertInto("billing_customers")
          .values({ organization_id: org.id, stripe_customer_id: customerId, livemode: false })
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
      return org?.id ?? null;
    }
    return null;
  });
}

export async function applySubscription(sub: Stripe.Subscription, eventCreated: Date | null): Promise<ApplyOutcome> {
  assertTestMode(sub);
  if (!STATUSES.has(sub.status)) throw new Error(`stripe_status_unknown:${sub.status}`);
  const orgId = await orgForCustomer(idOf(sub.customer), sub.metadata?.organization_id);
  if (!orgId) return "unknown_org";

  const item = sub.items.data[0];
  const priceId = item?.price.id;
  const price = priceId
    ? await withSystem((tx) => tx.selectFrom("billing_prices").select(["plan_code", "interval"]).where("stripe_price_id", "=", priceId).executeTakeFirst())
    : undefined;
  if (!price) return "unknown_price";

  // Desde la API 2025-03-31 el periodo vive en los elementos; antes, en la suscripción.
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const periodStart = ts((item as unknown as { current_period_start?: number }).current_period_start ?? legacy.current_period_start);
  const periodEnd = ts((item as unknown as { current_period_end?: number }).current_period_end ?? legacy.current_period_end);
  const eventAt = eventCreated ?? new Date();

  return withSystem(async (tx) => {
    const current = await tx
      .selectFrom("subscriptions")
      .select(["stripe_subscription_id", "status", "past_due_since", "last_stripe_event_at"])
      .where("organization_id", "=", orgId)
      .forUpdate()
      .executeTakeFirst();
    // Eventos de una suscripción anterior (p. ej. la vieja que se borra tras contratar otra).
    if (current?.stripe_subscription_id && current.stripe_subscription_id !== sub.id && !["canceled", "incomplete_expired"].includes(current.status)) {
      return "other_subscription";
    }
    if (current?.last_stripe_event_at && current.stripe_subscription_id === sub.id && eventAt < current.last_stripe_event_at) return "stale";

    const pastDueSince = sub.status === "past_due" ? (current?.status === "past_due" && current.past_due_since ? current.past_due_since : eventAt) : null;
    const values = {
      plan_code: price.plan_code,
      status: sub.status,
      billing_interval: price.interval,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      trial_start: ts(sub.trial_start),
      trial_end: ts(sub.trial_end),
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end || Boolean(sub.cancel_at),
      canceled_at: ts(sub.canceled_at),
      ended_at: ts(sub.ended_at),
      past_due_since: pastDueSince,
      livemode: sub.livemode,
      last_stripe_event_at: eventAt,
    };
    await tx
      .insertInto("subscriptions")
      .values({ organization_id: orgId, ...values })
      .onConflict((oc) => oc.column("organization_id").doUpdateSet(values))
      .execute();

    // Baja definitiva: los datos se conservan 60 días (P9). Si vuelve, se anula.
    const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
    await tx
      .updateTable("organizations")
      .set({ data_retention_until: ended ? sql<string>`(coalesce(${ts(sub.ended_at)}::timestamptz, now()) + make_interval(days => ${RETENTION_DAYS}))::date` : null })
      .where("id", "=", orgId)
      .execute();
    return "applied";
  });
}

export async function applyInvoice(inv: Stripe.Invoice): Promise<ApplyOutcome> {
  assertTestMode(inv);
  if (!inv.id) return "stale";
  const orgId = await orgForCustomer(idOf(inv.customer), inv.metadata?.organization_id);
  if (!orgId) return "unknown_org";
  const status = inv.status ?? "draft";
  if (!["draft", "open", "paid", "uncollectible", "void"].includes(status)) return "stale";
  const values = {
    status,
    amount_due_cents: inv.amount_due,
    amount_paid_cents: inv.amount_paid,
    currency: inv.currency,
    period_start: ts(inv.period_start),
    period_end: ts(inv.period_end),
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf_url: inv.invoice_pdf ?? null,
    livemode: inv.livemode,
  };
  await withSystem((tx) =>
    tx
      .insertInto("billing_invoices")
      .values({ organization_id: orgId, stripe_invoice_id: inv.id!, ...values })
      .onConflict((oc) => oc.column("stripe_invoice_id").doUpdateSet(values))
      .execute(),
  );
  return "applied";
}

/** checkout.session.completed: vincula cliente y taller y trae la suscripción. */
async function applyCheckout(session: Stripe.Checkout.Session, eventCreated: Date): Promise<ApplyOutcome> {
  assertTestMode(session);
  const orgId = await orgForCustomer(idOf(session.customer), session.client_reference_id ?? session.metadata?.organization_id);
  if (!orgId) return "unknown_org";
  const subId = idOf(session.subscription as string | { id: string } | null);
  const stripe = getStripe();
  if (subId && stripe) return applySubscription(await stripe.subscriptions.retrieve(subId), eventCreated);
  return "applied";
}

export type EventOutcome = ApplyOutcome | "duplicate" | "ignored" | "livemode_blocked";

/** Procesa un evento de Stripe ya verificado (firma) una sola vez. */
export async function processStripeEvent(event: Stripe.Event): Promise<EventOutcome> {
  const claimed = await withSystem(async (tx) => {
    const { rows } = await sql<{ status: string }>`
      insert into stripe_events (id, type, livemode) values (${event.id}, ${event.type}, ${event.livemode})
      on conflict (id) do update set status = 'received', error = null
        where stripe_events.status = 'failed'
      returning status
    `.execute(tx);
    return rows.length > 0;
  });
  if (!claimed) return "duplicate";

  const finish = (status: "processed" | "ignored" | "failed", error?: string) =>
    withSystem((tx) =>
      tx
        .updateTable("stripe_events")
        .set({ status, error: error?.slice(0, 1000) ?? null, processed_at: new Date() })
        .where("id", "=", event.id)
        .execute(),
    );

  try {
    assertTestMode(event);
    const created = new Date(event.created * 1000);
    let outcome: EventOutcome;
    switch (event.type) {
      case "checkout.session.completed":
        outcome = await applyCheckout(event.data.object, created);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        outcome = await applySubscription(event.data.object, created);
        break;
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        assertTestMode(sub);
        const orgId = await orgForCustomer(idOf(sub.customer), sub.metadata?.organization_id);
        if (orgId) await notifyBilling(orgId, "trial_ending", ts(sub.trial_end)).catch((err) => logger.error("billing_notify_failed", { error: err }));
        outcome = orgId ? "applied" : "unknown_org";
        break;
      }
      case "invoice.payment_failed": {
        outcome = await applyInvoice(event.data.object);
        const orgId = outcome === "applied" ? await orgForCustomer(idOf(event.data.object.customer), undefined) : null;
        if (orgId) await notifyBilling(orgId, "payment_failed", null).catch((err) => logger.error("billing_notify_failed", { error: err }));
        break;
      }
      case "invoice.created":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.voided":
      case "invoice.marked_uncollectible":
        outcome = await applyInvoice(event.data.object);
        break;
      default:
        outcome = "ignored";
    }
    await finish(outcome === "applied" || outcome === "stale" || outcome === "other_subscription" ? "processed" : "ignored", outcome === "applied" ? undefined : outcome);
    if (outcome === "unknown_org" || outcome === "unknown_price") logger.warn("stripe_event_unmatched", { type: event.type, outcome });
    return outcome;
  } catch (err) {
    if (err instanceof LiveModeBlockedError) {
      logger.error("stripe_livemode_blocked", { type: event.type });
      await finish("ignored", "livemode_blocked");
      return "livemode_blocked";
    }
    await finish("failed", (err as Error).message);
    throw err;
  }
}
