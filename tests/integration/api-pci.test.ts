import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as actionTypesRoute from "@/app/api/v1/action-types/route";
import * as actionsRoute from "@/app/api/v1/actions/route";
import * as customersRoute from "@/app/api/v1/customers/route";
import * as equipmentRoute from "@/app/api/v1/equipment/route";
import * as equipmentOneRoute from "@/app/api/v1/equipment/[id]/route";
import * as incidentsRoute from "@/app/api/v1/incidents/route";
import * as incidentRoute from "@/app/api/v1/incidents/[id]/route";
import * as installationsRoute from "@/app/api/v1/installations/route";
import * as installationRoute from "@/app/api/v1/installations/[id]/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import * as vehiclesRoute from "@/app/api/v1/vehicles/route";
import * as workOrdersRoute from "@/app/api/v1/work-orders/route";
import * as workOrderRoute from "@/app/api/v1/work-orders/[id]/route";
import * as workOrderStatusRoute from "@/app/api/v1/work-orders/[id]/status/route";
import type { SubscriptionState } from "@/server/auth/context";
import { type ApiScope, API_SCOPES, createApiKey } from "@/server/api/keys";
import { closePool } from "@/server/db/client";

import { createOrg, ownerMemberId, query, type TestOrg } from "./support/db";

/** PCI · API v1: instalaciones, equipos, actuaciones, órdenes e incidencias por las rutas reales. */

process.env.API_KEY_PEPPER = "pepper-de-pruebas-0123456789abcdef0123456789";
const BASE = "http://localhost:3000/api/v1";
const sub: SubscriptionState = {
  planCode: "excelencia",
  status: "active",
  active: true,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};
async function newKey(o: TestOrg, scopes: readonly ApiScope[] = API_SCOPES) {
  const ctx = {
    auth: { userId: o.ownerId },
    membership: {
      organizationId: o.orgId,
      memberId: await ownerMemberId(o),
      role: "admin" as const,
      permissions: [],
      organizationName: "",
      organizationSlug: "",
      logoPath: null,
      isOwner: true,
      branchScope: "all" as const,
    },
    subscription: sub,
  };
  return (
    await createApiKey(ctx as never, {
      name: `Prueba ${randomUUID().slice(0, 4)}`,
      scopes: [...scopes],
      branchIds: null,
      expiresAt: null,
    })
  ).key;
}

type Handler = (
  req: Request,
  seg?: { params: Promise<Record<string, string>> },
) => Promise<Response>;
async function call(
  h: Handler,
  key: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
) {
  const res = await h(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${key}`,
        ...(init.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
    init.params ? { params: Promise.resolve(init.params) } : undefined,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- respuestas JSON de la API en las pruebas
  return {
    status: res.status,
    headers: res.headers,
    body: (await res.json()) as Record<string, any>,
  };
}

let org: TestOrg;
let other: TestOrg;
let key: string;
let otherKey: string;
let customerId: string;
let installationId: string;
let equipmentId: string;

beforeAll(async () => {
  org = await createOrg("excelencia");
  other = await createOrg("excelencia");
  key = await newKey(org);
  otherKey = await newKey(other);
});
beforeEach(async () => {
  await query("delete from private.rate_limit_buckets where key like 'api:%'");
});
afterAll(closePool);

describe("API v1 · PCI", () => {
  it("cliente empresa → instalación → extintor con su ficha", async () => {
    const c = await call(customersRoute.POST, key, "/customers", {
      method: "POST",
      body: {
        first_name: "Comunidad Las Encinas",
        customer_kind: "company",
        legal_name: "CP Las Encinas 12",
        contact_name: "Marta Gil",
        email: "encinas@cliente.test",
      },
    });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({
      customer_kind: "company",
      legal_name: "CP Las Encinas 12",
      contact_name: "Marta Gil",
    });
    customerId = c.body.id;

    const i = await call(installationsRoute.POST, key, "/installations", {
      method: "POST",
      body: {
        customer_id: customerId,
        name: "Garaje comunitario",
        establishment_type: "parking",
        address_line1: "Calle Encina 12",
        postal_code: "28001",
        city: "Madrid",
      },
    });
    expect(i.status).toBe(201);
    expect(i.body).toMatchObject({
      object: "installation",
      name: "Garaje comunitario",
      establishment_type: "parking",
      status: "active",
    });
    installationId = i.body.id;

    const bad = await call(equipmentRoute.POST, key, "/equipment", {
      method: "POST",
      body: { installation_id: installationId, category: "extinguisher" },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toHaveProperty("agent");

    const e = await call(equipmentRoute.POST, key, "/equipment", {
      method: "POST",
      body: {
        installation_id: installationId,
        category: "extinguisher",
        location: "Planta -1",
        extinguisher: {
          agent: "powder_abc",
          charge_value: 6,
          charge_unit: "kg",
          put_in_service_on: "2025-01-10",
        },
      },
    });
    expect(e.status).toBe(201);
    expect(e.body).toMatchObject({
      object: "equipment",
      category: "extinguisher",
      code: "EXT-000001",
      extinguisher: { agent: "powder_abc", charge_value: 6, charge_unit: "kg" },
    });
    expect(e.body.next_action_on).toBe("2026-01-10");
    equipmentId = e.body.id;

    const patched = await call(
      equipmentOneRoute.PATCH,
      key,
      `/equipment/${equipmentId}`,
      {
        method: "PATCH",
        body: { location: "Planta -1, junto al ascensor" },
        params: { id: equipmentId },
      },
    );
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({
      location: "Planta -1, junto al ascensor",
      extinguisher: { agent: "powder_abc", charge_value: 6 },
    });

    const list = await call(
      equipmentRoute.GET,
      key,
      `/equipment?installation_id=${installationId}&category=extinguisher`,
    );
    expect(list.body.data.map((x: { id: string }) => x.id)).toEqual([
      equipmentId,
    ]);
  });

  it("orden de trabajo con sus equipos, ejecución y cierre", async () => {
    const types = await call(actionTypesRoute.GET, key, "/action-types");
    const annual = types.body.data.find(
      (a: { code: string }) => a.code === "ext_annual",
    );
    expect(annual).toMatchObject({
      category: "extinguisher",
      interval_months: 12,
      enabled: true,
    });

    const [{ id: tech }] = await query<{ id: string }>(
      "insert into technicians (organization_id, full_name) values ($1, 'Pablo Ruiz') returning id",
      [org.orgId],
    );
    const w = await call(workOrdersRoute.POST, key, "/work-orders", {
      method: "POST",
      body: {
        installation_id: installationId,
        service_type: "periodic_maintenance",
        scheduled_for: "2030-01-15",
        scheduled_time: "09:30",
        technician_id: tech,
        items: [{ equipment_id: equipmentId, action_type_id: annual.id }],
      },
    });
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({
      object: "work_order",
      status: "assigned",
      items: [{ equipment_id: equipmentId, status: "pending" }],
    });
    expect(w.body.number).toMatch(/^OT-\d{4}-\d{4}$/);

    // No se puede completar con equipos pendientes.
    await call(
      workOrderStatusRoute.POST,
      key,
      `/work-orders/${w.body.id}/status`,
      {
        method: "POST",
        body: { status: "in_progress" },
        params: { id: w.body.id },
      },
    );
    const early = await call(
      workOrderStatusRoute.POST,
      key,
      `/work-orders/${w.body.id}/status`,
      {
        method: "POST",
        body: { status: "completed" },
        params: { id: w.body.id },
      },
    );
    expect(early.status).toBe(400);

    // Actuación (con la API de actuaciones) y luego el cierre del equipo desde el panel no aplica: se completa una orden sin pendientes.
    const a = await call(actionsRoute.POST, key, "/actions", {
      method: "POST",
      body: {
        equipment_id: equipmentId,
        action_type_id: annual.id,
        performed_on: new Date().toISOString().slice(0, 10),
        result: "compliant",
        materials: [{ description: "Precinto", quantity: 1 }],
      },
    });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      object: "action",
      result: "compliant",
      action_type: { code: "ext_annual" },
    });
    const acts = await call(
      actionsRoute.GET,
      key,
      `/actions?equipment_id=${equipmentId}`,
    );
    expect(acts.body.data).toHaveLength(1);

    const got = await call(
      workOrderRoute.GET,
      key,
      `/work-orders/${w.body.id}`,
      { params: { id: w.body.id } },
    );
    expect(got.body.status).toBe("in_progress");
  });

  it("incidencias: alta, resolución y validación", async () => {
    const x = await call(incidentsRoute.POST, key, "/incidents", {
      method: "POST",
      body: {
        installation_id: installationId,
        equipment_id: equipmentId,
        severity: "high",
        title: "Manguera agrietada",
      },
    });
    expect(x.status).toBe(201);
    expect(x.body).toMatchObject({
      object: "incident",
      status: "open",
      severity: "high",
    });
    const noReason = await call(
      incidentRoute.PATCH,
      key,
      `/incidents/${x.body.id}`,
      {
        method: "PATCH",
        body: { status: "resolved" },
        params: { id: x.body.id },
      },
    );
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.fields).toHaveProperty("resolution");
    const ok = await call(incidentRoute.PATCH, key, `/incidents/${x.body.id}`, {
      method: "PATCH",
      body: { status: "resolved", resolution: "Manguera sustituida" },
      params: { id: x.body.id },
    });
    expect(ok.body).toMatchObject({
      status: "resolved",
      resolution: "Manguera sustituida",
    });
  });

  it("aislamiento: otra empresa no ve ni toca nada (404), y faltan permisos → 403", async () => {
    expect(
      (
        await call(
          installationRoute.GET,
          otherKey,
          `/installations/${installationId}`,
          { params: { id: installationId } },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          equipmentOneRoute.PATCH,
          otherKey,
          `/equipment/${equipmentId}`,
          {
            method: "PATCH",
            body: { location: "x" },
            params: { id: equipmentId },
          },
        )
      ).status,
    ).toBe(404);
    const foreign = await call(workOrdersRoute.POST, otherKey, "/work-orders", {
      method: "POST",
      body: { installation_id: installationId, service_type: "inspection" },
    });
    expect(foreign.status).toBe(404);
    expect(
      (await call(equipmentRoute.GET, otherKey, "/equipment")).body.data,
    ).toHaveLength(0);
    const readOnly = await newKey(org, ["equipment:read"]);
    expect(
      (await call(installationsRoute.GET, readOnly, "/installations")).status,
    ).toBe(403);
    expect(
      (
        await call(equipmentRoute.POST, readOnly, "/equipment", {
          method: "POST",
          body: { installation_id: installationId, category: "bie" },
        })
      ).status,
    ).toBe(403);
  });

  it("las rutas de vehículos siguen funcionando pero se anuncian como obsoletas", async () => {
    const r = await call(vehiclesRoute.GET, key, "/vehicles");
    expect(r.status).toBe(200);
    expect(r.headers.get("deprecation")).toBe("@1794700800");
    expect(r.headers.get("link")).toBe(
      '</api/v1/equipment>; rel="successor-version"',
    );
    expect(
      (await call(equipmentRoute.GET, key, "/equipment")).headers.get(
        "deprecation",
      ),
    ).toBeNull();
  });

  it("OpenAPI describe las rutas PCI implementadas", async () => {
    const res = await openapiRoute.GET(new Request(`${BASE}/openapi.json`));
    const doc = (await res.json()) as {
      paths: Record<string, Record<string, { deprecated?: boolean }>>;
    };
    const routes: Record<string, Record<string, unknown>> = {
      "/installations": installationsRoute,
      "/installations/{id}": installationRoute,
      "/equipment": equipmentRoute,
      "/equipment/{id}": equipmentOneRoute,
      "/action-types": actionTypesRoute,
      "/actions": actionsRoute,
      "/work-orders": workOrdersRoute,
      "/work-orders/{id}": workOrderRoute,
      "/work-orders/{id}/status": workOrderStatusRoute,
      "/incidents": incidentsRoute,
      "/incidents/{id}": incidentRoute,
    };
    for (const [path, mod] of Object.entries(routes)) {
      const methods = Object.keys(mod)
        .filter((m) => ["GET", "POST", "PATCH"].includes(m))
        .map((m) => m.toLowerCase())
        .sort();
      expect(Object.keys(doc.paths[path] ?? {}).sort()).toEqual(methods);
    }
    expect(doc.paths["/vehicles"].get.deprecated).toBe(true);
  });
});
