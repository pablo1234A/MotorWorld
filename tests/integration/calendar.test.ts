import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import { eventIdFor } from "@/server/integrations/google";
import * as appointments from "@/server/modules/appointments/service";
import * as calendar from "@/server/modules/integrations/calendar";

import { FakeGoogle } from "./support/fake-google";
import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/**
 * Fase 9a: Google Calendar por el camino real (OAuth, tokens cifrados en la BD,
 * sincronización de citas), con un servidor que imita a Google SOLO en tests.
 */

const google = new FakeGoogle();
type Ctx = Parameters<typeof calendar.startConnect>[0];
const sub = (planCode: PlanCode): SubscriptionState => ({ planCode, status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });

async function admin(o: TestOrg, plan: PlanCode): Promise<Ctx> {
  return { auth: { userId: o.ownerId }, membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [] }, subscription: sub(plan) };
}
async function request(o: TestOrg, fields: { date?: string; slot?: [Date, Date] }) {
  const [{ id }] = await query<{ id: string }>(
    `insert into appointments (organization_id, branch_id, source, requester_name, requester_email, plate_entered, requested_date, requested_slot, customer_message)
     values ($1, $2, 'booking_page', 'Luis Mora', 'luis@cliente.test', '1234 BCD', $3, $4, 'Ruido al frenar') returning id`,
    [o.orgId, o.branchId, fields.date ?? null, fields.slot ? `[${fields.slot[0].toISOString()},${fields.slot[1].toISOString()})` : null],
  );
  return id;
}
async function connect(ctx: Ctx, code = "codigo-bueno") {
  const { url, state } = await calendar.startConnect(ctx, "http://localhost:3000");
  expect(new URL(url).searchParams.get("state")).toBe(state);
  await calendar.completeConnect(ctx, { code, state, cookieState: state }, "http://localhost:3000");
}
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let max: TestOrg;
let ctx: Ctx;

beforeAll(async () => {
  await google.start();
  process.env.GOOGLE_CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secreto-de-prueba";
  process.env.GOOGLE_OAUTH_BASE = google.url;
  process.env.GOOGLE_API_BASE = google.url;
  process.env.INTEGRATIONS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  max = await createOrg("max");
  ctx = await admin(max, "max");
});
afterAll(async () => {
  await google.stop();
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_BASE", "GOOGLE_API_BASE", "INTEGRATIONS_ENCRYPTION_KEY"]) delete process.env[k];
  await closePool();
});

describe("conexión con Google (OAuth)", () => {
  it("solo para Max o superior y solo administradores", async () => {
    const pro = await createOrg("pro");
    await expect(calendar.startConnect(await admin(pro, "pro"), "http://localhost:3000")).rejects.toMatchObject({ code: "feature_unavailable" });
    const user = await createUser();
    const memberId = await addMember(max, user, "operator", ["appointments.manage"]);
    const op: Ctx = { auth: { userId: user }, membership: { organizationId: max.orgId, memberId, role: "operator", permissions: ["appointments.manage"] }, subscription: sub("max") };
    await expect(calendar.startConnect(op, "http://localhost:3000")).rejects.toMatchObject({ code: "permission_denied" });
    // Un operador que finge ser admin en el contexto tampoco pasa: lo comprueba la BD.
    await expect(calendar.startConnect({ ...op, membership: { ...op.membership, role: "admin" } }, "http://localhost:3000")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("rechaza un state sin cookie, de otro usuario o de otro taller, y sin el permiso de la agenda", async () => {
    const { state } = await calendar.startConnect(ctx, "http://localhost:3000");
    await expect(calendar.completeConnect(ctx, { code: "codigo-bueno", state, cookieState: undefined }, "http://localhost:3000")).rejects.toMatchObject({ detail: "oauth_state" });
    const other = await createOrg("max");
    const otherCtx = await admin(other, "max");
    await expect(calendar.completeConnect(otherCtx, { code: "codigo-bueno", state, cookieState: state }, "http://localhost:3000")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(connect(ctx, "codigo-sin-permiso")).rejects.toMatchObject({ detail: "google_scope" });
    await expect(connect(ctx, "codigo-falso")).rejects.toMatchObject({ code: "integration_failed" });
    expect((await calendar.getCalendarStatus(ctx)).integration).toBeNull();
  });

  it("conecta: guarda la cuenta y los tokens CIFRADOS (nunca en claro)", async () => {
    await connect(ctx);
    const status = await calendar.getCalendarStatus(ctx);
    expect(status).toMatchObject({ available: true, configured: true, integration: { status: "connected", email: "agenda@taller.test" } });
    const [secret] = await query<{ ciphertext: Buffer }>(
      "select s.ciphertext from private.integration_secrets s join integrations i on i.id = s.integration_id where i.organization_id = $1 and i.status = 'connected'",
      [max.orgId],
    );
    expect(secret.ciphertext.toString("latin1")).not.toContain("rt-1");
    expect(secret.ciphertext.toString("latin1")).not.toContain("at-1");
    const [audit] = await query("select 1 from audit_logs where organization_id = $1 and action = 'google_calendar.connected'", [max.orgId]);
    expect(audit).toBeTruthy();
  });
});

describe("sincronización de citas", () => {
  it("solicitud → evento «sin confirmar»; confirmada → con hora; repetir no duplica; rechazada → se quita", async () => {
    const id = await request(max, { date: day(5) });
    expect(await calendar.syncAppointment(id)).toBe("synced");
    const ev = google.events.get(eventIdFor(id))!;
    expect(ev).toMatchObject({ status: "tentative", start: { date: day(5) } });
    expect(ev.summary).toBe("Solicitud (sin confirmar): Luis Mora · 1234 BCD");
    expect(ev.description).toContain("Mensaje: Ruido al frenar");
    expect(ev.description).toContain(`/app/citas/${id}`);

    await appointments.confirmAppointment(ctx, { id, date: day(6), time: "10:00", durationMinutes: 60 });
    expect(await calendar.syncAppointment(id)).toBe("synced");
    expect(await calendar.syncAppointment(id)).toBe("synced");
    expect([...google.events.keys()].filter((k) => k === eventIdFor(id))).toHaveLength(1);
    const confirmed = google.events.get(eventIdFor(id))!;
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.summary).toBe("Cita: Luis Mora · 1234 BCD");
    expect(confirmed.start.dateTime).toBeTruthy();
    const [link] = await query<{ sync_status: string }>("select sync_status from calendar_event_links where appointment_id = $1", [id]);
    expect(link.sync_status).toBe("synced");

    await appointments.cancelAppointment(ctx, id);
    expect(await calendar.syncAppointment(id)).toBe("removed");
    expect(google.events.has(eventIdFor(id))).toBe(false);
  });

  it("si Google falla, la cita no se ve afectada: queda pendiente y el proceso programado la reintenta", async () => {
    const start = new Date(Date.now() + 3 * 86_400_000);
    const id = await request(max, { slot: [start, new Date(start.getTime() + 3_600_000)] });
    google.failNextEventCall = 1;
    expect(await calendar.syncAppointment(id)).toBe("failed");
    const [link] = await query<{ sync_status: string }>("select sync_status from calendar_event_links where appointment_id = $1", [id]);
    expect(link.sync_status).toBe("pending");
    const [appt] = await query<{ status: string }>("select status from appointments where id = $1", [id]);
    expect(appt.status).toBe("requested");

    const stats = await calendar.syncPendingCalendar();
    expect(stats.synced).toBeGreaterThanOrEqual(1);
    expect(google.events.get(eventIdFor(id))?.start.dateTime).toBeTruthy();
  });

  it("de otro taller sin Google conectado, o sin plan Max, no se sincroniza nada", async () => {
    const pro = await createOrg("pro");
    expect(await calendar.syncAppointment(await request(pro, { date: day(4) }))).toBe("skipped");
  });

  it("si Google retira el permiso, pide volver a conectar; desconectar revoca y borra los tokens", async () => {
    // Fuerza la renovación del token de acceso: Google responde invalid_grant.
    const [{ id: integrationId }] = await query<{ id: string }>("select id from integrations where organization_id = $1 and status = 'connected'", [max.orgId]);
    google.deadRefreshTokens.add("rt-1");
    const { seal } = await import("@/server/integrations/crypto");
    const s = seal(JSON.stringify({ refreshToken: "rt-1", accessToken: "at-viejo", expiresAt: Date.now() - 1000 }), integrationId);
    await query("update private.integration_secrets set ciphertext = $2, nonce = $3, auth_tag = $4 where integration_id = $1", [integrationId, s.ciphertext, s.nonce, s.authTag]);

    const id = await request(max, { date: day(7) });
    expect(await calendar.syncAppointment(id)).toBe("reconnect");
    expect((await calendar.getCalendarStatus(ctx)).integration).toMatchObject({ status: "error", lastError: "reconnect_required" });

    await calendar.disconnect(ctx);
    expect(google.revoked).toContain("rt-1");
    expect(await query("select 1 from private.integration_secrets where integration_id = $1", [integrationId])).toHaveLength(0);
    expect((await calendar.getCalendarStatus(ctx)).integration).toBeNull();
    expect(await calendar.syncAppointment(id)).toBe("skipped");

    // Volver a conectar crea una conexión nueva y la cita pendiente se sube.
    google.deadRefreshTokens.clear();
    await connect(ctx);
    const stats = await calendar.syncPendingCalendar();
    expect(stats.synced).toBeGreaterThanOrEqual(1);
    expect(google.events.has(eventIdFor(id))).toBe(true);
  });
});
