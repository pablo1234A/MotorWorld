import "server-only";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import { escapeLike, type Page } from "@/lib/pagination";
import { normalizePlate } from "@/lib/plate";
import type { MaintenanceInput } from "@/lib/validation/workshop";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Historial de mantenimiento. Al registrar/editar/borrar una revisión, un
 * trigger recalcula la ficha del vehículo (última y próxima revisión, km) y
 * guarda la lectura de kilometraje.
 */

function assertNotFuture(serviceDate: string) {
  // La BD admite hoy + 1 día por zonas horarias; la aplicación usa la fecha de la Península.
  if (serviceDate > addDays(todayIn(), 1)) throw new DomainError("validation_error", "service_date_in_future");
}

async function insertParts(tx: Tx, tenant: { organization_id: string; branch_id: string }, recordId: string, parts: MaintenanceInput["parts"]) {
  if (!parts.length) return;
  await tx
    .insertInto("maintenance_parts")
    .values(
      parts.map((p) => ({
        organization_id: tenant.organization_id,
        branch_id: tenant.branch_id,
        record_id: recordId,
        description: p.description,
        reference: p.reference,
        quantity: String(p.quantity),
      })),
    )
    .execute();
}

export async function createRecord(ctx: ServiceCtx, vehicleId: string, input: MaintenanceInput): Promise<string> {
  assertNotFuture(input.serviceDate);
  return withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles")
      .select(["organization_id", "branch_id"])
      .where("id", "=", vehicleId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!v) throw new DomainError("not_found");
    const record = await tx
      .insertInto("maintenance_records")
      .values({
        organization_id: v.organization_id,
        branch_id: v.branch_id,
        vehicle_id: vehicleId,
        service_date: input.serviceDate,
        km: input.km,
        work_performed: input.workPerformed,
        notes: input.notes,
        next_recommended_date: input.nextRecommendedDate,
        next_recommended_km: input.nextRecommendedKm,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertParts(tx, v, record.id, input.parts);
    return record.id;
  });
}

export async function updateRecord(ctx: ServiceCtx, recordId: string, input: MaintenanceInput): Promise<{ vehicleId: string }> {
  assertNotFuture(input.serviceDate);
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .selectFrom("maintenance_records")
      .select(["organization_id", "branch_id", "vehicle_id"])
      .where("id", "=", recordId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (!r) throw new DomainError("not_found");
    const result = await tx
      .updateTable("maintenance_records")
      .set({
        service_date: input.serviceDate,
        km: input.km,
        work_performed: input.workPerformed,
        notes: input.notes,
        next_recommended_date: input.nextRecommendedDate,
        next_recommended_km: input.nextRecommendedKm,
      })
      .where("id", "=", recordId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    await tx.deleteFrom("maintenance_parts").where("record_id", "=", recordId).execute();
    await insertParts(tx, r, recordId, input.parts);
    return { vehicleId: r.vehicle_id };
  });
}

/** Solo administradores (política RLS con el permiso centinela 'admin'). */
export async function deleteRecord(ctx: ServiceCtx, recordId: string): Promise<{ vehicleId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .selectFrom("maintenance_records")
      .select("vehicle_id")
      .where("id", "=", recordId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (!r) throw new DomainError("not_found");
    const result = await tx.deleteFrom("maintenance_records").where("id", "=", recordId).executeTakeFirst();
    if (Number(result.numDeletedRows) === 0) throw new DomainError("permission_denied");
    return { vehicleId: r.vehicle_id };
  });
}

export interface HistoryFilters {
  q?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface HistoryRow {
  id: string;
  serviceDate: string;
  km: number | null;
  workPerformed: string;
  vehicleId: string;
  plate: string;
  vehicleName: string;
  customerId: string;
  customerName: string;
  branchName: string;
  partsCount: number;
}

export async function listHistory(ctx: ServiceCtx, f: HistoryFilters): Promise<Page<HistoryRow>> {
  const orgId = ctx.membership.organizationId;
  const q = f.q?.trim().toLowerCase();
  const like = q ? `%${escapeLike(q)}%` : null;
  const plate = q ? normalizePlate(q) : "";
  const plateLike = plate.length >= 2 ? `%${escapeLike(plate)}%` : null;

  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("maintenance_records as r")
      .innerJoin("vehicles as v", "v.id", "r.vehicle_id")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .innerJoin("branches as b", "b.id", "r.branch_id")
      .where("r.organization_id", "=", orgId)
      .where("v.deleted_at", "is", null);
    if (f.branchId) query = query.where("r.branch_id", "=", f.branchId);
    if (f.from) query = query.where("r.service_date", ">=", f.from);
    if (f.to) query = query.where("r.service_date", "<=", f.to);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          ...(plateLike ? [eb("v.plate_normalized", "like", plateLike)] : []),
          eb(sql`lower(r.work_performed)`, "like", like),
          eb(sql`lower(c.first_name || ' ' || c.last_name)`, "like", like),
        ]),
      );
    }
    const rows = await query
      .select([
        "r.id",
        "r.service_date as serviceDate",
        "r.km",
        "r.work_performed as workPerformed",
        "v.id as vehicleId",
        "v.plate",
        sql<string>`trim(coalesce(v.make, '') || ' ' || coalesce(v.model, ''))`.as("vehicleName"),
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "b.name as branchName",
        sql<number>`(select count(*)::int from maintenance_parts mp where mp.record_id = r.id)`.as("partsCount"),
        sql<string>`count(*) over ()`.as("total"),
      ])
      .orderBy("r.service_date", "desc")
      .orderBy("r.created_at", "desc")
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize)
      .execute();
    return {
      rows: rows.map(({ total: _t, ...r }) => r),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export async function getRecord(ctx: ServiceCtx, recordId: string) {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .selectFrom("maintenance_records")
      .select([
        "id",
        "vehicle_id as vehicleId",
        "service_date as serviceDate",
        "km",
        "work_performed as workPerformed",
        "notes",
        "next_recommended_date as nextRecommendedDate",
        "next_recommended_km as nextRecommendedKm",
      ])
      .where("id", "=", recordId)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (!r) return null;
    const parts = await tx
      .selectFrom("maintenance_parts")
      .select(["description", "reference", "quantity"])
      .where("record_id", "=", recordId)
      .orderBy("created_at")
      .execute();
    return { ...r, parts };
  });
}
