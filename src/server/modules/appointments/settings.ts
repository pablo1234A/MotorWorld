import "server-only";

import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { ServiceCtx } from "@/server/modules/branches/service";

/** Configuración de la página de citas por sucursal (solo administradores, RLS). */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export interface BookingSettings {
  branchId: string;
  branchName: string;
  bookingEnabled: boolean;
  bookingMode: "free_request" | "slots";
  slotMinutes: number;
  bookingNoticeHours: number;
  rules: Array<{ id: string; weekday: number; startTime: string; endTime: string; capacity: number }>;
}

export async function getBookingSettings(ctx: Ctx, branchId: string): Promise<BookingSettings | null> {
  return withRls(ctx.auth, async (tx) => {
    const s = await tx
      .selectFrom("branch_settings as s")
      .innerJoin("branches as b", "b.id", "s.branch_id")
      .select([
        "s.branch_id as branchId",
        "b.name as branchName",
        "s.booking_enabled as bookingEnabled",
        "s.booking_mode as bookingMode",
        "s.slot_minutes as slotMinutes",
        "s.booking_notice_hours as bookingNoticeHours",
      ])
      .where("s.organization_id", "=", ctx.membership.organizationId)
      .where("s.branch_id", "=", branchId)
      .where("b.status", "=", "active")
      .executeTakeFirst();
    if (!s) return null;
    const rules = await tx
      .selectFrom("availability_rules")
      .select(["id", "weekday", sql<string>`to_char(start_time, 'HH24:MI')`.as("startTime"), sql<string>`to_char(end_time, 'HH24:MI')`.as("endTime"), "capacity"])
      .where("branch_id", "=", branchId)
      .orderBy("weekday")
      .orderBy("start_time")
      .execute();
    return { ...(s as Omit<BookingSettings, "rules">), rules };
  });
}

export async function updateBookingSettings(
  ctx: Ctx,
  input: { branchId: string; bookingEnabled: boolean; bookingMode: "free_request" | "slots"; slotMinutes: number; bookingNoticeHours: number },
): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("branch_settings")
      .set({
        booking_enabled: input.bookingEnabled,
        booking_mode: input.bookingMode,
        slot_minutes: input.slotMinutes,
        booking_notice_hours: input.bookingNoticeHours,
      })
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("branch_id", "=", input.branchId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

export async function addAvailabilityRule(
  ctx: Ctx,
  input: { branchId: string; weekday: number; startTime: string; endTime: string; capacity: number },
): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, (tx) =>
    tx
      .insertInto("availability_rules")
      .values({
        organization_id: ctx.membership.organizationId,
        branch_id: input.branchId,
        weekday: input.weekday,
        start_time: input.startTime,
        end_time: input.endTime,
        capacity: input.capacity,
      })
      .execute(),
  );
}

export async function removeAvailabilityRule(ctx: Ctx, id: string): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx.deleteFrom("availability_rules").where("organization_id", "=", ctx.membership.organizationId).where("id", "=", id).executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw new DomainError("not_found");
  });
}
