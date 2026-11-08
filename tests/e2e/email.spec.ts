import { createHmac } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import { appEnv, db, grantPlan, uniqueEmail, waitForEmail } from "./support/env";
import { createWorkshop, signUpAndVerify } from "./support/flows";

/**
 * Fase 6 de punta a punta: plantillas (vista previa, validación, guardar,
 * prueba real por SMTP a Mailpit, restaurar), configuración del correo,
 * direcciones bloqueadas y webhook del proveedor (firma).
 */

const card = (page: Page, title: string) => page.locator("section", { has: page.getByRole("heading", { name: title, exact: true }) });

test.describe("sistema de correos", () => {
  test("plantilla: vista previa, validación, guardar, prueba real y restaurar", async ({ page }) => {
    const owner = uniqueEmail("plantillas");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Plantillas");
    await grantPlan(owner, "pro");
    await page.reload();

    await page.getByRole("link", { name: "Configuración", exact: true }).first().click();
    await page.getByRole("main").getByRole("link", { name: /^Plantillas de correo/ }).click();
    await expect(page.getByText("El botón no aparece porque falta la dirección «Responder a»").first()).toBeVisible();

    // Dirección de respuesta: el botón «Pedir visita» abre un correo a la empresa.
    await page.goto("/app/configuracion/avisos");
    await page.getByLabel("Responder a").fill("citas@taller-plantillas.test");
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByText("Configuración guardada.")).toBeVisible();
    await page.goto("/app/configuracion/plantillas");
    await expect(page.getByRole("heading", { name: "Plantillas de correo" })).toBeVisible();

    const T = "Recordatorio de mantenimiento (vencimientos)";
    const editor = card(page, T);
    await expect(editor.getByText("Plantilla original")).toBeVisible();
    // Vista previa con datos de ejemplo.
    await expect(editor.getByText("Asunto: Mantenimiento de protección contra incendios en Garaje comunitario Calle Encina 12")).toBeVisible();

    await editor.getByLabel("Asunto").fill("{nombre}, toca revisar {instalacion} {precio}");
    await editor.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(editor.getByText("Variable desconocida: {precio}")).toBeVisible();

    await editor.getByLabel("Asunto").fill("{nombre}, toca revisar {instalacion}");
    await expect(editor.getByText("Asunto: Laura, toca revisar Garaje comunitario Calle Encina 12")).toBeVisible();
    await editor.getByLabel("Texto del botón").fill("Reservar ya");
    await expect(editor.frameLocator("iframe").getByRole("link", { name: "Reservar ya" })).toBeVisible();
    await editor.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(editor.getByText("Plantilla guardada.")).toBeVisible();
    await page.reload();
    await expect(card(page, T).getByLabel("Asunto")).toHaveValue("{nombre}, toca revisar {instalacion}");
    await expect(card(page, T).getByText("Personalizada")).toBeVisible();

    // Prueba real: llega al correo del administrador a través del SMTP local.
    await card(page, T).getByRole("button", { name: "Enviarme una prueba" }).click();
    await expect(page.getByText(`Correo de prueba enviado a ${owner}`)).toBeVisible();
    const mail = await waitForEmail(owner, "[Prueba] Laura, toca revisar Garaje comunitario Calle Encina 12");
    expect(mail.From.Name).toBe("Taller Plantillas");
    expect(mail.HTML).toContain("Reservar ya");

    page.once("dialog", (d) => d.accept());
    await card(page, T).getByRole("button", { name: "Restaurar la plantilla original" }).click();
    await expect(card(page, T).getByLabel("Asunto")).toHaveValue("Mantenimiento de protección contra incendios en {instalacion}");
    await page.reload();
    await expect(card(page, T).getByText("Plantilla original")).toBeVisible();
  });

  test("correo: remitente, resumen, direcciones bloqueadas y webhook firmado", async ({ page, request }) => {
    const owner = uniqueEmail("correo");
    await signUpAndVerify(page, owner);
    await createWorkshop(page, "Taller Correo");
    await grantPlan(owner, "pro");
    await page.reload();

    await page.goto("/app/configuracion/correo");
    await expect(page.getByRole("heading", { name: "Correo", exact: true })).toBeVisible();
    const [{ slug }] = await db<{ slug: string }>(
      "select o.slug::text as slug from organizations o join organization_members m on m.organization_id = o.id join profiles p on p.id = m.user_id where p.email = $1",
      [owner],
    );
    await expect(page.getByText(`"Taller Correo" <${slug}@`)).toBeVisible();
    // Con SMTP no hay verificación de dominios: se dice, no se simula.
    await expect(page.getByText("La verificación de dominios propios no está disponible todavía")).toBeVisible();

    const sender = card(page, "Remitente de los avisos");
    await sender.getByLabel("Resumen para la empresa").selectOption("daily");
    await sender.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Configuración del correo guardada.")).toBeVisible();
    await page.reload();
    await expect(card(page, "Remitente de los avisos").getByLabel("Resumen para la empresa")).toHaveValue("daily");

    const blocked = card(page, "Direcciones bloqueadas");
    await blocked.getByLabel("Bloquear una dirección").fill("Moroso@Cliente.test");
    await blocked.getByRole("button", { name: "Bloquear" }).click();
    await expect(page.getByText("No se enviarán más correos a moroso@cliente.test.")).toBeVisible();
    await expect(blocked.getByText("Bloqueada por la empresa")).toBeVisible();
    await blocked.getByRole("button", { name: "Desbloquear moroso@cliente.test" }).click();
    await expect(blocked.getByText("No hay direcciones bloqueadas.")).toBeVisible();

    // Webhook del proveedor: sin firma válida no se acepta.
    const body = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "no-existe" } });
    expect((await request.post("/api/webhooks/email/resend", { data: body, headers: { "content-type": "application/json" } })).status()).toBe(401);
    const secret = appEnv("RESEND_WEBHOOK_SECRET");
    const id = `msg_e2e_${Date.now()}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
    const ok = await request.post("/api/webhooks/email/resend", {
      data: body,
      headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, outcome: "unknown_message" });
    const again = await request.post("/api/webhooks/email/resend", {
      data: body,
      headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` },
    });
    expect(await again.json()).toMatchObject({ outcome: "duplicate" });
  });
});
