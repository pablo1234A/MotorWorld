import "server-only";

import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { withRls } from "@/server/db/client";

export interface DashboardSummary {
  customers: number;
  activeVehicles: number;
  members: number;
  branches: number;
}

/** Contadores reales del taller (RLS: solo lo que el usuario puede ver). */
export async function getDashboardSummary(ctx: OrgContext): Promise<DashboardSummary> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ customers: string; vehicles: string; members: string; branches: string }>`
      select
        (select count(*) from customers where organization_id = ${orgId} and deleted_at is null) as customers,
        (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active') as vehicles,
        (select count(*) from organization_members where organization_id = ${orgId} and status = 'active') as members,
        (select count(*) from branches where organization_id = ${orgId} and status = 'active') as branches
    `.execute(tx);
    const r = rows[0];
    return {
      customers: Number(r.customers),
      activeVehicles: Number(r.vehicles),
      members: Number(r.members),
      branches: Number(r.branches),
    };
  });
}
