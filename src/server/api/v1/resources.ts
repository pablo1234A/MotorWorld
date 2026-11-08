import "server-only";

import { sql } from "kysely";
import { z } from "zod";

import { normalizePlate } from "@/lib/plate";
import { createVehicleSchema, maintenanceSchema, updateCustomerSchema, updateVehicleSchema, VEHICLE_STATUSES } from "@/lib/validation/workshop";
import { withRls } from "@/server/db/client";
import * as appointments from "@/server/modules/appointments/service";
import { syncAppointmentLater } from "@/server/modules/integrations/calendar";
import * as maintenance from "@/server/modules/maintenance/service";
import * as vehiclesService from "@/server/modules/vehicles/service";
import * as customersService from "@/server/modules/customers/service";

import { ApiError, type ApiContext, type ApiPrincipal, type ApiResult, assertBranch, nextCursor, pageParams, uuidParam } from "../handler";

/**
 * Recursos de la API v1. JSON en snake_case; fechas de negocio AAAA-MM-DD e
 * instantes en ISO 8601 (UTC). Un recurso de otro taller, o de una sucursal
 * que la clave no puede ver, responde 404 (nunca se revela que existe).
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");
const str = (max: number) => z.string().trim().max(max);

function branchFilter(p: ApiPrincipal): string[] | null {
  return p.branchIds;
}

async function tenantRow(p: ApiPrincipal, table: "customers" | "vehicles" | "appointments" | "maintenance_records", id: string): Promise<{ branch_id: string }> {
  const row = await withRls(p.ctx.auth, async (tx) => {
    const { rows } = await sql<{ branch_id: string }>`
      select branch_id from ${sql.table(table)} where id = ${id} and organization_id = ${p.orgId}
        ${table === "customers" || table === "vehicles" ? sql`and deleted_at is null` : sql``}
    `.execute(tx);
    return rows[0];
  });
  if (!row) throw new ApiError(404, "not_found", "No existe");
  assertBranch(p, row.branch_id);
  return row;
}

async function primaryBranch(p: ApiPrincipal): Promise<string> {
  if (p.branchIds?.length === 1) return p.branchIds[0];
  const r = await withRls(p.ctx.auth, (tx) =>
    tx.selectFrom("branches").select("id").where("organization_id", "=", p.orgId).where("is_primary", "=", true).executeTakeFirst(),
  );
  if (!r) throw new ApiError(400, "validation_error", "Indica branch_id");
  assertBranch(p, r.id);
  return r.id;
}

// ================================================================ clientes

const customerCols = ["id", "branch_id", "first_name", "last_name", "email", "phone", "source", "notes", "reminders_opt_out", "created_at", "updated_at"] as const;
type CustomerDb = { id: string; branch_id: string; first_name: string; last_name: string; email: string | null; phone: string | null; source: string; notes: string | null; reminders_opt_out: boolean; created_at: Date; updated_at: Date };
const customerJson = (c: CustomerDb) => ({
  id: c.id,
  object: "customer",
  branch_id: c.branch_id,
  first_name: c.first_name,
  last_name: c.last_name,
  email: c.email ? String(c.email) : null,
  phone: c.phone,
  source: c.source,
  notes: c.notes,
  reminders_opt_out: c.reminders_opt_out,
  created_at: iso(c.created_at),
  updated_at: iso(c.updated_at),
});

async function getCustomerRow(p: ApiPrincipal, id: string) {
  await tenantRow(p, "customers", id);
  return withRls(p.ctx.auth, (tx) => tx.selectFrom("customers").select(customerCols).where("id", "=", id).where("organization_id", "=", p.orgId).executeTakeFirstOrThrow());
}

export async function listCustomers({ principal: p, url }: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const updatedSince = url.searchParams.get("updated_since");
  if (updatedSince && Number.isNaN(Date.parse(updatedSince))) throw new ApiError(400, "validation_error", "updated_since no es una fecha válida");
  const branches = branchFilter(p);
  const rows = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("customers")
      .select(customerCols)
      .where("organization_id", "=", p.orgId)
      .where("deleted_at", "is", null)
      .$if(Boolean(branches), (q) => q.where("branch_id", "in", branches!))
      .$if(Boolean(email), (q) => q.where("email", "=", email!))
      .$if(Boolean(updatedSince), (q) => q.where("updated_at", ">=", new Date(updatedSince!)))
      .$if(Boolean(cursor), (q) => q.where(sql<boolean>`(created_at, id) < (${cursor!.at}::timestamptz, ${cursor!.id}::uuid)`))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute(),
  );
  return { body: { object: "list", data: rows.slice(0, limit).map(customerJson), next_cursor: nextCursor(rows, limit) } };
}

export async function getCustomer({ principal: p }: ApiContext, id: string): Promise<ApiResult> {
  return { body: customerJson(await getCustomerRow(p, uuidParam(id))) };
}

const customerBody = z.object({
  branch_id: z.uuid().optional(),
  first_name: str(80).min(1),
  last_name: str(120).optional(),
  email: z.email().max(254).nullish(),
  phone: z.string().max(30).nullish(),
  notes: str(5000).nullish(),
  reminders_opt_out: z.boolean().optional(),
});

export async function createCustomer({ principal: p, body }: ApiContext): Promise<ApiResult> {
  const b = customerBody.parse(body);
  const branchId = b.branch_id ?? (await primaryBranch(p));
  assertBranch(p, branchId);
  // Mismas reglas que el panel (teléfono normalizado, correo en minúsculas…).
  const v = updateCustomerSchema.parse({
    id: "00000000-0000-4000-8000-000000000000",
    firstName: b.first_name,
    lastName: b.last_name ?? "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    source: "api",
    notes: b.notes ?? "",
    remindersOptOut: b.reminders_opt_out ? "on" : undefined,
  });
  const row = await withRls(p.ctx.auth, (tx) =>
    tx
      .insertInto("customers")
      .values({
        organization_id: p.orgId,
        branch_id: branchId,
        first_name: v.firstName,
        last_name: v.lastName,
        email: v.email,
        phone: v.phone,
        source: "api",
        notes: v.notes,
        reminders_opt_out: v.remindersOptOut,
        created_by: p.ctx.auth.userId,
      })
      .returning(customerCols)
      .executeTakeFirstOrThrow(),
  );
  return { status: 201, body: customerJson(row) };
}

export async function updateCustomer({ principal: p, body }: ApiContext, id: string): Promise<ApiResult> {
  const b = customerBody.omit({ branch_id: true }).partial().strict().parse(body);
  const cur = await getCustomerRow(p, uuidParam(id));
  const v = updateCustomerSchema.parse({
    id: cur.id,
    firstName: b.first_name ?? cur.first_name,
    lastName: b.last_name ?? cur.last_name,
    email: (b.email === undefined ? cur.email : b.email) ?? "",
    phone: (b.phone === undefined ? cur.phone : b.phone) ?? "",
    source: cur.source,
    notes: (b.notes === undefined ? cur.notes : b.notes) ?? "",
    remindersOptOut: (b.reminders_opt_out ?? cur.reminders_opt_out) ? "on" : undefined,
  });
  await customersService.updateCustomer(p.ctx, v);
  return { body: customerJson(await getCustomerRow(p, cur.id)) };
}

// ================================================================ vehículos

const vehicleCols = [
  "id", "branch_id", "customer_id", "plate", "make", "model", "vin", "status", "current_km",
  "last_service_date", "last_service_km", "next_service_date", "next_service_km", "created_at", "updated_at",
] as const;
type VehicleDb = { id: string; branch_id: string; customer_id: string; plate: string; make: string | null; model: string | null; vin: string | null; status: string; current_km: number | null; last_service_date: unknown; last_service_km: number | null; next_service_date: unknown; next_service_km: number | null; created_at: Date; updated_at: Date };
const vehicleJson = (v: VehicleDb) => ({
  id: v.id,
  object: "vehicle",
  branch_id: v.branch_id,
  customer_id: v.customer_id,
  plate: v.plate,
  make: v.make,
  model: v.model,
  vin: v.vin,
  status: v.status,
  current_km: v.current_km,
  last_service_date: day(v.last_service_date),
  last_service_km: v.last_service_km,
  next_service_date: day(v.next_service_date),
  next_service_km: v.next_service_km,
  created_at: iso(v.created_at),
  updated_at: iso(v.updated_at),
});

async function getVehicleRow(p: ApiPrincipal, id: string) {
  await tenantRow(p, "vehicles", id);
  return withRls(p.ctx.auth, (tx) => tx.selectFrom("vehicles").select(vehicleCols).where("id", "=", id).where("organization_id", "=", p.orgId).executeTakeFirstOrThrow());
}

export async function listVehicles({ principal: p, url }: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const plate = url.searchParams.get("plate");
  const customerId = url.searchParams.get("customer_id");
  const before = url.searchParams.get("next_service_before");
  if (customerId) uuidParam(customerId);
  if (before && !isoDate.safeParse(before).success) throw new ApiError(400, "validation_error", "next_service_before: formato AAAA-MM-DD");
  const branches = branchFilter(p);
  const rows = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("vehicles")
      .select(vehicleCols)
      .where("organization_id", "=", p.orgId)
      .where("deleted_at", "is", null)
      .$if(Boolean(branches), (q) => q.where("branch_id", "in", branches!))
      .$if(Boolean(plate), (q) => q.where("plate_normalized", "=", normalizePlate(plate!)))
      .$if(Boolean(customerId), (q) => q.where("customer_id", "=", customerId!))
      .$if(Boolean(before), (q) => q.where("next_service_date", "<=", before!))
      .$if(Boolean(cursor), (q) => q.where(sql<boolean>`(created_at, id) < (${cursor!.at}::timestamptz, ${cursor!.id}::uuid)`))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute(),
  );
  return { body: { object: "list", data: rows.slice(0, limit).map(vehicleJson), next_cursor: nextCursor(rows, limit) } };
}

export async function getVehicle({ principal: p }: ApiContext, id: string): Promise<ApiResult> {
  return { body: vehicleJson(await getVehicleRow(p, uuidParam(id))) };
}

const km = z.number().int().min(0).max(2_000_000);

export async function createVehicle({ principal: p, body }: ApiContext): Promise<ApiResult> {
  const b = z
    .object({
      customer_id: z.uuid(),
      plate: z.string().max(20),
      make: str(60).nullish(),
      model: str(60).nullish(),
      vin: z.string().max(30).nullish(),
      current_km: km.nullish(),
      last_service_date: isoDate.nullish(),
      last_service_km: km.nullish(),
      next_service_date: isoDate.nullish(),
    })
    .strict()
    .parse(body);
  await tenantRow(p, "customers", b.customer_id);
  const input = createVehicleSchema.parse({
    customerId: b.customer_id,
    plate: b.plate,
    make: b.make ?? "",
    model: b.model ?? "",
    vin: b.vin ?? "",
    currentKm: b.current_km == null ? "" : String(b.current_km),
    lastServiceDate: b.last_service_date ?? "",
    lastServiceKm: b.last_service_km == null ? "" : String(b.last_service_km),
    nextServiceDate: b.next_service_date ?? "",
  });
  const id = await vehiclesService.createVehicle(p.ctx, input);
  return { status: 201, body: vehicleJson(await getVehicleRow(p, id)) };
}

export async function updateVehicle({ principal: p, body }: ApiContext, id: string): Promise<ApiResult> {
  const b = z
    .object({ plate: z.string().max(20), make: str(60).nullable(), model: str(60).nullable(), vin: z.string().max(30).nullable(), status: z.enum(VEHICLE_STATUSES) })
    .partial()
    .strict()
    .parse(body);
  const cur = await getVehicleRow(p, uuidParam(id));
  const input = updateVehicleSchema.parse({
    id: cur.id,
    plate: b.plate ?? cur.plate,
    make: (b.make === undefined ? cur.make : b.make) ?? "",
    model: (b.model === undefined ? cur.model : b.model) ?? "",
    vin: (b.vin === undefined ? cur.vin : b.vin) ?? "",
    status: b.status ?? cur.status,
  });
  await vehiclesService.updateVehicle(p.ctx, input);
  return { body: vehicleJson(await getVehicleRow(p, cur.id)) };
}

export async function recordMileage({ principal: p, body }: ApiContext, id: string): Promise<ApiResult> {
  const b = z.object({ km, read_on: isoDate.optional(), confirm_lower: z.boolean().optional() }).strict().parse(body);
  const cur = await getVehicleRow(p, uuidParam(id));
  await vehiclesService.recordMileage(p.ctx, { id: cur.id, km: b.km, readOn: b.read_on ?? new Date().toISOString().slice(0, 10), confirmLower: b.confirm_lower ?? false });
  return { status: 201, body: vehicleJson(await getVehicleRow(p, cur.id)) };
}

// ================================================================ historial

type RecordDb = { id: string; branch_id: string; vehicle_id: string; service_date: unknown; km: number | null; work_performed: string; notes: string | null; next_recommended_date: unknown; next_recommended_km: number | null; created_at: Date; updated_at: Date };
const recordCols = ["id", "branch_id", "vehicle_id", "service_date", "km", "work_performed", "notes", "next_recommended_date", "next_recommended_km", "created_at", "updated_at"] as const;
const recordJson = (r: RecordDb, parts: { description: string; reference: string | null; quantity: string }[] = []) => ({
  id: r.id,
  object: "maintenance_record",
  branch_id: r.branch_id,
  vehicle_id: r.vehicle_id,
  service_date: day(r.service_date),
  km: r.km,
  work_performed: r.work_performed,
  notes: r.notes,
  next_recommended_date: day(r.next_recommended_date),
  next_recommended_km: r.next_recommended_km,
  parts: parts.map((x) => ({ description: x.description, reference: x.reference, quantity: Number(x.quantity) })),
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});

export async function listMaintenance({ principal: p, url }: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const vehicleId = url.searchParams.get("vehicle_id");
  if (vehicleId) await tenantRow(p, "vehicles", uuidParam(vehicleId));
  const branches = branchFilter(p);
  const rows = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("maintenance_records")
      .select(recordCols)
      .where("organization_id", "=", p.orgId)
      .$if(Boolean(branches), (q) => q.where("branch_id", "in", branches!))
      .$if(Boolean(vehicleId), (q) => q.where("vehicle_id", "=", vehicleId!))
      .$if(Boolean(cursor), (q) => q.where(sql<boolean>`(created_at, id) < (${cursor!.at}::timestamptz, ${cursor!.id}::uuid)`))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute(),
  );
  const page = rows.slice(0, limit);
  const parts = page.length
    ? await withRls(p.ctx.auth, (tx) =>
        tx.selectFrom("maintenance_parts").select(["record_id", "description", "reference", "quantity"]).where("record_id", "in", page.map((r) => r.id)).execute(),
      )
    : [];
  return {
    body: {
      object: "list",
      data: page.map((r) => recordJson(r, parts.filter((x) => x.record_id === r.id).map((x) => ({ ...x, quantity: String(x.quantity) })))),
      next_cursor: nextCursor(rows, limit),
    },
  };
}

export async function createMaintenance({ principal: p, body }: ApiContext): Promise<ApiResult> {
  const b = z
    .object({
      vehicle_id: z.uuid(),
      service_date: isoDate,
      km: km.nullish(),
      work_performed: z.string().max(5000),
      notes: str(5000).nullish(),
      next_recommended_date: isoDate.nullish(),
      next_recommended_km: km.nullish(),
      parts: z.array(z.object({ description: z.string().max(200), reference: z.string().max(80).nullish(), quantity: z.number().positive().max(99999) }).strict()).max(50).optional(),
    })
    .strict()
    .parse(body);
  await tenantRow(p, "vehicles", b.vehicle_id);
  const input = maintenanceSchema.parse({
    serviceDate: b.service_date,
    km: b.km == null ? "" : String(b.km),
    workPerformed: b.work_performed,
    notes: b.notes ?? "",
    nextRecommendedDate: b.next_recommended_date ?? "",
    nextRecommendedKm: b.next_recommended_km == null ? "" : String(b.next_recommended_km),
    parts: (b.parts ?? []).map((x) => ({ description: x.description, reference: x.reference ?? "", quantity: x.quantity })),
  });
  const id = await maintenance.createRecord(p.ctx, b.vehicle_id, input);
  const row = await withRls(p.ctx.auth, (tx) => tx.selectFrom("maintenance_records").select(recordCols).where("id", "=", id).executeTakeFirstOrThrow());
  const parts = await withRls(p.ctx.auth, (tx) => tx.selectFrom("maintenance_parts").select(["description", "reference", "quantity"]).where("record_id", "=", id).execute());
  return { status: 201, body: recordJson(row, parts.map((x) => ({ ...x, quantity: String(x.quantity) }))) };
}

// ================================================================ citas

const APPOINTMENT_STATUSES = ["requested", "confirmed", "rejected", "canceled", "completed", "no_show"] as const;
type AppointmentDb = {
  id: string; branch_id: string; customer_id: string | null; vehicle_id: string | null; source: string; status: string;
  requester_name: string; requester_email: string | null; requester_phone: string | null; plate_entered: string | null;
  requested_date: unknown; confirmed_start: Date | null; confirmed_end: Date | null; customer_message: string | null; created_at: Date; updated_at: Date;
};
const appointmentCols = [
  "id", "branch_id", "customer_id", "vehicle_id", "source", "status", "requester_name", "requester_email", "requester_phone",
  "plate_entered", "requested_date", "confirmed_start", "confirmed_end", "customer_message", "created_at", "updated_at",
] as const;
const appointmentJson = (a: AppointmentDb) => ({
  id: a.id,
  object: "appointment",
  branch_id: a.branch_id,
  customer_id: a.customer_id,
  vehicle_id: a.vehicle_id,
  source: a.source,
  status: a.status,
  requester: { name: a.requester_name, email: a.requester_email ? String(a.requester_email) : null, phone: a.requester_phone, plate: a.plate_entered },
  requested_date: day(a.requested_date),
  start: iso(a.confirmed_start),
  end: iso(a.confirmed_end),
  message: a.customer_message,
  created_at: iso(a.created_at),
  updated_at: iso(a.updated_at),
});

async function getAppointmentRow(p: ApiPrincipal, id: string) {
  await tenantRow(p, "appointments", id);
  return withRls(p.ctx.auth, (tx) => tx.selectFrom("appointments").select(appointmentCols).where("id", "=", id).where("organization_id", "=", p.orgId).executeTakeFirstOrThrow());
}

export async function listAppointments({ principal: p, url }: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const status = url.searchParams.get("status");
  if (status && !(APPOINTMENT_STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "validation_error", `status: ${APPOINTMENT_STATUSES.join(", ")}`);
  const from = url.searchParams.get("start_from");
  const to = url.searchParams.get("start_to");
  for (const [k, v] of [["start_from", from], ["start_to", to]] as const) if (v && Number.isNaN(Date.parse(v))) throw new ApiError(400, "validation_error", `${k} no es una fecha válida`);
  const branches = branchFilter(p);
  const rows = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("appointments")
      .select(appointmentCols)
      .where("organization_id", "=", p.orgId)
      .$if(Boolean(branches), (q) => q.where("branch_id", "in", branches!))
      .$if(Boolean(status), (q) => q.where("status", "=", status!))
      .$if(Boolean(from), (q) => q.where("confirmed_start", ">=", new Date(from!)))
      .$if(Boolean(to), (q) => q.where("confirmed_start", "<", new Date(to!)))
      .$if(Boolean(cursor), (q) => q.where(sql<boolean>`(created_at, id) < (${cursor!.at}::timestamptz, ${cursor!.id}::uuid)`))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute(),
  );
  return { body: { object: "list", data: rows.slice(0, limit).map(appointmentJson), next_cursor: nextCursor(rows, limit) } };
}

export async function getAppointment({ principal: p }: ApiContext, id: string): Promise<ApiResult> {
  return { body: appointmentJson(await getAppointmentRow(p, uuidParam(id))) };
}

export async function createAppointment({ principal: p, body }: ApiContext): Promise<ApiResult> {
  const b = z
    .object({ customer_id: z.uuid(), vehicle_id: z.uuid().nullish(), date: isoDate, time, duration_minutes: z.number().int().min(15).max(480), notes: str(5000).nullish() })
    .strict()
    .parse(body);
  await tenantRow(p, "customers", b.customer_id);
  const id = await appointments.createManualAppointment(p.ctx, {
    customerId: b.customer_id,
    vehicleId: b.vehicle_id ?? null,
    date: b.date,
    time: b.time,
    durationMinutes: b.duration_minutes,
    notes: b.notes || null,
    source: "api",
  });
  syncAppointmentLater(id);
  return { status: 201, body: appointmentJson(await getAppointmentRow(p, id)) };
}

export async function updateAppointment({ principal: p, body }: ApiContext, id: string): Promise<ApiResult> {
  const b = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("confirm"), date: isoDate, time, duration_minutes: z.number().int().min(15).max(480) }).strict(),
      z.object({ action: z.enum(["reject", "cancel", "complete", "no_show"]) }).strict(),
    ])
    .parse(body);
  const cur = await getAppointmentRow(p, uuidParam(id));
  if (b.action === "confirm") await appointments.confirmAppointment(p.ctx, { id: cur.id, date: b.date, time: b.time, durationMinutes: b.duration_minutes });
  else if (b.action === "reject") await appointments.rejectAppointment(p.ctx, cur.id);
  else if (b.action === "cancel") await appointments.cancelAppointment(p.ctx, cur.id);
  else if (b.action === "complete") await appointments.completeAppointment(p.ctx, cur.id);
  else await appointments.noShowAppointment(p.ctx, cur.id);
  syncAppointmentLater(cur.id);
  return { body: appointmentJson(await getAppointmentRow(p, cur.id)) };
}

// ================================================================ avisos

const REMINDER_STATUSES = ["scheduled", "processing", "retrying", "sent", "delivered", "bounced", "complained", "failed", "skipped", "canceled"] as const;

export async function listReminders({ principal: p, url }: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const status = url.searchParams.get("status");
  if (status && !(REMINDER_STATUSES as readonly string[]).includes(status)) throw new ApiError(400, "validation_error", `status: ${REMINDER_STATUSES.join(", ")}`);
  const vehicleId = url.searchParams.get("vehicle_id");
  if (vehicleId) await tenantRow(p, "vehicles", uuidParam(vehicleId));
  const branches = branchFilter(p);
  const rows = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("reminders")
      .select(["id", "branch_id", "customer_id", "vehicle_id", "type", "status", "skip_reason", "due_date", "offset_days", "scheduled_for", "sent_at", "created_at"])
      .where("organization_id", "=", p.orgId)
      .$if(Boolean(branches), (q) => q.where("branch_id", "in", branches!))
      .$if(Boolean(status), (q) => q.where("status", "=", status!))
      .$if(Boolean(vehicleId), (q) => q.where("vehicle_id", "=", vehicleId!))
      .$if(Boolean(cursor), (q) => q.where(sql<boolean>`(created_at, id) < (${cursor!.at}::timestamptz, ${cursor!.id}::uuid)`))
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute(),
  );
  return {
    body: {
      object: "list",
      data: rows.slice(0, limit).map((r) => ({
        id: r.id,
        object: "reminder",
        branch_id: r.branch_id,
        customer_id: r.customer_id,
        vehicle_id: r.vehicle_id,
        type: r.type,
        status: r.status,
        skip_reason: r.skip_reason,
        due_date: day(r.due_date),
        offset_days: r.offset_days,
        scheduled_for: iso(r.scheduled_for),
        sent_at: iso(r.sent_at),
        created_at: iso(r.created_at),
      })),
      next_cursor: nextCursor(rows, limit),
    },
  };
}
