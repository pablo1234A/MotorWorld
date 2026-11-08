import "server-only";

import { sql } from "kysely";

import type { Page } from "@/lib/pagination";
import { escapeLike } from "@/lib/pagination";
import { normalizePlate } from "@/lib/plate";
import { APPOINTMENT_FILTERS, type AppointmentFilter } from "@/lib/validation/appointments";
import type { OrgContext } from "@/server/auth/context";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Citas en el panel (permiso 'appointments.manage', RLS). Las transiciones de
 * estado las valida la base de datos (solicitud ≠ cita confirmada) y cada
 * cambio queda en el historial (appointment_events).
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export interface AppointmentRow {
  id: string;
  status: string;
  source: string;
  requesterName: string;
  plate: string | null;
  vehicleName: string | null;
  requestedDate: string | null;
  requestedStart: Date | null;
  confirmedStart: Date | null;
  createdAt: Date;
  branchName: string;
  timezone: string;
}

export interface AppointmentFilters {
  filter?: AppointmentFilter;
  q?: string;
  branchId?: string;
  page: number;
  pageSize: number;
}

export async function listAppointments(ctx: Ctx, f: AppointmentFilters): Promise<Page<AppointmentRow>> {
  const q = f.q?.trim().toLowerCase();
  const like = q ? `%${escapeLike(q)}%` : null;
  const plate = q ? normalizePlate(q) : "";
  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("appointments as a")
      .innerJoin("branches as b", "b.id", "a.branch_id")
      .innerJoin("organizations as o", "o.id", "a.organization_id")
      .leftJoin("vehicles as v", "v.id", "a.vehicle_id")
      .where("a.organization_id", "=", ctx.membership.organizationId);
    if (f.filter) query = query.where("a.status", "in", [...APPOINTMENT_FILTERS[f.filter]]);
    if (f.filter === "proximas") query = query.where("a.confirmed_end", ">=", sql<Date>`now() - interval '12 hours'`);
    if (f.branchId) query = query.where("a.branch_id", "=", f.branchId);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          eb(sql`lower(a.requester_name)`, "like", like),
          ...(plate.length >= 2 ? [eb(sql`app.normalize_plate(coalesce(v.plate, a.plate_entered))`, "like", `%${escapeLike(plate)}%`)] : []),
        ]),
      );
    }
    const order =
      f.filter === "proximas"
        ? sql`a.confirmed_start asc`
        : f.filter === "solicitudes"
          ? sql`coalesce(lower(a.requested_slot), a.requested_date::timestamptz, a.created_at) asc`
          : sql`coalesce(a.confirmed_start, lower(a.requested_slot), a.created_at) desc`;
    const rows = await query
      .select([
        "a.id",
        "a.status",
        "a.source",
        "a.requester_name as requesterName",
        sql<string | null>`coalesce(v.plate, a.plate_entered)`.as("plate"),
        sql<string | null>`nullif(trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '')`.as("vehicleName"),
        sql<string | null>`a.requested_date::text`.as("requestedDate"),
        sql<Date | null>`lower(a.requested_slot)`.as("requestedStart"),
        "a.confirmed_start as confirmedStart",
        "a.created_at as createdAt",
        "b.name as branchName",
        sql<string>`coalesce(b.timezone, o.timezone)`.as("timezone"),
        sql<string>`count(*) over ()`.as("total"),
      ])
      .orderBy(order)
      .orderBy("a.id")
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize)
      .execute();
    return { rows: rows.map(({ total: _t, ...r }) => r), total: rows.length ? Number(rows[0].total) : 0, page: f.page, pageSize: f.pageSize };
  });
}

export async function pendingRequestsCount(ctx: Pick<Ctx, "auth" | "membership">): Promise<number> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .selectFrom("appointments")
      .select(sql<number>`count(*)::int`.as("n"))
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("status", "=", "requested")
      .executeTakeFirst();
    return r?.n ?? 0;
  });
}

export interface AppointmentDetail extends AppointmentRow {
  branchId: string;
  customerId: string | null;
  vehicleId: string | null;
  reminderId: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  customerMessage: string | null;
  confirmedEnd: Date | null;
  internalNotes: string | null;
  customerName: string | null;
  slotMinutes: number;
  /** Cliente de la sucursal con el mismo correo (para vincular la solicitud). */
  suggestedCustomer: { id: string; name: string } | null;
  events: Array<{ fromStatus: string | null; toStatus: string; newStart: Date | null; createdAt: Date; actor: string | null }>;
}

export async function getAppointment(ctx: Ctx, id: string): Promise<AppointmentDetail | null> {
  return withRls(ctx.auth, async (tx) => {
    const a = await tx
      .selectFrom("appointments as a")
      .innerJoin("branches as b", "b.id", "a.branch_id")
      .innerJoin("organizations as o", "o.id", "a.organization_id")
      .innerJoin("branch_settings as bs", "bs.branch_id", "a.branch_id")
      .leftJoin("vehicles as v", "v.id", "a.vehicle_id")
      .leftJoin("customers as c", "c.id", "a.customer_id")
      .select([
        "a.id",
        "a.status",
        "a.source",
        "a.requester_name as requesterName",
        sql<string | null>`coalesce(v.plate, a.plate_entered)`.as("plate"),
        sql<string | null>`nullif(trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '')`.as("vehicleName"),
        sql<string | null>`a.requested_date::text`.as("requestedDate"),
        sql<Date | null>`lower(a.requested_slot)`.as("requestedStart"),
        "a.confirmed_start as confirmedStart",
        "a.confirmed_end as confirmedEnd",
        "a.created_at as createdAt",
        "b.name as branchName",
        "a.branch_id as branchId",
        sql<string>`coalesce(b.timezone, o.timezone)`.as("timezone"),
        "a.customer_id as customerId",
        "a.vehicle_id as vehicleId",
        "a.reminder_id as reminderId",
        sql<string | null>`a.requester_email::text`.as("requesterEmail"),
        "a.requester_phone as requesterPhone",
        "a.customer_message as customerMessage",
        "a.internal_notes as internalNotes",
        sql<string | null>`nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')`.as("customerName"),
        "bs.slot_minutes as slotMinutes",
      ])
      .where("a.organization_id", "=", ctx.membership.organizationId)
      .where("a.id", "=", id)
      .executeTakeFirst();
    if (!a) return null;
    const suggested =
      !a.customerId && a.requesterEmail
        ? await tx
            .selectFrom("customers")
            .select(["id", sql<string>`trim(first_name || ' ' || last_name)`.as("name")])
            .where("branch_id", "=", a.branchId)
            .where("deleted_at", "is", null)
            .where("email", "=", a.requesterEmail)
            .orderBy("created_at")
            .executeTakeFirst()
        : undefined;
    const events = await tx
      .selectFrom("appointment_events as e")
      .leftJoin("profiles as p", "p.id", "e.actor_user_id")
      .select([
        "e.from_status as fromStatus",
        "e.to_status as toStatus",
        "e.new_start as newStart",
        "e.created_at as createdAt",
        sql<string | null>`nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')`.as("actor"),
      ])
      .where("e.appointment_id", "=", id)
      .orderBy("e.created_at")
      .orderBy("e.id")
      .execute();
    return { ...a, suggestedCustomer: suggested ?? null, events };
  });
}

/** Fecha y hora LOCALES de la sucursal → instante (la BD hace la conversión con su zona horaria). */
async function localRange(tx: Tx, appointmentId: string, date: string, time: string, minutes: number) {
  const { rows } = await sql<{ start: Date; end: Date }>`
    select (${date}::date + ${time}::time) at time zone coalesce(b.timezone, o.timezone) as start,
           ((${date}::date + ${time}::time) at time zone coalesce(b.timezone, o.timezone)) + make_interval(mins => ${minutes}) as "end"
      from appointments a join branches b on b.id = a.branch_id join organizations o on o.id = a.organization_id
     where a.id = ${appointmentId}
  `.execute(tx);
  if (!rows[0]) throw new DomainError("not_found");
  return rows[0];
}

async function setStatus(ctx: Ctx, id: string, values: Record<string, unknown>, from: string[]): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("appointments")
      .set(values)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .where("status", "in", from)
      .executeTakeFirst();
    // 0 filas: no existe, no hay permiso (RLS) o el estado ya cambió.
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

export async function confirmAppointment(ctx: Ctx, input: { id: string; date: string; time: string; durationMinutes: number }): Promise<"confirmed" | "rescheduled"> {
  assertWritable(ctx);
  return withRls(ctx.auth, async (tx) => {
    const current = await tx
      .selectFrom("appointments")
      .select("status")
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", input.id)
      .executeTakeFirst();
    if (!current || !["requested", "confirmed"].includes(current.status)) throw new DomainError("not_found");
    const range = await localRange(tx, input.id, input.date, input.time, input.durationMinutes);
    const res = await tx
      .updateTable("appointments")
      .set({ status: "confirmed", confirmed_start: range.start, confirmed_end: range.end })
      .where("id", "=", input.id)
      .where("status", "=", current.status)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
    return current.status === "requested" ? "confirmed" : "rescheduled";
  });
}

export const rejectAppointment = (ctx: Ctx, id: string) => setStatus(ctx, id, { status: "rejected" }, ["requested"]);
export const cancelAppointment = (ctx: Ctx, id: string) => setStatus(ctx, id, { status: "canceled" }, ["requested", "confirmed"]);
export const completeAppointment = (ctx: Ctx, id: string) => setStatus(ctx, id, { status: "completed" }, ["confirmed"]);
export const noShowAppointment = (ctx: Ctx, id: string) => setStatus(ctx, id, { status: "no_show" }, ["confirmed"]);

export async function saveNotes(ctx: Ctx, id: string, notes: string | null): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("appointments")
      .set({ internal_notes: notes })
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

/** Cita creada en el taller (llamada, mostrador): nace confirmada. */
export async function createManualAppointment(
  ctx: Ctx,
  input: { customerId: string; vehicleId: string | null; date: string; time: string; durationMinutes: number; notes: string | null; source?: "manual" | "api" },
): Promise<string> {
  assertWritable(ctx);
  return withRls(ctx.auth, async (tx) => {
    const customer = await tx
      .selectFrom("customers")
      .select(["id", "branch_id", "first_name", "last_name", sql<string | null>`email::text`.as("email"), "phone"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", input.customerId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!customer) throw new DomainError("not_found");
    if (input.vehicleId) {
      const v = await tx
        .selectFrom("vehicles")
        .select("id")
        .where("id", "=", input.vehicleId)
        .where("customer_id", "=", customer.id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!v) throw new DomainError("integrity_violation", "owner_other_branch");
    }
    const { rows } = await sql<{ start: Date; end: Date }>`
      select (${input.date}::date + ${input.time}::time) at time zone coalesce(b.timezone, o.timezone) as start,
             ((${input.date}::date + ${input.time}::time) at time zone coalesce(b.timezone, o.timezone)) + make_interval(mins => ${input.durationMinutes}) as "end"
        from branches b join organizations o on o.id = b.organization_id where b.id = ${customer.branch_id}
    `.execute(tx);
    const row = await tx
      .insertInto("appointments")
      .values({
        organization_id: ctx.membership.organizationId,
        branch_id: customer.branch_id,
        customer_id: customer.id,
        vehicle_id: input.vehicleId,
        source: input.source ?? "manual",
        requester_name: `${customer.first_name} ${customer.last_name}`.trim(),
        requester_email: customer.email,
        requester_phone: customer.phone,
        status: "confirmed",
        confirmed_start: rows[0].start,
        confirmed_end: rows[0].end,
        internal_notes: input.notes,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  });
}

/**
 * Vincula la solicitud a una ficha: al cliente sugerido (mismo correo) o a uno
 * nuevo con los datos de la solicitud. Si hay matrícula, también el vehículo
 * (existente del cliente o nuevo).
 */
export async function linkToCustomer(ctx: Ctx, id: string, customerId: string | null): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const a = await tx
      .selectFrom("appointments")
      .select(["id", "branch_id", "requester_name", sql<string | null>`requester_email::text`.as("email"), "requester_phone", "plate_entered", "customer_id"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .executeTakeFirst();
    if (!a) throw new DomainError("not_found");
    if (a.customer_id) return;

    let cid = customerId;
    if (cid) {
      const c = await tx.selectFrom("customers").select("id").where("id", "=", cid).where("branch_id", "=", a.branch_id).where("deleted_at", "is", null).executeTakeFirst();
      if (!c) throw new DomainError("integrity_violation", "owner_other_branch");
    } else {
      const [firstName, ...rest] = a.requester_name.trim().split(/\s+/);
      const created = await tx
        .insertInto("customers")
        .values({
          organization_id: ctx.membership.organizationId,
          branch_id: a.branch_id,
          first_name: firstName.slice(0, 80),
          last_name: rest.join(" ").slice(0, 120),
          email: a.email,
          phone: a.requester_phone,
          source: "booking_page",
          created_by: ctx.auth.userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      cid = created.id;
    }

    let vehicleId: string | null = null;
    const plate = a.plate_entered ? normalizePlate(a.plate_entered) : "";
    if (plate.length >= 4) {
      const existing = await tx
        .selectFrom("vehicles")
        .select(["id", "customer_id"])
        .where("branch_id", "=", a.branch_id)
        .where("plate_normalized", "=", plate)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (existing && existing.customer_id === cid) vehicleId = existing.id;
      else if (!existing) {
        const created = await tx
          .insertInto("vehicles")
          .values({ organization_id: ctx.membership.organizationId, branch_id: a.branch_id, customer_id: cid!, plate: a.plate_entered!.toUpperCase(), created_by: ctx.auth.userId })
          .returning("id")
          .executeTakeFirstOrThrow();
        vehicleId = created.id;
      }
    }
    await tx.updateTable("appointments").set({ customer_id: cid, vehicle_id: vehicleId }).where("id", "=", id).execute();
  });
}
