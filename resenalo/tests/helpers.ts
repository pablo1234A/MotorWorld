import { PlanCode } from "@prisma/client";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { encrypt } from "@/server/crypto";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { createBusiness } from "@/server/modules/business";
import { setProviderOverride } from "@/server/email/providers";
import type { MailProvider } from "@/server/email/providers/types";

const TABLES = [
  "email_logs", "email_jobs", "automation_events", "campaigns", "automation_rules", "email_templates", "customers",
  "email_connections", "oauth_states", "api_keys", "inbound_webhooks", "monthly_usage", "subscriptions", "invoices",
  "billing_events", "audit_logs", "sessions", "auth_tokens", "businesses", "users", "data_rights_requests",
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await redis().flushdb();
}

let n = 0;
export async function makeUser(opts: { verified?: boolean; email?: string } = {}) {
  n++;
  const user = await prisma.user.create({
    data: {
      email: opts.email ?? `user${n}-${Date.now()}@empresa-prueba.es`,
      name: `Usuario ${n}`,
      passwordHash: await hashPassword("ClaveSegura123"),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: "test",
    },
  });
  const s = await createSession(user.id, {});
  return { user, token: s.token, cookie: `rsn_session=${s.token}` };
}

export async function makeTenant(opts: { plan?: PlanCode | null; connected?: boolean; status?: "ACTIVE" | "PAST_DUE" | "CANCELED" } = {}) {
  const u = await makeUser();
  const business = await createBusiness(u.user.id, {
    name: `Negocio ${u.user.name}`,
    legalName: null, taxId: null, addressLine: "Calle Mayor 1", city: "Madrid", postalCode: "28001", country: "ES", phone: null, website: null,
    reviewUrl: "https://g.page/r/negocio-prueba/review", reviewPlatform: "google", senderName: null, replyToEmail: null,
    timezone: "Europe/Madrid", resendCooldownDays: 30, trackClicks: true, acceptDpa: true,
  });
  if (opts.plan !== null) await activatePlan(business.id, opts.plan ?? "STARTER", opts.status ?? "ACTIVE");
  if (opts.connected !== false) {
    await prisma.emailConnection.create({
      data: {
        businessId: business.id, provider: "GOOGLE", emailAddress: "negocio@gmail.com",
        accessTokenEnc: encrypt("access-token-valido"), refreshTokenEnc: encrypt("refresh-token-valido"),
        tokenExpiresAt: new Date(Date.now() + 3600_000), scopes: "https://www.googleapis.com/auth/gmail.send", status: "ACTIVE",
      },
    });
  }
  return { ...u, business };
}

export async function activatePlan(businessId: string, code: PlanCode, status: "ACTIVE" | "PAST_DUE" | "CANCELED" = "ACTIVE", period?: { start: Date; end: Date }) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
  const start = period?.start ?? new Date(Date.now() - 86400_000);
  const end = period?.end ?? new Date(Date.now() + 29 * 86400_000);
  await prisma.subscription.upsert({
    where: { businessId },
    create: { businessId, planId: plan.id, status, stripeSubscriptionId: `sub_test_${businessId}`, stripePriceId: plan.stripePriceId, currentPeriodStart: start, currentPeriodEnd: end },
    update: { planId: plan.id, status, currentPeriodStart: start, currentPeriodEnd: end },
  });
  await prisma.monthlyUsage.upsert({
    where: { businessId_periodStart: { businessId, periodStart: start } },
    create: { businessId, periodStart: start, periodEnd: end, emailLimit: plan.monthlyEmailLimit },
    update: { emailLimit: plan.monthlyEmailLimit },
  });
}

export async function makeCustomer(businessId: string, i = 0, extra: Partial<{ email: string; name: string; serviceName: string }> = {}) {
  return prisma.customer.create({
    data: { businessId, name: extra.name ?? `Cliente ${i}`, email: extra.email ?? `cliente${i}.${Math.random().toString(36).slice(2, 7)}@correo-cliente.es`, serviceName: extra.serviceName ?? "Corte de pelo", completedAt: new Date() },
  });
}

/** Proveedor de correo controlable para pruebas del motor (no simula éxito en producción: solo se inyecta en tests). */
export function fakeProvider(behaviour: (call: number, mime: Buffer) => Promise<{ providerMessageId: string | null }>) {
  const sent: Buffer[] = [];
  let calls = 0;
  const p: MailProvider = {
    id: "GOOGLE",
    label: "Gmail (test)",
    isConfigured: () => true,
    authorizeUrl: () => "https://example.test/auth",
    exchangeCode: async () => { throw new Error("no usado"); },
    refresh: async () => ({ accessToken: "nuevo", expiresAt: new Date(Date.now() + 3600_000), scope: "https://www.googleapis.com/auth/gmail.send" }),
    send: async (_t, mime) => {
      calls++;
      const r = await behaviour(calls, mime);
      sent.push(mime);
      return r;
    },
    revoke: async () => undefined,
  };
  setProviderOverride("GOOGLE", p);
  return { sent, calls: () => calls };
}

export function req(url: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", headers.get("origin") ?? "http://localhost:3999");
  return new Request(`http://localhost:3999${url}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
}

export const ctx = <T extends Record<string, string>>(params: T = {} as T) => ({ params: Promise.resolve(params) });
