import { afterAll, describe, expect, it } from "vitest";

import { PLAN_CODES, PLANS } from "@/lib/plans";
import { closePool } from "@/server/db/client";

import { query } from "./support/db";

afterAll(closePool);

describe("plans: base de datos ↔ espejo TypeScript", () => {
  it("coinciden plan por plan (precios, límites y funcionalidades)", async () => {
    const rows = await query<{
      code: string;
      name: string;
      price_month_cents: number;
      price_year_cents: number;
      max_customers: number | null;
      max_active_vehicles: number | null;
      max_equipment: number | null;
      monthly_emails: number;
      max_users: number | null;
      max_branches: number | null;
      features: string[];
    }>(`select * from plans order by sort_order`);

    expect(rows.map((r) => r.code)).toEqual([...PLAN_CODES]);
    for (const row of rows) {
      const plan = PLANS[row.code as keyof typeof PLANS];
      expect({
        name: row.name,
        priceMonthCents: row.price_month_cents,
        priceYearCents: row.price_year_cents,
        maxCustomers: row.max_customers,
        maxActiveVehicles: row.max_active_vehicles,
        maxEquipment: row.max_equipment,
        monthlyEmails: row.monthly_emails,
        maxUsers: row.max_users,
        maxBranches: row.max_branches,
        features: [...row.features].sort(),
      }).toEqual({
        name: plan.name,
        priceMonthCents: plan.priceMonthCents,
        priceYearCents: plan.priceYearCents,
        maxCustomers: plan.maxCustomers,
        maxActiveVehicles: plan.maxActiveVehicles,
        maxEquipment: plan.maxEquipment,
        monthlyEmails: plan.monthlyEmails,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        features: [...plan.features].sort(),
      });
    }
  });
});
