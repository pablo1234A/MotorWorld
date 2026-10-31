import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { EventSource } from "@prisma/client";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { emailQueue } from "@/server/queue/queues";
import { parseFlexibleDate } from "@/lib/csv";
import { clearProviderOverrides } from "@/server/email/providers";
import { createReviewRequest } from "@/server/modules/automation/requests";
import { sweep } from "@/server/modules/automation/sender";
import { resumeOnHoldJobs } from "@/server/modules/email-connection";
import { syncSubscription } from "@/server/modules/billing/stripe";
import { makeCustomer, makeTenant, resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  clearProviderOverrides();
});
afterAll(async () => {
  await emailQueue().close();
  redis().disconnect();
});

describe("regresiones de la revisión de código", () => {
  it("fechas: un mes fuera de rango se rechaza (no salta de año)", () => {
    expect(parseFlexibleDate("10/31/2026")).toBeNull();
    expect(parseFlexibleDate("2026-13-01")).toBeNull();
    expect(parseFlexibleDate("31/10/2026")?.toISOString().slice(0, 10)).toBe("2026-10-31");
  });

  it("al reconectar, los envíos en espera aún no vencidos conservan su programación", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.API });
    const future = new Date(Date.now() + 5 * 86400_000);
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { status: "ON_HOLD", scheduledFor: future, createdAt: new Date(Date.now() - 8 * 86400_000) } });
    const conn = await prisma.emailConnection.findUniqueOrThrow({ where: { businessId: t.business.id } });
    await resumeOnHoldJobs(t.business.id, conn.id);
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.status).toBe("SCHEDULED");
    expect(job.scheduledFor.getTime()).toBe(future.getTime());
  });

  it("un evento tardío de una suscripción antigua no sobrescribe la activa", async () => {
    const t = await makeTenant({ plan: "PRO" });
    const now = Math.floor(Date.now() / 1000);
    const old = {
      id: "sub_antigua", object: "subscription", customer: "cus_x", status: "incomplete_expired", cancel_at_period_end: false, canceled_at: null,
      metadata: { businessId: t.business.id },
      items: { data: [{ id: "si", price: { id: "price_test_starter" }, current_period_start: now - 100, current_period_end: now + 1000 }] },
    } as unknown as Stripe.Subscription;
    await syncSubscription(old, new Date());
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: t.business.id }, include: { plan: true } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.plan.code).toBe("PRO");
  });

  it("el barrido no vuelve a encolar trabajos que acaban de encolarse", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: EventSource.MANUAL, sendNow: true });
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { scheduledFor: new Date(Date.now() - 5 * 60_000) } });
    expect((await sweep()).orphan).toBe(0);
    await prisma.emailJob.update({ where: { id: r.jobId! }, data: { lastEnqueuedAt: new Date(Date.now() - 20 * 60_000) } });
    expect((await sweep()).orphan).toBe(1);
  });
});
