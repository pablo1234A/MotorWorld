import { describe, expect, it } from "vitest";
import { canExport, checkQuota, parsePlanFeatures, parseUsageState, subscriptionGrantsAccess, usagePercent } from "@/domain/plans";

const state = (overrides: Record<string, unknown> = {}) =>
  parseUsageState({
    plan_code: "pro",
    plan_name: "Pro",
    features: { max_products: 5000, max_templates: 50, max_bulk_rows: 500, max_images_per_product: 10, export_formats: ["txt", "csv", "json", "shopify_csv"] },
    monthly_listing_limit: 500,
    monthly_bulk_limit: 500,
    used: 100,
    bulk_used: 50,
    period_start: "2026-11-01T00:00:00Z",
    period_end: "2026-12-01T00:00:00Z",
    ...overrides,
  });

describe("planes y consumo", () => {
  it("calcula lo restante", () => {
    const usage = state();
    expect(usage.remaining).toBe(400);
    expect(usage.bulkRemaining).toBe(400);
    expect(usagePercent(usage)).toBe(20);
  });

  it("no devuelve valores negativos", () => {
    const usage = state({ used: 900 });
    expect(usage.remaining).toBe(0);
    expect(usage.bulkRemaining).toBe(0);
    expect(usagePercent(usage)).toBe(100);
  });

  it("permite operaciones que caben y rechaza las que no", () => {
    expect(checkQuota(state(), 400, false)).toEqual({ allowed: true });
    expect(checkQuota(state(), 401, false)).toEqual({ allowed: false, reason: "monthly_limit" });
    expect(checkQuota(state(), 501, true)).toEqual({ allowed: false, reason: "too_many_rows" });
    expect(checkQuota(state({ bulk_used: 480 }), 30, true)).toEqual({ allowed: false, reason: "bulk_limit" });
  });

  it("exige plan para la generación masiva", () => {
    const free = state({ monthly_bulk_limit: 0, features: { max_bulk_rows: 0, export_formats: ["txt", "csv"] } });
    expect(checkQuota(free, 1, true)).toEqual({ allowed: false, reason: "plan_required" });
    expect(canExport(free, "csv")).toBe(true);
    expect(canExport(free, "json")).toBe(false);
  });

  it("tolera características mal formadas", () => {
    const features = parsePlanFeatures({ export_formats: ["pdf", 3], max_bulk_rows: "x" });
    expect(features.exportFormats).toEqual(["txt"]);
    expect(features.maxBulkRows).toBe(0);
    expect(features.maxProducts).toBeNull();
  });

  it("solo ciertos estados de suscripción dan acceso", () => {
    expect(subscriptionGrantsAccess("active")).toBe(true);
    expect(subscriptionGrantsAccess("past_due")).toBe(true);
    expect(subscriptionGrantsAccess("canceled")).toBe(false);
    expect(subscriptionGrantsAccess("unpaid")).toBe(false);
  });
});
