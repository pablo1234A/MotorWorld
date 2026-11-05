import "server-only";

import { sql } from "kysely";

import { escapeLike, type Page } from "@/lib/pagination";
import { normalizePlate } from "@/lib/plate";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/lib/validation/workshop";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Clientes. RLS limita lo visible a las sucursales del usuario y exige
 * customers.write / customers.delete (y suscripción activa) para escribir;
 * aquí se filtra además por organización de forma explícita.
 */

export interface CustomerListFilters {
  q?: string;
  branchId?: string;
  email?: "with" | "without";
  sort?: "recent" | "name";
  page: number;
  pageSize: number;
}

export interface CustomerListRow {
  id: string;
  branchName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  remindersOptOut: boolean;
  vehicleCount: number;
  nextServiceDate: string | null;
  createdAt: Date;
}

export async function listCustomers(ctx: ServiceCtx, f: CustomerListFilters): Promise<Page<CustomerListRow>> {
  const orgId = ctx.membership.organizationId;
  const q = f.q?.trim().toLowerCase();
  const like = q ? `%${escapeLike(q)}%` : null;
  const plate = q ? normalizePlate(q) : "";
  const plateLike = plate.length >= 3 ? `%${escapeLike(plate)}%` : null;
  const digits = q ? q.replace(/\D/g, "") : "";
  const phoneLike = digits.length >= 4 ? `%${digits}%` : null;

  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("customers as c")
      .innerJoin("branches as b", "b.id", "c.branch_id")
      .where("c.organization_id", "=", orgId)
      .where("c.deleted_at", "is", null);

    if (f.branchId) query = query.where("c.branch_id", "=", f.branchId);
    if (f.email === "with") query = query.where("c.email", "is not", null);
    if (f.email === "without") query = query.where("c.email", "is", null);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          eb(sql`lower(c.first_name || ' ' || c.last_name)`, "like", like),
          eb(sql`c.email::text`, "like", like),
          ...(phoneLike ? [eb("c.phone", "like", phoneLike)] : []),
          ...(plateLike
            ? [
                eb.exists(
                  eb
                    .selectFrom("vehicles as v")
                    .select(sql`1`.as("one"))
                    .whereRef("v.customer_id", "=", "c.id")
                    .where("v.deleted_at", "is", null)
                    .where("v.plate_normalized", "like", plateLike),
                ),
              ]
            : []),
        ]),
      );
    }

    const rows = await query
      .select([
        "c.id",
        "b.name as branchName",
        "c.first_name as firstName",
        "c.last_name as lastName",
        "c.email",
        "c.phone",
        "c.source",
        "c.reminders_opt_out as remindersOptOut",
        "c.created_at as createdAt",
        sql<string>`count(*) over ()`.as("total"),
        sql<number>`(select count(*)::int from vehicles v where v.customer_id = c.id and v.deleted_at is null)`.as("vehicleCount"),
        sql<string | null>`(select min(v.next_service_date)::text from vehicles v
                            where v.customer_id = c.id and v.deleted_at is null and v.status = 'active')`.as("nextServiceDate"),
      ])
      .$call((qb) =>
        f.sort === "name"
          ? qb.orderBy("c.first_name").orderBy("c.last_name").orderBy("c.id")
          : qb.orderBy("c.created_at", "desc").orderBy("c.id"),
      )
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize)
      .execute();

    return {
      rows: rows.map(({ total: _t, ...r }) => ({ ...r, email: r.email ? String(r.email) : null })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export interface CustomerVehicle {
  id: string;
  plate: string;
  make: string | null;
  model: string | null;
  status: string;
  currentKm: number | null;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
}

export interface CustomerHistoryEntry {
  id: string;
  vehicleId: string;
  plate: string;
  serviceDate: string;
  km: number | null;
  workPerformed: string;
}

export interface CustomerDetail {
  id: string;
  branchId: string;
  branchName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  notes: string | null;
  remindersOptOut: boolean;
  createdAt: Date;
  updatedAt: Date;
  vehicles: CustomerVehicle[];
  history: CustomerHistoryEntry[];
}

export async function getCustomer(ctx: ServiceCtx, id: string): Promise<CustomerDetail | null> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const c = await tx
      .selectFrom("customers as c")
      .innerJoin("branches as b", "b.id", "c.branch_id")
      .select([
        "c.id",
        "c.branch_id as branchId",
        "b.name as branchName",
        "c.first_name as firstName",
        "c.last_name as lastName",
        "c.email",
        "c.phone",
        "c.source",
        "c.notes",
        "c.reminders_opt_out as remindersOptOut",
        "c.created_at as createdAt",
        "c.updated_at as updatedAt",
      ])
      .where("c.id", "=", id)
      .where("c.organization_id", "=", orgId)
      .where("c.deleted_at", "is", null)
      .executeTakeFirst();
    if (!c) return null;

    const vehicles = await tx
      .selectFrom("vehicles")
      .select([
        "id",
        "plate",
        "make",
        "model",
        "status",
        "current_km as currentKm",
        "last_service_date as lastServiceDate",
        "next_service_date as nextServiceDate",
      ])
      .where("customer_id", "=", id)
      .where("deleted_at", "is", null)
      .orderBy("status")
      .orderBy("plate")
      .execute();

    // Historial de los vehículos que tiene ahora y de las revisiones que se le hicieron como propietario.
    const history = await tx
      .selectFrom("maintenance_records as r")
      .innerJoin("vehicles as v", "v.id", "r.vehicle_id")
      .select(["r.id", "r.vehicle_id as vehicleId", "v.plate", "r.service_date as serviceDate", "r.km", "r.work_performed as workPerformed"])
      .where("r.organization_id", "=", orgId)
      .where((eb) => eb.or([eb("v.customer_id", "=", id), eb("r.customer_id_snapshot", "=", id)]))
      .where("v.deleted_at", "is", null)
      .orderBy("r.service_date", "desc")
      .orderBy("r.created_at", "desc")
      .limit(50)
      .execute();

    return { ...c, email: c.email ? String(c.email) : null, vehicles, history };
  });
}

export interface DuplicateMatch {
  id: string;
  name: string;
  reason: "email" | "phone";
}

/** Posibles duplicados por email o teléfono en la misma sucursal. */
export async function findDuplicates(
  ctx: ServiceCtx,
  branchId: string,
  email: string | null,
  phone: string | null,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  if (!email && !phone) return [];
  return withRls(ctx.auth, async (tx) => {
    const rows = await tx
      .selectFrom("customers")
      .select(["id", "first_name", "last_name", "email", "phone"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "=", branchId)
      .where("deleted_at", "is", null)
      .where((eb) => eb.or([...(email ? [eb("email", "=", email)] : []), ...(phone ? [eb("phone", "=", phone)] : [])]))
      .$if(Boolean(excludeId), (qb) => qb.where("id", "!=", excludeId!))
      .limit(5)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      reason: email && String(r.email) === email ? "email" : "phone",
    }));
  });
}

export type CreateCustomerResult = { kind: "created"; id: string } | { kind: "duplicates"; matches: DuplicateMatch[] };

export async function createCustomer(ctx: ServiceCtx, input: CreateCustomerInput): Promise<CreateCustomerResult> {
  if (!input.confirmDuplicate) {
    const matches = await findDuplicates(ctx, input.branchId, input.email, input.phone);
    if (matches.length) return { kind: "duplicates", matches };
  }
  const row = await withRls(ctx.auth, (tx) =>
    tx
      .insertInto("customers")
      .values({
        organization_id: ctx.membership.organizationId,
        branch_id: input.branchId,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        source: input.source,
        notes: input.notes,
        reminders_opt_out: input.remindersOptOut,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow(),
  );
  return { kind: "created", id: row.id };
}

export async function updateCustomer(ctx: ServiceCtx, input: UpdateCustomerInput): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const current = await tx
      .selectFrom("customers")
      .select(["source", "reminders_opt_out"])
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!current) throw new DomainError("not_found");

    const result = await tx
      .updateTable("customers")
      .set({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        // Los orígenes fijados por el sistema (importación, página de citas, API) se conservan.
        source: ["import", "booking_page", "api"].includes(current.source) ? current.source : input.source,
        notes: input.notes,
        reminders_opt_out: input.remindersOptOut,
        opted_out_at: input.remindersOptOut && !current.reminders_opt_out ? new Date() : input.remindersOptOut ? undefined : null,
      })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

/**
 * Borrado lógico. Si el cliente tiene vehículos, solo se borra si se pide
 * expresamente borrar también sus vehículos (en la misma transacción). El
 * historial de mantenimiento se conserva. La purga definitiva la hará un job
 * a los 30 días.
 */
export async function deleteCustomer(ctx: ServiceCtx, id: string, withVehicles: boolean): Promise<{ vehicles: number }> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const exists = await tx
      .selectFrom("customers")
      .select("id")
      .where("id", "=", id)
      .where("organization_id", "=", orgId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!exists) throw new DomainError("not_found");

    const now = new Date();
    let vehicles = 0;
    if (withVehicles) {
      const { n } = await tx
        .selectFrom("vehicles")
        .select((eb) => eb.fn.countAll<string>().as("n"))
        .where("customer_id", "=", id)
        .where("deleted_at", "is", null)
        .executeTakeFirstOrThrow();
      const r = await tx
        .updateTable("vehicles")
        .set({ deleted_at: now })
        .where("customer_id", "=", id)
        .where("organization_id", "=", orgId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      vehicles = Number(r.numUpdatedRows);
      // RLS filtra en silencio lo que no se puede modificar: si no se han podido
      // borrar todos sus vehículos, es falta de permiso (y se revierte todo).
      if (vehicles < Number(n)) throw new DomainError("permission_denied", "vehicles.delete");
    }
    const r = await tx
      .updateTable("customers")
      .set({ deleted_at: now })
      .where("id", "=", id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    return { vehicles };
  });
}

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
  plates: string[];
}

/** Búsqueda rápida para selectores (propietario de un vehículo). */
export async function searchCustomerOptions(ctx: ServiceCtx, q: string, branchId?: string): Promise<CustomerOption[]> {
  const page = await listCustomers(ctx, { q, branchId, page: 1, pageSize: 10, sort: "name" });
  if (!page.rows.length) return [];
  const ids = page.rows.map((r) => r.id);
  const plates = await withRls(ctx.auth, (tx) =>
    tx.selectFrom("vehicles").select(["customer_id", "plate"]).where("customer_id", "in", ids).where("deleted_at", "is", null).execute(),
  );
  return page.rows.map((r) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    plates: plates.filter((p) => p.customer_id === r.id).map((p) => p.plate),
  }));
}
