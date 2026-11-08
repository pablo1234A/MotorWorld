import { expect, test } from "@playwright/test";

import { grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/** Fase 9 en el navegador: informes, integraciones y API con una clave real. */

test.describe("fase 9", () => {
  test("Excelencia: crear una clave de API, usarla, revocarla; informes e integraciones", async ({ page, baseURL }) => {
    const owner = uniqueEmail("api");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller API");
    await grantPlan(owner, "excelencia");

    // Contadores básicos en el inicio (todos los planes).
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Vencimientos y trabajo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Parque mantenido" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver los informes" })).toBeVisible();

    await page.goto("/app/informes");
    await expect(page.getByRole("heading", { name: "Informes", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mantenimiento de equipos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vencimientos", exact: true })).toBeVisible();
    for (const kind of ["vencimientos", "mantenimientos", "instalaciones", "incidencias", "revisiones-pendientes"]) {
      const csv = await page.request.get(`/api/app/reports/${kind}`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()["content-type"]).toContain("text/csv");
    }

    await page.goto("/app/configuracion/integraciones");
    await expect(page.getByRole("heading", { name: "Google Calendar" })).toBeVisible();

    await page.goto("/app/configuracion/api");
    await page.getByLabel("Nombre").fill("Programa de gestión");
    await page.getByLabel(/Crear y editar clientes/).check();
    await page.getByRole("button", { name: "Crear clave" }).click();
    const key = (await page.getByTestId("api-key").textContent())!.trim();
    expect(key).toMatch(/^ry_test_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);

    const api = (path: string, init: { method?: string; data?: unknown } = {}) =>
      page.request.fetch(`${baseURL}/api/v1${path}`, { method: init.method ?? "GET", data: init.data, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" } });
    const created = await api("/customers", { method: "POST", data: { first_name: "Cliente", last_name: "Desde la API" } });
    expect(created.status()).toBe(201);
    expect(await created.json()).toMatchObject({ first_name: "Cliente", source: "api" });

    // Aparece en el panel.
    await page.goto("/app/clientes");
    await expect(page.getByRole("link", { name: /Cliente Desde la API/ }).first()).toBeVisible();

    await page.goto("/app/configuracion/api");
    await expect(page.getByText("Programa de gestión", { exact: true })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Revocar Programa de gestión" }).click();
    await expect(page.getByText("Clave revocada: deja de funcionar al momento.")).toBeVisible();
    expect((await api("/customers")).status()).toBe(401);

    const spec = await page.request.get("/api/v1/openapi.json");
    expect((await spec.json()).openapi).toBe("3.1.0");
  });

  test("Pro: informes e integraciones muestran el plan necesario", async ({ page }) => {
    const owner = uniqueEmail("pro9");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Pro 9");
    await grantPlan(owner, "pro");
    await page.goto("/app/informes");
    await expect(page.getByText("Incluidos a partir del plan Max")).toBeVisible();
    expect((await page.request.get("/api/app/reports/correos")).status()).toBe(403);
    await page.goto("/app/configuracion/integraciones");
    await expect(page.getByText("Incluido en los planes Max y Excelencia")).toBeVisible();
    await page.goto("/app/configuracion/api");
    await expect(page.getByText("Incluida en el plan Excelencia")).toBeVisible();
  });
});
