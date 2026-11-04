import { describe, expect, it } from "vitest";

import { minimumPlanFor, PLANS, planHasFeature } from "@/lib/plans";

describe("catálogo de planes (PDF)", () => {
  it("precios exactos", () => {
    expect(PLANS.pro.priceMonthCents).toBe(3900);
    expect(PLANS.max.priceMonthCents).toBe(7900);
    expect(PLANS.business.priceMonthCents).toBe(14900);
    expect(PLANS.excelencia.priceMonthCents).toBe(24900);
  });

  it("anual = 10 mensualidades (dos meses gratis)", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.priceYearCents).toBe(plan.priceMonthCents * 10);
    }
  });

  it("cada plan incluye todo lo del anterior", () => {
    const order = [PLANS.pro, PLANS.max, PLANS.business, PLANS.excelencia];
    for (let i = 1; i < order.length; i++) {
      for (const feature of order[i - 1].features) {
        expect(order[i].features).toContain(feature);
      }
    }
  });

  it("plan mínimo por funcionalidad", () => {
    expect(minimumPlanFor("quotes_pdf")).toBe("pro");
    expect(minimumPlanFor("km_reminders")).toBe("max");
    expect(minimumPlanFor("google_calendar")).toBe("max");
    expect(minimumPlanFor("multi_branch")).toBe("business");
    expect(minimumPlanFor("api")).toBe("excelencia");
    expect(planHasFeature("pro", "reports")).toBe(false);
  });
});
