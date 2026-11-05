import "server-only";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import { escapeLike, type Page } from "@/lib/pagination";
import { normalizePlate } from "@/lib/plate";
import type { CreateVehicleInput, UpdateVehicleInput } from "@/lib/validation/workshop";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Vehículos. Un vehículo pertenece siempre a la sucursal de su propietario
 * (FK compuesta): la sucursal no se elige, se deriva del cliente.
 */

export type DueFilter = "overdue" | "30" | "90" | "none";

export interface VehicleListFilters {
  q?: string;
  branchId?: string;
  status?: string;
  due?: DueFilter;
  page: number;
  pageSize: number;
}

export interface VehicleListRow {
  id: string;
  plate: string;
  make: string | null;
  model: string | null;
  status: string;
  currentKm: number | null;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  nextServiceKm: number | null;
  customerId: string;
  customerName: string;
  branchName: string;
}

export async function listVehicles(ctx: ServiceCtx, f: VehicleListFilters, today = todayIn()): Promise<Page<VehicleListRow>> {
  const orgId = ctx.membership.organizationId;
  const q = f.q?.trim().toLowerCase();
  const like = q ? `%${escapeLike(q)}%` : null;
  const plate = q ? normalizePlate(q) : "";
  const plateLike = plate.length >= 2 ? `%${escapeLike(plate)}%` : null;

  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("vehicles as v")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .innerJoin("branches as b", "b.id", "v.branch_id")
      .where("v.organization_id", "=", orgId)
      .where("v.deleted_at", "is", null);

    if (f.branchId) query = query.where("v.branch_id", "=", f.branchId);
    if (f.status) query = query.where("v.status", "=", f.status);
    if (f.due === "overdue") query = query.where("v.next_service_date", "<", today);
    if (f.due === "30") query = query.where("v.next_service_date", ">=", today).where("v.next_service_date", "<=", addDays(today, 30));
    if (f.due === "90") query = query.where("v.next_service_date", ">=", today).where("v.next_service_date", "<=", addDays(today, 90));
    if (f.due === "none") query = query.where("v.next_service_date", "is", null);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          ...(plateLike ? [eb("v.plate_normalized", "like", plateLike)] : []),
          eb(sql`lower(coalesce(v.make, '') || ' ' || coalesce(v.model, ''))`, "like", like),
          eb(sql`lower(c.first_name || ' ' || c.last_name)`, "like", like),
          eb("v.vin", "like", plateLike ?? like),
        ]),
      );
    }

    const rows = await query
      .select([
        "v.id",
        "v.plate",
        "v.make",
        "v.model",
        "v.status",
        "v.current_km as currentKm",
        "v.last_service_date as lastServiceDate",
        "v.next_service_date as nextServiceDate",
        "v.next_service_km as nextServiceKm",
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "b.name as branchName",
        sql<string>`count(*) over ()`.as("total"),
      ])
      .$call((qb) =>
        f.due ? qb.orderBy(sql`v.next_service_date asc nulls last`).orderBy("v.id") : qb.orderBy("v.created_at", "desc").orderBy("v.id"),
      )
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

export interface MaintenancePart {
  id: string;
  description: string;
  reference: string | null;
  quantity: string;
}

export interface MaintenanceEntry {
  id: string;
  serviceDate: string;
  km: number | null;
  workPerformed: string;
  notes: string | null;
  nextRecommendedDate: string | null;
  nextRecommendedKm: number | null;
  ownerName: string | null;
  createdByName: string | null;
  createdAt: Date;
  parts: MaintenancePart[];
}

export interface VehicleDetail {
  id: string;
  branchId: string;
  branchName: string;
  plate: string;
  make: string | null;
  model: string | null;
  vin: string | null;
  status: string;
  currentKm: number | null;
  kmUpdatedAt: Date | null;
  lastServiceDate: string | null;
  lastServiceKm: number | null;
  nextServiceDate: string | null;
  nextServiceKm: number | null;
  nextServiceSource: string;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  history: MaintenanceEntry[];
  mileage: Array<{ km: number; readOn: string; source: string }>;
}

export async function getVehicle(ctx: ServiceCtx, id: string): Promise<VehicleDetail | null> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles as v")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .innerJoin("branches as b", "b.id", "v.branch_id")
      .select([
        "v.id",
        "v.branch_id as branchId",
        "b.name as branchName",
        "v.plate",
        "v.make",
        "v.model",
        "v.vin",
        "v.status",
        "v.current_km as currentKm",
        "v.km_updated_at as kmUpdatedAt",
        "v.last_service_date as lastServiceDate",
        "v.last_service_km as lastServiceKm",
        "v.next_service_date as nextServiceDate",
        "v.next_service_km as nextServiceKm",
        "v.next_service_source as nextServiceSource",
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "c.email as customerEmail",
        "c.phone as customerPhone",
      ])
      .where("v.id", "=", id)
      .where("v.organization_id", "=", orgId)
      .where("v.deleted_at", "is", null)
      .executeTakeFirst();
    if (!v) return null;

    const records = await tx
      .selectFrom("maintenance_records as r")
      .leftJoin("customers as owner", "owner.id", "r.customer_id_snapshot")
      .leftJoin("profiles as p", "p.id", "r.created_by")
      .select([
        "r.id",
        "r.service_date as serviceDate",
        "r.km",
        "r.work_performed as workPerformed",
        "r.notes",
        "r.next_recommended_date as nextRecommendedDate",
        "r.next_recommended_km as nextRecommendedKm",
        "r.created_at as createdAt",
        sql<string | null>`nullif(trim(coalesce(owner.first_name, '') || ' ' || coalesce(owner.last_name, '')), '')`.as("ownerName"),
        sql<string | null>`nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')`.as("createdByName"),
      ])
      .where("r.vehicle_id", "=", id)
      .orderBy("r.service_date", "desc")
      .orderBy("r.created_at", "desc")
      .execute();

    const parts = records.length
      ? await tx
          .selectFrom("maintenance_parts")
          .select(["id", "record_id", "description", "reference", "quantity"])
          .where(
            "record_id",
            "in",
            records.map((r) => r.id),
          )
          .orderBy("created_at")
          .execute()
      : [];

    const mileage = await tx
      .selectFrom("mileage_readings")
      .select(["km", "read_on as readOn", "source"])
      .where("vehicle_id", "=", id)
      .orderBy("read_on", "desc")
      .orderBy("created_at", "desc")
      .limit(10)
      .execute();

    const { customerId, customerName, customerEmail, customerPhone, ...vehicle } = v;
    return {
      ...vehicle,
      customer: { id: customerId, name: customerName, email: customerEmail ? String(customerEmail) : null, phone: customerPhone },
      history: records.map((r) => ({
        ...r,
        parts: parts.filter((p) => p.record_id === r.id).map(({ record_id: _r, ...p }) => p),
      })),
      mileage,
    };
  });
}

async function customerTenant(tx: Tx, ctx: ServiceCtx, customerId: string) {
  const c = await tx
    .selectFrom("customers")
    .select(["organization_id", "branch_id"])
    .where("id", "=", customerId)
    .where("organization_id", "=", ctx.membership.organizationId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!c) throw new DomainError("not_found");
  return c;
}

/**
 * Alta de vehículo. Si se indica la última revisión, se registra como primera
 * entrada del historial (la ficha se calcula siempre a partir del historial).
 */
export async function createVehicle(ctx: ServiceCtx, input: CreateVehicleInput): Promise<string> {
  return withRls(ctx.auth, async (tx) => {
    const tenant = await customerTenant(tx, ctx, input.customerId);
    const vehicle = await tx
      .insertInto("vehicles")
      .values({
        organization_id: tenant.organization_id,
        branch_id: tenant.branch_id,
        customer_id: input.customerId,
        plate: input.plate.trim().toUpperCase(),
        make: input.make,
        model: input.model,
        vin: input.vin,
        current_km: input.currentKm ?? input.lastServiceKm,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (input.lastServiceDate) {
      await tx
        .insertInto("maintenance_records")
        .values({
          organization_id: tenant.organization_id,
          branch_id: tenant.branch_id,
          vehicle_id: vehicle.id,
          service_date: input.lastServiceDate,
          km: input.lastServiceKm,
          work_performed: "Última revisión (registrada al dar de alta el vehículo)",
          next_recommended_date: input.nextServiceDate,
          created_by: ctx.auth.userId,
        })
        .execute();
    } else if (input.nextServiceDate) {
      await tx
        .updateTable("vehicles")
        .set({ next_service_date: input.nextServiceDate, next_service_source: "manual" })
        .where("id", "=", vehicle.id)
        .execute();
    }
    return vehicle.id;
  });
}

async function updateOne(ctx: ServiceCtx, id: string, fn: (tx: Tx) => Promise<{ numUpdatedRows: bigint }>): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const exists = await tx
      .selectFrom("vehicles")
      .select("id")
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!exists) throw new DomainError("not_found");
    const r = await fn(tx);
    // Visible pero no actualizable ⇒ sin permiso de escritura (RLS).
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

export async function updateVehicle(ctx: ServiceCtx, input: UpdateVehicleInput): Promise<void> {
  await updateOne(ctx, input.id, (tx) =>
    tx
      .updateTable("vehicles")
      .set({ plate: input.plate.trim().toUpperCase(), make: input.make, model: input.model, vin: input.vin, status: input.status })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirstOrThrow(),
  );
}

/**
 * Lectura manual de kilómetros. Una lectura inferior a la actual (cambio de
 * cuadro, error previo) solo se acepta si se confirma expresamente.
 */
export async function recordMileage(
  ctx: ServiceCtx,
  input: { id: string; km: number; readOn: string; confirmLower: boolean },
): Promise<void> {
  if (input.readOn > addDays(todayIn(), 1)) throw new DomainError("validation_error", "read_on_in_future");
  await withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles")
      .select(["organization_id", "branch_id", "current_km"])
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!v) throw new DomainError("not_found");
    if (v.current_km !== null && input.km < v.current_km && !input.confirmLower) {
      throw new DomainError("validation_error", "km_lower_than_current");
    }
    await tx
      .insertInto("mileage_readings")
      .values({
        organization_id: v.organization_id,
        branch_id: v.branch_id,
        vehicle_id: input.id,
        km: input.km,
        read_on: input.readOn,
        source: "manual",
        created_by: ctx.auth.userId,
      })
      .execute();
    const r = await tx.updateTable("vehicles").set({ current_km: input.km }).where("id", "=", input.id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

/** Próxima revisión fijada a mano (se respeta hasta la siguiente revisión registrada). */
export async function setNextService(
  ctx: ServiceCtx,
  input: { id: string; nextServiceDate: string | null; nextServiceKm: number | null },
): Promise<void> {
  await updateOne(ctx, input.id, (tx) =>
    tx
      .updateTable("vehicles")
      .set({ next_service_date: input.nextServiceDate, next_service_km: input.nextServiceKm, next_service_source: "manual" })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirstOrThrow(),
  );
}

/** Cambio de propietario dentro de la misma sucursal. El historial se conserva. */
export async function changeOwner(ctx: ServiceCtx, id: string, customerId: string): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles")
      .select(["branch_id", "customer_id"])
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!v) throw new DomainError("not_found");
    if (v.customer_id === customerId) return;
    const target = await customerTenant(tx, ctx, customerId);
    if (target.branch_id !== v.branch_id) throw new DomainError("integrity_violation", "owner_other_branch");
    const r = await tx.updateTable("vehicles").set({ customer_id: customerId }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

export async function deleteVehicle(ctx: ServiceCtx, id: string): Promise<{ customerId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles")
      .select("customer_id")
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!v) throw new DomainError("not_found");
    const r = await tx.updateTable("vehicles").set({ deleted_at: new Date() }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    return { customerId: v.customer_id };
  });
}
