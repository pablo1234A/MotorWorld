import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import * as customers from "@/app/api/v1/customers/route";
import * as customer from "@/app/api/v1/customers/[id]/route";
import * as requestRoute from "@/app/api/v1/customers/[id]/request/route";
import * as templates from "@/app/api/v1/templates/[id]/route";
import * as emails from "@/app/api/v1/emails/[id]/route";
import * as emailsList from "@/app/api/v1/emails/route";
import * as rules from "@/app/api/v1/automations/[id]/route";
import { POST as cancel } from "@/app/api/v1/emails/[id]/cancel/route";
import { GET as statsRoute } from "@/app/api/v1/stats/route";
import { ctx, makeCustomer, makeTenant, req, resetDb } from "../helpers";
import { createReviewRequest } from "@/server/modules/automation/requests";

beforeEach(resetDb);
afterAll(() => redis().disconnect());

describe("aislamiento entre usuarios (multi-tenant)", () => {
  it("el usuario B no puede ver, modificar ni borrar datos del usuario A", async () => {
    const A = await makeTenant();
    const B = await makeTenant();
    const cA = await makeCustomer(A.business.id, 1, { email: "privado@cliente-a.es" });
    const tplA = await prisma.emailTemplate.findFirstOrThrow({ where: { businessId: A.business.id } });
    const ruleA = await prisma.automationRule.findFirstOrThrow({ where: { businessId: A.business.id } });
    const jobA = await createReviewRequest(A.business.id, { customerId: cA.id, source: "API" });

    const asB = { cookie: B.cookie };
    expect((await customer.GET(req(`/api/v1/customers/${cA.id}`, asB), ctx({ id: cA.id }))).status).toBe(404);
    expect((await customer.PATCH(req(`/api/v1/customers/${cA.id}`, { ...asB, method: "PATCH", json: { name: "hack" } }), ctx({ id: cA.id }))).status).toBe(404);
    expect((await customer.DELETE(req(`/api/v1/customers/${cA.id}`, { ...asB, method: "DELETE" }), ctx({ id: cA.id }))).status).toBe(404);
    expect((await requestRoute.POST(req(`/api/v1/customers/${cA.id}/request`, { ...asB, method: "POST", json: {} }), ctx({ id: cA.id }))).status).toBe(404);
    expect((await templates.GET(req(`/api/v1/templates/${tplA.id}`, asB), ctx({ id: tplA.id }))).status).toBe(404);
    expect((await templates.DELETE(req(`/api/v1/templates/${tplA.id}`, { ...asB, method: "DELETE" }), ctx({ id: tplA.id }))).status).toBe(404);
    expect((await emails.GET(req(`/api/v1/emails/${jobA.jobId}`, asB), ctx({ id: jobA.jobId! }))).status).toBe(404);
    expect((await cancel(req(`/api/v1/emails/${jobA.jobId}/cancel`, { ...asB, method: "POST" }), ctx({ id: jobA.jobId! }))).status).toBe(409);
    expect((await rules.DELETE(req(`/api/v1/automations/${ruleA.id}`, { ...asB, method: "DELETE" }), ctx({ id: ruleA.id }))).status).toBe(404);

    const listB = await (await customers.GET(req("/api/v1/customers", asB), ctx())).json();
    expect(listB.total).toBe(0);
    const emailsB = await (await emailsList.GET(req("/api/v1/emails", asB), ctx())).json();
    expect(emailsB.total).toBe(0);
    const statsB = await (await statsRoute(req("/api/v1/stats", asB), ctx())).json();
    expect(statsB.totals.pending).toBe(0);

    // Los datos de A siguen intactos
    expect(await prisma.customer.findUnique({ where: { id: cA.id } })).not.toBeNull();
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: jobA.jobId! } })).status).toBe("SCHEDULED");
    // A sí puede acceder a lo suyo
    expect((await customer.GET(req(`/api/v1/customers/${cA.id}`, { cookie: A.cookie }), ctx({ id: cA.id }))).status).toBe(200);
  });

  it("sin sesión → 401; con sesión pero desde otro origen (CSRF) → 403", async () => {
    const A = await makeTenant();
    expect((await customers.GET(req("/api/v1/customers"), ctx())).status).toBe(401);
    const res = await customers.POST(
      req("/api/v1/customers", { method: "POST", cookie: A.cookie, json: { name: "X", email: "x@correo.es" }, headers: { origin: "https://atacante.example" } }),
      ctx(),
    );
    expect(res.status).toBe(403);
    expect(await prisma.customer.count()).toBe(0);
  });
});
