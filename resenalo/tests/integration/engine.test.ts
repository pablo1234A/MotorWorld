import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { EventSource } from "@prisma/client";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { emailQueue } from "@/server/queue/queues";
import { clearProviderOverrides } from "@/server/email/providers";
import { ProviderError } from "@/server/email/providers/types";
import { createReviewRequest, cancelJob, retryJob } from "@/server/modules/automation/requests";
import { processEmailJob, sweep } from "@/server/modules/automation/sender";
import { unsubscribeByToken } from "@/server/modules/customers";
import { activatePlan, fakeProvider, makeCustomer, makeTenant, resetDb } from "../helpers";

const ok = () => fakeProvider(async (n) => ({ providerMessageId: `gmail-msg-${n}` }));
const usageOf = (businessId: string) => prisma.monthlyUsage.findFirstOrThrow({ where: { businessId }, orderBy: { periodStart: "desc" } });

beforeEach(async () => {
  await resetDb();
  clearProviderOverrides();
});
afterAll(async () => {
  await emailQueue().close();
  redis().disconnect();
});

describe("motor de automatización — flujo completo", () => {
  it("crea la solicitud, la envía con la cuenta del negocio, personaliza variables y actualiza el contador", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const c = await makeCustomer(t.business.id, 1, { name: "Marta López", email: "marta@correo-cliente.es", serviceName: "Tinte" });
    const prov = ok();
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(r.status).toBe("CREATED");
    expect(r.jobStatus).toBe("QUEUED");
    const outcome = await processEmailJob(r.jobId!);
    expect(outcome).toBe("sent");

    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! }, include: { logs: true } });
    expect(job.status).toBe("SENT");
    expect(job.providerMessageId).toBe("gmail-msg-1");
    expect(job.logs.map((l) => l.event)).toEqual(expect.arrayContaining(["QUEUED", "SEND_ATTEMPT", "SENT"]));

    const mime = prov.sent[0].toString("utf8").replace(/\r\n[ \t]+/g, " "); // desplegado de cabeceras RFC 5322
    expect(mime).toMatch(/^From: .*negocio@gmail\.com/m);
    expect(mime).toMatch(/^To: .*marta@correo-cliente\.es/m);
    expect(mime).toMatch(/^List-Unsubscribe: <http:\/\/localhost:3999\/api\/public\/unsubscribe\//m);
    expect(mime).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
    expect(job.bodyText).toContain("Hola Marta López,");
    expect(job.bodyText).toContain(`Desde ${t.business.name}`);
    expect(job.bodyText).toContain(`http://localhost:3999/r/${job.publicToken}`);

    const usage = await usageOf(t.business.id);
    expect(usage.sent).toBe(1);
    expect(usage.reserved).toBe(0);
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(cust.lastRequestStatus).toBe("SENT");
  });

  it("respeta el retardo de la automatización (programado, no enviado antes de tiempo)", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const prov = ok();
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API, completedAt: new Date() });
    expect(r.jobStatus).toBe("SCHEDULED");
    expect(r.scheduledFor!.getTime()).toBeGreaterThan(Date.now() + 110 * 60_000);
    expect(await processEmailJob(r.jobId!)).toBe("skipped");
    await sweep();
    expect(prov.calls()).toBe(0);
    // al vencer, el barrido lo pasa a la cola
    await sweep(new Date(Date.now() + 3 * 3600_000));
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).status).toBe("QUEUED");
  });
});

describe("límites mensuales (backend, atómicos)", () => {
  it("Starter: 35 solicitudes concurrentes → exactamente 30 aceptadas y 5 rechazadas por límite", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const customers = await Promise.all(Array.from({ length: 35 }, (_, i) => makeCustomer(t.business.id, i)));
    const results = await Promise.all(customers.map((c) => createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true })));
    expect(results.filter((r) => r.status === "CREATED")).toHaveLength(30);
    const rejected = results.filter((r) => r.status === "REJECTED");
    expect(rejected).toHaveLength(5);
    expect(rejected.every((r) => r.reason === "LIMIT_REACHED")).toBe(true);
  });

  it("el worker nunca supera el límite aunque haya trabajos de más en cola (reserva atómica)", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const prov = ok();
    const customers = await Promise.all(Array.from({ length: 30 }, (_, i) => makeCustomer(t.business.id, i)));
    const res = await Promise.all(customers.map((c) => createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true })));
    // Simulamos un consumo externo (p. ej. cambio a un plan inferior) dejando solo 3 huecos.
    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { emailLimit: 3 } });
    const outcomes = await Promise.all(res.map((r) => processEmailJob(r.jobId!)));
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(3);
    expect(outcomes.filter((o) => o === "blocked")).toHaveLength(27);
    expect(prov.calls()).toBe(3);
    const u = await usageOf(t.business.id);
    expect(u.sent).toBe(3);
    expect(u.reserved).toBe(0);
    const blocked = await prisma.emailJob.count({ where: { businessId: t.business.id, status: "BLOCKED", statusReason: "LIMIT_REACHED" } });
    expect(blocked).toBe(27);
  });

  it("límites de cada plan: Starter 30, Pro 70, Business 200", async () => {
    for (const [code, limit] of [["STARTER", 30], ["PRO", 70], ["BUSINESS", 200]] as const) {
      const t = await makeTenant({ plan: code });
      const u = await usageOf(t.business.id);
      expect(u.emailLimit).toBe(limit);
      await prisma.monthlyUsage.update({ where: { id: u.id }, data: { sent: limit } });
      const c = await makeCustomer(t.business.id);
      const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
      expect(r.reason).toBe("LIMIT_REACHED");
    }
  });

  it("el contador se reinicia en el nuevo periodo de facturación", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const u = await usageOf(t.business.id);
    await prisma.monthlyUsage.update({ where: { id: u.id }, data: { sent: 30 } });
    const c1 = await makeCustomer(t.business.id, 1);
    expect((await createReviewRequest(t.business.id, { customerId: c1.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("LIMIT_REACHED");
    // Renovación (lo haría el webhook de Stripe): nuevo periodo
    await activatePlan(t.business.id, "STARTER", "ACTIVE", { start: new Date(), end: new Date(Date.now() + 30 * 86400_000) });
    const r = await createReviewRequest(t.business.id, { customerId: c1.id, source: EventSource.MANUAL, sendNow: true });
    expect(r.status).toBe("CREATED");
    const newUsage = await usageOf(t.business.id);
    expect(newUsage.id).not.toBe(u.id);
    expect(newUsage.sent).toBe(0);
  });
});

describe("comprobaciones previas", () => {
  it("sin suscripción activa → rechazado; pago pendiente (PAST_DUE) → rechazado", async () => {
    const t = await makeTenant({ plan: null });
    const c = await makeCustomer(t.business.id);
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL })).reason).toBe("SUBSCRIPTION_INACTIVE");
    await activatePlan(t.business.id, "PRO", "PAST_DUE");
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL })).reason).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("sin correo conectado → rechazado", async () => {
    const t = await makeTenant({ connected: false });
    const c = await makeCustomer(t.business.id);
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL })).reason).toBe("NO_EMAIL_CONNECTION");
  });

  it("duplicados: mismo externalId es idempotente; mismo cliente en periodo de espera se omite", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const a = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API, externalId: "pedido-77" });
    const b = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API, externalId: "pedido-77" });
    expect(a.status).toBe("CREATED");
    expect(b.status).toBe("DUPLICATE");
    expect(b.jobId).toBe(a.jobId);
    const d = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, serviceName: "Otro servicio" });
    expect(d.reason).toBe("COOLDOWN");
    expect(await prisma.emailJob.count({ where: { businessId: t.business.id } })).toBe(1);
  });

  it("baja del destinatario: bloquea pendientes y futuras solicitudes", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API });
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    await unsubscribeByToken(job.publicToken);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("BLOCKED");
    await prisma.business.update({ where: { id: t.business.id }, data: { resendCooldownDays: 0 } });
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, serviceName: "x" })).reason).toBe("UNSUBSCRIBED");
  });

  it("automatización en pausa: omite eventos automáticos pero permite el envío manual", async () => {
    const t = await makeTenant();
    await prisma.business.update({ where: { id: t.business.id }, data: { automationPaused: true } });
    const c1 = await makeCustomer(t.business.id, 1);
    const c2 = await makeCustomer(t.business.id, 2);
    expect((await createReviewRequest(t.business.id, { customerId: c1.id, source: EventSource.API })).reason).toBe("AUTOMATION_PAUSED");
    expect((await createReviewRequest(t.business.id, { customerId: c2.id, source: EventSource.MANUAL, sendNow: true })).status).toBe("CREATED");
  });

  it("cancelar libera el cupo comprometido", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API });
    await cancelJob(t.business.id, r.jobId!);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).status).toBe("CANCELED");
    expect(await processEmailJob(r.jobId!)).toBe("skipped");
  });
});

describe("errores del proveedor", () => {
  it("fallo de autorización → conexión NEEDS_REAUTH, envío en espera, sin contabilizar; se reanuda al reconectar", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    fakeProvider(async () => {
      throw new ProviderError("auth", "Gmail: autorización caducada o revocada.", 401);
    });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(await processEmailJob(r.jobId!)).toBe("on_hold");
    const conn = await prisma.emailConnection.findUniqueOrThrow({ where: { businessId: t.business.id } });
    expect(conn.status).toBe("NEEDS_REAUTH");
    expect(conn.lastError).toContain("autorización");
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! }, include: { logs: true } });
    expect(job.status).toBe("ON_HOLD");
    expect(job.logs.some((l) => l.event === "AUTH_ERROR")).toBe(true);
    expect((await usageOf(t.business.id)).sent).toBe(0);
    expect((await usageOf(t.business.id)).reserved).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { businessId: t.business.id, action: "email_connection.auth_failed" } });
    expect(audit).not.toBeNull();

    // Reconexión → reanudación
    await prisma.emailConnection.update({ where: { id: conn.id }, data: { status: "ACTIVE" } });
    const { resumeOnHoldJobs } = await import("@/server/modules/email-connection");
    await resumeOnHoldJobs(t.business.id, conn.id);
    ok();
    expect(await processEmailJob(r.jobId!)).toBe("sent");
    expect((await usageOf(t.business.id)).sent).toBe(1);
  });

  it("error temporal → reintento con backoff; al agotar intentos → FALLIDO sin contabilizar", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    fakeProvider(async () => {
      throw new ProviderError("transient", "Gmail no disponible (503).", 503);
    });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { maxAttempts: 3 } });
    expect(await processEmailJob(r.jobId!)).toBe("retry");
    let job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.status).toBe("QUEUED");
    expect(job.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 50_000);
    for (let i = 0; i < 2; i++) {
      await prisma.emailJob.update({ where: { id: job.id }, data: { scheduledFor: new Date() } });
      await processEmailJob(job.id);
    }
    job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.status).toBe("FAILED");
    expect(job.statusReason).toBe("MAX_ATTEMPTS");
    expect(job.attempts).toBe(3);
    const u = await usageOf(t.business.id);
    expect(u.sent).toBe(0);
    expect(u.failed).toBe(1);
    expect(u.reserved).toBe(0);
  });

  it("destinatario rechazado → REBOTADO y el cliente queda marcado para no volver a enviarle", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    fakeProvider(async () => {
      throw new ProviderError("invalid_recipient", "Gmail rechazó el destinatario: Invalid To header", 400);
    });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(await processEmailJob(r.jobId!)).toBe("bounced");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).emailStatus).toBe("BOUNCED");
    await expect(retryJob(t.business.id, r.jobId!)).rejects.toThrow(/no válido o rechazado/);
  });

  it("envío interrumpido (worker caído a mitad) → no se reenvía automáticamente para evitar duplicados", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    const u = await usageOf(t.business.id);
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { status: "SENDING", sendingStartedAt: new Date(Date.now() - 20 * 60_000), usagePeriodStart: u.periodStart } });
    await prisma.monthlyUsage.update({ where: { id: u.id }, data: { reserved: 1 } });
    const s = await sweep();
    expect(s.stale).toBe(1);
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.status).toBe("FAILED");
    expect(job.statusReason).toBe("UNKNOWN_OUTCOME");
    expect((await usageOf(t.business.id)).reserved).toBe(0);
  });

  it("dos workers procesando el mismo trabajo a la vez → solo un envío", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const prov = ok();
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    const outcomes = await Promise.all([processEmailJob(r.jobId!), processEmailJob(r.jobId!), processEmailJob(r.jobId!)]);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(prov.calls()).toBe(1);
  });
});
