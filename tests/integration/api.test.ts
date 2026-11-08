import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as appointmentsRoute from "@/app/api/v1/appointments/route";
import * as appointmentRoute from "@/app/api/v1/appointments/[id]/route";
import * as customersRoute from "@/app/api/v1/customers/route";
import * as customerRoute from "@/app/api/v1/customers/[id]/route";
import * as maintenanceRoute from "@/app/api/v1/maintenance/route";
import * as openapiRoute from "@/app/api/v1/openapi.json/route";
import * as remindersRoute from "@/app/api/v1/reminders/route";
import * as vehiclesRoute from "@/app/api/v1/vehicles/route";
import * as vehicleRoute from "@/app/api/v1/vehicles/[id]/route";
import * as mileageRoute from "@/app/api/v1/vehicles/[id]/mileage/route";
import type { PlanCode } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { type ApiScope, API_SCOPES, createApiKey, hashKey, listApiKeys, revokeApiKey } from "@/server/api/keys";
import { closePool } from "@/server/db/client";

import { addMember, createOrg, createUser, ownerMemberId, query, type TestOrg } from "./support/db";

/** Fase 9c: API pública v1 por las rutas reales, contra la BD real. */

process.env.API_KEY_PEPPER = "pepper-de-pruebas-0123456789abcdef0123456789";
const BASE = "http://localhost:3000/api/v1";
type Ctx = Parameters<typeof createApiKey>[0];
const sub = (planCode: PlanCode): SubscriptionState => ({ planCode, status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
async function admin(o: TestOrg, plan: PlanCode = "excelencia"): Promise<Ctx> {
  return {
    auth: { userId: o.ownerId },
    membership: { organizationId: o.orgId, memberId: await ownerMemberId(o), role: "admin", permissions: [], organizationName: "", organizationSlug: "", logoPath: null, isOwner: true, branchScope: "all" },
    subscription: sub(plan),
  };
}
async function newKey(o: TestOrg, scopes: readonly ApiScope[] = API_SCOPES, branchIds: string[] | null = null) {
  return (await createApiKey(await admin(o), { name: `Prueba ${randomUUID().slice(0, 4)}`, scopes: [...scopes], branchIds, expiresAt: null })).key;
}

type Handler = (req: Request, seg?: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(h: Handler, key: string | null, path: string, init: { method?: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const res = await h(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    }),
    init.params ? { params: Promise.resolve(init.params) } : undefined,
  );
  return { status: res.status, headers: res.headers, // eslint-disable-next-line @typescript-eslint/no-explicit-any -- respuestas JSON de la API en las pruebas
    body: (await res.json()) as Record<string, any> };
}

let org: TestOrg;
let other: TestOrg;
let key: string;

beforeAll(async () => {
  org = await createOrg("excelencia");
  other = await createOrg("excelencia");
  key = await newKey(org);
});
beforeEach(async () => {
  await query("delete from private.rate_limit_buckets where key like 'api:%'");
});
afterAll(closePool);

describe("claves de la API", () => {
  it("se guarda solo el HMAC; la clave se ve una vez y el prefijo identifica el entorno", async () => {
    expect(key).toMatch(/^ry_test_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);
    const [row] = await query<{ key_hash: Buffer; prefix: string }>("select key_hash, prefix from api_keys where prefix = $1", [key.slice(0, 16)]);
    expect(row.key_hash.equals(hashKey(key))).toBe(true);
    expect(JSON.stringify(row)).not.toContain(key.slice(17));
    const keys = await listApiKeys(await admin(org));
    expect(keys.some((k) => k.prefix === row.prefix)).toBe(true);
    expect(JSON.stringify(keys)).not.toContain(key.slice(17));
  });

  it("solo el plan Excelencia y solo administradores", async () => {
    const max = await createOrg("max");
    await expect(createApiKey(await admin(max, "max"), { name: "x", scopes: ["customers:read"], branchIds: null, expiresAt: null })).rejects.toMatchObject({ code: "feature_unavailable" });
    const user = await createUser();
    const memberId = await addMember(org, user, "operator", ["customers.write"]);
    const op = { ...(await admin(org)), auth: { userId: user }, membership: { ...(await admin(org)).membership, memberId, role: "operator" as const } };
    await expect(createApiKey(op, { name: "x", scopes: ["customers:read"], branchIds: null, expiresAt: null })).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("sin clave, con una clave falsa, revocada o caducada → 401", async () => {
    expect((await call(customersRoute.GET, null, "/customers")).status).toBe(401);
    expect((await call(customersRoute.GET, "ry_test_abcdefgh_" + "x".repeat(32), "/customers")).status).toBe(401);
    expect((await call(customersRoute.GET, `${key.slice(0, -1)}${key.endsWith("a") ? "b" : "a"}`, "/customers")).status).toBe(401);
    const k2 = await newKey(org, ["customers:read"]);
    expect((await call(customersRoute.GET, k2, "/customers")).status).toBe(200);
    const [{ id }] = await query<{ id: string }>("select id from api_keys where prefix = $1", [k2.slice(0, 16)]);
    await revokeApiKey(await admin(org), id);
    const res = await call(customersRoute.GET, k2, "/customers");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: "unauthenticated" });
    expect(res.body.error.request_id).toMatch(/^req_/);
    const k3 = await newKey(org, ["customers:read"]);
    await query("update api_keys set expires_at = now() - interval '1 minute' where prefix = $1", [k3.slice(0, 16)]);
    expect((await call(customersRoute.GET, k3, "/customers")).status).toBe(401);
  });

  it("si quien creó la clave deja de ser administrador, la clave deja de funcionar; si el plan baja, 403", async () => {
    const o = await createOrg("excelencia");
    const k = await newKey(o, ["customers:read"]);
    expect((await call(customersRoute.GET, k, "/customers")).status).toBe(200);
    await query("update subscriptions set plan_code = 'business' where organization_id = $1", [o.orgId]);
    expect((await call(customersRoute.GET, k, "/customers")).body.error.code).toBe("plan_feature_unavailable");
    await query("update subscriptions set plan_code = 'excelencia' where organization_id = $1", [o.orgId]);
    const second = await createUser();
    await addMember(o, second, "admin");
    await query("update organization_members set is_owner = false, role = 'operator' where organization_id = $1 and user_id = $2", [o.orgId, o.ownerId]).catch(async () => {
      await query("update organization_members set status = 'disabled' where organization_id = $1 and user_id = $2", [o.orgId, o.ownerId]);
    });
    expect((await call(customersRoute.GET, k, "/customers")).status).toBe(401);
  });

  it("permisos de la clave (scopes): sin customers:write no se crea nada", async () => {
    const ro = await newKey(org, ["customers:read"]);
    const res = await call(customersRoute.POST, ro, "/customers", { method: "POST", body: { first_name: "No" } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });
});

describe("recursos", () => {
  it("clientes: crear, ver, cambiar, listar con cursor; validación con campos", async () => {
    const created = await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "Ana", last_name: "Ruiz", email: "ANA@Cliente.test", phone: "600 111 222" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ object: "customer", first_name: "Ana", email: "ana@cliente.test", phone: "+34600111222", source: "api" });
    const id = created.body.id as string;

    expect((await call(customerRoute.GET, key, `/customers/${id}`, { params: { id } })).body.first_name).toBe("Ana");
    const patched = await call(customerRoute.PATCH, key, `/customers/${id}`, { method: "PATCH", body: { last_name: "Ruiz Gil" }, params: { id } });
    expect(patched.body).toMatchObject({ last_name: "Ruiz Gil", email: "ana@cliente.test" });

    const bad = await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "", email: "no-es-correo" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("validation_error");
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(["first_name", "email"]));
    expect((await call(customerRoute.PATCH, key, `/customers/${id}`, { method: "PATCH", body: { organization_id: other.orgId }, params: { id } })).status).toBe(400);

    for (let i = 0; i < 3; i++) await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: `Lote ${i}` } });
    const p1 = await call(customersRoute.GET, key, "/customers?limit=2");
    expect(p1.body.data).toHaveLength(2);
    const p2 = await call(customersRoute.GET, key, `/customers?limit=2&cursor=${p1.body.next_cursor}`);
    expect(p2.body.data).toHaveLength(2);
    expect(p2.body.data.map((c: { id: string }) => c.id)).not.toContain(p1.body.data[0].id);
    expect((await call(customersRoute.GET, key, "/customers?limit=500")).status).toBe(400);
    expect((await call(customersRoute.GET, key, "/customers?cursor=basura")).status).toBe(400);
  });

  it("vehículos, kilómetros, historial y avisos", async () => {
    const c = await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "Luis" } });
    const plate = `${String(Math.floor(1000 + Math.random() * 8999))} KRT`;
    const v = await call(vehiclesRoute.POST, key, "/vehicles", { method: "POST", body: { customer_id: c.body.id, plate, make: "Seat", model: "León", current_km: 50000 } });
    expect(v.status).toBe(201);
    expect(v.body).toMatchObject({ object: "vehicle", plate: plate.replace(" ", " "), current_km: 50000, status: "active" });
    const vid = v.body.id as string;
    expect((await call(vehiclesRoute.GET, key, `/vehicles?plate=${encodeURIComponent(plate.replace(" ", "").toLowerCase())}`)).body.data.map((x: { id: string }) => x.id)).toEqual([vid]);

    const lower = await call(mileageRoute.POST, key, `/vehicles/${vid}/mileage`, { method: "POST", body: { km: 40000 }, params: { id: vid } });
    expect(lower.status).toBe(400);
    expect((await call(mileageRoute.POST, key, `/vehicles/${vid}/mileage`, { method: "POST", body: { km: 52000 }, params: { id: vid } })).body.current_km).toBe(52000);

    const rec = await call(maintenanceRoute.POST, key, "/maintenance", {
      method: "POST",
      body: { vehicle_id: vid, service_date: new Date().toISOString().slice(0, 10), km: 52000, work_performed: "Aceite y filtros", next_recommended_km: 67000, parts: [{ description: "Filtro de aceite", quantity: 1 }] },
    });
    expect(rec.status).toBe(201);
    expect(rec.body).toMatchObject({ object: "maintenance_record", km: 52000, parts: [{ description: "Filtro de aceite", quantity: 1 }] });
    const hist = await call(maintenanceRoute.GET, key, `/maintenance?vehicle_id=${vid}`);
    expect(hist.body.data).toHaveLength(1);
    expect((await call(vehicleRoute.GET, key, `/vehicles/${vid}`, { params: { id: vid } })).body.last_service_date).toBe(new Date().toISOString().slice(0, 10));
    expect((await call(vehicleRoute.PATCH, key, `/vehicles/${vid}`, { method: "PATCH", body: { status: "sold" }, params: { id: vid } })).body.status).toBe("sold");
    expect((await call(remindersRoute.GET, key, `/reminders?vehicle_id=${vid}`)).status).toBe(200);
  });

  it("citas: crear confirmada, cancelar; acción no válida → 400", async () => {
    const c = await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "Marta", email: `m-${randomUUID().slice(0, 6)}@cliente.test` } });
    const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const a = await call(appointmentsRoute.POST, key, "/appointments", { method: "POST", body: { customer_id: c.body.id, date: day, time: "10:30", duration_minutes: 60 } });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ object: "appointment", status: "confirmed", source: "api" });
    const id = a.body.id as string;
    expect((await call(appointmentRoute.PATCH, key, `/appointments/${id}`, { method: "PATCH", body: { action: "volar" }, params: { id } })).status).toBe(400);
    expect((await call(appointmentRoute.PATCH, key, `/appointments/${id}`, { method: "PATCH", body: { action: "cancel" }, params: { id } })).body.status).toBe("canceled");
    expect((await call(appointmentsRoute.GET, key, "/appointments?status=canceled")).body.data.some((x: { id: string }) => x.id === id)).toBe(true);
  });

  it("Idempotency-Key: repetir no duplica; otra petición con la misma clave → 409", async () => {
    const idem = randomUUID();
    const body = { first_name: "Idem", email: `idem-${idem.slice(0, 6)}@cliente.test` };
    const a = await call(customersRoute.POST, key, "/customers", { method: "POST", body, headers: { "idempotency-key": idem } });
    const b = await call(customersRoute.POST, key, "/customers", { method: "POST", body, headers: { "idempotency-key": idem } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(await query("select 1 from customers where email = $1", [body.email])).toHaveLength(1);
    const c = await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "Otro" }, headers: { "idempotency-key": idem } });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("idempotency_conflict");
  });
});

describe("aislamiento entre talleres (IDOR)", () => {
  it("un recurso de otro taller responde 404 en lectura y escritura, y no aparece en listados", async () => {
    const [{ id: foreignCustomer }] = await query<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name, email) values ($1, $2, 'Ajeno', 'ajeno@otro.test') returning id",
      [other.orgId, other.branchId],
    );
    const [{ id: foreignVehicle }] = await query<{ id: string }>(
      "insert into vehicles (organization_id, branch_id, customer_id, plate) values ($1, $2, $3, $4) returning id",
      [other.orgId, other.branchId, foreignCustomer, `${String(Math.floor(1000 + Math.random() * 8999))} ZZB`],
    );
    expect((await call(customerRoute.GET, key, `/customers/${foreignCustomer}`, { params: { id: foreignCustomer } })).status).toBe(404);
    expect((await call(customerRoute.PATCH, key, `/customers/${foreignCustomer}`, { method: "PATCH", body: { first_name: "Hackeado" }, params: { id: foreignCustomer } })).status).toBe(404);
    expect((await call(vehiclesRoute.POST, key, "/vehicles", { method: "POST", body: { customer_id: foreignCustomer, plate: "1234 BBB" } })).status).toBe(404);
    expect((await call(maintenanceRoute.POST, key, "/maintenance", { method: "POST", body: { vehicle_id: foreignVehicle, service_date: "2026-01-10", work_performed: "x" } })).status).toBe(404);
    expect((await call(mileageRoute.POST, key, `/vehicles/${foreignVehicle}/mileage`, { method: "POST", body: { km: 1 }, params: { id: foreignVehicle } })).status).toBe(404);
    expect((await call(appointmentsRoute.POST, key, "/appointments", { method: "POST", body: { customer_id: foreignCustomer, date: "2026-12-01", time: "10:00", duration_minutes: 30 } })).status).toBe(404);
    expect((await call(customersRoute.POST, key, "/customers", { method: "POST", body: { first_name: "X", branch_id: other.branchId } })).status).toBeGreaterThanOrEqual(400);
    const list = await call(customersRoute.GET, key, "/customers?email=ajeno@otro.test");
    expect(list.body.data).toHaveLength(0);
    const [{ first_name }] = await query<{ first_name: string }>("select first_name from customers where id = $1", [foreignCustomer]);
    expect(first_name).toBe("Ajeno");
  });

  it("una clave limitada a una sucursal no ve las demás", async () => {
    const [{ id: branch2 }] = await query<{ id: string }>("insert into branches (organization_id, name, slug) values ($1, 'Segundo', $2) returning id", [org.orgId, `b${randomUUID().slice(0, 6)}`]);
    const limited = await newKey(org, ["customers:read", "customers:write"], [branch2]);
    const own = await call(customersRoute.POST, limited, "/customers", { method: "POST", body: { first_name: "Sucursal2" } });
    expect(own.body.branch_id).toBe(branch2);
    const all = await call(customersRoute.GET, limited, "/customers?limit=100");
    expect(all.body.data.every((c: { branch_id: string }) => c.branch_id === branch2)).toBe(true);
    const [{ id: mainCustomer }] = await query<{ id: string }>("select id from customers where organization_id = $1 and branch_id = $2 limit 1", [org.orgId, org.branchId]);
    expect((await call(customerRoute.GET, limited, `/customers/${mainCustomer}`, { params: { id: mainCustomer } })).status).toBe(404);
  });
});

describe("límites, registro y especificación", () => {
  it("límite de peticiones por clave → 429 con Retry-After", async () => {
    const k = await newKey(org, ["reminders:read"]);
    const [{ id }] = await query<{ id: string }>("select id from api_keys where prefix = $1", [k.slice(0, 16)]);
    await query(
      "insert into private.rate_limit_buckets (key, tokens, updated_at) values ($1, 0, now()) on conflict (key) do update set tokens = 0, updated_at = now()",
      [`api:key:${id}`],
    );
    const res = await call(remindersRoute.GET, k, "/reminders");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("cada petición queda registrada sin cuerpos ni datos personales", async () => {
    await call(customersRoute.GET, key, "/customers?email=secreto@cliente.test");
    await new Promise((r) => setTimeout(r, 200));
    const rows = await query<{ route: string; status: number }>("select route, status from api_request_logs where organization_id = $1 order by id desc limit 5", [org.orgId]);
    expect(rows[0]).toMatchObject({ route: "GET /v1/customers", status: 200 });
    expect(JSON.stringify(rows)).not.toContain("secreto");
  });

  it("OpenAPI describe todas las rutas implementadas", async () => {
    const res = await openapiRoute.GET(new Request(`${BASE}/openapi.json`));
    const doc = (await res.json()) as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(doc.openapi).toBe("3.1.0");
    const routes: Record<string, Record<string, unknown>> = {
      "/customers": customersRoute, "/customers/{id}": customerRoute, "/vehicles": vehiclesRoute, "/vehicles/{id}": vehicleRoute,
      "/vehicles/{id}/mileage": mileageRoute, "/maintenance": maintenanceRoute, "/appointments": appointmentsRoute, "/appointments/{id}": appointmentRoute, "/reminders": remindersRoute,
    };
    for (const [path, mod] of Object.entries(routes)) {
      const methods = Object.keys(mod).filter((m) => ["GET", "POST", "PATCH"].includes(m)).map((m) => m.toLowerCase()).sort();
      expect(Object.keys(doc.paths[path] ?? {}).sort()).toEqual(methods);
    }
  });
});
