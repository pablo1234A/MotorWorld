import "server-only";

import { sql } from "kysely";

import { todayIn } from "@/lib/dates";
import type { Page } from "@/lib/pagination";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/** Incidencias detectadas en instalaciones y equipos (RLS: «incidents.write» para escribir). */

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export interface IncidentRow {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  detectedOn: string;
  resolvedOn: string | null;
  resolution: string | null;
  installationId: string;
  installationName: string;
  customerName: string;
  equipmentId: string | null;
  equipmentCode: string | null;
  workOrderId: string | null;
  workOrderNumber: string | null;
}

export interface IncidentFilters {
  id?: string;
  status?: "open" | "closed" | "all";
  installationId?: string;
  equipmentId?: string;
  severity?: string;
  page: number;
  pageSize: number;
}

export async function listIncidents(ctx: ServiceCtx, f: IncidentFilters): Promise<Page<IncidentRow>> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select x.id, x.title, x.description, x.severity, x.status, x.detected_on, x.resolved_on, x.resolution, x.installation_id,
             i.name as installation_name, trim(c.first_name || ' ' || c.last_name) as customer_name, x.equipment_id, e.code as equipment_code,
             x.work_order_id, w.number as work_order_number, count(*) over () as total
        from equipment_incidents x
        join installations i on i.id = x.installation_id
        join customers c on c.id = i.customer_id
        left join equipment e on e.id = x.equipment_id
        left join work_orders w on w.id = x.work_order_id
       where x.organization_id = ${ctx.membership.organizationId}
         ${f.status === "closed" ? sql`and x.status in ('resolved', 'dismissed')` : f.status === "all" ? sql`` : sql`and x.status in ('open', 'in_progress')`}
         ${f.id ? sql`and x.id = ${f.id}` : sql``}
         ${f.installationId ? sql`and x.installation_id = ${f.installationId}` : sql``}
         ${f.equipmentId ? sql`and x.equipment_id = ${f.equipmentId}` : sql``}
         ${f.severity ? sql`and x.severity = ${f.severity}` : sql``}
       order by case x.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, x.detected_on desc
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}
    `.execute(tx);
    return {
      rows: rows.map((r) => ({
        id: r.id as string, title: r.title as string, description: r.description as string | null, severity: r.severity as string,
        status: r.status as string, detectedOn: day(r.detected_on)!, resolvedOn: day(r.resolved_on), resolution: r.resolution as string | null,
        installationId: r.installation_id as string, installationName: r.installation_name as string, customerName: r.customer_name as string,
        equipmentId: r.equipment_id as string | null, equipmentCode: r.equipment_code as string | null,
        workOrderId: r.work_order_id as string | null, workOrderNumber: r.work_order_number as string | null,
      })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export async function getIncident(ctx: ServiceCtx, id: string): Promise<IncidentRow | null> {
  const page = await listIncidents(ctx, { id, status: "all", page: 1, pageSize: 1 });
  return page.rows[0] ?? null;
}

export async function createIncident(
  ctx: ServiceCtx,
  input: { installationId: string; equipmentId: string | null; workOrderId: string | null; severity: string; title: string; description: string | null; detectedOn: string },
): Promise<string> {
  return withRls(ctx.auth, async (tx) => {
    const inst = await tx.selectFrom("installations").select("branch_id").where("id", "=", input.installationId)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst();
    if (!inst) throw new DomainError("not_found");
    const row = await tx
      .insertInto("equipment_incidents")
      .values({
        organization_id: ctx.membership.organizationId,
        branch_id: inst.branch_id,
        installation_id: input.installationId,
        equipment_id: input.equipmentId,
        work_order_id: input.workOrderId,
        severity: input.severity,
        title: input.title,
        description: input.description,
        detected_on: input.detectedOn,
        reported_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  });
}

export async function updateIncident(ctx: ServiceCtx, input: { id: string; status: string; severity: string; resolution: string | null }): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const closed = input.status === "resolved" || input.status === "dismissed";
    const r = await tx
      .updateTable("equipment_incidents")
      .set({
        status: input.status,
        severity: input.severity,
        resolution: input.resolution,
        resolved_on: closed ? sql<string>`coalesce(resolved_on, ${todayIn()}::date)` : null,
      })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}
