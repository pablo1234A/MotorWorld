import "server-only";

import { sql } from "kysely";

import { withRls } from "@/server/db/client";
import type { ServiceCtx } from "@/server/modules/branches/service";

/** Cliente y sus vehículos para el editor de presupuestos y citas. */
export async function customerWithVehicles(ctx: Pick<ServiceCtx, "auth" | "membership">, customerId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) return null;
  return withRls(ctx.auth, async (tx) => {
    const c = await tx
      .selectFrom("customers")
      .select(["id", sql<string>`trim(first_name || ' ' || last_name)`.as("name"), sql<string | null>`email::text`.as("email")])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", customerId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!c) return null;
    const vehicles = await tx
      .selectFrom("vehicles")
      .select(["id", sql<string>`plate || coalesce(' · ' || nullif(trim(coalesce(make, '') || ' ' || coalesce(model, '')), ''), '')`.as("label")])
      .where("customer_id", "=", c.id)
      .where("deleted_at", "is", null)
      .orderBy("created_at")
      .execute();
    const installations = await tx
      .selectFrom("installations")
      .select(["id", sql<string>`name || coalesce(' · ' || nullif(city, ''), '')`.as("label")])
      .where("customer_id", "=", c.id)
      .where("deleted_at", "is", null)
      .orderBy("name")
      .execute();
    return { ...c, vehicles, installations };
  });
}
