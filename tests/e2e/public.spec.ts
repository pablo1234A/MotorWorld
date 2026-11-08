import { expect, test } from "@playwright/test";

import { db, uniqueEmail, waitForEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/** Fase 10: web pública, textos legales, consentimiento, bienvenida, errores y móvil. */

test.describe("web pública y textos legales", () => {
  test("portada con los precios exactos del PDF (sin IVA) y preguntas frecuentes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("extintor");
    await expect(page.getByText("Para empresas mantenedoras de protección contra incendios")).toBeVisible();
    const pricing = page.locator("#precios");
    for (const [plan, month, year] of [
      ["Pro", "39 €", "390 €"],
      ["Max", "79 €", "790 €"],
      ["Business", "149 €", "1490 €"],
      ["Excelencia", "249 €", "2490 €"],
    ]) {
      const card = pricing.locator("article", { has: page.getByRole("heading", { name: plan, exact: true }) });
      await expect(card).toContainText(`${month}/mes + IVA`);
      await expect(card).toContainText(`o ${year}/año + IVA`);
    }
    await expect(pricing).toContainText("150 clientes");
    await expect(pricing).toContainText("300 equipos en uso");
    // No se afirma que el software certifique el cumplimiento normativo.
    await page.getByText("¿RevisaYa certifica que cumplo el RIPCI?").click();
    await expect(page.getByText("no certifica el cumplimiento normativo ni emite certificados oficiales")).toBeVisible();
    await expect(pricing).toContainText("50.000 correos al mes");
    await page.getByText("¿Hace falta tarjeta para la prueba?").click();
    await expect(page.getByText("no se cobra nada hasta que terminan los 7 días")).toBeVisible();
    await page.getByRole("link", { name: "Empezar 7 días gratis" }).first().click();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("textos legales: borrador para revisión y datos del titular pendientes si no están configurados", async ({ page }) => {
    for (const [path, title] of [
      ["/legal/aviso-legal", "Aviso legal"],
      ["/legal/privacidad", "Política de privacidad"],
      ["/legal/terminos", "Términos y condiciones del servicio"],
      ["/legal/cookies", "Política de cookies"],
      ["/legal/encargo-tratamiento", "Contrato de encargo del tratamiento"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Borrador pendiente de revisión jurídica")).toBeVisible();
    }
    await page.goto("/legal/aviso-legal");
    await expect(page.getByText(/\[pendiente: (nombre o razón social|NIF)\]/).first()).toBeVisible();
    await page.goto("/ayuda");
    await expect(page.getByRole("heading", { name: "Guía de inicio" })).toBeVisible();
  });

  test("404 propia", async ({ page }) => {
    const res = await page.goto("/esta-pagina-no-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Esta página no existe" })).toBeVisible();
    expect((await page.request.get("/robots.txt")).status()).toBe(200);
  });

  test("al registrarse y crear el taller queda constancia de la aceptación y llega la bienvenida", async ({ page }) => {
    const email = uniqueEmail("legal");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Taller Bienvenida");
    const rows = await db<{ document: string; org: boolean }>(
      "select a.document, a.organization_id is not null as org from legal_acceptances a join profiles p on p.id = a.user_id where p.email = $1 order by a.document",
      [email],
    );
    expect(rows).toEqual([
      { document: "dpa", org: true },
      { document: "privacy", org: false },
      { document: "terms", org: false },
    ]);
    const mail = await waitForEmail(email, "Bienvenido a RevisaYa, Taller Bienvenida");
    expect(mail).toBeTruthy();
  });
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("portada sin desplazamiento horizontal y menú del panel desplegable", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const email = uniqueEmail("movil");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Extintores Móvil");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveCount(0);
    await page.getByText("Menú", { exact: true }).click();
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/clientes$/);
    await expect(page.getByRole("link", { name: "Clientes", exact: true })).toHaveCount(0);
  });
});
