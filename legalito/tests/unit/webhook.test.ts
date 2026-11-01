import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const SECRET = "whsec_test_secret_for_unit_tests";

// Doble de la capa de webhook: se prueba la ruta (firma, códigos HTTP y orden de llamadas).
const claimEvent = vi.fn();
const dispatchStripeEvent = vi.fn();
const markEvent = vi.fn();
vi.mock("@/lib/billing/webhook", () => ({
  HANDLED_EVENTS: new Set(["checkout.session.completed", "invoice.paid"]),
  claimEvent: (...a: unknown[]) => claimEvent(...a),
  dispatchStripeEvent: (...a: unknown[]) => dispatchStripeEvent(...a),
  markEvent: (...a: unknown[]) => markEvent(...a),
}));
vi.mock("@/lib/observability", () => ({ logError: vi.fn(), audit: vi.fn(), rateLimit: vi.fn(async () => true) }));

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.APP_ENV = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  const { resetEnvCache } = await import("@/lib/env");
  resetEnvCache();
  ({ POST } = (await import("@/app/api/stripe/webhook/route")) as unknown as { POST: typeof POST });
});

beforeEach(() => {
  claimEvent.mockReset().mockResolvedValue("process");
  dispatchStripeEvent.mockReset().mockResolvedValue(undefined);
  markEvent.mockReset().mockResolvedValue(undefined);
});

function signedRequest(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}
const event = (type: string, id = "evt_1") => ({ id, object: "event", type, livemode: false, data: { object: { id: "cs_test_1" } } });

describe("Webhook de Stripe", () => {
  it("rechaza peticiones sin firma o con firma inválida", async () => {
    const noSig = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(noSig.status).toBe(400);
    const bad = await POST(signedRequest(event("checkout.session.completed"), "whsec_otra"));
    expect(bad.status).toBe(400);
    expect(dispatchStripeEvent).not.toHaveBeenCalled();
  });

  it("procesa un evento válido y lo marca como procesado", async () => {
    const r = await POST(signedRequest(event("checkout.session.completed")));
    expect(r.status).toBe(200);
    expect(dispatchStripeEvent).toHaveBeenCalledTimes(1);
    expect(markEvent).toHaveBeenCalledWith("evt_1", "processed");
  });

  it("no reprocesa eventos duplicados", async () => {
    claimEvent.mockResolvedValue("duplicate");
    const r = await POST(signedRequest(event("invoice.paid")));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ duplicate: true });
    expect(dispatchStripeEvent).not.toHaveBeenCalled();
  });

  it("pide reintento si el mismo evento se está procesando en paralelo", async () => {
    claimEvent.mockResolvedValue("in_progress");
    const r = await POST(signedRequest(event("invoice.paid")));
    expect(r.status).toBe(409);
  });

  it("ignora tipos de evento no gestionados sin tocar la base de datos", async () => {
    const r = await POST(signedRequest(event("customer.created")));
    expect(r.status).toBe(200);
    expect(claimEvent).not.toHaveBeenCalled();
  });

  it("devuelve 500 y marca el evento como fallido para que Stripe reintente", async () => {
    dispatchStripeEvent.mockRejectedValue(new Error("fallo de base de datos"));
    const r = await POST(signedRequest(event("checkout.session.completed")));
    expect(r.status).toBe(500);
    expect(markEvent).toHaveBeenCalledWith("evt_1", "failed", "fallo de base de datos");
  });
});

describe("Helpers de la API reciente de Stripe", () => {
  it("obtiene la suscripción de una factura y el periodo desde los items", async () => {
    const { invoiceSubscriptionId, subscriptionPeriod } = await import("@/lib/billing/stripe");
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_1" } } } as unknown as Stripe.Invoice)).toBe("sub_1");
    expect(invoiceSubscriptionId({ parent: null } as unknown as Stripe.Invoice)).toBeNull();
    const p = subscriptionPeriod({ items: { data: [{ current_period_start: 1767225600, current_period_end: 1769904000 }] } } as unknown as Stripe.Subscription);
    expect(p.start).toBe("2026-01-01T00:00:00.000Z");
    expect(p.end).toBe("2026-02-01T00:00:00.000Z");
  });
});
