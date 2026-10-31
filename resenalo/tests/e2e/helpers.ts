import { expect, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { E2E_ENV } from "./env";

export const MOCK = "http://127.0.0.1:4010";
export const db = new PrismaClient({ datasources: { db: { url: E2E_ENV.DATABASE_URL } } });

export async function mockState(request: APIRequestContext) {
  return (await request.get(`${MOCK}/__state`)).json() as Promise<{ systemMail: { to: string; subject: string; text: string }[]; gmailSent: { raw: string }[] }>;
}
export async function setMockMode(request: APIRequestContext, mode: Record<string, string>) {
  await request.post(`${MOCK}/__mode`, { data: mode });
}

export async function waitForMail(request: APIRequestContext, to: string, subjectIncludes: string) {
  let found: { text: string } | undefined;
  await expect
    .poll(async () => {
      const s = await mockState(request);
      found = [...s.systemMail].reverse().find((m) => m.to.includes(to) && m.subject.includes(subjectIncludes));
      return Boolean(found);
    }, { timeout: 15_000 })
    .toBe(true);
  return found!;
}

export const linkIn = (text: string, pathPart: string) => {
  const m = text.match(new RegExp(`https?://[^\\s]+${pathPart}\\?token=[A-Za-z0-9_%-]+`));
  if (!m) throw new Error(`no se encontró el enlace ${pathPart}`);
  return m[0];
};

const signer = new Stripe("sk_test_signing_only");
let n = 0;
/** Envía al endpoint real un webhook de Stripe firmado con el secreto configurado. */
export async function stripeEvent(request: APIRequestContext, type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_e2e_${Date.now()}_${++n}`, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object } });
  const sig = signer.webhooks.generateTestHeaderString({ payload, secret: E2E_ENV.STRIPE_WEBHOOK_SECRET });
  const res = await request.post("/api/webhooks/stripe", { data: payload, headers: { "stripe-signature": sig, "content-type": "application/json" } });
  expect(res.status()).toBe(200);
}

export async function activateSubscription(request: APIRequestContext, businessId: string, plan: "starter" | "pro" | "business", status = "active") {
  const now = Math.floor(Date.now() / 1000);
  await stripeEvent(request, "customer.subscription.updated", {
    id: `sub_e2e_${businessId}`, object: "subscription", customer: `cus_e2e_${businessId}`, status, cancel_at_period_end: false, canceled_at: null,
    metadata: { businessId },
    items: { data: [{ id: "si_e2e", price: { id: `price_e2e_${plan}` }, current_period_start: now - 60, current_period_end: now + 30 * 86400 }] },
  });
}

/** Completa la autorización OAuth contra el servidor que reproduce Google (el navegador no puede ir a accounts.google.com en pruebas). */
export async function connectGmail(page: Page, returnTo: "onboarding" | "app") {
  const r = await page.request.post("/api/v1/email-connection/connect", { data: { provider: "GOOGLE", returnTo }, headers: { origin: E2E_ENV.APP_URL } });
  expect(r.status()).toBe(200);
  const { url } = await r.json();
  const u = new URL(url);
  expect(u.hostname).toBe("accounts.google.com");
  expect(u.searchParams.get("scope")).toContain("gmail.send");
  await page.goto(`/api/v1/email-connection/callback/google?code=e2e-code&state=${encodeURIComponent(u.searchParams.get("state")!)}`);
}

export async function registerAndVerify(page: Page, request: APIRequestContext, p: { name: string; email: string; password: string }) {
  await page.goto("/registro");
  await page.getByLabel("Nombre y apellidos").fill(p.name);
  await page.getByLabel("Correo electrónico").fill(p.email);
  await page.getByLabel("Contraseña").fill(p.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/verificar-pendiente/);
  const mail = await waitForMail(request, p.email, "Confirma tu correo");
  await page.goto(linkIn(mail.text, "/verificar-email"));
  await expect(page.getByText("¡Correo confirmado!")).toBeVisible();
}
