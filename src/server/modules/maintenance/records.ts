import "server-only";

import { sql } from "kysely";

import type { Page } from "@/lib/pagination";
import type { RecordInput } from "@/lib/validation/pci";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Historial de actuaciones sobre equipos PCI. Una actuación registrada no se
 * edita en silencio: la BD exige motivo para corregirla (queda fechada y
 * firmada, y la auditoría guarda qué cambió) o se anula con motivo. Los
 * vencimientos se recalculan solos (trigger).
 */

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export interface RecordRow {
  id: string;
  performedOn: string;
  equipmentId: string;
  equipmentCode: string;
  categoryCode: string;
  installationId: string;
  installationName: string;
  actionName: string;
  actionKind: string;
  result: string;
  observations: string | null;
  nextActionRecommendedOn: string | null;
  technicianName: string | null;
  workOrderId: string | null;
  workOrderNumber: string | null;
  amendedAt: Date | null;
  amendmentReason: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  materials: Array<{ description: string; reference: string | null; quantity: number; unit: string | null }>;
}

export interface RecordFilters {
  equipmentId?: string;
  installationId?: string;
  workOrderId?: string;
  from?: string;
  to?: string;
  result?: string;
  includeVoided?: boolean;
  page: number;
  pageSize: number;
}

export async function listRecords(ctx: ServiceCtx, f: RecordFilters): Promise<Page<RecordRow>> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select m.id, m.performed_on, m.equipment_id, e.code as equipment_code, e.category_code, m.installation_id, i.name as installation_name,
             a.name as action_name, a.kind as action_kind, m.result, m.observations, m.next_action_recommended_on, t.full_name as technician_name,
             m.work_order_id, w.number as work_order_number, m.amended_at, m.amendment_reason, m.voided_at, m.void_reason, m.created_at,
             coalesce((select json_agg(json_build_object('description', x.description, 'reference', x.reference, 'quantity', x.quantity, 'unit', x.unit))
                         from equipment_record_materials x where x.record_id = m.id), '[]') as materials,
             count(*) over () as total
        from equipment_maintenance_records m
        join equipment e on e.id = m.equipment_id
        join installations i on i.id = m.installation_id
        join maintenance_action_types a on a.id = m.action_type_id
        left join technicians t on t.id = m.technician_id
        left join work_orders w on w.id = m.work_order_id
       where m.organization_id = ${orgId}
         ${f.includeVoided ? sql`` : sql`and m.voided_at is null`}
         ${f.equipmentId ? sql`and m.equipment_id = ${f.equipmentId}` : sql``}
         ${f.installationId ? sql`and m.installation_id = ${f.installationId}` : sql``}
         ${f.workOrderId ? sql`and m.work_order_id = ${f.workOrderId}` : sql``}
         ${f.from ? sql`and m.performed_on >= ${f.from}::date` : sql``}
         ${f.to ? sql`and m.performed_on <= ${f.to}::date` : sql``}
         ${f.result ? sql`and m.result = ${f.result}` : sql``}
       order by m.performed_on desc, m.created_at desc
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}
    `.execute(tx);
    return {
      rows: rows.map((r) => ({
        id: r.id as string,
        performedOn: day(r.performed_on)!,
        equipmentId: r.equipment_id as string,
        equipmentCode: r.equipment_code as string,
        categoryCode: r.category_code as string,
        installationId: r.installation_id as string,
        installationName: r.installation_name as string,
        actionName: r.action_name as string,
        actionKind: r.action_kind as string,
        result: r.result as string,
        observations: r.observations as string | null,
        nextActionRecommendedOn: day(r.next_action_recommended_on),
        technicianName: r.technician_name as string | null,
        workOrderId: r.work_order_id as string | null,
        workOrderNumber: r.work_order_number as string | null,
        amendedAt: r.amended_at as Date | null,
        amendmentReason: r.amendment_reason as string | null,
        voidedAt: r.voided_at as Date | null,
        voidReason: r.void_reason as string | null,
        createdAt: r.created_at as Date,
        materials: (r.materials as RecordRow["materials"]).map((m) => ({ ...m, quantity: Number(m.quantity) })),
      })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

/** Inserta una actuación (y sus materiales e incidencia) en la transacción dada. */
export async function insertRecord(tx: Tx, ctx: ServiceCtx, input: RecordInput): Promise<string> {
  const orgId = ctx.membership.organizationId;
  const eq = await tx.selectFrom("equipment").select(["branch_id", "installation_id"]).where("id", "=", input.equipmentId)
    .where("organization_id", "=", orgId).where("deleted_at", "is", null).executeTakeFirst();
  if (!eq) throw new DomainError("not_found");
  const row = await tx
    .insertInto("equipment_maintenance_records")
    .values({
      organization_id: orgId,
      branch_id: eq.branch_id,
      equipment_id: input.equipmentId,
      installation_id: eq.installation_id,
      work_order_id: input.workOrderId,
      technician_id: input.technicianId,
      action_type_id: input.actionTypeId,
      performed_on: input.performedOn,
      result: input.result,
      observations: input.observations,
      next_action_recommended_on: input.nextActionRecommendedOn,
      created_by: ctx.auth.userId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  if (input.materials.length) {
    await tx
      .insertInto("equipment_record_materials")
      .values(input.materials.map((m) => ({ organization_id: orgId, branch_id: eq.branch_id, record_id: row.id, description: m.description, reference: m.reference, quantity: String(m.quantity), unit: m.unit })))
      .execute();
  }
  if (input.incidentTitle) {
    await tx
      .insertInto("equipment_incidents")
      .values({
        organization_id: orgId,
        branch_id: eq.branch_id,
        installation_id: eq.installation_id,
        equipment_id: input.equipmentId,
        work_order_id: input.workOrderId,
        record_id: row.id,
        severity: input.incidentSeverity,
        title: input.incidentTitle,
        description: input.observations,
        detected_on: input.performedOn,
        reported_by: ctx.auth.userId,
      })
      .execute();
  }
  return row.id;
}

export async function createRecord(ctx: ServiceCtx, input: RecordInput): Promise<string> {
  return withRls(ctx.auth, (tx) => insertRecord(tx, ctx, input));
}

/** Corrección: exige motivo; la BD la fecha, la firma y la audita. */
export async function amendRecord(
  ctx: ServiceCtx,
  input: { id: string; result: string; observations: string | null; nextActionRecommendedOn: string | null; amendmentReason: string },
): Promise<{ equipmentId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .updateTable("equipment_maintenance_records")
      .set({ result: input.result, observations: input.observations, next_action_recommended_on: input.nextActionRecommendedOn, amendment_reason: input.amendmentReason })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("voided_at", "is", null)
      .returning("equipment_id")
      .executeTakeFirst();
    if (!r) throw new DomainError("not_found");
    return { equipmentId: r.equipment_id };
  });
}

/** Anulación (registro erróneo): no se borra, queda tachado con su motivo. */
export async function voidRecord(ctx: ServiceCtx, id: string, reason: string): Promise<{ equipmentId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .updateTable("equipment_maintenance_records")
      .set({ voided_at: new Date(), void_reason: reason })
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("voided_at", "is", null)
      .returning("equipment_id")
      .executeTakeFirst();
    if (!r) throw new DomainError("not_found");
    return { equipmentId: r.equipment_id };
  });
}
