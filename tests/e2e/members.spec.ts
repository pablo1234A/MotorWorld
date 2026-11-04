import { expect, test } from "@playwright/test";

import { grantPlan, uniqueEmail } from "./support/env";
import { createWorkshop, signOut, signUpAndVerify } from "./support/flows";

test.describe("Usuarios e invitaciones", () => {
  test("el administrador invita a un operario, que se registra y entra con permisos limitados", async ({ page, browser }) => {
    const ownerEmail = uniqueEmail("duena");
    const operatorEmail = uniqueEmail("operario");

    await signUpAndVerify(page, ownerEmail);
    await createWorkshop(page, "Taller Equipo");
    await grantPlan(ownerEmail, "max");

    await page.getByRole("link", { name: "Usuarios" }).click();
    await expect(page.getByText("incluye 3 usuarios. En uso: 1")).toBeVisible();
    await page.getByLabel("Correo electrónico").fill(operatorEmail);
    await page.getByRole("button", { name: "Crear invitación" }).click();
    const linkInput = page.getByLabel("Enlace de invitación");
    await expect(linkInput).toBeVisible();
    const invitationUrl = await linkInput.inputValue();
    expect(invitationUrl).toMatch(/\/invitacion\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toBeVisible();

    // El invitado, en otro navegador, se registra desde el enlace.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(invitationUrl);
    await expect(guest.getByRole("heading", { name: "Te han invitado a Taller Equipo" })).toBeVisible();
    await guest.getByRole("link", { name: "Crear cuenta con ese correo" }).click();
    const invitationPath = new URL(invitationUrl).pathname;
    await signUpAndVerify(guest, operatorEmail, { next: invitationPath, firstName: "Mario" });
    await expect(guest).toHaveURL(new RegExp(`${invitationPath}$`));
    await guest.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(guest).toHaveURL(/\/app$/);
    await expect(guest.getByRole("heading", { name: "Taller Equipo" })).toBeVisible();
    await expect(guest.getByText("Operario", { exact: true })).toBeVisible();

    // El operario no tiene gestión de usuarios: ni enlace ni acceso directo.
    await expect(guest.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await guest.goto("/app/usuarios");
    await expect(guest.getByText("Solo los administradores del taller pueden gestionar usuarios.")).toBeVisible();

    // La invitación no se puede reutilizar.
    await guest.goto(invitationUrl);
    await expect(guest.getByText("Esta invitación ya se ha utilizado.")).toBeVisible();
    await guestContext.close();

    // El administrador ve al nuevo miembro y la invitación ya no está pendiente.
    await page.reload();
    await expect(page.getByText(operatorEmail)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitaciones pendientes" })).toHaveCount(0);
  });

  test("una invitación para otro correo no se puede aceptar", async ({ page, browser }) => {
    const ownerEmail = uniqueEmail("duena2");
    await signUpAndVerify(page, ownerEmail);
    await createWorkshop(page, "Taller Ajeno");
    await grantPlan(ownerEmail, "max");
    await page.getByRole("link", { name: "Usuarios" }).click();
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("destinatario"));
    await page.getByRole("button", { name: "Crear invitación" }).click();
    const invitationUrl = await page.getByLabel("Enlace de invitación").inputValue();

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signUpAndVerify(other, uniqueEmail("intruso"), { next: new URL(invitationUrl).pathname });
    await other.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(other.getByText("Esta invitación es para otra dirección de correo.")).toBeVisible();
    await otherContext.close();
  });

  test("límite del plan Pro: un único usuario", async ({ page }) => {
    const ownerEmail = uniqueEmail("pro");
    await signUpAndVerify(page, ownerEmail);
    await createWorkshop(page, "Taller Solo");
    await grantPlan(ownerEmail, "pro");
    await page.getByRole("link", { name: "Usuarios" }).click();
    await expect(page.getByText("Tu plan Pro incluye 1 usuario. En uso: 1")).toBeVisible();
    await expect(page.getByText("Con el plan actual no puedes añadir más usuarios.")).toBeVisible();
  });

  test("sin plan activo no se puede invitar", async ({ page }) => {
    await signUpAndVerify(page, uniqueEmail("sinplan"));
    await createWorkshop(page, "Taller Sin Plan");
    await page.getByRole("link", { name: "Usuarios" }).click();
    await expect(page.getByText("Necesitas un plan activo para invitar usuarios.")).toBeVisible();
    await signOut(page);
  });
});
