import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { closePool, withSystem } from "@/server/db/client";

import { createCustomers, createOrg, query } from "./support/db";

/**
 * Límites y contadores bajo operaciones SIMULTÁNEAS (casos críticos 3 y 4).
 * Cada operación usa su propia conexión y transacción.
 */

afterAll(closePool);

describe("concurrencia", () => {
  it("10 altas simultáneas de clientes con 5 huecos libres: exactamente 5 entran (Pro: 150)", async () => {
    const org = await createOrg("pro");
    await createCustomers(org, 145);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        withSystem(async (tx) => {
          await tx.insertInto("customers").values({ organization_id: org.orgId, branch_id: org.branchId, first_name: `Simultáneo ${i}` }).execute();
          // Mantiene la transacción abierta para forzar el solapamiento: sin el
          // bloqueo del límite, las 10 verían 145 filas confirmadas y entrarían.
          await sql`select pg_sleep(0.1)`.execute(tx);
        }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toBe(5);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "plan_limit_reached", detail: "customers" });
    }
    const [{ n }] = await query<{ n: string }>("select count(*) as n from customers where organization_id = $1", [org.orgId]);
    expect(Number(n)).toBe(150);
  });

  it("20 reservas de correo simultáneas con 5 disponibles: exactamente 5 se reservan (Pro: 500)", async () => {
    const org = await createOrg("pro");
    await query(
      `insert into usage_counters (organization_id, resource, period_start, used, limit_snapshot)
       values ($1, 'emails', app.usage_period($1), 495, 500)`,
      [org.orgId],
    );

    const periods = await Promise.all(
      Array.from({ length: 20 }, () =>
        withSystem(async (tx) => (await sql<{ p: string | null }>`select app.reserve_usage(${org.orgId}, 'emails') as p`.execute(tx)).rows[0].p),
      ),
    );

    expect(periods.filter((p) => p !== null)).toHaveLength(5);
    const [{ used }] = await query<{ used: number }>("select used from usage_counters where organization_id = $1", [org.orgId]);
    expect(used).toBe(500);
  });

  it("10 presupuestos simultáneos reciben números distintos y correlativos", async () => {
    const org = await createOrg("pro");
    const [{ id: customerId }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Laura') returning id",
      [org.orgId, org.branchId],
    );

    const numbers = await Promise.all(
      Array.from({ length: 10 }, () =>
        withSystem(async (tx) => {
          const r = await tx
            .insertInto("quotes")
            .values({ organization_id: org.orgId, branch_id: org.branchId, customer_id: customerId, issue_date: "2026-11-04", valid_until: "2026-12-04" })
            .returning("number")
            .executeTakeFirstOrThrow();
          return r.number;
        }),
      ),
    );

    expect(new Set(numbers).size).toBe(10);
    expect([...numbers].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `P-2026-${String(i + 1).padStart(4, "0")}`));
  });

  it("10 planificadores simultáneos crean un único recordatorio por evento", async () => {
    const org = await createOrg("pro");
    const [{ id: customerId }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, 'Laura', 'laura@test.local') returning id",
      [org.orgId, org.branchId],
    );
    const [{ id: vehicleId }] = await query<{ id: string }>(
      "insert into vehicles (organization_id, branch_id, customer_id, plate) values ($1, $2, $3, '1234BCD') returning id",
      [org.orgId, org.branchId, customerId],
    );

    await Promise.all(
      Array.from({ length: 10 }, () =>
        withSystem((tx) =>
          tx
            .insertInto("reminders")
            .values({
              organization_id: org.orgId,
              branch_id: org.branchId,
              customer_id: customerId,
              vehicle_id: vehicleId,
              type: "service_date",
              due_date: "2027-03-15",
              offset_days: 30,
              scheduled_for: new Date(),
            })
            .onConflict((oc) => oc.constraint("reminders_event_unique").doNothing())
            .execute(),
        ),
      ),
    );

    const [{ n }] = await query<{ n: string }>("select count(*) as n from reminders where vehicle_id = $1", [vehicleId]);
    expect(Number(n)).toBe(1);
  });
});
