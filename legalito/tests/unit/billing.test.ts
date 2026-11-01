import { describe, expect, it } from "vitest";
import { canDownloadVersion, computeEntitlements, formatPrice } from "@/lib/billing/entitlements";
import type { ProductRow, PurchaseRow, SubscriptionRow } from "@/lib/db/types";

const products: ProductRow[] = [
  { id: "p1", code: "one_time_pack", name: "Pago único", description: null, kind: "one_time", price_cents: 3900, currency: "eur", billing_interval: null, stripe_price_id: "price_1", included_document_types: ["aviso_legal", "privacidad", "cookies"], generations_limit: 3, includes_updates: false, documents_per_period: null, features: [], active: true, sort_order: 1 },
  { id: "p2", code: "subscription_basic", name: "Básico", description: null, kind: "subscription", price_cents: 599, currency: "eur", billing_interval: "month", stripe_price_id: "price_2", included_document_types: ["aviso_legal", "privacidad"], generations_limit: null, includes_updates: true, documents_per_period: 20, features: [], active: true, sort_order: 2 },
  { id: "p3", code: "subscription_business", name: "Business", description: null, kind: "subscription", price_cents: 3099, currency: "eur", billing_interval: "month", stripe_price_id: "price_3", included_document_types: ["aviso_legal", "privacidad", "cookies"], generations_limit: null, includes_updates: true, documents_per_period: null, features: [], active: true, sort_order: 4 },
];

const sub = (status: SubscriptionRow["status"], created = "2026-10-01"): SubscriptionRow => ({
  id: `s-${status}`, organization_id: "o", product_id: "p2", stripe_subscription_id: `sub_${status}`, stripe_customer_id: "cus", status,
  amount_cents: 999, currency: "eur", billing_interval: "month", current_period_end: null, cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, created_at: created,
});
const purchase = (used: number, status: PurchaseRow["status"] = "active", limit: number | null = 3): PurchaseRow => ({
  id: `pu-${used}-${status}`, organization_id: "o", product_id: "p1", payment_id: "pay", status, document_types: ["aviso_legal", "privacidad", "cookies"],
  template_version_ids: { aviso_legal: "tv1" }, generations_limit: limit, generations_used: used, created_at: "2026-10-01",
});

describe("Permisos según el estado de pago", () => {
  it("sin pagos no se puede generar", () => {
    const e = computeEntitlements({ subscriptions: [], purchases: [], products });
    expect(e.plan).toBe("none");
    expect(e.canGenerate).toBe(false);
    expect(e.source).toBeNull();
  });

  it("una suscripción activa permite generar los documentos de su plan", () => {
    const e = computeEntitlements({ subscriptions: [sub("active")], purchases: [], products });
    expect(e.canGenerate).toBe(true);
    expect(e.source).toMatchObject({ type: "subscription", documentTypes: ["aviso_legal", "privacidad"], includesUpdates: true });
  });

  it("un impago bloquea la generación y marca la incidencia", () => {
    for (const status of ["past_due", "unpaid", "incomplete"] as const) {
      const e = computeEntitlements({ subscriptions: [sub(status)], purchases: [], products });
      expect(e.canGenerate).toBe(false);
      expect(e.paymentIssue).toBe(true);
      expect(e.blockedReason).toMatch(/pago pendiente/);
    }
  });

  it("una suscripción cancelada no permite generar", () => {
    const e = computeEntitlements({ subscriptions: [sub("canceled")], purchases: [], products });
    expect(e.canGenerate).toBe(false);
    expect(e.paymentIssue).toBe(false);
  });

  it("el pago único permite generar hasta agotar el límite, con versiones congeladas", () => {
    const ok = computeEntitlements({ subscriptions: [], purchases: [purchase(2)], products });
    expect(ok.canGenerate).toBe(true);
    expect(ok.source).toMatchObject({ type: "purchase", remaining: 1, lockedVersions: { aviso_legal: "tv1" } });
    const exhausted = computeEntitlements({ subscriptions: [], purchases: [purchase(3)], products });
    expect(exhausted.canGenerate).toBe(false);
    expect(exhausted.blockedReason).toMatch(/agotado/);
  });

  it("una compra reembolsada no concede permisos", () => {
    const e = computeEntitlements({ subscriptions: [], purchases: [purchase(0, "refunded")], products });
    expect(e.canGenerate).toBe(false);
    expect(e.plan).toBe("none");
  });

  it("con impago en la suscripción sigue pudiendo usar una compra de pago único", () => {
    const e = computeEntitlements({ subscriptions: [sub("past_due")], purchases: [purchase(0)], products });
    expect(e.canGenerate).toBe(true);
    expect(e.source?.type).toBe("purchase");
    expect(e.paymentIssue).toBe(true);
  });

  it("prioriza la suscripción activa sobre una antigua cancelada", () => {
    const e = computeEntitlements({ subscriptions: [sub("canceled", "2026-01-01"), sub("active", "2026-09-01")], purchases: [], products });
    expect(e.subscription?.status).toBe("active");
  });

  it("el cupo mensual del plan limita la generación", () => {
    const active = sub("active");
    const ok = computeEntitlements({ subscriptions: [active], purchases: [], products, usage: { [active.id]: 18 } });
    expect(ok.canGenerate).toBe(true);
    expect(ok.source).toMatchObject({ type: "subscription", limit: 20, used: 18, remaining: 2 });
    expect(ok.planName).toBe("Básico");
    const full = computeEntitlements({ subscriptions: [active], purchases: [], products, usage: { [active.id]: 20 } });
    expect(full.canGenerate).toBe(false);
    expect(full.plan).toBe("subscription");
    expect(full.quota).toMatchObject({ limit: 20, used: 20, remaining: 0 });
    expect(full.blockedReason).toMatch(/20 documentos/);
  });

  it("el plan Business no tiene límite de documentos", () => {
    const business = { ...sub("active"), product_id: "p3" };
    const e = computeEntitlements({ subscriptions: [business], purchases: [], products, usage: { [business.id]: 500 } });
    expect(e.canGenerate).toBe(true);
    expect(e.source).toMatchObject({ limit: null, remaining: null });
    expect(e.planName).toBe("Business");
  });

  it("con el cupo agotado puede usar una compra de pago único si la tiene", () => {
    const active = sub("active");
    const e = computeEntitlements({ subscriptions: [active], purchases: [purchase(0)], products, usage: { [active.id]: 20 } });
    expect(e.canGenerate).toBe(true);
    expect(e.source?.type).toBe("purchase");
    expect(e.plan).toBe("subscription");
  });

  it("solo se descargan versiones no revocadas", () => {
    expect(canDownloadVersion({ revoked_at: null })).toBe(true);
    expect(canDownloadVersion({ revoked_at: "2026-10-10T00:00:00Z" })).toBe(false);
  });

  it("formatea precios en euros", () => {
    expect(formatPrice(3900).replace(/\s/g, " ")).toBe("39,00 €");
    expect(formatPrice(599).replace(/\s/g, " ")).toBe("5,99 €");
    expect(formatPrice(3099).replace(/\s/g, " ")).toBe("30,99 €");
  });
});
