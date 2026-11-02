import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { EventSource } from "@prisma/client";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { emailQueue } from "@/server/queue/queues";
import { clearProviderOverrides } from "@/server/email/providers";
import { setSmsGatewayOverride, type GatewayState, type SmsGateway } from "@/server/sms/smsgate";
import { createReviewRequest, scheduleDueReminders } from "@/server/modules/automation/requests";
import { processEmailJob } from "@/server/modules/automation/sender";
import { getCurrentUsage, usageWindow, addMonthsUtc } from "@/server/modules/billing/entitlements";
import { syncSubscription } from "@/server/modules/billing/stripe";
import { checkUsageAlerts } from "@/server/modules/notifications";
import { smsSegments, renderSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { POST as smsHook } from "@/app/api/webhooks/smsgate/[token]/route";
import { encrypt } from "@/server/crypto";
import { activatePlan, ctx, fakeProvider, makeCustomer, makeTenant, req, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  clearProviderOverrides();
  setSmsGatewayOverride(null);
});
afterAll(async () => {
  await emailQueue().close();
  redis().disconnect();
});

/** Simula la API de SMS Gate (el móvil del negocio). El estado de cada mensaje se controla desde la prueba. */
function fakeGateway(opts: { onSend?: () => void } = {}) {
  const sent: { to: string; text: string; id: string }[] = [];
  const states = new Map<string, GatewayState>();
  const g: SmsGateway = {
    listDevices: async () => [{ id: "dev1", name: "Pixel de Marta", lastSeen: new Date().toISOString() }],
    send: async (_c, m) => {
      opts.onSend?.();
      sent.push({ to: m.to, text: m.text, id: m.id });
      states.set(m.id, "Pending");
      return { messageId: m.id, state: "Pending" };
    },
    getState: async (_c, id) => ({ state: states.get(id) ?? "Pending", error: states.get(id) === "Failed" ? "RESULT_ERROR_GENERIC_FAILURE" : null }),
    cancel: async (_c, id) => void states.set(id, "Cancelled"),
    registerWebhook: async (_c, ev) => `wh-${ev}`,
    deleteWebhook: async () => undefined,
  };
  setSmsGatewayOverride(g);
  return { sent, states };
}

async function linkPhone(businessId: string) {
  return prisma.smsDevice.create({
    data: { businessId, apiBaseUrl: "https://api.sms-gate.app/3rdparty/v1", login: "u", passwordEnc: encrypt("p"), deviceId: "dev1", deviceName: "Pixel de Marta", phoneNumber: "+34611000000", webhookToken: `tok_${businessId}_abcdefghij` },
  });
}

describe("utilidades", () => {
  it("normaliza teléfonos españoles y rechaza fijos para SMS", () => {
    expect(normalizePhone("600 11 22 33")).toBe("+34600112233");
    expect(normalizePhone("0034 712-345-678")).toBe("+34712345678");
    expect(normalizePhone("123")).toBeNull();
  });
  it("cuenta segmentos SMS (GSM-7 y UCS-2) y añade la baja", () => {
    expect(smsSegments("Hola Ana").segments).toBe(1);
    expect(smsSegments("¿Qué tal tu experiencia? ó").encoding).toBe("UCS-2");
    const t = renderSms("Hola {{nombre_cliente}} {{enlace_resena}}", { customerName: "Ana López", businessName: "X", reviewUrl: "https://r/1", unsubscribeUrl: "https://b/1" });
    expect(t).toBe("Hola Ana https://r/1 Baja: https://b/1");
  });
});

describe("plan anual con cupo mensual y prueba gratuita", () => {
  it("un plan anual se divide en ventanas mensuales (el contador se reinicia cada mes)", async () => {
    const start = new Date("2026-01-31T10:00:00Z");
    const sub = { currentPeriodStart: start, currentPeriodEnd: addMonthsUtc(start, 12), billingInterval: "YEAR" as const };
    expect(usageWindow(sub, new Date("2026-02-10T00:00:00Z")).start.toISOString()).toBe("2026-01-31T10:00:00.000Z");
    expect(usageWindow(sub, new Date("2026-03-05T00:00:00Z")).start.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(usageWindow(sub, new Date("2026-12-31T12:00:00Z")).end.toISOString()).toBe(sub.currentPeriodEnd.toISOString());

    const t = await makeTenant({ plan: null });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "PRO" } });
    const periodStart = new Date(Date.now() - 40 * 86400_000);
    await prisma.subscription.create({
      data: { businessId: t.business.id, planId: plan.id, status: "ACTIVE", stripeSubscriptionId: "sub_anual", billingInterval: "YEAR", currentPeriodStart: periodStart, currentPeriodEnd: addMonthsUtc(periodStart, 12) },
    });
    const u = await getCurrentUsage(t.business.id);
    expect(u!.periodStart.getTime()).toBe(addMonthsUtc(periodStart, 1).getTime());
    expect(u!.emailLimit).toBe(300);
    expect(u!.smsLimit).toBe(50);
  });

  it("durante la prueba el cupo se limita y al activarse se aplica el del plan", async () => {
    const t = await makeTenant({ plan: null });
    const now = Math.floor(Date.now() / 1000);
    const base = {
      id: "sub_trial", object: "subscription", customer: "cus_t", cancel_at_period_end: false, canceled_at: null, metadata: { businessId: t.business.id },
      items: { data: [{ id: "si", price: { id: "price_test_business", recurring: { interval: "month" } }, current_period_start: now - 60, current_period_end: now + 14 * 86400 }] },
    };
    await syncSubscription({ ...base, status: "trialing", trial_end: now + 14 * 86400 } as unknown as Stripe.Subscription, new Date());
    let usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect(usage.emailLimit).toBe(50);
    expect(usage.smsLimit).toBe(10);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: t.business.id } })).trialUsedAt).not.toBeNull();
    const p2 = { start: now + 14 * 86400, end: now + 44 * 86400 };
    await syncSubscription(
      { ...base, status: "active", trial_end: null, items: { data: [{ ...base.items.data[0], current_period_start: p2.start, current_period_end: p2.end }] } } as unknown as Stripe.Subscription,
      new Date(Date.now() + 1000),
    );
    usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id }, orderBy: { periodStart: "desc" } });
    expect(usage.emailLimit).toBe(1000);
  });
});

describe("SMS desde el móvil del negocio (SMS Gate)", () => {
  async function smsTenant(plan: "PRO" | "STARTER" = "PRO") {
    const t = await makeTenant({ plan });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { channel: "SMS", delayMinutes: 0 } });
    return t;
  }

  it("vincula el móvil verificando las credenciales y registrando los avisos", async () => {
    const t = await smsTenant();
    fakeGateway();
    const { connectSmsDevice } = await import("@/server/modules/sms-device");
    const r = await connectSmsDevice({ businessId: t.business.id, userId: t.user.id, login: "abc", password: "secreto", phoneNumber: "600 11 22 33" });
    expect(r.device.deviceId).toBe("dev1");
    expect(r.device.phoneNumber).toBe("+34600112233");
    expect(r.device.passwordEnc).not.toContain("secreto");
    expect(r.device.webhookIds).toEqual(["wh-sms:sent", "wh-sms:delivered", "wh-sms:failed"]);
  });

  it("sin móvil vinculado no se crean SMS", async () => {
    const t = await smsTenant();
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Rosa Gil", email: "rosa@correo-cliente.es", phone: "+34600112233" } });
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("NO_SMS_DEVICE");
  });

  it("el SMS sale del móvil: solo cuenta cuando el móvil lo envía y el aviso se confirma con la API", async () => {
    const t = await smsTenant();
    await linkPhone(t.business.id);
    const gw = fakeGateway();
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Rosa Gil", email: "rosa@correo-cliente.es", phone: "+34600112233", serviceName: "corte" } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(await processEmailJob(r.jobId!)).toBe("sent");
    expect(gw.sent[0].to).toBe("+34600112233");
    expect(gw.sent[0].id).toBe(r.jobId);
    expect(gw.sent[0].text).toMatch(/^Hola Rosa, gracias por confiar en .* Baja: http:\/\/localhost:3999\/baja\//);
    let job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect([job.status, job.statusReason]).toEqual(["SENDING", "WAITING_DEVICE"]);
    let usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect([usage.smsSent, usage.smsReserved, usage.sent]).toEqual([0, 1, 0]);

    // Un aviso falsificado no cambia nada: el estado se consulta a la API (sigue Pending)
    const hook = (body: unknown, token = `tok_${t.business.id}_abcdefghij`) => smsHook(req(`/api/webhooks/smsgate/${token}`, { method: "POST", body: JSON.stringify(body) }), ctx({ token }));
    expect((await hook({ event: "sms:delivered", payload: { messageId: r.jobId } })).status).toBe(204);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).status).toBe("SENDING");
    expect((await hook({ event: "sms:sent", payload: { messageId: r.jobId } }, "token_que_no_existe_123456")).status).toBe(404);

    gw.states.set(r.jobId!, "Sent");
    await hook({ event: "sms:sent", payload: { messageId: r.jobId } });
    await hook({ event: "sms:sent", payload: { messageId: r.jobId } }); // repetido: idempotente
    usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect([usage.smsSent, usage.smsReserved]).toEqual([1, 0]);
    gw.states.set(r.jobId!, "Delivered");
    await hook({ event: "sms:delivered", payload: { messageId: r.jobId } });
    job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.status).toBe("DELIVERED");
    expect(job.deliveredAt).not.toBeNull();
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).smsSent).toBe(1);
  });

  it("si el móvil falla o no se conecta en 24 h, el SMS no cuenta en el cupo", async () => {
    const t = await smsTenant();
    await linkPhone(t.business.id);
    const gw = fakeGateway();
    const { pollPendingSms } = await import("@/server/modules/automation/sender");
    const a = await prisma.customer.create({ data: { businessId: t.business.id, name: "Ana", email: "ana@correo-cliente.es", phone: "+34600000001" } });
    const b = await prisma.customer.create({ data: { businessId: t.business.id, name: "Bea", email: "bea@correo-cliente.es", phone: "+34600000002" } });
    const ra = await createReviewRequest(t.business.id, { customerId: a.id, source: EventSource.MANUAL, sendNow: true });
    const rb = await createReviewRequest(t.business.id, { customerId: b.id, source: EventSource.MANUAL, sendNow: true });
    await processEmailJob(ra.jobId!);
    await processEmailJob(rb.jobId!);
    gw.states.set(ra.jobId!, "Failed");
    await prisma.emailJob.update({ where: { id: rb.jobId! }, data: { sendingStartedAt: new Date(Date.now() - 25 * 3600_000) } });
    await prisma.emailJob.updateMany({ where: { businessId: t.business.id }, data: { updatedAt: new Date(Date.now() - 5 * 60_000) } });
    const res = await pollPendingSms();
    expect(res.expired).toBe(1);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: ra.jobId! } })).status).toBe("FAILED");
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: rb.jobId! } })).lastError).toMatch(/24 horas/);
    expect(gw.states.get(rb.jobId!)).toBe("Cancelled");
    const u = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect([u.smsSent, u.smsReserved]).toEqual([0, 0]);
  });

  it("credenciales del móvil revocadas → SMS en espera y móvil marcado para volver a vincular", async () => {
    const t = await smsTenant();
    await linkPhone(t.business.id);
    const { ProviderError } = await import("@/server/email/providers/types");
    fakeGateway({ onSend: () => { throw new ProviderError("auth", "SMS Gate rechazó el usuario o la contraseña del móvil.", 401); } });
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Eva", email: "eva@correo-cliente.es", phone: "+34600555333" } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(await processEmailJob(r.jobId!)).toBe("on_hold");
    expect((await prisma.smsDevice.findUniqueOrThrow({ where: { businessId: t.business.id } })).status).toBe("NEEDS_REAUTH");
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).smsReserved).toBe(0);
  });

  it("sin móvil válido se omite; cupo SMS agotado se rechaza; desconectar el correo no retiene los SMS", async () => {
    const t = await smsTenant();
    await linkPhone(t.business.id);
    fakeGateway();
    const fijo = await prisma.customer.create({ data: { businessId: t.business.id, name: "Fijo", email: "fijo@correo-cliente.es", phone: "+34912345678" } });
    expect((await createReviewRequest(t.business.id, { customerId: fijo.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("INVALID_PHONE");
    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { smsSent: 50 } });
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Móvil", email: "movil@correo-cliente.es", phone: "+34600999888" } });
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("SMS_LIMIT_REACHED");
    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { smsSent: 0 } });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { delayMinutes: 600 } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API });
    const { disconnect } = await import("@/server/modules/email-connection");
    await disconnect(t.business.id, t.user.id);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).status).toBe("SCHEDULED");
  });

  it("Starter no puede usar SMS (la regla vuelve a correo)", async () => {
    const t = await smsTenant("STARTER");
    fakeProvider(async () => ({ providerMessageId: "g1" }));
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).channel).toBe("EMAIL");
  });
});

describe("recordatorio único si no se abrió el enlace", () => {
  it("crea exactamente un recordatorio tras el plazo y nunca para quien hizo clic", async () => {
    const t = await makeTenant({ plan: "PRO" });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { reminderEnabled: true, reminderDelayDays: 5 } });
    const prov = fakeProvider(async (n) => ({ providerMessageId: `g${n}` }));
    const a = await makeCustomer(t.business.id, 1);
    const b = await makeCustomer(t.business.id, 2);
    const ra = await createReviewRequest(t.business.id, { customerId: a.id, source: EventSource.MANUAL, sendNow: true });
    const rb = await createReviewRequest(t.business.id, { customerId: b.id, source: EventSource.MANUAL, sendNow: true });
    await processEmailJob(ra.jobId!);
    await processEmailJob(rb.jobId!);
    const old = new Date(Date.now() - 6 * 86400_000);
    await prisma.emailJob.updateMany({ where: { businessId: t.business.id }, data: { sentAt: old } });
    await prisma.emailJob.update({ where: { id: rb.jobId! }, data: { firstClickedAt: new Date(), clickCount: 1 } });

    expect((await scheduleDueReminders()).created).toBe(1);
    expect((await scheduleDueReminders()).created).toBe(0);
    const rem = await prisma.emailJob.findFirstOrThrow({ where: { reminderOfId: ra.jobId! } });
    expect(rem.isReminder).toBe(true);
    expect(rem.subject).toMatch(/¿nos cuentas qué tal fue\?/);
    expect(await processEmailJob(rem.id)).toBe("sent");
    expect(prov.calls()).toBe(3);
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).sent).toBe(3);
  });

  it("no se crea en Starter aunque la regla lo tenga activado", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { reminderEnabled: true, reminderDelayDays: 1 } });
    fakeProvider(async () => ({ providerMessageId: "g" }));
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    await processEmailJob(r.jobId!);
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { sentAt: new Date(Date.now() - 3 * 86400_000) } });
    expect((await scheduleDueReminders()).created).toBe(0);
  });
});

describe("avisos de consumo", () => {
  it("marca el aviso del 80 % y del 100 % una sola vez por periodo", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { sent: 80 } });
    await checkUsageAlerts(t.business.id);
    let u = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect(u.alert80At).not.toBeNull();
    expect(u.alert100At).toBeNull();
    const first = u.alert80At!.getTime();
    await checkUsageAlerts(t.business.id);
    u = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect(u.alert80At!.getTime()).toBe(first);
    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { sent: 100 } });
    await checkUsageAlerts(t.business.id);
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).alert100At).not.toBeNull();
    await activatePlan(t.business.id, "STARTER", "ACTIVE", { start: new Date(), end: new Date(Date.now() + 30 * 86400_000) });
    const fresh = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id }, orderBy: { periodStart: "desc" } });
    expect(fresh.alert80At).toBeNull();
  });
});

describe("regresiones de la segunda revisión", () => {
  it("sin medición de clics no hay recordatorio; tampoco si ya se envió una solicitud más reciente", async () => {
    const t = await makeTenant({ plan: "PRO" });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { reminderEnabled: true, reminderDelayDays: 1 } });
    fakeProvider(async (n) => ({ providerMessageId: `g${n}` }));
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    await processEmailJob(r.jobId!);
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { sentAt: new Date(Date.now() - 3 * 86400_000) } });
    await prisma.business.update({ where: { id: t.business.id }, data: { trackClicks: false } });
    expect((await scheduleDueReminders()).created).toBe(0);
    await prisma.business.update({ where: { id: t.business.id }, data: { trackClicks: true, resendCooldownDays: 0 } });
    const r2 = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true, serviceName: "otro" });
    await processEmailJob(r2.jobId!);
    await prisma.emailJob.update({ where: { id: r2.jobId! }, data: { sentAt: new Date(Date.now() - 2 * 86400_000) } });
    const created = await prisma.emailJob.count({ where: { businessId: t.business.id, isReminder: true } });
    await scheduleDueReminders();
    // como mucho uno, para la solicitud más reciente; nunca para la antigua
    expect(await prisma.emailJob.count({ where: { reminderOfId: r.jobId! } })).toBe(0);
    expect((await prisma.emailJob.count({ where: { businessId: t.business.id, isReminder: true } })) - created).toBeLessThanOrEqual(1);
  });


});
