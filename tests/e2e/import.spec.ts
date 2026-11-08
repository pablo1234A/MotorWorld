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

    await page.getByRole("link", { name: "Importar", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Importar desde Excel o CSV" })).toBeVisible();
    // La importación de vehículos (etapa anterior) sigue disponible, plegada.
    const legacy = page.locator("details", { hasText: "Vehículos (etapa anterior de RevisaYa)" });
    await legacy.getByText("Vehículos (etapa anterior de RevisaYa)").click();

    // 1. Plantilla
    const download = page.waitForEvent("download");
    await legacy.getByRole("link", { name: "Plantilla Excel (.xlsx)" }).click();
    expect((await download).suggestedFilename()).toBe("plantilla-vehiculos-revisaya.xlsx");

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
    await legacy.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "mis-clientes.csv", mimeType: "text/csv", buffer: file });
    await legacy.getByRole("button", { name: "Subir y revisar" }).click();
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
    await legacy.getByText("Vehículos (etapa anterior de RevisaYa)").click();
    await legacy.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "mis-clientes.csv", mimeType: "text/csv", buffer: file });
    await legacy.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByText("Ese vehículo ya existe en la empresa: se omite").first()).toBeVisible();
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
    const clientes = page.getByRole("heading", { name: "1. Clientes" }).locator("..");
    await clientes.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "otra-cosa.csv", mimeType: "text/csv", buffer: Buffer.from("Producto;Precio\nExtintor;30\n") });
    await clientes.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByText("No se encuentra la fila de cabeceras")).toBeVisible();
    await expect(page.getByText("Todavía no has importado ningún archivo.")).toBeVisible();
  });

  test("PCI: clientes desde CSV → revisión (crear, omitir, errores) → confirmar → fichas creadas", async ({ page }) => {
    const owner = uniqueEmail("importa-pci");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Extintores Excel");
    await grantPlan(owner, "pro");
    await page.goto("/app/importar");
    const clientes = page.getByRole("heading", { name: "1. Clientes" }).locator("..");
    const download = page.waitForEvent("download");
    await clientes.getByRole("link", { name: "Plantilla .xlsx" }).click();
    expect((await download).suggestedFilename()).toBe("plantilla-clientes-revisaya.xlsx");

    const csv = [
      "Tipo (empresa o particular);Nombre;Razón social;CIF / NIF;Correo electrónico;Municipio",
      "empresa;Comunidad Las Encinas;CP Las Encinas 12;;encinas@cliente.test;Madrid",
      "particular;Laura Martín;;;laura@cliente.test;",
      "empresa;Repetida;;;encinas@cliente.test;",
      "empresa;CIF malo;;B1234;;",
    ].join("\n");
    await clientes.getByLabel("Archivo Excel (.xlsx) o CSV").setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await clientes.getByRole("button", { name: "Subir y revisar" }).click();
    await expect(page.getByRole("heading", { name: "Importación de clientes" })).toBeVisible();
    await expect(page.getByText("Ya existe un cliente con ese CIF/NIF o correo: se omite")).toBeVisible();
    await expect(page.getByText("NIF/CIF no válido")).toBeVisible();
    await page.getByRole("button", { name: /Confirmar e importar 2 filas/ }).click();
    await expect(page.getByText("Hay filas con errores")).toBeVisible();
    await page.getByLabel(/Importar solo las 2 filas correctas/).check();
    await page.getByRole("button", { name: /Confirmar e importar 2 filas/ }).click();
    await expect(page.getByText("Importación terminada: 2 fichas creadas.")).toBeVisible();
    await page.getByRole("link", { name: "Ver clientes" }).click();
    await expect(page.getByRole("link", { name: "Comunidad Las Encinas" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Laura Martín" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Repetida" })).toHaveCount(0);
  });
});
