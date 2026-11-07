import { randomUUID } from "node:crypto";

import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { syncCatalog } from "@/server/billing/catalog";
import { getStripe, resetStripeClient } from "@/server/billing/stripe";
import { closePool } from "@/server/db/client";
import * as billing from "@/server/modules/billing/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Fase 8 contra stripe-mock (servidor oficial de Stripe que valida cada
 * llamada contra su especificación; `pnpm stripe:mock`) y webhooks firmados
 * contra la base de datos real. No se usa ninguna clave real ni se cobra nada.
 */

const MOCK = process.env.STRIPE_MOCK_URL ?? "http://127.0.0.1:12111";
const WEBHOOK_SECRET = "whsec_test_secret_para_pruebas_de_integracion";
let mockUp = false;

type Ctx = Parameters<typeof billing.startCheckout>[0];
const sub = (planCode: PlanCode | null, active = true): SubscriptionState => ({ planCode, status: active ? "active" : null, active, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });

async function adminCtx(o: TestOrg): Promise<Ctx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] }, subscription: sub(null, false), user: { email: "dueno@taller.test" } };
}

const prices: Record<string, string> = {};

beforeAll(async () => {
  mockUp = await fetch(`${MOCK}/v1/customers`, { headers: { authorization: "Bearer sk_test_123" } })
    .then((r) => r.ok)
    .catch(() => false);
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_API_BASE = MOCK;
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  resetStripeClient();
  if (mockUp) {
    for (const p of await syncCatalog(getStripe()!)) prices[`${p.plan}_${p.interval}`] = p.priceId;
  }
});

afterAll(async () => {
  delete process.env.STRIPE_API_BASE;
  delete process.env.STRIPE_SECRET_KEY;
  resetStripeClient();
  await closePool();
});

describe("catálogo y pagos contra stripe-mock", () => {
  it("stripe-mock está levantado (pnpm stripe:mock)", () => {
    expect(mockUp).toBe(true);
  });

  it("los precios de los planes (los del PDF, sin IVA) quedan dados de alta", async () => {
    const rows = await query<{ plan_code: string; interval: string; stripe_price_id: string }>(
      "select plan_code, interval, stripe_price_id from billing_prices where livemode = false order by plan_code, interval",
    );
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.stripe_price_id)).size).toBe(8);
  });

  it("checkout: crea el cliente de Stripe una vez y devuelve la página de pago", async () => {
    const o = await createOrg(null);
    const ctx = await adminCtx(o);
    expect((await billing.getOverview(ctx)).trialEligible).toBe(true);
    const url = await billing.startCheckout(ctx, "pro", "month", "http://localhost:3000");
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [c] = await query<{ stripe_customer_id: string }>("select stripe_customer_id from billing_customers where organization_id = $1", [o.orgId]);
    expect(c.stripe_customer_id).toMatch(/^cus_/);
    await billing.startCheckout(ctx, "max", "year", "http://localhost:3000");
    expect(await query("select 1 from billing_customers where organization_id = $1", [o.orgId])).toHaveLength(1);
  });

  it("no deja contratar un plan en el que no cabe el taller, ni a un operario, ni sin Stripe", async () => {
    const o = await createOrg("business");
    const ctx = await adminCtx(o);
    for (let i = 0; i < 2; i++) await addMember(o, await createUser(), "operator");
    await query("update subscriptions set status = 'canceled' where organization_id = $1", [o.orgId]);
    await expect(billing.startCheckout(ctx, "pro", "month", "http://x")).rejects.toMatchObject({ code: "validation_error" });
    expect(billing.downgradeBlockers("pro", { users: 3, branches: 1, customers: 10, activeVehicles: 10 })[0]).toContain("3 usuarios");
    const operator = { ...ctx, auth: { userId: await createUser() }, membership: { ...ctx.membership, role: "operator" as const } };
    await expect(billing.startCheckout(operator, "max", "month", "http://x")).rejects.toMatchObject({ code: "permission_denied" });

    delete process.env.STRIPE_SECRET_KEY;
    resetStripeClient();
    await expect(billing.startCheckout(ctx, "max", "month", "http://x")).rejects.toMatchObject({ code: "payments_not_configured" });
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    resetStripeClient();
  });

  it("portal, cambio de plan y cancelación: llamadas válidas para Stripe", async () => {
    const o = await createOrg(null);
    const ctx = await adminCtx(o);
    await billing.startCheckout(ctx, "pro", "month", "http://localhost:3000");
    await query(
      "insert into subscriptions (organization_id, plan_code, status, billing_interval, stripe_subscription_id, stripe_price_id) values ($1, 'pro', 'active', 'month', $3, $2)",
      [o.orgId, prices.pro_month, `sub_mock${randomUUID().replace(/-/g, "").slice(0, 12)}`],
    );
    // La sesión de portal de ejemplo de stripe-mock viene marcada como LIVE: la
    // protección del modo TEST la rechaza (es justo lo que debe hacer).
    await expect(billing.openPortal(ctx, "http://localhost:3000")).rejects.toThrow("stripe_livemode_blocked");
    await expect(billing.changePlan(ctx, "max", "year")).resolves.toBeUndefined();
    await expect(billing.setCancelAtPeriodEnd(ctx, true)).resolves.toBeUndefined();
    // Ya tiene suscripción: no puede abrir otra contratación.
    await expect(billing.startCheckout(ctx, "max", "month", "http://x")).rejects.toMatchObject({ code: "conflict" });
  });
});

// ---------------------------------------------------------------- webhooks

const stripe = new Stripe("sk_test_123");
let seq = 0;

function subscriptionObject(o: { id: string; customer: string; org: string; status: string; price: string; extra?: Record<string, unknown> }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: o.id,
    object: "subscription",
    customer: o.customer,
    status: o.status,
    livemode: false,
    metadata: { organization_id: o.org },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_start: now,
    trial_end: now + 7 * 86400,
    items: { object: "list", data: [{ id: "si_1", object: "subscription_item", price: { id: o.price, object: "price" }, current_period_start: now, current_period_end: now + 30 * 86400 }] },
    ...o.extra,
  };
}

async function sendEvent(type: string, object: unknown, opts: { created?: number; id?: string; livemode?: boolean; secret?: string } = {}) {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const payload = JSON.stringify({
    id: opts.id ?? `evt_${Date.now()}${seq++}`,
    object: "event",
    type,
    created: opts.created ?? Math.floor(Date.now() / 1000) + seq,
    livemode: opts.livemode ?? false,
    api_version: "2025-10-29.clover",
    data: { object },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
  const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
  return { status: res.status, body: (await res.json()) as { outcome?: string } };
}

describe("ciclo de vida por webhooks firmados (base de datos real)", () => {
  let org: TestOrg;
  let customer: string;
  const subId = `sub_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const state = async () =>
    (
      await query<{ plan_code: string; status: string; past_due_since: Date | null; active: boolean; cancel_at_period_end: boolean; retention: string | null }>(
        `select s.plan_code, s.status, s.past_due_since, s.cancel_at_period_end, app.subscription_is_active(s.status, s.past_due_since) as active,
                o.data_retention_until::text as retention
           from subscriptions s join organizations o on o.id = s.organization_id where s.organization_id = $1`,
        [org.orgId],
      )
    )[0];

  beforeAll(async () => {
    org = await createOrg(null);
    customer = `cus_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    await query("insert into billing_customers (organization_id, stripe_customer_id) values ($1, $2)", [org.orgId, customer]);
    if (!prices.pro_month) {
      // Sin stripe-mock: precios de prueba propios para los eventos.
      for (const code of ["pro", "max", "business", "excelencia"])
        for (const i of ["month", "year"]) {
          const id = `price_t${code}${i}${randomUUID().slice(0, 6)}`;
          await query("insert into billing_prices (plan_code, interval, livemode, stripe_price_id) values ($1, $2, false, $3) on conflict (plan_code, interval, livemode) do update set stripe_price_id = excluded.stripe_price_id", [code, i, id]);
          prices[`${code}_${i}`] = id;
        }
    }
  });

  it("prueba → activa → cambio de plan → impago con gracia → baja con datos conservados 60 días", async () => {
    const base = { id: subId, customer, org: org.orgId };
    expect((await sendEvent("customer.subscription.created", subscriptionObject({ ...base, status: "trialing", price: prices.pro_month }))).body.outcome).toBe("applied");
    expect(await state()).toMatchObject({ plan_code: "pro", status: "trialing", active: true });

    const t1 = Math.floor(Date.now() / 1000) + 100;
    await sendEvent("customer.subscription.updated", subscriptionObject({ ...base, status: "active", price: prices.max_month }), { created: t1 });
    expect(await state()).toMatchObject({ plan_code: "max", status: "active" });

    // Un evento ANTERIOR que llega tarde no hace retroceder el estado.
    expect((await sendEvent("customer.subscription.updated", subscriptionObject({ ...base, status: "trialing", price: prices.pro_month }), { created: t1 - 50 })).body.outcome).toBe("stale");
    expect(await state()).toMatchObject({ plan_code: "max", status: "active" });

    await sendEvent("customer.subscription.updated", subscriptionObject({ ...base, status: "past_due", price: prices.max_month }), { created: t1 + 10 });
    let s = await state();
    expect(s).toMatchObject({ status: "past_due", active: true }); // 7 días de gracia (P7)
    expect(s.past_due_since).not.toBeNull();
    await query("update subscriptions set past_due_since = now() - interval '8 days' where organization_id = $1", [org.orgId]);
    expect((await state()).active).toBe(false); // sin pagar tras la gracia: solo lectura

    const invoice = { id: `in_${randomUUID().replace(/-/g, "").slice(0, 14)}`, object: "invoice", customer, status: "open", amount_due: 9559, amount_paid: 0, currency: "eur", livemode: false, period_start: t1, period_end: t1 + 86400, hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: null, metadata: {} };
    expect((await sendEvent("invoice.payment_failed", invoice)).body.outcome).toBe("applied");
    await sendEvent("invoice.paid", { ...invoice, status: "paid", amount_paid: 9559 });
    expect((await query<{ status: string; amount_paid_cents: number }>("select status, amount_paid_cents from billing_invoices where stripe_invoice_id = $1", [invoice.id]))[0]).toEqual({
      status: "paid",
      amount_paid_cents: 9559,
    });

    const ended = Math.floor(Date.now() / 1000);
    await sendEvent("customer.subscription.deleted", subscriptionObject({ ...base, status: "canceled", price: prices.max_month, extra: { ended_at: ended, canceled_at: ended } }), { created: t1 + 20 });
    s = await state();
    expect(s).toMatchObject({ status: "canceled", active: false });
    const expected = new Date((ended + 60 * 86400) * 1000).toISOString().slice(0, 10);
    expect(s.retention).toBe(expected);
  });

  it("idempotencia, firma, modo live y eventos de otra suscripción", async () => {
    const o = await createOrg(null);
    const cus = `cus_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    await query("insert into billing_customers (organization_id, stripe_customer_id) values ($1, $2)", [o.orgId, cus]);
    const obj = subscriptionObject({ id: `sub_${randomUUID().replace(/-/g, "").slice(0, 14)}`, customer: cus, org: o.orgId, status: "active", price: prices.business_year });
    const id = `evt_${randomUUID().replace(/-/g, "")}`;
    expect((await sendEvent("customer.subscription.created", obj, { id })).body.outcome).toBe("applied");
    expect((await sendEvent("customer.subscription.created", obj, { id })).body.outcome).toBe("duplicate");
    expect(await query("select 1 from stripe_events where id = $1", [id])).toHaveLength(1);

    expect((await sendEvent("customer.subscription.updated", obj, { secret: "whsec_otro" })).status).toBe(400);
    const live = await sendEvent("customer.subscription.updated", { ...obj, status: "canceled", livemode: true }, { livemode: true });
    expect(live.body.outcome).toBe("livemode_blocked");
    expect((await query<{ status: string }>("select status from subscriptions where organization_id = $1", [o.orgId]))[0].status).toBe("active");

    const other = { ...obj, id: `sub_${randomUUID().replace(/-/g, "").slice(0, 14)}`, status: "canceled" };
    expect((await sendEvent("customer.subscription.deleted", other)).body.outcome).toBe("other_subscription");
    expect((await sendEvent("customer.subscription.updated", { ...obj, items: { object: "list", data: [{ id: "si_x", price: { id: "price_desconocido" } }] } })).body.outcome).toBe("unknown_price");
    expect((await sendEvent("payment_intent.created", { id: "pi_1", object: "payment_intent", livemode: false })).body.outcome).toBe("ignored");

    const before = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await sendEvent("customer.subscription.updated", obj)).status).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = before;
  });

  it("al mejorar el plan vuelven a la cola los avisos saltados por cuota (P5)", async () => {
    const o = await createOrg(null);
    const cus = `cus_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    await query("insert into billing_customers (organization_id, stripe_customer_id) values ($1, $2)", [o.orgId, cus]);
    const id = `sub_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    await sendEvent("customer.subscription.created", subscriptionObject({ id, customer: cus, org: o.orgId, status: "active", price: prices.pro_month }));
    const [{ id: c }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, 'Ana', 'ana@x.test') returning id", [o.orgId, o.branchId]);
    const [{ id: v }] = await query<{ id: string }>("insert into vehicles (organization_id, branch_id, customer_id, plate) values ($1, $2, $3, '1111 BBB') returning id", [o.orgId, o.branchId, c]);
    const [{ id: r }] = await query<{ id: string }>(
      "insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for, status, skip_reason) values ($1, $2, $3, $4, 'service_date', current_date + 20, 30, now(), 'skipped', 'quota_exceeded') returning id",
      [o.orgId, o.branchId, c, v],
    );
    await sendEvent("customer.subscription.updated", subscriptionObject({ id, customer: cus, org: o.orgId, status: "active", price: prices.max_month }));
    expect((await query<{ status: string }>("select status from reminders where id = $1", [r]))[0].status).toBe("scheduled");
  });
});
