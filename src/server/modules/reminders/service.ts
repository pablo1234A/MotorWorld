import "server-only";

import { sql } from "kysely";

import { todayIn } from "@/lib/dates";
import { normalizePlate } from "@/lib/plate";
import { escapeLike, type Page } from "@/lib/pagination";
import { PLANS, planHasFeature } from "@/lib/plans";
import { REMINDER_FILTERS, type ReminderFilter, type ReminderSettingsInput } from "@/lib/validation/reminders";
import type { OrgContext } from "@/server/auth/context";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Configuración de avisos por sucursal y panel de recordatorios.
 * La autorización real la imponen RLS y los grants por columna
 * (branch_settings: solo administradores; reminders: lectura con
 * 'reminders.read' y el usuario solo puede CANCELAR uno pendiente).
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

function assertWritable(ctx: Ctx): void {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export interface ReminderSettings {
  branchId: string;
  branchName: string;
  remindersEnabled: boolean;
  offsetsDays: number[];
  sendWindowStart: string;
  sendWindowEnd: string;
  sendWeekdays: number[];
  defaultIntervalMonths: number;
  defaultIntervalKm: number;
  kmRemindersEnabled: boolean;
  kmOffsetBefore: number;
  replyToEmail: string | null;
  timezone: string;
  kmFeature: boolean;
  blackouts: Array<{ day: string; reason: string | null }>;
}

export async function getReminderSettings(ctx: Ctx, branchId: string): Promise<ReminderSettings | null> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const row = await tx
      .selectFrom("branch_settings as s")
      .innerJoin("branches as b", "b.id", "s.branch_id")
      .innerJoin("organizations as o", "o.id", "s.organization_id")
      .select([
        "s.branch_id as branchId",
        "b.name as branchName",
        "s.reminders_enabled as remindersEnabled",
        "s.offsets_days as offsetsDays",
        sql<string>`to_char(s.send_window_start, 'HH24:MI')`.as("sendWindowStart"),
        sql<string>`to_char(s.send_window_end, 'HH24:MI')`.as("sendWindowEnd"),
        "s.send_weekdays as sendWeekdays",
        "s.default_interval_months as defaultIntervalMonths",
        "s.default_interval_km as defaultIntervalKm",
        "s.km_reminders_enabled as kmRemindersEnabled",
        "s.km_offset_before as kmOffsetBefore",
        sql<string | null>`s.reply_to_email::text`.as("replyToEmail"),
        "o.timezone",
      ])
      .where("s.organization_id", "=", orgId)
      .where("s.branch_id", "=", branchId)
      .where("b.status", "=", "active")
      .executeTakeFirst();
    if (!row) return null;
    const today = todayIn(row.timezone);
    const blackouts = await tx
      .selectFrom("blackout_dates")
      .select([sql<string>`day::text`.as("day"), "reason"])
      .where("organization_id", "=", orgId)
      .where("branch_id", "=", branchId)
      .where("day", ">=", today)
      .orderBy("day")
      .limit(200)
      .execute();
    const plan = ctx.subscription.planCode;
    return {
      ...row,
      offsetsDays: [...row.offsetsDays].sort((a, b) => b - a),
      sendWeekdays: [...row.sendWeekdays].sort((a, b) => a - b),
      kmFeature: plan ? planHasFeature(plan, "km_reminders") : false,
      blackouts,
    };
  });
}

export async function updateReminderSettings(ctx: Ctx, input: ReminderSettingsInput): Promise<void> {
  assertWritable(ctx);
  const orgId = ctx.membership.organizationId;
  const plan = ctx.subscription.planCode;
  // Sin la funcionalidad en el plan, la opción por km se guarda desactivada
  // (la BD rechazaría activarla: RY003).
  const kmAllowed = plan ? planHasFeature(plan, "km_reminders") : false;
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("branch_settings")
      .set({
        reminders_enabled: input.remindersEnabled,
        offsets_days: input.offsets,
        send_window_start: input.sendWindowStart,
        send_window_end: input.sendWindowEnd,
        send_weekdays: input.sendWeekdays,
        default_interval_months: input.defaultIntervalMonths,
        default_interval_km: input.defaultIntervalKm,
        km_reminders_enabled: kmAllowed && input.kmRemindersEnabled,
        km_offset_before: input.kmOffsetBefore,
        reply_to_email: input.replyToEmail,
      })
      .where("organization_id", "=", orgId)
      .where("branch_id", "=", input.branchId)
      .executeTakeFirst();
    // RLS filtra en silencio: 0 filas = sin permiso o sucursal ajena.
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
    await sql`select app.write_audit(${orgId}::uuid, 'reminder_settings.updated', 'branch_settings', ${input.branchId}, ${JSON.stringify({
      reminders_enabled: input.remindersEnabled,
      offsets_days: input.offsets,
    })}::jsonb)`.execute(tx);
  });
}

export async function addBlackout(ctx: Ctx, input: { branchId: string; day: string; reason: string | null }): Promise<void> {
  assertWritable(ctx);
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .insertInto("blackout_dates")
      .values({ organization_id: orgId, branch_id: input.branchId, day: input.day, reason: input.reason })
      .onConflict((oc) => oc.columns(["branch_id", "day"]).doUpdateSet({ reason: input.reason }))
      .executeTakeFirst();
    if (Number(res.numInsertedOrUpdatedRows ?? 0) === 0) throw new DomainError("not_found");
  });
}

export async function removeBlackout(ctx: Ctx, input: { branchId: string; day: string }): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .deleteFrom("blackout_dates")
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "=", input.branchId)
      .where("day", "=", input.day)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw new DomainError("not_found");
  });
}

// ------------------------------------------------------------------- panel

export interface ReminderRow {
  id: string;
  type: string;
  status: string;
  skipReason: string | null;
  lastError: string | null;
  dueDate: string;
  offsetDays: number;
  scheduledFor: Date;
  sentAt: Date | null;
  attempts: number;
  vehicleId: string;
  plate: string;
  vehicleName: string;
  customerId: string;
  customerName: string;
  branchName: string;
  /** Cita pedida desde el botón de este aviso (si la hay). */
  appointmentId: string | null;
}

export interface ReminderFilters {
  filter?: ReminderFilter;
  q?: string;
  branchId?: string;
  page: number;
  pageSize: number;
}

export async function listReminders(ctx: Ctx, f: ReminderFilters): Promise<Page<ReminderRow>> {
  const orgId = ctx.membership.organizationId;
  const q = f.q?.trim().toLowerCase();
  const like = q ? `%${escapeLike(q)}%` : null;
  const plate = q ? normalizePlate(q) : "";
  const plateLike = plate.length >= 2 ? `%${escapeLike(plate)}%` : null;

  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("reminders as r")
      .innerJoin("vehicles as v", "v.id", "r.vehicle_id")
      .innerJoin("customers as c", "c.id", "r.customer_id")
      .innerJoin("branches as b", "b.id", "r.branch_id")
      .where("r.organization_id", "=", orgId);
    if (f.filter) query = query.where("r.status", "in", [...REMINDER_FILTERS[f.filter]]);
    if (f.branchId) query = query.where("r.branch_id", "=", f.branchId);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          ...(plateLike ? [eb("v.plate_normalized", "like", plateLike)] : []),
          eb(sql`lower(c.first_name || ' ' || c.last_name)`, "like", like),
        ]),
      );
    }
    const rows = await query
      .select([
        "r.id",
        "r.type",
        "r.status",
        "r.skip_reason as skipReason",
        "r.last_error as lastError",
        sql<string>`r.due_date::text`.as("dueDate"),
        "r.offset_days as offsetDays",
        "r.scheduled_for as scheduledFor",
        "r.sent_at as sentAt",
        "r.attempts",
        "v.id as vehicleId",
        "v.plate",
        sql<string>`trim(coalesce(v.make, '') || ' ' || coalesce(v.model, ''))`.as("vehicleName"),
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "b.name as branchName",
        sql<string | null>`(select ap.id from appointments ap where ap.reminder_id = r.id order by ap.created_at desc limit 1)`.as("appointmentId"),
        sql<string>`count(*) over ()`.as("total"),
      ])
      // Pendientes: lo próximo primero. Resto: lo más reciente primero.
      .orderBy(f.filter === "pendientes" ? sql`r.scheduled_for asc` : sql`coalesce(r.sent_at, r.scheduled_for) desc`)
      .orderBy("r.id")
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

export interface ReminderSummary {
  pending: number;
  sentThisMonth: number;
  problems: number;
  emailsUsed: number;
  emailsLimit: number | null;
  timezone: string;
}

/** Resumen para la cabecera del panel (mes natural en la zona del taller). */
export async function reminderSummary(ctx: Ctx): Promise<ReminderSummary> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ pending: number; sent: number; problems: number; used: number; timezone: string }>`
      with month as (select app.usage_period(${orgId}::uuid) as start,
                            (select timezone from organizations where id = ${orgId}) as tz)
      select
        count(*) filter (where r.status in ('scheduled', 'processing', 'retrying'))::int as pending,
        count(*) filter (where r.status in ('sent', 'delivered')
                         and r.sent_at >= ((select start from month)::timestamp at time zone (select tz from month)))::int as sent,
        count(*) filter (where r.status in ('failed', 'bounced', 'complained')
                         and r.updated_at > now() - interval '30 days')::int as problems,
        coalesce((select uc.used from usage_counters uc
                  where uc.organization_id = ${orgId} and uc.resource = 'emails'
                    and uc.period_start = (select start from month)), 0)::int as used,
        (select tz from month) as timezone
      from reminders r
      where r.organization_id = ${orgId}
    `.execute(tx);
    const r = rows[0];
    const plan = ctx.subscription.planCode;
    return {
      pending: r.pending,
      sentThisMonth: r.sent,
      problems: r.problems,
      emailsUsed: r.used,
      emailsLimit: plan ? PLANS[plan].monthlyEmails : null,
      timezone: r.timezone,
    };
  });
}

export async function cancelReminder(ctx: Ctx, reminderId: string): Promise<void> {
  assertWritable(ctx);
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("reminders")
      .set({ status: "canceled", skip_reason: "canceled_by_user" })
      .where("organization_id", "=", orgId)
      .where("id", "=", reminderId)
      .where("status", "in", ["scheduled", "retrying"])
      .executeTakeFirst();
    // RLS: solo administradores y solo si sigue pendiente (no se puede
    // cancelar uno que el motor ya está enviando).
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
    await sql`select app.write_audit(${orgId}::uuid, 'reminder.canceled', 'reminder', ${reminderId}, '{}'::jsonb)`.execute(tx);
  });
}
