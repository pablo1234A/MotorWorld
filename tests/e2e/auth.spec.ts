import { expect, test } from "@playwright/test";

import { db, PASSWORD, uniqueEmail, waitForEmailLink } from "./support/env";
import { createWorkshop, signIn, signOut, signUpAndVerify } from "./support/flows";

test.describe("Autenticación", () => {
  test("registro con verificación de email, alta de taller, cierre de sesión y acceso", async ({ page }) => {
    const email = uniqueEmail("alta");

    await signUpAndVerify(page, email);
    // El enlace del correo inicia sesión y lleva al alta del taller.
    await createWorkshop(page, "Taller Sur");
    await expect(page.getByText("Tu empresa aún no tiene un plan activo")).toBeVisible();
    await expect(page.getByText("Administrador · propietario de la cuenta")).toBeVisible();

    await signOut(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/acceso\?next=%2Fapp/);

    await signIn(page, email, PASSWORD, "/app");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Taller Sur" })).toBeVisible();
  });

  test("no se puede entrar sin verificar el email", async ({ page }) => {
    const email = uniqueEmail("sinverificar");
    await page.goto("/registro");
    await page.getByLabel("Nombre", { exact: true }).fill("Pedro");
    await page.getByLabel("Apellidos").fill("Gil");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Repite la contraseña").fill(PASSWORD);
    await page.getByRole("checkbox", { name: /Acepto los términos/ }).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();

    await signIn(page, email);
    await expect(page.getByText("Tienes que verificar tu correo")).toBeVisible();
  });

  test("validación en servidor: contraseña débil y contraseñas distintas", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre", { exact: true }).fill("Ana");
    await page.getByLabel("Apellidos").fill("Ruiz");
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("debil"));
    await page.getByLabel("Contraseña", { exact: true }).fill("corta");
    await page.getByLabel("Repite la contraseña").fill("otra");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Mínimo 10 caracteres", { exact: true })).toBeVisible();
    await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();
    await expect(page.getByText("Tienes que aceptar los términos y la política de privacidad")).toBeVisible();
    // Los valores no sensibles se conservan; la contraseña nunca se devuelve.
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Ana");
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  });

  test("credenciales incorrectas: mensaje genérico", async ({ page }) => {
    await signIn(page, uniqueEmail("noexiste"), "Incorrecta123");
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  });

  test("recuperación de contraseña por correo", async ({ page }) => {
    const email = uniqueEmail("recupera");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Taller Norte");
    await signOut(page);

    const startedAt = new Date(Date.now() - 1000);
    await page.goto("/recuperar");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Si existe una cuenta con ese correo")).toBeVisible();

    const link = await waitForEmailLink(email, "contraseña nueva", startedAt);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Crea una contraseña nueva" })).toBeVisible();
    const newPassword = "NuevaClave2026x";
    await page.getByLabel("Contraseña nueva", { exact: true }).fill(newPassword);
    await page.getByLabel("Repite la contraseña").fill(newPassword);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await signOut(page);
    await signIn(page, email, PASSWORD);
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    await signIn(page, email, newPassword);
    await expect(page).toHaveURL(/\/app$/);
  });

  test("un enlace de verificación manipulado no inicia sesión", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=pkce_inventado&type=email&next=/app");
    await expect(page).toHaveURL(/\/acceso\?error=enlace_no_valido/);
    await expect(page.getByText("El enlace no es válido, ha caducado o ya se ha utilizado.")).toBeVisible();
  });

  test("rate limiting: se bloquean los registros masivos desde una misma IP", async ({ page }) => {
    // Agota el cubo de registros de esta IP (5 por hora) y comprueba el bloqueo.
    await db("insert into private.rate_limit_buckets (key, tokens) values ('signup:ip:unknown', 0), ('signup:ip:127.0.0.1', 0), ('signup:ip:::1', 0) on conflict (key) do update set tokens = 0, updated_at = now()");
    await page.goto("/registro");
    await page.getByLabel("Nombre", { exact: true }).fill("Bot");
    await page.getByLabel("Apellidos").fill("Masivo");
    await page.getByLabel("Correo electrónico").fill(uniqueEmail("bot"));
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Repite la contraseña").fill(PASSWORD);
    await page.getByRole("checkbox", { name: /Acepto los términos/ }).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Demasiados intentos. Espera unos minutos")).toBeVisible();
    await db("delete from private.rate_limit_buckets where key like 'signup:%'");
  });

  test("no hay redirecciones abiertas a otros dominios", async ({ page }) => {
    const email = uniqueEmail("redir");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Taller Redirección");
    await signOut(page);
    await signIn(page, email, PASSWORD, "//evil.example.com/robar");
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/app$/);
  });

  test("cambio de contraseña desde la cuenta exige la actual", async ({ page }) => {
    const email = uniqueEmail("cambio");
    await signUpAndVerify(page, email);
    await createWorkshop(page, "Taller Cambio");
    await page.getByRole("link", { name: "Mi cuenta" }).click();

    await page.getByLabel("Contraseña actual").fill("NoEsLaActual1");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("OtraClave2026z");
    await page.getByLabel("Repite la contraseña nueva").fill("OtraClave2026z");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Contraseña incorrecta")).toBeVisible();

    await page.getByLabel("Contraseña actual").fill(PASSWORD);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("OtraClave2026z");
    await page.getByLabel("Repite la contraseña nueva").fill("OtraClave2026z");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Contraseña actualizada.")).toBeVisible();

    await signOut(page);
    await signIn(page, email, "OtraClave2026z");
    await expect(page).toHaveURL(/\/app$/);
  });
});
