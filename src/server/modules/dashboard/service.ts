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

export interface PciDashboard {
  customers: number;
  installations: number;
  equipment: number;
  extinguishers: number;
  workOrdersOpen: number;
  actionsScheduled: number;
  records30d: number;
  equipmentDue30d: number;
  equipmentOverdue: number;
  incidentsOpen: number;
  recent: Array<{ kind: "record" | "work_order" | "incident"; at: string; refId: string; label: string; installation: string }>;
}

/** Inicio PCI: la función SQL corre con la RLS del usuario (sus sucursales; un técnico, sus órdenes). */
export async function getPciDashboard(ctx: { auth: OrgContext["auth"]; membership: { organizationId: string } }): Promise<PciDashboard> {
  const raw = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ d: Record<string, unknown> }>`select app.pci_dashboard(${ctx.membership.organizationId}::uuid) as d`.execute(tx);
    return rows[0].d;
  });
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    customers: n("customers"),
    installations: n("installations"),
    equipment: n("equipment"),
    extinguishers: n("extinguishers"),
    workOrdersOpen: n("work_orders_open"),
    actionsScheduled: n("actions_scheduled"),
    records30d: n("records_30d"),
    equipmentDue30d: n("equipment_due_30d"),
    equipmentOverdue: n("equipment_overdue"),
    incidentsOpen: n("incidents_open"),
    recent: ((raw.recent as Array<Record<string, string>>) ?? []).map((r) => ({
      kind: r.kind as "record" | "work_order" | "incident", at: r.at, refId: r.ref_id, label: r.label, installation: r.installation,
    })),
  };
}
