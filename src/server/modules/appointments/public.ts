import "server-only";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import type { PublicBookingInput } from "@/lib/validation/appointments";
import { withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { verifyBookingToken } from "@/server/email/links";
import type { EmailPort } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { logger } from "@/server/logger";
import { logoUrl } from "@/server/modules/organizations/profile";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";

import { notifyStaffNewRequest, sendAppointmentEmail } from "./notify";

/**
 * Página pública para pedir cita (/t/<slug>/cita). Sin sesión: todo se lee y
 * escribe con la conexión del sistema, y solo se expone lo imprescindible
 * (marca del taller y, con el enlace firmado del aviso, el nombre del cliente
 * y la matrícula para prellenar el formulario). Una SOLICITUD no es una cita
 * confirmada: la confirma el taller.
 */

export const BOOKING_MAX_DAYS_AHEAD = 90;
export const SLOT_DAYS = 21;

export interface BookingBranch {
  id: string;
  name: string;
  mode: "free_request" | "slots";
  slotMinutes: number;
  noticeHours: number;
  tz: string;
}

export interface BookingSlot {
  start: string; // ISO
  end: string;
  free: number;
}

export interface BookingPage {
  org: { id: string; name: string; slug: string; brandColor: string | null; logoSrc: string | null; phone: string | null; email: string | null; address: string | null };
  open: boolean;
  branches: BookingBranch[];
  branch: BookingBranch | null;
  tokenStatus: "none" | "valid" | "invalid" | "expired";
  prefill: { name: string; email: string | null; phone: string | null; plate: string | null; vehicle: string | null } | null;
  slots: BookingSlot[];
  today: string;
}

interface TokenTarget {
  reminderId: string;
  branchId: string;
  customerId: string;
  vehicleId: string;
  name: string;
  email: string | null;
  phone: string | null;
  plate: string;
  vehicle: string | null;
  expired: boolean;
}

async function tokenTarget(orgId: string, token: string | null): Promise<TokenTarget | "invalid" | null> {
  if (!token) return null;
  const secret = process.env.EMAIL_LINK_SECRET;
  const reminderId = secret ? verifyBookingToken(token, secret) : null;
  if (!reminderId) return "invalid";
  const row = await withSystem(async (tx) => {
    const { rows } = await sql<Omit<TokenTarget, "reminderId"> & { expired: boolean }>`
      select r.branch_id as "branchId", r.customer_id as "customerId", r.vehicle_id as "vehicleId",
             trim(c.first_name || ' ' || c.last_name) as name, c.email::text as email, c.phone,
             v.plate, nullif(trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '') as vehicle,
             (r.due_date + 60 < (now() at time zone coalesce(b.timezone, o.timezone))::date
               or c.deleted_at is not null or v.deleted_at is not null) as expired
        from reminders r
        join customers c on c.id = r.customer_id
        join vehicles v on v.id = r.vehicle_id
        join branches b on b.id = r.branch_id
        join organizations o on o.id = r.organization_id
       where r.id = ${reminderId} and r.organization_id = ${orgId}
    `.execute(tx);
    return rows[0];
  });
  if (!row) return "invalid";
  return { reminderId, ...row };
}

export async function resolveBookingPage(slug: string, opts: { token?: string | null; branchId?: string | null } = {}): Promise<BookingPage | null> {
  const org = await withSystem((tx) =>
    tx
      .selectFrom("organizations as o")
      .leftJoin("subscriptions as s", "s.organization_id", "o.id")
      .select([
        "o.id",
        "o.trade_name as name",
        sql<string>`o.slug::text`.as("slug"),
        "o.brand_primary as brandColor",
        "o.logo_path as logoPath",
        "o.phone",
        sql<string | null>`o.email::text`.as("email"),
        sql<string | null>`nullif(concat_ws(', ', o.address_line1, o.city), '')`.as("address"),
        "o.timezone",
        sql<boolean>`coalesce(app.subscription_is_active(s.status, s.past_due_since), false)`.as("active"),
      ])
      .where(sql`o.slug`, "=", slug.toLowerCase())
      .where("o.status", "=", "active")
      .executeTakeFirst(),
  );
  if (!org) return null;

  const branches = org.active
    ? await withSystem((tx) =>
        tx
          .selectFrom("branches as b")
          .innerJoin("branch_settings as bs", "bs.branch_id", "b.id")
          .select([
            "b.id",
            "b.name",
            "bs.booking_mode as mode",
            "bs.slot_minutes as slotMinutes",
            "bs.booking_notice_hours as noticeHours",
            sql<string>`coalesce(b.timezone, ${org.timezone})`.as("tz"),
          ])
          .where("b.organization_id", "=", org.id)
          .where("b.status", "=", "active")
          .where("bs.booking_enabled", "=", true)
          .orderBy("b.is_primary", "desc")
          .orderBy("b.name")
          .execute(),
      )
    : [];

  const target = await tokenTarget(org.id, opts.token ?? null);
  const tokenStatus: BookingPage["tokenStatus"] = target === null ? "none" : target === "invalid" ? "invalid" : target.expired ? "expired" : "valid";
  const valid = tokenStatus === "valid" ? (target as TokenTarget) : null;

  const typed = branches as BookingBranch[];
  const branch =
    (valid ? typed.find((b) => b.id === valid.branchId) : typed.find((b) => b.id === opts.branchId)) ?? (typed.length === 1 ? typed[0] : null);
  const today = todayIn(branch?.tz ?? org.timezone);

  let slots: BookingSlot[] = [];
  if (branch?.mode === "slots") {
    slots = await withSystem(async (tx) => {
      const { rows } = await sql<{ slot_start: Date; slot_end: Date; capacity: number; taken: number }>`
        select * from app.available_slots(${branch.id}::uuid, ${today}::date, ${SLOT_DAYS})
      `.execute(tx);
      return rows.filter((r) => r.taken < r.capacity).map((r) => ({ start: r.slot_start.toISOString(), end: r.slot_end.toISOString(), free: r.capacity - r.taken }));
    });
  }

  return {
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      brandColor: org.brandColor,
      logoSrc: logoUrl("http://local", org.id, org.logoPath)?.replace("http://local", "") ?? null,
      phone: org.phone,
      email: org.email,
      address: org.address,
    },
    open: typed.length > 0,
    branches: typed,
    branch,
    tokenStatus,
    prefill: valid ? { name: valid.name, email: valid.email, phone: valid.phone, plate: valid.plate, vehicle: valid.vehicle } : null,
    slots,
    today,
  };
}

/** Crea la solicitud. Devuelve el id (o null si se descartó como robot). */
export async function createPublicRequest(
  input: PublicBookingInput,
  ip: string,
  deps: { email: EmailPort | null; sender: SenderConfig | null },
): Promise<string | null> {
  // Campo trampa relleno: se responde como si todo fuera bien, sin guardar nada.
  if (input.website) return null;

  const page = await resolveBookingPage(input.slug, { token: input.token, branchId: input.branchId });
  if (!page) throw new DomainError("not_found");
  await enforceRateLimits([
    [`booking:ip:${ip}`, RATE_LIMITS.bookingPerIp],
    [`booking:org:${page.org.id}`, RATE_LIMITS.bookingPerOrg],
  ]);
  if (!(await verifyTurnstile(input.turnstileToken, ip))) throw new DomainError("validation_error", "bot_check");
  if (!page.open) throw new DomainError("validation_error", "booking_closed");
  const branch = page.branch ?? page.branches.find((b) => b.id === input.branchId) ?? null;
  if (!branch) throw new DomainError("validation_error", "booking_closed");

  const target = page.tokenStatus === "valid" ? await tokenTarget(page.org.id, input.token) : null;
  const linked = target && target !== "invalid" ? target : null;

  if (branch.mode === "free_request") {
    if (!input.requestedDate || input.requestedDate <= page.today || input.requestedDate > addDays(page.today, BOOKING_MAX_DAYS_AHEAD)) {
      throw new DomainError("validation_error", "booking_date");
    }
  } else if (!input.slot) {
    throw new DomainError("validation_error", "booking_slot_required");
  }

  const id = await withSystem(async (tx) => {
    // Un cerrojo por sucursal: dos personas no se quedan con la última plaza de un hueco.
    await sql`select pg_advisory_xact_lock(hashtextextended(${branch.id}::text, 7))`.execute(tx);

    let slotRange: string | null = null;
    let requestedDate = input.requestedDate;
    if (branch.mode === "slots") {
      const start = new Date(input.slot!);
      const { rows } = await sql<{ slot_end: Date; capacity: number; taken: number; local_date: string }>`
        select s.slot_end, s.capacity, s.taken, to_char(s.slot_start at time zone ${branch.tz}, 'YYYY-MM-DD') as local_date
          from app.available_slots(${branch.id}::uuid, ${page.today}::date, ${SLOT_DAYS}) s
         where s.slot_start = ${start}::timestamptz
      `.execute(tx);
      const slot = rows[0];
      if (!slot || slot.taken >= slot.capacity) throw new DomainError("validation_error", "slot_unavailable");
      slotRange = `[${start.toISOString()},${slot.slot_end.toISOString()})`;
      requestedDate = slot.local_date;
    }

    // Sin enlace del aviso: se vincula a la ficha solo si matrícula Y correo coinciden.
    let customerId = linked?.customerId ?? null;
    let vehicleId = linked?.vehicleId ?? null;
    if (!linked && input.plate && input.email) {
      const { rows } = await sql<{ customer_id: string; vehicle_id: string }>`
        select v.customer_id, v.id as vehicle_id from vehicles v join customers c on c.id = v.customer_id
         where v.branch_id = ${branch.id} and v.deleted_at is null and c.deleted_at is null
           and v.plate_normalized = app.normalize_plate(${input.plate})
           and c.email = ${input.email}
         limit 1
      `.execute(tx);
      if (rows[0]) {
        customerId = rows[0].customer_id;
        vehicleId = rows[0].vehicle_id;
      }
    }

    const row = await tx
      .insertInto("appointments")
      .values({
        organization_id: page.org.id,
        branch_id: branch.id,
        customer_id: customerId,
        vehicle_id: vehicleId,
        reminder_id: linked?.reminderId ?? null,
        source: linked ? "reminder_link" : "booking_page",
        requester_name: input.name,
        requester_email: input.email,
        requester_phone: input.phone,
        plate_entered: input.plate ?? linked?.plate ?? null,
        requested_date: requestedDate,
        requested_slot: slotRange,
        customer_message: input.message,
        status: "requested",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  });

  // Los correos no deben impedir la solicitud: se registran si fallan.
  await sendAppointmentEmail("booking_received", id, deps).catch((err) => logger.error("booking_received_email_failed", { error: err }));
  await notifyStaffNewRequest(id, deps).catch((err) => logger.error("booking_staff_email_failed", { error: err }));
  return id;
}
