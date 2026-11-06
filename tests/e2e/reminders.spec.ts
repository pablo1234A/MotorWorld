import { expect, type Page, test } from "@playwright/test";

import { db, grantPlan, runJob, uniqueEmail, waitForEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Fase 5 de punta a punta, con la aplicación compilada, la base de datos real
 * y un servidor SMTP real (Mailpit): configurar avisos → el planificador crea
 * el aviso → el dispatcher lo envía → llega el correo con las variables →
 * el cliente se da de baja → el panel lo refleja.
 */

const card = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

function isoInMadrid(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const es = (iso: string) => iso.split("-").reverse().join("/");

test.describe("avisos de revisión", () => {
  test("configurar → planificar → enviar por SMTP → baja del cliente", async ({ page, baseURL }) => {
    const owner = uniqueEmail("avisos");
    const customerEmail = uniqueEmail("cliente");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Avisos");
    await grantPlan(owner, "pro");
    await page.reload();

    // 1. Configuración (administrador): avisos activados, ventana amplia para no depender de la hora del test.
    await page.getByRole("link", { name: "Avisos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Configuración de avisos" })).toBeVisible();
    await expect(page.getByText("Los avisos están desactivados")).toBeVisible();
    await page.getByLabel("Enviar avisos automáticos a los clientes").check();
    await page.getByLabel("Días de antelación").fill("30, 30");
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByText("Hay días repetidos")).toBeVisible();

    await page.getByLabel("Enviar avisos automáticos a los clientes").check();
    await page.getByLabel("Días de antelación").fill("30, 7");
    await page.getByLabel("Responder a").fill("recepcion@taller-avisos.test");
    await page.getByLabel("Desde").fill("00:00");
    await page.getByLabel("Hasta").fill("23:59");
    for (const day of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) {
      await page.getByLabel(day, { exact: true }).check();
    }
    await expect(page.getByText("Tu plan actual solo envía avisos por fecha")).toBeVisible();
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByText("Configuración guardada. Los avisos están activados.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Días de antelación")).toHaveValue("30, 7");
    await expect(page.getByLabel("Domingo", { exact: true })).toBeChecked();

    // Festivo lejano (no afecta a este envío): se añade y se quita.
    const holidays = card(page, "Festivos y días de cierre");
    await holidays.getByLabel("Día", { exact: true }).fill("2099-12-25");
    await holidays.getByLabel("Motivo (opcional)").fill("Navidad");
    await holidays.getByRole("button", { name: "Añadir día" }).click();
    await expect(holidays.getByText("25/12/2099")).toBeVisible();
    await holidays.getByRole("button", { name: "Quitar 25/12/2099" }).click();
    await expect(holidays.getByText("No hay días sin envíos programados.")).toBeVisible();

    // 2. Cliente y vehículo cuya próxima revisión es dentro de 30 días.
    const due = addDays(isoInMadrid(new Date()), 30);
    const [y, m, d] = due.split("-");
    const lastService = `${Number(y) - 1}-${m}-${d}`;
    await page.getByRole("link", { name: "Clientes", exact: true }).click();
    await page.getByRole("link", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Nuria");
    await page.getByLabel("Apellidos").fill("Sanz");
    await page.getByLabel("Correo electrónico").fill(customerEmail);
    await page.getByRole("button", { name: "Crear cliente" }).click();
    await expect(page.getByText("Cliente creado.")).toBeVisible();
    const add = card(page, "Añadir vehículo");
    await add.getByLabel("Matrícula").fill("4321 KZB");
    await add.getByLabel("Marca").fill("Seat");
    await add.getByLabel("Modelo").fill("León");
    await add.getByLabel("Fecha", { exact: true }).fill(lastService);
    await add.getByLabel("Kilómetros", { exact: true }).fill("60000");
    await add.getByRole("button", { name: "Dar de alta el vehículo" }).click();
    await expect(page.getByText("Vehículo dado de alta.")).toBeVisible();
    await expect(page.getByText(es(due)).first()).toBeVisible();

    // 3. Planificador y dispatcher, como los lanzaría el cron.
    const plan = await runJob(baseURL!, "plan-reminders");
    expect(plan.ok).toBe(true);
    await page.getByRole("link", { name: "Recordatorios", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Recordatorios" })).toBeVisible();
    const row = page.getByRole("row", { name: /4321 KZB/ });
    await expect(row).toContainText("30 días antes");
    await expect(row).toContainText("Programado");

    const dispatch = await runJob(baseURL!, "dispatch-reminders");
    expect(dispatch.ok).toBe(true);
    expect(Number(dispatch.stats?.sent)).toBeGreaterThanOrEqual(1);

    // 4. El correo ha llegado de verdad al servidor SMTP, con las variables.
    const mail = await waitForEmail(customerEmail, "Revisión de tu Seat León");
    expect(mail.Subject).toBe("Revisión de tu Seat León en Taller Avisos");
    expect(mail.From.Name).toBe("Taller Avisos");
    expect(mail.Text).toContain(`Hola Nuria, te recordamos que la revisión de tu Seat León (4321 KZB) está prevista para el ${es(due)}.`);
    expect(mail.HTML).toContain("mailto:recepcion@taller-avisos.test");
    const unsubscribe = mail.HTML.match(/href="([^"]*\/baja\/[^"]+)"/)?.[1];
    expect(unsubscribe).toBeTruthy();

    await page.reload();
    await expect(page.getByRole("row", { name: /4321 KZB/ })).toContainText("Enviado");
    await expect(page.getByText("Correos usados este mes").locator("..")).toContainText("1 de 500");
    // Un segundo dispatcher no reenvía nada.
    await runJob(baseURL!, "dispatch-reminders");
    const [{ n }] = await db<{ n: number }>("select count(*)::int as n from email_logs where to_email = $1", [customerEmail]);
    expect(n).toBe(1);

    // 5. Baja del cliente desde el enlace del correo.
    const customerPage = await page.context().newPage();
    await customerPage.goto(unsubscribe!.replace(/&amp;/g, "&"));
    await expect(customerPage.getByRole("heading", { name: "Avisos de Taller Avisos" })).toBeVisible();
    await customerPage.getByRole("button", { name: "No quiero recibir más avisos" }).click();
    await expect(customerPage.getByText("No volverás a recibir avisos de revisión de Taller Avisos.")).toBeVisible();
    const [customer] = await db<{ reminders_opt_out: boolean }>("select reminders_opt_out from customers where email = $1", [customerEmail]);
    expect(customer.reminders_opt_out).toBe(true);
    await customerPage.close();
  });

  test("los procesos internos exigen el secreto del cron", async ({ request }) => {
    expect((await request.post("/api/internal/jobs/dispatch-reminders")).status()).toBe(401);
    expect((await request.post("/api/internal/jobs/plan-reminders", { headers: { authorization: "Bearer incorrecto" } })).status()).toBe(401);
  });
});
