import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import type { ProductRow, SubscriptionRow } from "@/lib/db/types";
import { audit, logError } from "@/lib/observability";
import { sendEmail } from "@/lib/email/send";
import { generateDocuments } from "@/lib/documents/service";
import { resolveActiveTemplate } from "@/lib/documents/templates-repo";
import { formatPrice } from "./entitlements";
import { customerId, getStripe, invoiceSubscriptionId, subscriptionPeriod, toIso } from "./stripe";

/**
 * Lógica de cumplimiento de pagos. Todas las funciones son idempotentes
 * (upserts sobre identificadores únicos de Stripe) y obtienen el estado
 * autoritativo desde la API de Stripe, de modo que el orden de llegada de los
 * webhooks no altera el resultado.
 */

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(iso)) : "";

async function orgForCustomer(stripeCustomerId: string | null): Promise<{ id: string; owner_email: string | null; owner_id: string } | null> {
  if (!stripeCustomerId) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("organizations")
    .select("id, owner_id, profiles!organizations_owner_id_fkey(email)")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (!data) return null;
  const profile = data.profiles as unknown as { email: string } | null;
  return { id: data.id as string, owner_id: data.owner_id as string, owner_email: profile?.email ?? null };
}

async function productByPrice(priceId: string | null | undefined): Promise<ProductRow | null> {
  if (!priceId) return null;
  const { data } = await createAdminClient().from("products").select("*").eq("stripe_price_id", priceId).maybeSingle();
  return (data as ProductRow) ?? null;
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
export async function fulfillCheckoutSession(sessionId: string): Promise<{ status: "paid" | "pending" | "ignored"; organizationId?: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
  const org = await orgForCustomer(customerId(session.customer));
  const metaOrg = session.metadata?.organization_id;

  // El cliente de Stripe debe pertenecer a la organización indicada al crear la sesión.
  if (!org || (metaOrg && metaOrg !== org.id)) {
    await logError("billing.fulfill", new Error("Sesión de checkout sin organización coherente"), { sessionId, metaOrg });
    return { status: "ignored" };
  }

  if (session.mode === "subscription") {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subId) await syncSubscription(subId);
    return { status: session.status === "complete" ? "paid" : "pending", organizationId: org.id };
  }

  if (session.mode !== "payment") return { status: "ignored" };
  if (session.payment_status !== "paid") return { status: "pending", organizationId: org.id };

  const db = createAdminClient();
  const priceId = session.line_items?.data?.[0]?.price?.id;
  const product = await productByPrice(priceId);
  if (!product) {
    await logError("billing.fulfill", new Error("Precio de Stripe sin producto asociado"), { sessionId, priceId });
    return { status: "ignored" };
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Inserción condicional: un reintento nunca sobrescribe un pago ya reembolsado o disputado.
  await db
    .from("payments")
    .upsert(
      {
        organization_id: org.id,
        product_id: product.id,
        kind: "one_time",
        status: "succeeded",
        amount_cents: session.amount_total ?? product.price_cents,
        currency: session.currency ?? product.currency,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true },
    );
  const { data: payment, error: payErr } = await db
    .from("payments")
    .select("id, status")
    .eq("stripe_checkout_session_id", session.id)
    .single();
  if (payErr) throw payErr;

  // Si ya fue reembolsado antes de procesar (eventos desordenados) no se reactiva.
  if (payment.status !== "succeeded") return { status: "ignored", organizationId: org.id };

  // Compra con versiones de plantilla congeladas en este momento.
  const locked: Record<string, string> = {};
  for (const t of product.included_document_types) {
    try {
      locked[t] = (await resolveActiveTemplate(db, t)).versionId;
    } catch {
      // Sin plantilla disponible: se resolverá en la generación y quedará registrado el error.
    }
  }
  const { data: purchase, error: purErr } = await db
    .from("purchases")
    .upsert(
      {
        organization_id: org.id,
        product_id: product.id,
        payment_id: payment.id,
        document_types: product.included_document_types,
        template_version_ids: locked,
        generations_limit: product.generations_limit,
      },
      { onConflict: "payment_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (purErr) throw purErr;
  const purchaseId =
    purchase?.id ?? ((await db.from("purchases").select("id").eq("payment_id", payment.id).single()).data?.id as string);

  await audit({ actorType: "stripe", action: "purchase.completed", entityType: "purchase", entityId: purchaseId, organizationId: org.id, metadata: { session: session.id } });

  if (org.owner_email) {
    await sendEmail({
      key: `purchase_confirmed:${payment.id}`,
      to: org.owner_email,
      email: { template: "purchase_confirmed", data: { productName: product.name, amount: formatPrice(session.amount_total ?? product.price_cents, session.currency ?? "eur") } },
      userId: org.owner_id,
      organizationId: org.id,
    });
  }

  await tryInitialGeneration(org.id, `purchase:${purchaseId}:initial`, org.owner_email, purchaseId);
  return { status: "paid", organizationId: org.id };
}

async function tryInitialGeneration(organizationId: string, batchKey: string, email: string | null, purchaseId?: string) {
  try {
    await generateDocuments({ organizationId, userId: null, batchKey, purchaseId, notifyEmail: email });
  } catch (e) {
    // No interrumpe el webhook: el cliente puede generar desde su panel y el error queda registrado.
    await logError("billing.initial_generation", e, { organizationId, batchKey });
  }
}

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------
export async function syncSubscription(subscriptionId: string): Promise<SubscriptionRow | null> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const db = createAdminClient();
  const cust = customerId(sub.customer)!;
  const org = await orgForCustomer(cust);
  const price = sub.items.data[0]?.price;
  const product = await productByPrice(price?.id);
  const period = subscriptionPeriod(sub);

  const { data: previous } = await db.from("subscriptions").select("*").eq("stripe_subscription_id", sub.id).maybeSingle();

  const row = {
    organization_id: org?.id ?? null,
    product_id: product?.id ?? null,
    stripe_subscription_id: sub.id,
    stripe_customer_id: cust,
    stripe_price_id: price?.id ?? null,
    status: sub.status,
    amount_cents: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    billing_interval: price?.recurring?.interval ?? null,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: toIso(sub.cancel_at),
    canceled_at: toIso(sub.canceled_at),
    ended_at: toIso(sub.ended_at),
    trial_end: toIso(sub.trial_end),
    latest_invoice_id: typeof sub.latest_invoice === "string" ? sub.latest_invoice : (sub.latest_invoice?.id ?? null),
  };
  const { data: saved, error } = await db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" }).select("*").single();
  if (error) throw error;
  const current = saved as SubscriptionRow;
  if (!org) {
    await logError("billing.sync", new Error("Suscripción sin organización asociada"), { subscriptionId });
    return current;
  }

  const prev = previous as SubscriptionRow | null;
  const amount = formatPrice(current.amount_cents ?? product?.price_cents ?? 0, current.currency ?? "eur");
  const wasActive = prev && ["active", "trialing"].includes(prev.status);
  const isActive = ["active", "trialing"].includes(current.status);

  if (isActive && !wasActive) {
    await audit({ actorType: "stripe", action: "subscription.activated", entityType: "subscription", entityId: current.id, organizationId: org.id });
    if (org.owner_email) {
      await sendEmail({
        key: `subscription_activated:${sub.id}`,
        to: org.owner_email,
        email: { template: "subscription_activated", data: { productName: product?.name ?? "Suscripción", amount } },
        userId: org.owner_id,
        organizationId: org.id,
      });
    }
    await tryInitialGeneration(org.id, `subscription:${current.id}:initial`, org.owner_email);
  }

  const cancelScheduled = current.cancel_at_period_end || Boolean(current.cancel_at);
  const prevCancelScheduled = Boolean(prev && (prev.cancel_at_period_end || prev.cancel_at));
  if (cancelScheduled && !prevCancelScheduled && current.status !== "canceled") {
    await audit({ actorType: "stripe", action: "subscription.cancel_scheduled", entityType: "subscription", entityId: current.id, organizationId: org.id });
    if (org.owner_email) {
      await sendEmail({
        key: `subscription_cancel_scheduled:${sub.id}:${current.cancel_at ?? current.current_period_end}`,
        to: org.owner_email,
        email: { template: "subscription_cancel_scheduled", data: { endDate: fmtDate(current.cancel_at ?? current.current_period_end) } },
        userId: org.owner_id,
        organizationId: org.id,
      });
    }
  }

  if (current.status === "canceled" && prev?.status !== "canceled") {
    await audit({ actorType: "stripe", action: "subscription.ended", entityType: "subscription", entityId: current.id, organizationId: org.id });
    if (org.owner_email) {
      await sendEmail({
        key: `subscription_ended:${sub.id}`,
        to: org.owner_email,
        email: { template: "subscription_ended", data: {} },
        userId: org.owner_id,
        organizationId: org.id,
      });
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Facturas (renovaciones, impagos y reintentos)
// ---------------------------------------------------------------------------
export async function recordInvoice(invoiceId: string, outcome: "paid" | "failed"): Promise<void> {
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
  const subId = invoiceSubscriptionId(invoice);
  const db = createAdminClient();
  const org = await orgForCustomer(customerId(invoice.customer));
  const sub = subId ? await syncSubscription(subId) : null;
  const pi = invoice.payments?.data?.[0]?.payment?.payment_intent;
  const paymentIntentId = typeof pi === "string" ? pi : (pi?.id ?? null);

  const { error } = await db.from("payments").upsert(
    {
      organization_id: org?.id ?? null,
      product_id: sub?.product_id ?? null,
      subscription_id: sub?.id ?? null,
      kind: "subscription",
      status: outcome === "paid" ? "succeeded" : "failed",
      amount_cents: outcome === "paid" ? invoice.amount_paid : invoice.amount_due,
      currency: invoice.currency,
      stripe_invoice_id: invoice.id,
      stripe_payment_intent_id: paymentIntentId,
      attempt_count: invoice.attempt_count,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      failure_reason: outcome === "failed" ? "El cobro de la factura no se completó" : null,
      paid_at: outcome === "paid" ? new Date().toISOString() : null,
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (error) throw error;

  if (outcome === "failed" && org?.owner_email) {
    await audit({ actorType: "stripe", action: "invoice.payment_failed", entityType: "invoice", entityId: invoice.id, organizationId: org.id, metadata: { attempt: invoice.attempt_count } });
    await sendEmail({
      key: `payment_failed:${invoice.id}:${invoice.attempt_count}`,
      to: org.owner_email,
      email: {
        template: "payment_failed",
        data: {
          amount: formatPrice(invoice.amount_due, invoice.currency),
          attempt: invoice.attempt_count,
          nextAttempt: invoice.next_payment_attempt ? fmtDate(toIso(invoice.next_payment_attempt)) : null,
        },
      },
      userId: org.owner_id,
      organizationId: org.id,
    });
  }
}

export async function sendRenewalReminder(invoice: Stripe.Invoice): Promise<void> {
  const subId = invoiceSubscriptionId(invoice);
  const org = await orgForCustomer(customerId(invoice.customer));
  if (!subId || !org?.owner_email) return;
  const date = toIso(invoice.next_payment_attempt ?? invoice.period_end);
  await sendEmail({
    key: `renewal_reminder:${subId}:${invoice.period_end}`,
    to: org.owner_email,
    email: { template: "renewal_reminder", data: { date: fmtDate(date), amount: formatPrice(invoice.amount_due, invoice.currency) } },
    userId: org.owner_id,
    organizationId: org.id,
  });
}

// ---------------------------------------------------------------------------
// Reembolsos y disputas
// ---------------------------------------------------------------------------
export async function recordRefund(charge: Stripe.Charge): Promise<void> {
  const db = createAdminClient();
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { data: payment } = await db.from("payments").select("*").eq("stripe_payment_intent_id", pi).maybeSingle();
  if (!payment) {
    await logError("billing.refund", new Error("Reembolso de un pago desconocido"), { charge: charge.id });
    return;
  }
  const full = charge.refunded || charge.amount_refunded >= charge.amount;
  await db
    .from("payments")
    .update({ amount_refunded_cents: charge.amount_refunded, status: full ? "refunded" : "partially_refunded", stripe_charge_id: charge.id })
    .eq("id", payment.id);

  if (full && payment.kind === "one_time") {
    const { data: purchase } = await db.from("purchases").update({ status: "refunded" }).eq("payment_id", payment.id).select("id").maybeSingle();
    if (purchase) {
      // Un pago reembolsado íntegramente revoca el acceso a los documentos de esa compra.
      await db
        .from("document_versions")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: "Compra reembolsada" })
        .eq("purchase_id", purchase.id)
        .is("revoked_at", null);
    }
  }
  await audit({
    actorType: "stripe",
    action: full ? "payment.refunded" : "payment.partially_refunded",
    entityType: "payment",
    entityId: payment.id as string,
    organizationId: payment.organization_id as string | null,
    metadata: { amount_refunded: charge.amount_refunded },
  });
}

export async function recordDispute(dispute: Stripe.Dispute): Promise<void> {
  const db = createAdminClient();
  const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  if (pi) await db.from("payments").update({ status: "disputed" }).eq("stripe_payment_intent_id", pi);
  await logError("billing.dispute", new Error(`Disputa abierta: ${dispute.reason}`), { dispute: dispute.id, amount: dispute.amount });
}
