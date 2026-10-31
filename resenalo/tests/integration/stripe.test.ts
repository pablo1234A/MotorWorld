import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { POST as checkoutRoute } from "@/app/api/v1/billing/checkout/route";
import { ctx, makeTenant, req, resetDb } from "../helpers";

const secret = process.env.STRIPE_WEBHOOK_SECRET!;
const signer = new Stripe("sk_test_signing_only");
let evtN = 0;

function subscriptionObject(p: { id: string; customer: string; businessId: string; price: string; status: Stripe.Subscription.Status; start: number; end: number; cancelAtPeriodEnd?: boolean }) {
  return {
    id: p.id,
    object: "subscription",
    customer: p.customer,
    status: p.status,
    cancel_at_period_end: p.cancelAtPeriodEnd ?? false,
    canceled_at: p.status === "canceled" ? p.end : null,
    metadata: { businessId: p.businessId },
    items: { object: "list", data: [{ id: "si_1", object: "subscription_item", price: { id: p.price, object: "price" }, current_period_start: p.start, current_period_end: p.end }] },
  };
}

async function send(type: string, object: unknown, created = Math.floor(Date.now() / 1000), id = `evt_test_${++evtN}`) {
  const payload = JSON.stringify({ id, object: "event", type, created, api_version: "2025-10-29.clover", data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  const res = await stripeWebhook(req("/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } }), ctx());
  return { res, body: await res.json() };
}

beforeEach(resetDb);
afterAll(() => redis().disconnect());

describe("webhooks de Stripe", () => {
  it("rechaza firmas no válidas", async () => {
    const payload = JSON.stringify({ id: "evt_x", type: "customer.subscription.created", data: { object: {} } });
    const res = await stripeWebhook(req("/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=deadbeef" } }), ctx());
    expect(res.status).toBe(400);
    const none = await stripeWebhook(req("/api/webhooks/stripe", { method: "POST", body: payload }), ctx());
    expect(none.status).toBe(400);
  });

  it("alta → ACTIVE con límites del plan; renovación reinicia contador; cambio de plan; pago fallido; cancelación", async () => {
    const t = await makeTenant({ plan: null });
    await prisma.business.update({ where: { id: t.business.id }, data: { stripeCustomerId: "cus_test_1" } });
    const now = Math.floor(Date.now() / 1000);
    const p1 = { start: now - 100, end: now + 30 * 86400 };
    const base = { id: "sub_1", customer: "cus_test_1", businessId: t.business.id };

    // 1. Alta en Starter
    let r = await send("customer.subscription.created", subscriptionObject({ ...base, price: "price_test_starter", status: "active", ...p1 }), now);
    expect(r.res.status).toBe(200);
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.plan.code).toBe("STARTER");
    let usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect(usage.emailLimit).toBe(30);
    await prisma.monthlyUsage.update({ where: { id: usage.id }, data: { sent: 12 } });

    // 2. Idempotencia: el mismo evento dos veces
    const dupId = `evt_dup_${now}`;
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_starter", status: "active", ...p1 }), now + 1, dupId);
    r = await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_starter", status: "active", ...p1 }), now + 1, dupId);
    expect(r.body.result).toBe("duplicate");

    // 3. Cambio a Pro a mitad de periodo → límite 70 sin perder lo consumido
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_pro", status: "active", ...p1 }), now + 2);
    usage = await prisma.monthlyUsage.findUniqueOrThrow({ where: { id: usage.id } });
    expect(usage.emailLimit).toBe(70);
    expect(usage.sent).toBe(12);

    // 4. Evento antiguo que llega tarde → ignorado
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_starter", status: "active", ...p1 }), now - 50);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.plan.code).toBe("PRO");

    // 5. Renovación → nuevo periodo con contador a 0
    const p2 = { start: p1.end, end: p1.end + 30 * 86400 };
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_pro", status: "active", ...p2 }), now + 3);
    const rows = await prisma.monthlyUsage.findMany({ where: { businessId: t.business.id }, orderBy: { periodStart: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1].sent).toBe(0);
    expect(rows[1].emailLimit).toBe(70);

    // 6. Pago fallido → PAST_DUE (bloquea envíos)
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_pro", status: "past_due", ...p2 }), now + 4);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.status).toBe("PAST_DUE");
    const { subscriptionAllowsSending } = await import("@/server/modules/billing/entitlements");
    expect(subscriptionAllowsSending(sub)).toBe(false);

    // 7. Business y cancelación programada / cancelación definitiva
    await send("customer.subscription.updated", subscriptionObject({ ...base, price: "price_test_business", status: "active", cancelAtPeriodEnd: true, ...p2 }), now + 5);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.plan.code).toBe("BUSINESS");
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id }, orderBy: { periodStart: "desc" } })).emailLimit).toBe(200);
    await send("customer.subscription.deleted", subscriptionObject({ ...base, price: "price_test_business", status: "canceled", ...p2 }), now + 6);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.status).toBe("CANCELED");
    expect(subscriptionAllowsSending(sub)).toBe(false);
  });

  it("factura pagada: guarda base imponible, IVA y total", async () => {
    const t = await makeTenant({ plan: null });
    await prisma.business.update({ where: { id: t.business.id }, data: { stripeCustomerId: "cus_inv" } });
    const inv = {
      id: "in_test_1", object: "invoice", customer: "cus_inv", number: "RSN-0001", status: "paid", currency: "eur",
      total: 3299, total_excluding_tax: 2726, total_taxes: [{ amount: 573, tax_behavior: "inclusive" }], amount_paid: 3299, subtotal: 3299,
      hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: "https://pay.stripe.com/invoice/x/pdf", created: 1790000000,
      status_transitions: { finalized_at: 1790000000 }, lines: { data: [{ period: { start: 1790000000, end: 1792592000 } }] },
      customer_name: "Empresa SL", customer_email: "a@b.es", customer_address: null, customer_tax_ids: [],
    };
    await send("invoice.paid", inv);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { stripeInvoiceId: "in_test_1" } });
    expect([row.subtotalCents, row.taxCents, row.totalCents]).toEqual([2726, 573, 3299]);
    expect(row.businessId).toBe(t.business.id);
  });

  it("el checkout solo acepta un código de plan del servidor (no se puede inyectar precio)", async () => {
    const t = await makeTenant({ plan: null });
    const res = await checkoutRoute(req("/api/v1/billing/checkout", { method: "POST", cookie: t.cookie, json: { plan: "PRO", priceCents: 1 } }), ctx());
    // Sin STRIPE_SECRET_KEY en test → 503 NOT_CONFIGURED (no se simula el pago).
    expect(res.status).toBe(503);
    const bad = await checkoutRoute(req("/api/v1/billing/checkout", { method: "POST", cookie: t.cookie, json: { plan: "GRATIS" } }), ctx());
    expect(bad.status).toBe(422);
  });
});
