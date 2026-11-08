import "server-only";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import type { Page } from "@/lib/pagination";
import type { WorkOrderStatus } from "@/lib/pci/labels";
import type { CreateWorkOrderInput } from "@/lib/validation/pci";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";
import { insertRecord } from "../maintenance/records";

/**
 * Órdenes de trabajo. La BD impone: equipos de la instalación de la orden,
 * transiciones válidas, numeración OT-AAAA-NNNN, y que un técnico (sin
 * «gestionar órdenes») solo vea y avance las suyas. Cada resultado por equipo
 * crea la actuación en el historial del equipo.
 */

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export interface WorkOrderRow {
  id: string;
  number: string;
  status: WorkOrderStatus;
  serviceType: string;
  scheduledFor: string | null;
  scheduledTime: string | null;
  technicianId: string | null;
  technicianName: string | null;
  installationId: string;
  installationName: string;
  installationAddress: string;
  customerId: string;
  customerName: string;
  items: number;
  itemsDone: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface WorkOrderFilters {
  status?: "open" | "closed" | WorkOrderStatus;
  technicianId?: string;
  installationId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listWorkOrders(ctx: ServiceCtx, f: WorkOrderFilters): Promise<Page<WorkOrderRow>> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select w.id, w.number, w.status, w.service_type, w.scheduled_for, to_char(w.scheduled_time, 'HH24:MI') as scheduled_time,
             w.technician_id, t.full_name as technician_name, w.installation_id, i.name as installation_name,
             concat_ws(', ', i.address_line1, i.city) as installation_address, w.customer_id,
             trim(c.first_name || ' ' || c.last_name) as customer_name, w.created_at, w.completed_at,
             (select count(*) from work_order_items it where it.work_order_id = w.id) as items,
             (select count(*) from work_order_items it where it.work_order_id = w.id and it.status <> 'pending') as items_done,
             count(*) over () as total
        from work_orders w
        join installations i on i.id = w.installation_id
        join customers c on c.id = w.customer_id
        left join technicians t on t.id = w.technician_id
       where w.organization_id = ${ctx.membership.organizationId}
         ${f.status === "open" ? sql`and w.status in ('pending', 'scheduled', 'assigned', 'in_progress')`
           : f.status === "closed" ? sql`and w.status in ('completed', 'canceled')`
           : f.status ? sql`and w.status = ${f.status}` : sql``}
         ${f.technicianId ? sql`and w.technician_id = ${f.technicianId}` : sql``}
         ${f.installationId ? sql`and w.installation_id = ${f.installationId}` : sql``}
         ${f.from ? sql`and w.scheduled_for >= ${f.from}::date` : sql``}
         ${f.to ? sql`and w.scheduled_for <= ${f.to}::date` : sql``}
       order by case when w.status in ('completed', 'canceled') then 1 else 0 end, w.scheduled_for nulls last, w.created_at desc
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}
    `.execute(tx);
    return {
      rows: rows.map(mapRow),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export interface WorkOrderItem {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  categoryCode: string;
  location: string | null;
  typeName: string | null;
  actionTypeId: string;
  actionName: string;
  status: string;
  result: string | null;
  observations: string | null;
  recordId: string | null;
}

export interface WorkOrderDetail extends WorkOrderRow {
  branchId: string;
  description: string | null;
  notes: string | null;
  completionNotes: string | null;
  customerEmail: string | null;
  startedAt: Date | null;
  canceledAt: Date | null;
  reportPdfPath: string | null;
  itemList: WorkOrderItem[];
  events: Array<{ event: string; fromStatus: string | null; toStatus: string | null; note: string | null; actor: string | null; at: Date }>;
}

export async function getWorkOrder(ctx: ServiceCtx, id: string): Promise<WorkOrderDetail | null> {
  const list = await loadRow(ctx, id);
  if (!list) return null;
  return withRls(ctx.auth, async (tx) => {
    const extra = await tx
      .selectFrom("work_orders as w")
      .innerJoin("customers as c", "c.id", "w.customer_id")
      .select(["w.branch_id", "w.description", "w.notes", "w.completion_notes", "w.started_at", "w.canceled_at", "w.report_pdf_path", sql<string | null>`c.email::text`.as("customer_email")])
      .where("w.id", "=", id)
      .executeTakeFirstOrThrow();
    const items = await tx
      .selectFrom("work_order_items as it")
      .innerJoin("equipment as e", "e.id", "it.equipment_id")
      .innerJoin("maintenance_action_types as a", "a.id", "it.planned_action_type_id")
      .leftJoin("equipment_types as t", "t.id", "e.type_id")
      .select(["it.id", "it.equipment_id", "e.code", "e.category_code", "e.location", "t.name as type_name", "it.planned_action_type_id", "a.name as action_name",
        "it.status", "it.result", "it.observations", "it.record_id"])
      .where("it.work_order_id", "=", id)
      .orderBy("e.code")
      .orderBy("a.position")
      .execute();
    const events = await tx
      .selectFrom("work_order_events as ev")
      .leftJoin("profiles as p", "p.id", "ev.actor_id")
      .select(["ev.event", "ev.from_status", "ev.to_status", "ev.note", "ev.created_at", sql<string | null>`nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')`.as("actor")])
      .where("ev.work_order_id", "=", id)
      .orderBy("ev.created_at")
      .orderBy("ev.id")
      .execute();
    return {
      ...list,
      branchId: extra.branch_id,
      description: extra.description,
      notes: extra.notes,
      completionNotes: extra.completion_notes,
      customerEmail: extra.customer_email,
      startedAt: extra.started_at,
      canceledAt: extra.canceled_at,
      reportPdfPath: extra.report_pdf_path,
      itemList: items.map((i) => ({
        id: i.id, equipmentId: i.equipment_id, equipmentCode: i.code, categoryCode: i.category_code, location: i.location, typeName: i.type_name,
        actionTypeId: i.planned_action_type_id, actionName: i.action_name, status: i.status, result: i.result, observations: i.observations, recordId: i.record_id,
      })),
      events: events.map((e) => ({ event: e.event, fromStatus: e.from_status, toStatus: e.to_status, note: e.note, actor: e.actor, at: e.created_at })),
    };
  });
}

async function loadRow(ctx: ServiceCtx, id: string): Promise<WorkOrderRow | null> {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select w.id, w.number, w.status, w.service_type, w.scheduled_for, to_char(w.scheduled_time, 'HH24:MI') as scheduled_time,
             w.technician_id, t.full_name as technician_name, w.installation_id, i.name as installation_name,
             concat_ws(', ', i.address_line1, i.city) as installation_address, w.customer_id,
             trim(c.first_name || ' ' || c.last_name) as customer_name, w.created_at, w.completed_at,
             (select count(*) from work_order_items it where it.work_order_id = w.id) as items,
             (select count(*) from work_order_items it where it.work_order_id = w.id and it.status <> 'pending') as items_done
        from work_orders w
        join installations i on i.id = w.installation_id
        join customers c on c.id = w.customer_id
        left join technicians t on t.id = w.technician_id
       where w.id = ${id} and w.organization_id = ${ctx.membership.organizationId}
    `.execute(tx);
    return rows[0] ? mapRow(rows[0]) : null;
  });
}

function mapRow(r: Record<string, unknown>): WorkOrderRow {
  return {
    id: r.id as string, number: r.number as string, status: r.status as WorkOrderStatus, serviceType: r.service_type as string,
    scheduledFor: day(r.scheduled_for), scheduledTime: r.scheduled_time as string | null, technicianId: r.technician_id as string | null,
    technicianName: r.technician_name as string | null, installationId: r.installation_id as string, installationName: r.installation_name as string,
    installationAddress: r.installation_address as string, customerId: r.customer_id as string, customerName: r.customer_name as string,
    items: Number(r.items), itemsDone: Number(r.items_done), createdAt: r.created_at as Date, completedAt: r.completed_at as Date | null,
  };
}

/** Equipos y operaciones que vencen en una instalación hasta una fecha (para preparar la orden). */
export async function dueItemsForInstallation(ctx: ServiceCtx, installationId: string, until: string) {
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ equipment_id: string; code: string; category_code: string; location: string | null; action_type_id: string; action_name: string; next_due_on: Date }>`
      select e.id as equipment_id, e.code, e.category_code, e.location, a.id as action_type_id, a.name as action_name, s.next_due_on
        from equipment_action_schedules s
        join equipment e on e.id = s.equipment_id and e.deleted_at is null and e.status = 'in_service'
        join maintenance_action_types a on a.id = s.action_type_id
       where e.installation_id = ${installationId} and e.organization_id = ${ctx.membership.organizationId} and s.next_due_on <= ${until}::date
       order by s.next_due_on, e.code
    `.execute(tx);
    return rows.map((r) => ({ equipmentId: r.equipment_id, code: r.code, categoryCode: r.category_code, location: r.location, actionTypeId: r.action_type_id, actionName: r.action_name, nextDueOn: day(r.next_due_on)! }));
  });
}

export async function createWorkOrder(ctx: ServiceCtx, input: CreateWorkOrderInput): Promise<string> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const inst = await tx.selectFrom("installations").select(["branch_id", "customer_id"]).where("id", "=", input.installationId)
      .where("organization_id", "=", orgId).where("deleted_at", "is", null).executeTakeFirst();
    if (!inst) throw new DomainError("not_found");
    const status = input.technicianId ? "assigned" : input.scheduledFor ? "scheduled" : "pending";
    const wo = await tx
      .insertInto("work_orders")
      .values({
        organization_id: orgId,
        branch_id: inst.branch_id,
        customer_id: inst.customer_id,
        installation_id: input.installationId,
        service_type: input.serviceType,
        status,
        scheduled_for: input.scheduledFor,
        scheduled_time: input.scheduledTime,
        technician_id: input.technicianId,
        description: input.description,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const pairs = new Map<string, { equipmentId: string; actionTypeId: string }>();
    if (input.includeDue) {
      const until = input.dueUntil ?? addDays(todayIn(), 30);
      const { rows } = await sql<{ equipment_id: string; action_type_id: string }>`
        select s.equipment_id, s.action_type_id from equipment_action_schedules s
          join equipment e on e.id = s.equipment_id and e.deleted_at is null and e.status = 'in_service'
         where e.installation_id = ${input.installationId} and s.next_due_on <= ${until}::date
      `.execute(tx);
      for (const r of rows) pairs.set(`${r.equipment_id}:${r.action_type_id}`, { equipmentId: r.equipment_id, actionTypeId: r.action_type_id });
    }
    for (const it of input.items) {
      const [equipmentId, actionTypeId] = it.split(":");
      pairs.set(it.toLowerCase(), { equipmentId, actionTypeId });
    }
    if (pairs.size) {
      await tx
        .insertInto("work_order_items")
        .values([...pairs.values()].map((p) => ({ organization_id: orgId, branch_id: inst.branch_id, work_order_id: wo.id, equipment_id: p.equipmentId, planned_action_type_id: p.actionTypeId })))
        .execute();
    }
    return wo.id;
  });
}

export async function updateWorkOrder(
  ctx: ServiceCtx,
  input: { id: string; serviceType: string; scheduledFor: string | null; scheduledTime: string | null; technicianId: string | null; description: string | null; notes: string | null },
): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const cur = await tx.selectFrom("work_orders").select(["status"]).where("id", "=", input.id).where("organization_id", "=", ctx.membership.organizationId).executeTakeFirst();
    if (!cur) throw new DomainError("not_found");
    if (cur.status === "completed" || cur.status === "canceled") throw new DomainError("validation_error", "work_order_closed");
    // Estado coherente: con técnico → asignada; sin técnico pero con fecha → programada.
    let status = cur.status;
    if (cur.status === "pending" || cur.status === "scheduled" || cur.status === "assigned") {
      status = input.technicianId ? "assigned" : input.scheduledFor ? "scheduled" : "pending";
    }
    await tx
      .updateTable("work_orders")
      .set({ service_type: input.serviceType, scheduled_for: input.scheduledFor, scheduled_time: input.scheduledTime, technician_id: input.technicianId,
        description: input.description, notes: input.notes, status })
      .where("id", "=", input.id)
      .execute();
  });
}

export async function setWorkOrderStatus(ctx: ServiceCtx, id: string, status: WorkOrderStatus, completionNotes: string | null): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const r = await tx
      .updateTable("work_orders")
      .set({ status, ...(status === "completed" ? { completion_notes: completionNotes } : {}) })
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

export async function addWorkOrderItems(ctx: ServiceCtx, id: string, items: Array<{ equipmentId: string; actionTypeId: string }>): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const wo = await tx.selectFrom("work_orders").select(["branch_id"]).where("id", "=", id).where("organization_id", "=", ctx.membership.organizationId).executeTakeFirst();
    if (!wo) throw new DomainError("not_found");
    if (!items.length) return;
    await tx
      .insertInto("work_order_items")
      .values(items.map((p) => ({ organization_id: ctx.membership.organizationId, branch_id: wo.branch_id, work_order_id: id, equipment_id: p.equipmentId, planned_action_type_id: p.actionTypeId })))
      .onConflict((oc) => oc.columns(["work_order_id", "equipment_id", "planned_action_type_id"]).doNothing())
      .execute();
  });
}

export async function removeWorkOrderItem(ctx: ServiceCtx, itemId: string): Promise<{ workOrderId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx.deleteFrom("work_order_items").where("id", "=", itemId).where("organization_id", "=", ctx.membership.organizationId)
      .where("status", "=", "pending").returning("work_order_id").executeTakeFirst();
    if (!r) throw new DomainError("not_found");
    return { workOrderId: r.work_order_id };
  });
}

/** Resultado de un equipo de la orden: crea la actuación y cierra la línea (todo o nada). */
export async function recordItemResult(
  ctx: ServiceCtx,
  input: {
    itemId: string;
    result: "compliant" | "compliant_with_remarks" | "non_compliant" | "not_performed";
    performedOn: string;
    observations: string | null;
    nextActionRecommendedOn: string | null;
    materials: Array<{ description: string; reference: string | null; quantity: number; unit: string | null }>;
    incidentTitle: string | null;
    incidentSeverity: "low" | "medium" | "high" | "critical";
  },
): Promise<{ workOrderId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const item = await tx
      .selectFrom("work_order_items as it")
      .innerJoin("work_orders as w", "w.id", "it.work_order_id")
      .select(["it.id", "it.work_order_id", "it.equipment_id", "it.planned_action_type_id", "it.status", "w.status as wo_status", "w.technician_id"])
      .where("it.id", "=", input.itemId)
      .where("it.organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (!item) throw new DomainError("not_found");
    if (item.status !== "pending") throw new DomainError("validation_error", "work_order_item_done");
    if (item.wo_status !== "in_progress") throw new DomainError("validation_error", "work_order_not_in_progress");
    const recordId = await insertRecord(tx, ctx, {
      equipmentId: item.equipment_id,
      actionTypeId: item.planned_action_type_id,
      performedOn: input.performedOn,
      result: input.result,
      observations: input.observations,
      nextActionRecommendedOn: input.nextActionRecommendedOn,
      technicianId: item.technician_id,
      workOrderId: item.work_order_id,
      materials: input.materials,
      incidentTitle: input.incidentTitle,
      incidentSeverity: input.incidentSeverity,
    });
    await tx
      .updateTable("work_order_items")
      .set({ status: input.result === "not_performed" ? "not_done" : "done", result: input.result, observations: input.observations, record_id: recordId })
      .where("id", "=", input.itemId)
      .execute();
    return { workOrderId: item.work_order_id };
  });
}

export async function addWorkOrderNote(ctx: ServiceCtx, id: string, note: string): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const wo = await tx.selectFrom("work_orders").select(["branch_id"]).where("id", "=", id).where("organization_id", "=", ctx.membership.organizationId).executeTakeFirst();
    if (!wo) throw new DomainError("not_found");
    await tx.insertInto("work_order_events").values({ organization_id: ctx.membership.organizationId, branch_id: wo.branch_id, work_order_id: id, event: "note", note, actor_id: ctx.auth.userId }).execute();
  });
}
