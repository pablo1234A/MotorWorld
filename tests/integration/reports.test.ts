import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/dates";
import type { OperatorPermission } from "@/lib/permissions";
import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import * as reports from "@/server/modules/reports/service";

import { addMember, createOrg, createUser, query, type TestOrg } from "./support/db";

/** Fase 9b: informes (Max) y contadores básicos (todos), contra la BD real. */

type Ctx = Parameters<typeof reports.getSummary>[0];
const sub = (planCode: PlanCode): SubscriptionState => ({ planCode, status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
async function admin(o: TestOrg, plan: PlanCode): Promise<Ctx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId }, subscription: sub(plan) };
}
async function operator(o: TestOrg, permissions: OperatorPermission[], plan: PlanCode = "max"): Promise<Ctx> {
  const user = await createUser();
  await addMember(o, user, "operator", permissions);
  return { auth: { userId: user }, membership: { organizationId: o.orgId }, subscription: sub(plan) };
}
async function vehicle(o: TestOrg, name: string, next = 20) {
  const [{ id: customerId }] = await query<{ id: string }>(
    "insert into customers (organization_id, branch_id, first_name, last_name, email) values ($1, $2, $3, 'Prueba', $4) returning id",
    [o.orgId, o.branchId, name, `${randomUUID().slice(0, 8)}@cliente.test`],
  );
  const plate = `${String(Math.floor(1000 + Math.random() * 8999))} ${["BCD", "FGH", "JKL", "MNP"][Math.floor(Math.random() * 4)]}`;
  const [{ id }] = await query<{ id: string }>(
    "insert into vehicles (organization_id, branch_id, customer_id, plate, make, model, next_service_date, next_service_source) values ($1, $2, $3, $4, 'Seat', 'Ibiza', current_date + $5::int, 'manual') returning id",
    [o.orgId, o.branchId, customerId, plate, next],
  );
  return { customerId, vehicleId: id, plate };
}
async function sentReminder(o: TestOrg, v: { customerId: string; vehicleId: string }, daysAgo: number) {
  const [{ id }] = await query<{ id: string }>(
    `insert into reminders (organization_id, branch_id, customer_id, vehicle_id, type, due_date, offset_days, scheduled_for, status, sent_at, provider, provider_message_id)
     values ($1, $2, $3, $4, 'service_date', current_date + 10, 30, now() - make_interval(days => $5::int), 'sent', now() - make_interval(days => $5::int), 'resend', 'msg_' || gen_random_uuid()) returning id`,
    [o.orgId, o.branchId, v.customerId, v.vehicleId, daysAgo],
  );
  return id;
}
async function mail(o: TestOrg, kind: string, status: string) {
  await query(
    `insert into email_logs (organization_id, branch_id, kind, to_email, from_email, subject, provider, status, sent_at, provider_message_id) values ($1, $2, $3, 'x@cliente.test', 'taller@avisos.test', 'Asunto', 'resend', $4, now(), 'm_' || gen_random_uuid())`,
    [o.orgId, o.branchId, kind, status],
  );
}

let org: TestOrg;
let ctx: Ctx;
const range = () => reports.parseRange({});
let returned: Awaited<ReturnType<typeof vehicle>>;
let notBack: Awaited<ReturnType<typeof vehicle>>;

beforeAll(async () => {
  org = await createOrg("max");
  ctx = await admin(org, "max");
  returned = await vehicle(org, "Vuelve");
  notBack = await vehicle(org, "Novuelve", -5);
  const r1 = await sentReminder(org, returned, 20);
  await sentReminder(org, notBack, 15);
  // Volvió 5 días después del aviso.
  await query(
    "insert into maintenance_records (organization_id, branch_id, vehicle_id, service_date, work_performed) values ($1, $2, $3, current_date - 15, 'Cambio de aceite')",
    [org.orgId, org.branchId, returned.vehicleId],
  );
  await query(
    "insert into appointments (organization_id, branch_id, source, requester_name, requester_email, reminder_id, customer_id, vehicle_id) values ($1, $2, 'reminder_link', 'Vuelve Prueba', 'v@cliente.test', $3, $4, $5)",
    [org.orgId, org.branchId, r1, returned.customerId, returned.vehicleId],
  );
  await mail(org, "reminder", "delivered");
  await mail(org, "reminder", "bounced");
  await mail(org, "booking_confirmed", "accepted");
  await mail(org, "digest", "delivered"); // correo de la plataforma al taller: no cuenta
});
afterAll(closePool);

describe("informes (plan Max)", () => {
  it("resumen: avisos, citas desde avisos, clientes que vuelven (P17) y correos", async () => {
    const s = await reports.getSummary(ctx, range());
    expect(s).toMatchObject({
      remindersSent: 2,
      vehiclesReminded: 2,
      vehiclesReturned: 1,
      appointmentsRequested: 1,
      appointmentsFromReminders: 1,
      emailsTotal: 3,
      emailsDelivered: 1,
      emailsBounced: 1,
      emailsByKind: { reminder: 2, booking_confirmed: 1 },
    });
    expect(s.months.length).toBeGreaterThanOrEqual(3);
    expect(s.months.reduce((a, m) => a + m.reminders, 0)).toBe(2);
  });

  it("clientes que no han vuelto, revisiones pendientes y correos, con paginación", async () => {
    const nr = await reports.notReturned(ctx, range(), { page: 1 });
    expect(nr.total).toBe(1);
    expect(nr.rows[0]).toMatchObject({ vehicleId: notBack.vehicleId, plate: notBack.plate, customerName: "Novuelve Prueba", daysSince: 15 });

    const pending = await reports.pendingServices(ctx, addDays(todayIn(), 30), null, { page: 1 });
    expect(pending.rows.map((r) => r.vehicleId)).toEqual(expect.arrayContaining([notBack.vehicleId]));
    expect(pending.rows.find((r) => r.vehicleId === notBack.vehicleId)?.overdue).toBe(true);

    const emails = await reports.emailsSent(ctx, range(), { page: 1, pageSize: 2 });
    expect(emails.total).toBe(3);
    expect(emails.rows).toHaveLength(2);
    expect(emails.rows.some((e) => e.kind === "digest")).toBe(false);
  });

  it("CSV: cabeceras en español y fórmulas neutralizadas", async () => {
    await query("update customers set first_name = '=HYPERLINK(1)' where id = $1", [notBack.customerId]);
    const rows = await reports.exportRows(ctx, "no-han-vuelto", range(), addDays(todayIn(), 30));
    expect(rows[0][0]).toBe("Cliente");
    const { toCsv } = await import("@/server/modules/imports/files");
    expect(toCsv(rows).toString("utf8")).toContain("'=HYPERLINK(1) Prueba");
    await query("update customers set first_name = 'Novuelve' where id = $1", [notBack.customerId]);
  });

  it("periodo no válido → error de validación", async () => {
    await expect(reports.getSummary(ctx, { from: "2026-05-01", to: "2026-01-01", branchId: null })).rejects.toMatchObject({ detail: "invalid_report_range" });
    expect(reports.parseRange({ desde: "2020-01-01", hasta: "2026-11-01" }).from).toBe("2024-10-31");
  });

  it("acceso: plan Pro sin informes, operario sin permiso, y otro taller (IDOR) bloqueados en la BD", async () => {
    const pro = await createOrg("pro");
    await expect(reports.getSummary(await admin(pro, "pro"), range())).rejects.toMatchObject({ code: "feature_unavailable" });
    await expect(reports.getSummary(await operator(org, ["reminders.read"]), range())).rejects.toMatchObject({ code: "permission_denied" });
    const allowed = await operator(org, ["reports.read"]);
    expect((await reports.getSummary(allowed, range())).remindersSent).toBe(2);
    // Un administrador de otro taller que pone el id de este taller no ve nada.
    const otherMax = await createOrg("max");
    const intruder = await admin(otherMax, "max");
    await expect(reports.getSummary({ ...intruder, membership: { ...intruder.membership, organizationId: org.orgId } }, range())).rejects.toMatchObject({ code: "permission_denied" });
    await expect(reports.notReturned({ ...intruder, membership: { ...intruder.membership, organizationId: org.orgId } }, range(), { page: 1 })).rejects.toMatchObject({ code: "permission_denied" });
    // Sucursal de otro taller como filtro: sin sucursales → denegado.
    await expect(reports.getSummary(ctx, { ...range(), branchId: otherMax.branchId })).rejects.toMatchObject({ code: "permission_denied" });
  });
});

describe("contadores básicos del inicio (todos los planes, P16)", () => {
  it("avisos, citas y clientes que han vuelto en los últimos 30 días", async () => {
    expect(await reports.dashboardActivity(ctx)).toEqual({ remindersSent30d: 2, appointments30d: 1, returned30d: 1 });
    const pro = await createOrg("pro");
    expect(await reports.dashboardActivity(await admin(pro, "pro"))).toEqual({ remindersSent30d: 0, appointments30d: 0, returned30d: 0 });
    const outsider = await admin(await createOrg("pro"), "pro");
    await expect(reports.dashboardActivity({ ...outsider, membership: { ...outsider.membership, organizationId: org.orgId } })).rejects.toMatchObject({ code: "permission_denied" });
  });
});
