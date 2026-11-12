import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, HttpSession, resetRateLimits } from "../support/http";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let admin: TestUser;
let target: TestUser;
const adminHttp = new HttpSession();

beforeAll(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`El servidor no responde en ${BASE_URL}.`);
  await resetRateLimits();
  [admin, target] = await Promise.all([createTestUser("admin"), createTestUser("target")]);
  // Único mecanismo de concesión: escritura con service_role (equivale a scripts/grant-admin.mts).
  await adminClient().from("platform_admins").insert({ user_id: admin.id });
  await adminHttp.signInDirect(admin.email, admin.password);
});

afterAll(async () => {
  await Promise.all([deleteTestUser(admin), deleteTestUser(target)]);
  await resetRateLimits();
});

describe("panel de administración", () => {
  it("un administrador accede a todas las secciones", async () => {
    for (const path of ["/admin", "/admin/usuarios", "/admin/espacios", "/admin/catalogo", "/admin/catalogo?tipo=anuncios", "/admin/trabajos", "/admin/consumo", "/admin/planes", "/admin/suscripciones", "/admin/auditoria", "/admin/mensajes"]) {
      const response = await adminHttp.request(path);
      expect(response.status, path).toBe(200);
    }
    const html = await (await adminHttp.request(`/admin/usuarios?q=${encodeURIComponent(target.email)}`)).text();
    expect(html).toContain(target.email);
  });

  it("no puede desactivarse a sí mismo", async () => {
    const response = await adminHttp.json(`/api/admin/users/${admin.id}`, { method: "PATCH", body: { action: "disable", reason: "Prueba de autodesactivación" } });
    expect(response.status).toBe(409);
  });

  it("desactivar exige una causa y bloquea el acceso del usuario", async () => {
    const targetHttp = new HttpSession();
    await targetHttp.signInDirect(target.email, target.password);
    expect((await targetHttp.request("/app")).status).toBe(200);

    const noReason = await adminHttp.json(`/api/admin/users/${target.id}`, { method: "PATCH", body: { action: "disable", reason: "corta" } });
    expect(noReason.status).toBe(422);
    const disabled = await adminHttp.json(`/api/admin/users/${target.id}`, { method: "PATCH", body: { action: "disable", reason: "Uso abusivo comprobado del servicio" } });
    expect(disabled.status).toBe(200);

    // La sesión existente deja de servir y no puede volver a entrar.
    expect((await targetHttp.json("/api/products")).status).toBe(401);
    const login = await new HttpSession().json("/api/auth/login", { body: { email: target.email, password: target.password } });
    expect(login.status).toBe(403);

    const { data: audit } = await adminClient().from("audit_logs").select("action, actor_id, metadata").eq("resource_id", target.id).eq("action", "admin.user_disabled").single();
    expect(audit).toMatchObject({ actor_id: admin.id, metadata: { reason: "Uso abusivo comprobado del servicio" } });

    expect((await adminHttp.json(`/api/admin/users/${target.id}`, { method: "PATCH", body: { action: "enable" } })).status).toBe(200);
    const again = await new HttpSession().json("/api/auth/login", { body: { email: target.email, password: target.password } });
    expect(again.status).toBe(200);
  });

  it("asigna un plan manualmente y el nuevo límite se aplica al instante", async () => {
    const response = await adminHttp.json(`/api/admin/workspaces/${target.workspaceId}/plan`, { method: "PATCH", body: { planCode: "starter", reason: "Cuenta de pruebas" } });
    expect(response.status).toBe(200);
    const { data } = await target.client.rpc("get_usage_summary", { p_workspace: target.workspaceId });
    expect(data).toMatchObject({ plan_code: "starter", monthly_listing_limit: 100 });
  });

  it("edita los límites de un plan desde la base de datos", async () => {
    const { data: plan } = await adminClient().from("plans").select("*").eq("code", "starter").single();
    const body = { name: "Starter", price: 5.99, monthlyListingLimit: 120, monthlyBulkLimit: 0, maxProducts: 500, maxTemplates: 10, maxBulkRows: 0, maxImagesPerProduct: 6, isActive: true };
    expect((await adminHttp.json(`/api/admin/plans/${plan!.id}`, { method: "PATCH", body })).status).toBe(200);
    const { data } = await target.client.rpc("get_usage_summary", { p_workspace: target.workspaceId });
    expect(data).toMatchObject({ monthly_listing_limit: 120 });
    // Restaurar el valor original.
    await adminHttp.json(`/api/admin/plans/${plan!.id}`, { method: "PATCH", body: { ...body, monthlyListingLimit: plan!.monthly_listing_limit } });
    const freePlan = await adminClient().from("plans").select("id").eq("code", "free").single();
    const deactivateFree = await adminHttp.json(`/api/admin/plans/${freePlan.data!.id}`, { method: "PATCH", body: { ...body, name: "Free", price: 0, monthlyListingLimit: 10, isActive: false } });
    expect(deactivateFree.status).toBe(409);
  });

  it("un administrador revocado pierde el acceso inmediatamente", async () => {
    await adminClient().from("platform_admins").delete().eq("user_id", admin.id);
    expect((await adminHttp.request("/admin")).status).toBe(404);
    await adminClient().from("platform_admins").insert({ user_id: admin.id });
  });
});
