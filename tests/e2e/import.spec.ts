import { expect, test } from "@playwright/test";

import { db, grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

const HEADER = "Nombre del cliente;Correo electrónico;Teléfono;Matrícula;Marca;Modelo;Última revisión;Kilómetros;Próxima revisión";

test.describe("Importación Excel/CSV", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await db("delete from private.rate_limit_buckets where key like 'import:%'");
  });

  test("plantilla → subir con errores → corregir en pantalla → confirmar → fichas creadas; mismo archivo otra vez", async ({ page }) => {
    const owner = uniqueEmail("importa");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Excel");
    await grantPlan(owner, "pro");

    await page.getByRole("link", { name: "Importar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Importar clientes y vehículos" })).toBeVisible();

    // 1. Plantilla
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Plantilla Excel (.xlsx)" }).click();
    expect((await download).suggestedFilename()).toBe("plantilla-revisaya.xlsx");

    // 2. Archivo con errores
    const file = Buffer.from(
      [
        HEADER,
        "Laura Martín;laura@correo.test;600 123 456;1234 BCD;Seat;Ibiza;15/03/2026;82.000;",
        "Pedro Gil;pedro@correo.test;;5678 FGH;Renault;Clio;31/02/2026;45000;",
        "Ana Ruiz;;;9012 JKL;;;10/01/2026;;",
        "",
      ].join("\n"),
      "utf8",
    );
    await page.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "mis-clientes.csv", mimeType: "text/csv", buffer: file });
    await page.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByRole("heading", { name: "mis-clientes.csv" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Con errores (2)" })).toBeVisible();
    await expect(page.getByText("Fecha no válida (usa dd/mm/aaaa)")).toBeVisible();
    await expect(page.getByText("Falta el correo electrónico")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar importación" })).toBeDisabled();

    // Nada se ha guardado todavía
    await page.goto("/app/clientes");
    await expect(page.getByText("Todavía no hay clientes.")).toBeVisible();
    await page.goBack();

    // 3. Corregir la fecha en pantalla
    await page.getByRole("button", { name: "Corregir fila 3" }).click();
    await page.getByLabel("Última revisión").fill("28/02/2026");
    await page.getByRole("button", { name: "Guardar fila" }).click();
    await expect(page.getByRole("link", { name: "Con errores (1)" })).toBeVisible();

    // 4. Aceptar filas sin correo (no recibirán avisos)
    await page.getByRole("button", { name: "Importar también las filas sin correo" }).click();
    await expect(page.getByRole("link", { name: "Con errores (0)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar importación" })).toBeEnabled();

    // Informe de errores y avisos
    const report = page.waitForEvent("download");
    await page.getByRole("link", { name: "Descargar informe de errores (CSV)" }).click();
    expect((await report).suggestedFilename()).toBe("errores-importacion.csv");

    // 5. Confirmar
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    await expect(page.getByText("Importación completada")).toBeVisible();
    await expect(page.getByText("Se han creado 3 clientes y 3 vehículos")).toBeVisible();

    await page.goto("/app/vehiculos");
    await expect(page.getByRole("link", { name: "1234 BCD" })).toBeVisible();
    await expect(page.getByRole("link", { name: "5678 FGH" })).toBeVisible();
    await page.getByRole("link", { name: "1234 BCD" }).click();
    await expect(page.getByText("Revisión importada")).toBeVisible();
    await expect(page.getByText("15/03/2027").first()).toBeVisible();

    // 6. El mismo archivo otra vez: se detecta y no duplica nada
    await page.goto("/app/importar");
    await page.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "mis-clientes.csv", mimeType: "text/csv", buffer: file });
    await page.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByText("Ese vehículo ya existe en el taller: se omite").first()).toBeVisible();
    await expect(page.getByText("No hay ninguna fila que importar.")).toBeVisible();
    await page.getByRole("button", { name: "Descartar importación" }).click();
    await expect(page.getByText("Importación descartada. No se ha guardado nada.")).toBeVisible();
  });

  test("archivo no válido: mensaje claro y nada guardado", async ({ page }) => {
    const owner = uniqueEmail("importa-mal");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Mal");
    await grantPlan(owner, "pro");
    await page.goto("/app/importar");
    await page
      .getByLabel("Archivo Excel (.xlsx) o CSV")
      .setInputFiles({ name: "otra-cosa.csv", mimeType: "text/csv", buffer: Buffer.from("Nombre;Correo\nAna;ana@correo.test\n") });
    await page.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByText("Faltan columnas obligatorias")).toBeVisible();
    await expect(page.getByText("Todavía no has importado ningún archivo.")).toBeVisible();
  });
});
