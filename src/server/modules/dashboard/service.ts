import "server-only";

import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { addDays, todayIn } from "@/lib/dates";
import { withRls } from "@/server/db/client";

export interface DashboardSummary {
  customers: number;
  activeVehicles: number;
  members: number;
  branches: number;
  overdue: number;
  dueIn30: number;
  withoutNextService: number;
  customersWithoutEmail: number;
}

/** Contadores reales del taller (RLS: solo lo que el usuario puede ver). */
export async function getDashboardSummary(ctx: OrgContext, today = todayIn()): Promise<DashboardSummary> {
  const orgId = ctx.membership.organizationId;
  const in30 = addDays(today, 30);
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<"customers" | "vehicles" | "members" | "branches" | "overdue" | "due30" | "nonext" | "noemail", string>>`
      select
        (select count(*) from customers where organization_id = ${orgId} and deleted_at is null) as customers,
        (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active') as vehicles,
        (select count(*) from organization_members where organization_id = ${orgId} and status = 'active') as members,
        (select count(*) from branches where organization_id = ${orgId} and status = 'active') as branches,
        (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active'
           and next_service_date < ${today}::date) as overdue,
        (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active'
           and next_service_date between ${today}::date and ${in30}::date) as due30,
        (select count(*) from vehicles where organization_id = ${orgId} and deleted_at is null and status = 'active'
           and next_service_date is null) as nonext,
        (select count(*) from customers where organization_id = ${orgId} and deleted_at is null and email is null) as noemail
    `.execute(tx);
    const r = rows[0];
    return {
      customers: Number(r.customers),
      activeVehicles: Number(r.vehicles),
      members: Number(r.members),
      branches: Number(r.branches),
      overdue: Number(r.overdue),
      dueIn30: Number(r.due30),
      withoutNextService: Number(r.nonext),
      customersWithoutEmail: Number(r.noemail),
    };
  });
}
