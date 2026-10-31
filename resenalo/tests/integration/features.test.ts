import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { POST as eventsApi } from "@/app/api/public/v1/events/route";
import { POST as hookRoute } from "@/app/api/hooks/[publicId]/route";
import { POST as importRoute } from "@/app/api/v1/customers/import/route";
import * as tplRoutes from "@/app/api/v1/templates/route";
import * as ruleRoutes from "@/app/api/v1/automations/route";
import { POST as campaignRoute } from "@/app/api/v1/campaigns/route";
import { GET as clickRoute } from "@/app/r/[token]/route";
import { POST as unsubRoute } from "@/app/api/public/unsubscribe/[token]/route";
import { createApiKey, getOrCreateInboundWebhook, signInboundPayload } from "@/server/modules/integrations";
import { createReviewRequest } from "@/server/modules/automation/requests";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { ctx, makeCustomer, makeTenant, req, resetDb } from "../helpers";

beforeEach(resetDb);
afterAll(() => redis().disconnect());

const event = { externalId: "cita-1001", customer: { name: "Pedro Ruiz", email: "pedro@correo-cliente.es" }, serviceName: "Revisión", completedAt: new Date().toISOString() };

describe("API pública y webhooks entrantes", () => {
  it("API key: crea cliente + solicitud; idempotente; clave inválida → 401", async () => {
    const t = await makeTenant({ plan: "PRO" });
    const { secret } = await createApiKey(t.business.id, t.user.id, "CRM");
    const call = (auth: string, body: unknown = event) =>
      eventsApi(req("/api/public/v1/events", { method: "POST", json: body, headers: { authorization: auth, origin: "https://crm.externo.com" } }), ctx());
    const r1 = await call(`Bearer ${secret}`);
    expect(r1.status).toBe(201);
    const j1 = await r1.json();
    expect(j1.status).toBe("CREATED");
    const r2 = await (await call(`Bearer ${secret}`)).json();
    expect(r2.status).toBe("DUPLICATE");
    expect(await prisma.customer.count({ where: { businessId: t.business.id } })).toBe(1);
    expect((await call("Bearer rsn_live_inventadaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(401);
    expect((await call(`Bearer ${secret}`, { customer: { name: "X", email: "no-es-email" } })).status).toBe(422);
  });

  it("plan Starter no incluye API", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const { secret } = await createApiKey(t.business.id, t.user.id, "CRM");
    const r = await eventsApi(req("/api/public/v1/events", { method: "POST", json: event, headers: { authorization: `Bearer ${secret}` } }), ctx());
    expect(r.status).toBe(403);
  });

  it("webhook HMAC: firma válida acepta; firma inválida o caducada rechaza", async () => {
    const t = await makeTenant({ plan: "BUSINESS" });
    const hook = await getOrCreateInboundWebhook(t.business.id);
    const raw = JSON.stringify(event);
    const call = (sig: string) => hookRoute(req(`/api/hooks/${hook.publicId}`, { method: "POST", body: raw, headers: { "x-resenalo-signature": sig, "content-type": "application/json" } }), ctx({ publicId: hook.publicId }));
    expect((await call(signInboundPayload(hook.secret, raw))).status).toBe(201);
    expect((await call(signInboundPayload("whsec_otro", raw))).status).toBe(401);
    expect((await call(signInboundPayload(hook.secret, raw, Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
    expect((await call("basura")).status).toBe(401);
  });
});

describe("clientes: importación CSV", () => {
  it("valida emails, detecta duplicados y genera solicitudes", async () => {
    const t = await makeTenant({ plan: "PRO" });
    await makeCustomer(t.business.id, 0, { email: "existente@correo-cliente.es" });
    const csv = [
      "nombre;email;servicio;fecha",
      "Ana;ana@correo-cliente.es;Corte;31/10/2026",
      "Ana bis;ANA@correo-cliente.es;Corte;31/10/2026",
      "Mal;no-es-email;Corte;",
      "Existe;existente@correo-cliente.es;Tinte;2026-10-30",
      "Fecha mala;f@correo-cliente.es;Corte;mañana",
    ].join("\n");
    const noLegal = await importRoute(req("/api/v1/customers/import", { method: "POST", cookie: t.cookie, json: { csv, createRequests: true } }), ctx());
    expect(noLegal.status).toBe(422);
    const r = await importRoute(req("/api/v1/customers/import", { method: "POST", cookie: t.cookie, json: { csv, createRequests: true, legalBasisConfirmed: true } }), ctx());
    const { report } = await r.json();
    expect(report.totalRows).toBe(5);
    expect(report.created).toBe(1);
    expect(report.updated).toBe(1);
    expect(report.duplicatesInFile).toBe(1);
    expect(report.invalid).toHaveLength(2);
    expect(report.requests.created).toBe(2);
  });
});

describe("plantillas y automatizaciones", () => {
  it("valida variables, exige enlace y bloquea incentivos; Starter limitado a 1 plantilla", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const post = (body: unknown) => tplRoutes.POST(req("/api/v1/templates", { method: "POST", cookie: t.cookie, json: body }), ctx());
    expect((await post({ ...DEFAULT_TEMPLATE, name: "x", body: "Hola {{nombre_cliente}}, sin enlace aquí" })).status).toBe(422);
    expect((await post({ ...DEFAULT_TEMPLATE, name: "x", body: "Hola {{desconocida}} {{enlace_resena}}" })).status).toBe(422);
    const inc = await post({ ...DEFAULT_TEMPLATE, name: "x", body: "Déjanos 5 estrellas y te regalamos un descuento: {{enlace_resena}}" });
    expect(inc.status).toBe(422);
    expect((await inc.json()).error.message).toMatch(/neutrales/);
    const limit = await post({ ...DEFAULT_TEMPLATE, name: "Segunda" });
    expect(limit.status).toBe(403);
  });

  it("Pro permite varias plantillas y reglas por servicio; ventana horaria solo en Business", async () => {
    const t = await makeTenant({ plan: "PRO" });
    const tpl = await (await tplRoutes.POST(req("/api/v1/templates", { method: "POST", cookie: t.cookie, json: { ...DEFAULT_TEMPLATE, name: "Tintes" } }), ctx())).json();
    expect(tpl.template.id).toBeTruthy();
    const rule = { name: "Tintes", templateId: tpl.template.id, delayMinutes: 0, serviceFilter: "tinte", sources: ["MANUAL", "API"], priority: 10 };
    expect((await ruleRoutes.POST(req("/api/v1/automations", { method: "POST", cookie: t.cookie, json: rule }), ctx())).status).toBe(201);
    const withWindow = await ruleRoutes.POST(req("/api/v1/automations", { method: "POST", cookie: t.cookie, json: { ...rule, name: "V", sendWindowStart: 9, sendWindowEnd: 20 } }), ctx());
    expect(withWindow.status).toBe(403);
    // La regla por servicio tiene prioridad y usa su plantilla
    const c = await makeCustomer(t.business.id, 1, { serviceName: "Tinte completo" });
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: "MANUAL", sendNow: true });
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    expect(job.templateId).toBe(tpl.template.id);
  });

  it("campañas: no disponibles en Starter; en Pro respetan el límite del plan", async () => {
    const s = await makeTenant({ plan: "STARTER" });
    const tplS = await prisma.emailTemplate.findFirstOrThrow({ where: { businessId: s.business.id } });
    const cS = await makeCustomer(s.business.id);
    expect((await campaignRoute(req("/api/v1/campaigns", { method: "POST", cookie: s.cookie, json: { name: "c", templateId: tplS.id, customerIds: [cS.id] } }), ctx())).status).toBe(403);

    const p = await makeTenant({ plan: "PRO" });
    const tpl = await prisma.emailTemplate.findFirstOrThrow({ where: { businessId: p.business.id } });
    const cs = await Promise.all(Array.from({ length: 75 }, (_, i) => makeCustomer(p.business.id, i)));
    const r = await campaignRoute(req("/api/v1/campaigns", { method: "POST", cookie: p.cookie, json: { name: "Otoño", templateId: tpl.id, customerIds: cs.map((c) => c.id) } }), ctx());
    const j = await r.json();
    expect(j.summary.created).toBe(70);
    expect(j.summary.rejected).toBe(5);
    expect(j.summary.reasons.LIMIT_REACHED).toBe(5);
  });
});

describe("enlaces públicos del correo", () => {
  it("clic → redirige al perfil de reseñas y lo registra; baja en un clic", async () => {
    const t = await makeTenant();
    const c = await makeCustomer(t.business.id);
    const r = await createReviewRequest(t.business.id, { customerId: c.id, source: "MANUAL", sendNow: true });
    const job = await prisma.emailJob.findUniqueOrThrow({ where: { id: r.jobId! } });
    const click = await clickRoute(req(`/r/${job.publicToken}`), ctx({ token: job.publicToken }));
    expect(click.status).toBe(302);
    expect(click.headers.get("location")).toBe("https://g.page/r/negocio-prueba/review");
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: job.id } })).clickCount).toBe(1);
    const u = await unsubRoute(req(`/api/public/unsubscribe/${job.publicToken}`, { method: "POST", body: "List-Unsubscribe=One-Click" }), ctx({ token: job.publicToken }));
    expect(u.status).toBe(200);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).unsubscribedAt).not.toBeNull();
  });
});
