import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { OperatorPermission } from "@/lib/permissions";
import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import * as reminders from "@/server/modules/reminders/service";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Configuración de avisos y panel de recordatorios por el camino real de las
 * Server Actions (servicios + RLS) con usuarios reales.
 */

type Ctx = Parameters<typeof reminders.updateReminderSettings>[0];

const sub = (planCode: PlanCode, active = true): SubscriptionState => ({
  planCode,
  status: active ? "active" : "canceled",
  active,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
});

async function adminCtx(o: TestOrg, plan: PlanCode = o === org ? "business" : "pro"): Promise<Ctx> {
  return {
    auth: { userId: o.ownerId },
    membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] },
    subscription: sub(plan),
  };
}

async function operatorCtx(o: TestOrg, permissions: OperatorPermission[]): Promise<Ctx> {
  const user = await createUser();
  const memberId = await addMember(o, user, "operator", permissions);
  return { auth: { userId: user }, membership: { organizationId: o.orgId, memberId, role: "operator", permissions }, subscription: sub("business") };
}

const settings = (branchId: string, extra: Partial<Parameters<typeof reminders.updateReminderSettings>[1]> = {}) => ({
  branchId,
  remindersEnabled: true,
  offsets: [45, 10],
  sendWindowStart: "08:30",
  sendWindowEnd: "14:00",
  sendWeekdays: [1, 2, 3, 4, 5, 6],
  defaultIntervalMonths: 6,
  defaultIntervalKm: 10000,
  kmRemindersEnabled: false,
  kmOffsetBefore: 500,
  replyToEmail: "taller@taller.test",
  ...extra,
});

async function addReminder(o: TestOrg, status = "scheduled") {
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, last_name, email) values ($1, $2, 'Marta', 'Gil', 'marta@cliente.test') returning id",
    [o.orgId, o.branchId],
  );
  const plate = `${String(Math.floor(1000 + Math.random() * 8999))} KLM`;
  const [{ id: vehicleId }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, next_service_date, next_service_source) values ($1, $2, $3, $4, '2027-02-01', 'manual') returning id",
    [o.orgId, o.branchId, customerId, plate],
  );
  const [{ id }] = await query<{ id: string }>(
    `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for, status,
                            provider_message_id, sent_at, skip_reason)
     values ($1, $2, $3, $4, 'service_date', '2027-02-01', 30, now() + interval '1 day', $5,
             case when $5 = 'sent' then 'msg-' || gen_random_uuid() end, case when $5 = 'sent' then now() end,
             case when $5 = 'skipped' then 'no_email' end) returning id`,
    [o.orgId, o.branchId, customerId, vehicleId, status],
  );
  return { id, plate };
}

let org: TestOrg;
let other: TestOrg;

beforeAll(async () => {
  // Business: varios usuarios (operarios en los tests de permisos).
  org = await createOrg("business");
  other = await createOrg("pro");
});

afterAll(async () => {
  await query("update reminders set status = 'canceled', skip_reason = 'canceled_by_user' where organization_id in ($1, $2) and status in ('scheduled', 'retrying')", [
    org.orgId,
    other.orgId,
  ]);
  await closePool();
});

describe("configuración de avisos", () => {
  it("el administrador la lee y la guarda (y queda auditado)", async () => {
    const ctx = await adminCtx(org);
    const before = await reminders.getReminderSettings(ctx, org.branchId);
    expect(before).toMatchObject({ remindersEnabled: false, offsetsDays: [30, 7], sendWindowStart: "09:00", sendWeekdays: [1, 2, 3, 4, 5], kmFeature: true });

    await reminders.updateReminderSettings(ctx, settings(org.branchId));
    const after = await reminders.getReminderSettings(ctx, org.branchId);
    expect(after).toMatchObject({
      remindersEnabled: true,
      offsetsDays: [45, 10],
      sendWindowStart: "08:30",
      sendWindowEnd: "14:00",
      sendWeekdays: [1, 2, 3, 4, 5, 6],
      defaultIntervalMonths: 6,
      replyToEmail: "taller@taller.test",
    });
    const audit = await query("select 1 from audit_logs where organization_id = $1 and action = 'reminder_settings.updated'", [org.orgId]);
    expect(audit).toHaveLength(1);
  });

  it("un operario no puede cambiarla, ni un administrador de otro taller", async () => {
    const op = await operatorCtx(org, ["reminders.read", "customers.write"]);
    await expect(reminders.updateReminderSettings(op, settings(org.branchId, { offsets: [1] }))).rejects.toMatchObject({ code: "not_found" });
    const foreign = await adminCtx(other);
    // Aunque cambie el id de sucursal en el formulario, RLS lo impide.
    await expect(reminders.updateReminderSettings(foreign, settings(org.branchId, { offsets: [1] }))).rejects.toMatchObject({ code: "not_found" });
    await expect(reminders.updateReminderSettings({ ...foreign, membership: { ...foreign.membership, organizationId: org.orgId } }, settings(org.branchId))).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await reminders.getReminderSettings(foreign, org.branchId)).toBeNull();
    const [{ offsets_days }] = await query<{ offsets_days: number[] }>("select offsets_days from branch_settings where branch_id = $1", [org.branchId]);
    expect(offsets_days).toEqual([45, 10]);
  });

  it("con la suscripción inactiva queda en solo lectura", async () => {
    const ctx = { ...(await adminCtx(org)), subscription: sub("pro", false) };
    await expect(reminders.updateReminderSettings(ctx, settings(org.branchId))).rejects.toMatchObject({ code: "subscription_inactive" });
    await expect(reminders.addBlackout(ctx, { branchId: org.branchId, day: "2027-01-06", reason: null })).rejects.toMatchObject({ code: "subscription_inactive" });
  });

  it("avisos por km: Pro los guarda desactivados; Max los puede activar", async () => {
    const pro = await createOrg("pro");
    const proCtx = await adminCtx(pro, "pro");
    await reminders.updateReminderSettings(proCtx, settings(pro.branchId, { kmRemindersEnabled: true }));
    expect(await reminders.getReminderSettings(proCtx, pro.branchId)).toMatchObject({ kmRemindersEnabled: false, kmFeature: false });

    const max = await createOrg("max");
    const ctx = await adminCtx(max, "max");
    await reminders.updateReminderSettings(ctx, settings(max.branchId, { kmRemindersEnabled: true }));
    expect(await reminders.getReminderSettings(ctx, max.branchId)).toMatchObject({ kmRemindersEnabled: true, kmFeature: true, kmOffsetBefore: 500 });
  });

  it("la base de datos rechaza valores no válidos aunque se salten el formulario", async () => {
    const ctx = await adminCtx(org);
    await expect(reminders.updateReminderSettings(ctx, settings(org.branchId, { offsets: [7, 7] }))).rejects.toThrow();
    await expect(reminders.updateReminderSettings(ctx, settings(org.branchId, { sendWindowStart: "20:00", sendWindowEnd: "10:00" }))).rejects.toThrow();
  });

  it("festivos: añadir, listar (solo futuros), quitar", async () => {
    const ctx = await adminCtx(org);
    await reminders.addBlackout(ctx, { branchId: org.branchId, day: "2099-12-25", reason: "Navidad" });
    await reminders.addBlackout(ctx, { branchId: org.branchId, day: "2099-12-25", reason: "Navidad (cerrado)" });
    await query("insert into blackout_dates (organization_id, branch_id, day) values ($1, $2, '2020-01-01')", [org.orgId, org.branchId]);
    expect((await reminders.getReminderSettings(ctx, org.branchId))?.blackouts).toEqual([{ day: "2099-12-25", reason: "Navidad (cerrado)" }]);

    const foreign = await adminCtx(other);
    await expect(reminders.removeBlackout(foreign, { branchId: org.branchId, day: "2099-12-25" })).rejects.toMatchObject({ code: "not_found" });
    await expect(reminders.addBlackout(foreign, { branchId: org.branchId, day: "2099-12-24", reason: null })).rejects.toThrow();

    await reminders.removeBlackout(ctx, { branchId: org.branchId, day: "2099-12-25" });
    expect((await reminders.getReminderSettings(ctx, org.branchId))?.blackouts).toEqual([]);
    await expect(reminders.removeBlackout(ctx, { branchId: org.branchId, day: "2099-12-25" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("panel de recordatorios", () => {
  it("lista con filtros y búsqueda; resumen del mes", async () => {
    const ctx = await adminCtx(org);
    const pending = await addReminder(org, "scheduled");
    await addReminder(org, "sent");
    await addReminder(org, "skipped");

    const all = await reminders.listReminders(ctx, { page: 1, pageSize: 25 });
    expect(all.total).toBeGreaterThanOrEqual(3);
    const pend = await reminders.listReminders(ctx, { filter: "pendientes", page: 1, pageSize: 25 });
    expect(pend.rows.every((r) => ["scheduled", "processing", "retrying"].includes(r.status))).toBe(true);
    expect(pend.rows.map((r) => r.id)).toContain(pending.id);
    const skipped = await reminders.listReminders(ctx, { filter: "no_enviados", page: 1, pageSize: 25 });
    expect(skipped.rows[0]).toMatchObject({ status: "skipped", skipReason: "no_email", customerName: "Marta Gil" });
    const search = await reminders.listReminders(ctx, { q: pending.plate.replace(" ", "").toLowerCase(), page: 1, pageSize: 25 });
    expect(search.rows.map((r) => r.id)).toEqual([pending.id]);

    const summary = await reminders.reminderSummary(ctx);
    expect(summary).toMatchObject({ emailsLimit: 15000, timezone: "Europe/Madrid" });
    expect(summary.pending).toBeGreaterThanOrEqual(1);
    expect(summary.sentThisMonth).toBeGreaterThanOrEqual(1);
  });

  it("sin 'reminders.read' no se ve nada; otro taller tampoco ve los avisos", async () => {
    await addReminder(org, "scheduled");
    const op = await operatorCtx(org, ["customers.write"]);
    expect((await reminders.listReminders(op, { page: 1, pageSize: 25 })).total).toBe(0);
    const reader = await operatorCtx(org, ["reminders.read"]);
    expect((await reminders.listReminders(reader, { page: 1, pageSize: 25 })).total).toBeGreaterThan(0);
    const foreign = await adminCtx(other);
    expect((await reminders.listReminders({ ...foreign, membership: { ...foreign.membership, organizationId: org.orgId } }, { page: 1, pageSize: 25 })).total).toBe(0);
  });

  it("solo un administrador cancela, y solo avisos pendientes", async () => {
    const r = await addReminder(org, "scheduled");
    const reader = await operatorCtx(org, ["reminders.read"]);
    await expect(reminders.cancelReminder(reader, r.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(reminders.cancelReminder(await adminCtx(other), r.id)).rejects.toMatchObject({ code: "not_found" });

    const ctx = await adminCtx(org);
    await reminders.cancelReminder(ctx, r.id);
    const [row] = await query<{ status: string; skip_reason: string }>("select status, skip_reason from reminders where id = $1", [r.id]);
    expect(row).toEqual({ status: "canceled", skip_reason: "canceled_by_user" });
    await expect(reminders.cancelReminder(ctx, r.id)).rejects.toMatchObject({ code: "not_found" });

    const sent = await addReminder(org, "sent");
    await expect(reminders.cancelReminder(ctx, sent.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(reminders.cancelReminder(ctx, randomUUID())).rejects.toMatchObject({ code: "not_found" });
  });
});
