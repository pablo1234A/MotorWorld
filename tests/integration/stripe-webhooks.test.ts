import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

/**
 * Lógica de webhooks de Stripe contra la base de datos real. No se contacta con Stripe:
 * las firmas se generan con un secreto local y la lectura de suscripciones se simula.
 * Activar pagos de verdad requiere las credenciales descritas en docs/STRIPE.md.
 */
const SECRET = "whsec_pruebas_locales_no_reales";
Object.assign(process.env, {
  PAYMENTS_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_simulada_no_real",
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_STARTER: "price_prueba_starter",
  STRIPE_PRICE_PRO: "price_prueba_pro",
  STRIPE_PRICE_BUSINESS: "price_prueba_business",
});

const billing = await import("@/server/billing/stripe");
let user: TestUser;
const subscriptions = new Map<string, Stripe.Subscription>();
const now = Math.floor(Date.now() / 1000);

function fakeSubscription(id: string, workspaceId: string, price: string, status: Stripe.Subscription.Status, extra: Partial<Stripe.Subscription> = {}) {
  return {
    id,
    object: "subscription",
    customer: "cus_prueba",
    status,
    cancel_at_period_end: false,
    metadata: { workspace_id: workspaceId },
    items: { data: [{ price: { id: price }, current_period_start: now - 3600, current_period_end: now + 30 * 86400 }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${randomUUID().replace(/-/g, "")}`, object: "event", type, data: { object } } as unknown as Stripe.Event;
}

async function subscriptionRow() {
  const { data } = await adminClient().from("subscriptions").select("status, provider, provider_subscription_id, current_period_end, plans(code)").eq("workspace_id", user.workspaceId).single();
  return data!;
}

beforeAll(async () => {
  user = await createTestUser("stripe");
  vi.spyOn(billing.getStripe().subscriptions, "retrieve").mockImplementation((async (id: string) => {
    const subscription = subscriptions.get(id);
    if (!subscription) throw new Error("No existe");
    return subscription;
  }) as never);
});
afterAll(async () => {
  await deleteTestUser(user);
  vi.restoreAllMocks();
});

describe("webhooks de Stripe", () => {
  it("solo acepta eventos con firma válida", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(billing.verifyWebhook(payload, header).id).toBe("evt_1");
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_otro" });
    expect(() => billing.verifyWebhook(payload, forged)).toThrow(/firma/);
    expect(() => billing.verifyWebhook(payload.replace("invoice.paid", "invoice.payment_failed"), header)).toThrow(/firma/);
    expect(() => billing.verifyWebhook(payload, null)).toThrow(/firma/);
  });

  it("checkout completado activa el plan contratado", async () => {
    subscriptions.set("sub_1", fakeSubscription("sub_1", user.workspaceId, "price_prueba_pro", "active"));
    const result = await billing.processWebhookEvent(event("checkout.session.completed", { mode: "subscription", subscription: "sub_1" }));
    expect(result).toBe("processed");
    expect(await subscriptionRow()).toMatchObject({ status: "active", provider: "stripe", provider_subscription_id: "sub_1", plans: { code: "pro" } });
    const { data } = await user.client.rpc("get_usage_summary", { p_workspace: user.workspaceId });
    expect(data).toMatchObject({ plan_code: "pro", monthly_listing_limit: 500 });
  });

  it("el mismo evento no se procesa dos veces (idempotencia)", async () => {
    const repeated = event("customer.subscription.updated", { id: "sub_1" });
    expect(await billing.processWebhookEvent(repeated)).toBe("processed");
    expect(await billing.processWebhookEvent(repeated)).toBe("duplicate");
  });

  it("un pago fallido deja la suscripción en past_due sin perder el plan", async () => {
    subscriptions.set("sub_1", fakeSubscription("sub_1", user.workspaceId, "price_prueba_pro", "past_due"));
    await billing.processWebhookEvent(event("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }));
    expect(await subscriptionRow()).toMatchObject({ status: "past_due", plans: { code: "pro" } });
  });

  it("un cambio de plan se sincroniza", async () => {
    subscriptions.set("sub_1", fakeSubscription("sub_1", user.workspaceId, "price_prueba_business", "active", { cancel_at_period_end: true }));
    await billing.processWebhookEvent(event("invoice.paid", { subscription: "sub_1" }));
    expect(await subscriptionRow()).toMatchObject({ status: "active", plans: { code: "business" } });
  });

  it("un evento tardío de otra suscripción no pisa la vigente", async () => {
    subscriptions.set("sub_antigua", fakeSubscription("sub_antigua", user.workspaceId, "price_prueba_starter", "canceled"));
    await billing.processWebhookEvent(event("customer.subscription.deleted", { id: "sub_antigua" }));
    expect(await subscriptionRow()).toMatchObject({ provider_subscription_id: "sub_1", plans: { code: "business" } });
  });

  it("la cancelación devuelve el espacio al plan gratuito", async () => {
    subscriptions.set("sub_1", fakeSubscription("sub_1", user.workspaceId, "price_prueba_business", "canceled"));
    await billing.processWebhookEvent(event("customer.subscription.deleted", { id: "sub_1" }));
    expect(await subscriptionRow()).toMatchObject({ status: "active", provider: "none", provider_subscription_id: null, current_period_end: null, plans: { code: "free" } });
  });

  it("un evento fallido queda registrado y puede reprocesarse", async () => {
    const failing = event("customer.subscription.updated", { id: "sub_inexistente" });
    await expect(billing.processWebhookEvent(failing)).rejects.toThrow();
    const { data } = await adminClient().from("stripe_events").select("status").eq("id", failing.id).single();
    expect(data?.status).toBe("failed");
    subscriptions.set("sub_inexistente", fakeSubscription("sub_inexistente", user.workspaceId, "price_prueba_starter", "active"));
    expect(await billing.processWebhookEvent(failing)).toBe("processed");
    expect(await subscriptionRow()).toMatchObject({ plans: { code: "starter" } });
  });
});
