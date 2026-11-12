import "server-only";
import Stripe from "stripe";
import { PAID_PLAN_CODES, type PaidPlanCode } from "@/domain/plans";
import { appUrl, getEnv, paymentsEnabled } from "@/lib/config/env";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import type { SessionContext } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";

/**
 * Integración con Stripe. Todo este módulo queda inerte mientras PAYMENTS_ENABLED=false:
 * no se crea ningún cliente, sesión ni cobro. El estado de una suscripción SOLO se
 * modifica al procesar webhooks con firma verificada; nunca a partir del navegador.
 */

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) throw new ApiError("not_configured", "Stripe no está configurado.");
  stripe ??= new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: "AnunciaPro" } });
  return stripe;
}

function assertPaymentsEnabled() {
  if (!paymentsEnabled()) {
    throw new ApiError("payments_disabled", "Los pagos están desactivados. Todas las cuentas funcionan en el plan gratuito.");
  }
}

export function priceIdForPlan(plan: PaidPlanCode): string {
  const env = getEnv();
  const id = { starter: env.STRIPE_PRICE_STARTER, pro: env.STRIPE_PRICE_PRO, business: env.STRIPE_PRICE_BUSINESS }[plan];
  if (!id) throw new ApiError("not_configured", `Falta el precio de Stripe para el plan ${plan}.`);
  return id;
}

export function planForPriceId(priceId: string | null | undefined): PaidPlanCode | null {
  if (!priceId) return null;
  const env = getEnv();
  const map: Record<string, PaidPlanCode> = {};
  if (env.STRIPE_PRICE_STARTER) map[env.STRIPE_PRICE_STARTER] = "starter";
  if (env.STRIPE_PRICE_PRO) map[env.STRIPE_PRICE_PRO] = "pro";
  if (env.STRIPE_PRICE_BUSINESS) map[env.STRIPE_PRICE_BUSINESS] = "business";
  return map[priceId] ?? null;
}

function assertOwner(context: SessionContext) {
  if (context.role !== "owner" && context.role !== "admin") {
    throw new ApiError("forbidden", "Solo el propietario del espacio de trabajo puede gestionar la suscripción.");
  }
}

async function ensureCustomer(context: SessionContext): Promise<string> {
  const admin = getAdminClient();
  const { data: subscription } = await admin.from("subscriptions").select("provider_customer_id").eq("workspace_id", context.workspace.id).maybeSingle();
  if (subscription?.provider_customer_id) return subscription.provider_customer_id;
  const customer = await getStripe().customers.create(
    { email: context.profile.email, name: context.profile.full_name || undefined, metadata: { workspace_id: context.workspace.id, user_id: context.user.id } },
    { idempotencyKey: `customer:${context.workspace.id}` },
  );
  await admin.from("subscriptions").update({ provider_customer_id: customer.id }).eq("workspace_id", context.workspace.id);
  return customer.id;
}

export async function createCheckoutSession(context: SessionContext, plan: PaidPlanCode): Promise<string> {
  assertPaymentsEnabled();
  assertOwner(context);
  const admin = getAdminClient();
  const { data: current } = await admin.from("subscriptions").select("provider, provider_subscription_id, status").eq("workspace_id", context.workspace.id).maybeSingle();
  if (current?.provider === "stripe" && current.provider_subscription_id && ["active", "trialing", "past_due"].includes(current.status)) {
    throw new ApiError("conflict", "Ya tienes una suscripción activa. Cambia de plan desde el portal de facturación.");
  }
  const customer = await ensureCustomer(context);
  // La clave de idempotencia evita sesiones duplicadas por doble clic durante una ventana de 5 minutos.
  const bucket = Math.floor(Date.now() / 300_000);
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      client_reference_id: context.workspace.id,
      subscription_data: { metadata: { workspace_id: context.workspace.id } },
      metadata: { workspace_id: context.workspace.id, plan },
      allow_promotion_codes: true,
      success_url: appUrl("/app/cuenta?checkout=success"),
      cancel_url: appUrl("/app/cuenta?checkout=cancelled"),
    },
    { idempotencyKey: `checkout:${context.workspace.id}:${plan}:${bucket}` },
  );
  if (!session.url) throw new ApiError("internal_error", "Stripe no devolvió una URL de pago.");
  return session.url;
}

export async function createPortalSession(context: SessionContext): Promise<string> {
  assertPaymentsEnabled();
  assertOwner(context);
  const { data } = await getAdminClient().from("subscriptions").select("provider_customer_id").eq("workspace_id", context.workspace.id).maybeSingle();
  if (!data?.provider_customer_id) throw new ApiError("conflict", "Todavía no tienes datos de facturación.");
  const session = await getStripe().billingPortal.sessions.create({ customer: data.provider_customer_id, return_url: appUrl("/app/cuenta") });
  return session.url;
}

/** Cancela la suscripción de pago al eliminar una cuenta (si los pagos están activos). */
export async function cancelWorkspaceSubscription(workspaceId: string) {
  if (!paymentsEnabled()) return;
  const { data } = await getAdminClient().from("subscriptions").select("provider, provider_subscription_id").eq("workspace_id", workspaceId).maybeSingle();
  if (data?.provider === "stripe" && data.provider_subscription_id) {
    await getStripe().subscriptions.cancel(data.provider_subscription_id);
  }
}

// --- Webhooks ---------------------------------------------------------------
export function verifyWebhook(payload: string, signature: string | null): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("not_configured", "El secreto del webhook de Stripe no está configurado.");
  if (!signature) throw new ApiError("bad_request", "Falta la firma del webhook.");
  try {
    return getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new ApiError("bad_request", "La firma del webhook no es válida.");
  }
}

const iso = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

type PeriodFields = { current_period_start?: number; current_period_end?: number };

/** Sincroniza una suscripción de Stripe con la tabla `subscriptions`. */
export async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = getAdminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const planCode = planForPriceId(item?.price.id);

  let workspaceId: string | null = subscription.metadata?.workspace_id ?? null;
  if (!workspaceId) {
    const { data } = await admin.from("subscriptions").select("workspace_id").eq("provider_customer_id", customerId).maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
  if (!workspaceId) throw new Error(`No se encuentra el workspace de la suscripción ${subscription.id}`);

  const { data: existing } = await admin.from("subscriptions").select("provider_subscription_id").eq("workspace_id", workspaceId).maybeSingle();
  const ended = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  // Un evento tardío de una suscripción antigua no debe pisar a la suscripción vigente.
  if (ended && existing?.provider_subscription_id && existing.provider_subscription_id !== subscription.id) return;

  const targetCode = ended || !planCode ? "free" : planCode;
  if (!ended && !planCode) logger.warn("stripe.unknown_price", { subscriptionId: subscription.id, priceId: item?.price.id });
  const { data: plan } = await admin.from("plans").select("id").eq("code", targetCode).single();
  if (!plan) throw new Error(`El plan ${targetCode} no existe en la base de datos`);

  // Según la versión de la API, el periodo está en la suscripción o en su primer elemento.
  const period: PeriodFields = { ...(item as unknown as PeriodFields), ...(subscription as unknown as PeriodFields) };
  const { error } = await admin
    .from("subscriptions")
    .update({
      plan_id: plan.id,
      status: ended ? "active" : subscription.status,
      provider: ended ? "none" : "stripe",
      provider_customer_id: customerId,
      provider_subscription_id: ended ? null : subscription.id,
      current_period_start: ended ? null : iso(period.current_period_start),
      current_period_end: ended ? null : iso(period.current_period_end),
      cancel_at_period_end: ended ? false : subscription.cancel_at_period_end,
    })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(`No se pudo sincronizar la suscripción: ${error.message}`);

  await admin.from("audit_logs").insert({
    workspace_id: workspaceId,
    action: "subscription.synced",
    resource_type: "subscription",
    resource_id: subscription.id,
    metadata: { status: subscription.status, plan: targetCode },
  });
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const loose = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  };
  const value = loose.parent?.subscription_details?.subscription ?? loose.subscription ?? null;
  return typeof value === "string" ? value : (value?.id ?? null);
}

async function handleEvent(event: Stripe.Event) {
  const client = getStripe();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return;
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(await client.subscriptions.retrieve(id));
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Se relee la suscripción para trabajar siempre con su estado actual
      // aunque los eventos lleguen desordenados.
      await syncSubscription(await client.subscriptions.retrieve(event.data.object.id));
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const id = invoiceSubscriptionId(event.data.object);
      if (id) await syncSubscription(await client.subscriptions.retrieve(id));
      return;
    }
    default:
      return;
  }
}

/**
 * Procesa un evento una sola vez. `stripe_events` actúa como registro de idempotencia:
 * los reenvíos de un evento ya procesado se ignoran; los fallidos se pueden reintentar.
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<"processed" | "duplicate"> {
  const admin = getAdminClient();
  const inserted = await admin.from("stripe_events").insert({ id: event.id, type: event.type, status: "processing" });
  if (inserted.error) {
    if (inserted.error.code !== "23505") throw new Error(inserted.error.message);
    const { data: claimed } = await admin
      .from("stripe_events")
      .update({ status: "processing", error_message: null })
      .eq("id", event.id)
      .eq("status", "failed")
      .select("id");
    if (!claimed?.length) return "duplicate";
  }
  try {
    await handleEvent(event);
    await admin.from("stripe_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id);
    return "processed";
  } catch (error) {
    await admin
      .from("stripe_events")
      .update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "error" })
      .eq("id", event.id);
    throw error;
  }
}

export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export { PAID_PLAN_CODES };
