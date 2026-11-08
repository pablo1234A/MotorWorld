import { expect, type Page, test } from "@playwright/test";

import { db, grantPlan, uniqueEmail, waitForEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Fase 7 y pendientes: datos del taller (NIF validado, logo), presupuesto con
 * IVA (totales en vivo, borrador, emisión, PDF real, envío por SMTP con el
 * PDF adjunto) y citas configuradas por huecos.
 */

const card = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

// PNG 1×1 válido.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

test.describe("presupuestos y datos del taller", () => {
  test("datos fiscales y logo → presupuesto con IVA → emitir y enviar con el PDF", async ({ page }) => {
    const owner = uniqueEmail("presu");
    const customerEmail = uniqueEmail("cliente-presu");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Presupuestos");
    await grantPlan(owner, "pro");
    await page.reload();

    // Datos del taller: el NIF se valida (letra de control) y el logo aparece en el panel.
    await page.goto("/app/configuracion/taller");
    await page.getByLabel("Razón social").fill("Taller Presupuestos S.L.");
    await page.getByLabel("NIF / CIF").fill("B12345675");
    await page.getByRole("button", { name: "Guardar datos de la empresa" }).click();
    await expect(page.getByText("NIF, NIE o CIF no válido")).toBeVisible();
    await page.getByLabel("NIF / CIF").fill("B-12345674");
    await page.getByLabel("Código postal").fill("28001");
    await page.getByLabel("Población").fill("Madrid");
    await page.getByRole("button", { name: "Guardar datos de la empresa" }).click();
    await expect(page.getByText("Datos de la empresa guardados.")).toBeVisible();
    await page.getByLabel("Archivo del logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Subir logo" }).click();
    await expect(page.getByText("Logo actualizado.")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("img", { name: "Taller Presupuestos" })).toBeVisible();
    const logoSrc = await page.getByRole("img", { name: "Logo de la empresa" }).getAttribute("src");
    const logo = await page.request.get(logoSrc!);
    expect(logo.headers()["content-type"]).toBe("image/png");

    // Cliente e instalación (datos de partida).
    const [{ org_id, branch_id }] = await db<{ org_id: string; branch_id: string }>(
      `select m.organization_id as org_id, b.id as branch_id from organization_members m join profiles p on p.id = m.user_id
         join branches b on b.organization_id = m.organization_id and b.is_primary where p.email = $1`,
      [owner],
    );
    const [{ id: customerId }] = await db<{ id: string }>(
      "insert into customers (organization_id, branch_id, first_name, last_name, email) values ($1, $2, 'Marta', 'López', $3) returning id",
      [org_id, branch_id, customerEmail],
    );
    const [{ id: installationId }] = await db<{ id: string }>(
      "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Oficinas López', 'Calle Alta 5', 'Madrid') returning id",
      [org_id, branch_id, customerId],
    );

    // Presupuesto desde la ficha de la instalación, con totales en vivo.
    await page.goto(`/app/instalaciones/${installationId}`);
    await page.getByRole("link", { name: "Nuevo presupuesto" }).click();
    await expect(page.getByLabel("Instalación")).toHaveValue(installationId);
    await page.getByLabel("Tipo 1").selectOption("material");
    await page.getByLabel("Concepto 1", { exact: true }).fill("Manguera BIE 25 mm (metros)");
    await page.getByLabel("Cantidad 1").fill("4,5");
    await page.getByLabel("Precio 1").fill("12,35");
    await page.getByRole("button", { name: "Añadir concepto" }).click();
    await page.getByLabel("Concepto 2", { exact: true }).fill("Mano de obra de sustitución");
    await page.getByLabel("Cantidad 2").fill("1,5");
    await page.getByLabel("Precio 2").fill("40");
    // Base 55,58 + 60,00 = 115,58; IVA 11,67 + 12,60 = 24,27 → 139,85
    await expect(page.getByTestId("quote-total")).toHaveText(/139,85\s€/);
    await page.getByRole("button", { name: "Crear borrador" }).click();
    await expect(page.getByText("Borrador creado.")).toBeVisible();
    const number = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    expect(number).toMatch(/^P-\d{4}-0001$/);

    // Vista previa del PDF del borrador.
    const previewHref = await page.getByRole("link", { name: "Vista previa del PDF" }).getAttribute("href");
    const preview = await page.request.get(previewHref!);
    expect(preview.headers()["content-type"]).toBe("application/pdf");
    expect((await preview.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Emitir y enviar: el cliente recibe el PDF adjunto por SMTP.
    await page.getByRole("button", { name: "Emitir y enviar al cliente" }).click();
    await expect(page.getByText("Presupuesto emitido. Le hemos enviado un correo al cliente.")).toBeVisible();
    await expect(page.getByText("Emitido · Marta López")).toBeVisible();
    const mail = await waitForEmail(customerEmail, `Presupuesto ${number}`);
    expect(mail.From.Name).toBe("Taller Presupuestos");
    expect(mail.Text).toContain("139,85");
    expect(mail.Text).toContain("para Oficinas López");
    expect(mail.Attachments?.find((a) => a.FileName === `presupuesto-${number}.pdf`)?.ContentType).toBe("application/pdf");

    // Ya no se puede editar; se puede aceptar y duplicar.
    await expect(page.getByRole("button", { name: "Guardar borrador" })).toHaveCount(0);
    await page.getByRole("button", { name: "Aceptado" }).click();
    await expect(page.getByText("Marcado como aceptado.")).toBeVisible();
    await page.getByRole("link", { name: "Presupuestos", exact: true }).click();
    await expect(page.getByRole("row", { name: new RegExp(number) })).toContainText("Aceptado");
  });

  test("citas por huecos: el cliente elige un hueco libre", async ({ page, browser }) => {
    const owner = uniqueEmail("huecos");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Huecos");
    await grantPlan(owner, "pro");
    await page.reload();

    await page.goto("/app/configuracion/citas");
    const settings = card(page, "Página para pedir visita");
    await settings.getByLabel("El cliente elige un hueco libre", { exact: false }).check();
    await settings.getByLabel("Antelación mínima (horas)").fill("0");
    await settings.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Configuración de visitas guardada.")).toBeVisible();
    const rules = card(page, "Horario de visitas");
    await rules.getByLabel("Día").selectOption("1");
    await rules.getByLabel("Desde").fill("08:00");
    await rules.getByLabel("Hasta").fill("20:00");
    await rules.getByRole("button", { name: "Añadir franja" }).click();
    await expect(page.getByText("Lunes de 08:00 a 20:00")).toBeVisible();
    // El resto de días, directamente (el alta por pantalla ya está probada arriba).
    await db(
      `insert into availability_rules (organization_id, branch_id, weekday, start_time, end_time, capacity)
       select b.organization_id, b.id, d, '08:00', '20:00', 1 from branches b
         join organization_members m on m.organization_id = b.organization_id join profiles p on p.id = m.user_id
         cross join generate_series(2, 7) d where p.email = $1 and b.is_primary`,
      [owner],
    );
    const publicUrl = (await page.getByRole("link", { name: /\/t\/.+\/cita$/ }).textContent())!.trim();

    const customer = await browser.newPage();
    await customer.goto(publicUrl);
    await customer.getByLabel("Nombre y apellidos").fill("Pablo Ruiz");
    await customer.getByLabel("Teléfono").fill("611 222 333");
    // El primer hueco de mañana (hoy pueden no quedar).
    const slots = customer.locator('input[name="slot"]');
    const count = await slots.count();
    expect(count).toBeGreaterThan(5);
    // Se pulsa la hora visible (el botón de opción está oculto y asociado a ella).
    const pick = Math.min(count - 1, 14);
    await customer.locator('input[name="slot"] + span').nth(pick).click();
    await expect(slots.nth(pick)).toBeChecked();
    await customer.getByLabel("¿Qué necesitas?").selectOption({ label: "Mantenimiento correctivo" });
    await customer.getByLabel("Dirección de la instalación").fill("Polígono Norte, nave 7");
    await customer.getByRole("button", { name: "Pedir la visita" }).click();
    await expect(customer.getByText("¡Solicitud enviada!")).toBeVisible();
    await customer.close();

    await page.goto("/app/citas");
    const request = page.locator('a[href^="/app/citas/"]', { hasText: "Pablo Ruiz" });
    await expect(request).toContainText("Solicitud");
    await request.click();
    await expect(page.getByText("El cliente no tiene correo: avísale por teléfono").first()).toBeVisible();
    await expect(page.getByText("Polígono Norte, nave 7")).toBeVisible();
    await expect(page.getByText("Mantenimiento correctivo")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar visita" }).click();
    await expect(page.getByText("Visita confirmada.")).toBeVisible();
    await page.getByRole("button", { name: "Crear ficha con estos datos" }).click();
    await expect(page.getByText("Ficha de cliente creada con los datos de la solicitud.")).toBeVisible();
    await expect(page.locator('a[href^="/app/clientes/"]', { hasText: "Pablo Ruiz" })).toBeVisible();
  });
});
