import { expect, type Page } from "@playwright/test";

import { db, PASSWORD, waitForEmailLink } from "./env";

/** Registro completo: formulario → correo de verificación → enlace confirmado. */
export async function signUpAndVerify(page: Page, email: string, opts: { next?: string; firstName?: string } = {}) {
  // Los E2E registran muchas cuentas desde 127.0.0.1: se repone el cubo de
  // registros (la protección en sí se prueba en auth.spec.ts).
  await db("delete from private.rate_limit_buckets where key like 'signup:%'");
  const startedAt = new Date(Date.now() - 1000);
  await page.goto(opts.next ? `/registro?next=${encodeURIComponent(opts.next)}` : "/registro");
  await page.getByLabel("Nombre", { exact: true }).fill(opts.firstName ?? "Laura");
  await page.getByLabel("Apellidos").fill("Martín");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repite la contraseña").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /Acepto los términos/ }).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();

  const link = await waitForEmailLink(email, "Confirma tu correo", startedAt);
  await page.goto(link);
}

export async function signIn(page: Page, email: string, password = PASSWORD, next?: string) {
  await page.goto(next ? `/acceso?next=${encodeURIComponent(next)}` : "/acceso");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

/** Alta de la empresa (antes «taller»; el nombre de la función se mantiene). */
export async function createWorkshop(page: Page, name: string) {
  await expect(page.getByRole("heading", { name: "Da de alta tu empresa" })).toBeVisible();
  await page.getByLabel("Nombre de la empresa").fill(name);
  await page.getByRole("checkbox", { name: /contrato de encargo del tratamiento/ }).check();
  await page.getByRole("button", { name: "Crear empresa" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/acceso/);
}
