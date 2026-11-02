import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { EventSource } from "@prisma/client";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { emailQueue } from "@/server/queue/queues";
import { clearProviderOverrides } from "@/server/email/providers";
import { setSmsProviderOverride, twilioSignature } from "@/server/sms/twilio";
import { createReviewRequest, scheduleDueReminders } from "@/server/modules/automation/requests";
import { processEmailJob } from "@/server/modules/automation/sender";
import { getCurrentUsage, usageWindow, addMonthsUtc } from "@/server/modules/billing/entitlements";
import { syncSubscription } from "@/server/modules/billing/stripe";
import { checkUsageAlerts } from "@/server/modules/notifications";
import { smsSegments, renderSms } from "@/lib/sms";
import { normalizePhone } from "@/lib/phone";
import { POST as twilioHook } from "@/app/api/webhooks/twilio/[token]/route";
import { activatePlan, ctx, fakeProvider, makeCustomer, makeTenant, req, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  clearProviderOverrides();
  setSmsProviderOverride(null);
});
afterAll(async () => {
  await emailQueue().close();
  redis().disconnect();
});

function fakeSms(fail?: () => never) {
  const sent: { to: string; body: string }[] = [];
  setSmsProviderOverride({
    isConfigured: () => true,
    send: async (m) => {
      if (fail) fail();
      sent.push({ to: m.to, body: m.body });
      return { providerMessageId: `SM${sent.length}`, status: "queued" };
    },
  });
  return sent;
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

describe("canal SMS", () => {
  async function smsTenant(plan: "PRO" | "STARTER" = "PRO") {
    const t = await makeTenant({ plan });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { channel: "SMS", delayMinutes: 0 } });
    return t;
  }

  it("envía por SMS, cuenta en el cupo SMS (no en el de correo) y registra la entrega real", async () => {
    const t = await smsTenant();
    const sent = fakeSms();
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Rosa Gil", email: "rosa@correo-cliente.es", phone: "+34600112233", serviceName: "corte" } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(r.status).toBe("CREATED");
    expect(await processEmailJob(r.jobId!)).toBe("sent");
    expect(sent[0].to).toBe("+34600112233");
    expect(sent[0].body).toMatch(/^Hola Rosa, gracias por confiar en .*http:\/\/localhost:3999\/r\/.* Baja: http:\/\/localhost:3999\/baja\//);
    const usage = await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect([usage.smsSent, usage.smsReserved, usage.sent]).toEqual([1, 0, 0]);

    // StatusCallback firmado de Twilio → ENTREGADO
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    process.env.TWILIO_AUTH_TOKEN = "twilio_test_token";
    const { resetEnvCache } = await import("@/server/env");
    resetEnvCache();
    const url = `http://localhost:3999/api/webhooks/twilio/${job.publicToken}`;
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    const bad = await twilioHook(req(`/api/webhooks/twilio/${job.publicToken}`, { method: "POST", body: new URLSearchParams(params).toString(), headers: { "x-twilio-signature": "falsa" } }), ctx({ token: job.publicToken }));
    expect(bad.status).toBe(401);
    const ok = await twilioHook(
      req(`/api/webhooks/twilio/${job.publicToken}`, { method: "POST", body: new URLSearchParams(params).toString(), headers: { "x-twilio-signature": twilioSignature("twilio_test_token", url, params) } }),
      ctx({ token: job.publicToken }),
    );
    expect(ok.status).toBe(204);
    const after = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("DELIVERED");
    expect(after.deliveredAt).not.toBeNull();
    delete process.env.TWILIO_AUTH_TOKEN;
    resetEnvCache();
  });

  it("sin móvil válido se omite; cupo SMS agotado se rechaza; número rechazado queda marcado", async () => {
    const t = await smsTenant();
    fakeSms();
    const noPhone = await prisma.customer.create({ data: { businessId: t.business.id, name: "Sin Móvil", email: "a@correo-cliente.es", phone: "+34912345678" } });
    expect((await createReviewRequest(t.business.id, { customerId: noPhone.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("INVALID_PHONE");

    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { smsSent: 50 } });
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Con Móvil", email: "b@correo-cliente.es", phone: "+34600999888" } });
    expect((await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true })).reason).toBe("SMS_LIMIT_REACHED");

    await prisma.monthlyUsage.updateMany({ where: { businessId: t.business.id }, data: { smsSent: 0 } });
    const { ProviderError } = await import("@/server/email/providers/types");
    fakeSms(() => {
      throw new ProviderError("invalid_recipient", "Twilio rechazó el número (21211)", 400);
    });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    expect(await processEmailJob(r.jobId!)).toBe("bounced");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).phoneInvalidAt).not.toBeNull();
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).smsSent).toBe(0);
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

  it("desconectar el correo no retiene los SMS pendientes", async () => {
    const t = await makeTenant({ plan: "PRO" });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { channel: "SMS", delayMinutes: 600 } });
    fakeSms();
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Ana Sms", email: "ana.sms@correo-cliente.es", phone: "+34600555444" } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API });
    const { disconnect } = await import("@/server/modules/email-connection");
    await disconnect(t.business.id, t.user.id);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } })).status).toBe("SCHEDULED");
  });

  it("un aviso de 'no entregado' que llega antes del registro del envío no se pierde", async () => {
    const t = await makeTenant({ plan: "PRO" });
    await prisma.automationRule.updateMany({ where: { businessId: t.business.id }, data: { channel: "SMS", delayMinutes: 0 } });
    const { applySmsStatus } = await import("@/server/modules/automation/sender");
    fakeSms(); // proveedor configurado al crear la solicitud
    const c = await prisma.customer.create({ data: { businessId: t.business.id, name: "Eva Sms", email: "eva.sms@correo-cliente.es", phone: "+34600555333" } });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    setSmsProviderOverride({
      isConfigured: () => true,
      send: async () => {
        await applySmsStatus(job.publicToken, "undelivered", "30007");
        return { providerMessageId: "SMx", status: "queued" };
      },
    });
    await processEmailJob(job.id);
    const after = await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("BOUNCED");
    expect((await prisma.monthlyUsage.findFirstOrThrow({ where: { businessId: t.business.id } })).smsSent).toBe(1);
  });
});

