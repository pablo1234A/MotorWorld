import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { extractConfirmLink, resetRateLimits, waitForEmail } from "../support/http";
import { adminClient, setPlan } from "../support/supabase";

config({ path: ".env.local", quiet: true });

export { adminClient, resetRateLimits, setPlan };

export function newIdentity(label: string) {
  return { name: `Prueba ${label}`, email: `e2e-${label}-${randomUUID().slice(0, 8)}@pruebas.anunciapro.test`, password: `Clave${randomUUID().slice(0, 6)}9` };
}

/** Registro completo por la interfaz y confirmación del correo desde el buzón local. */
export async function registerThroughUi(page: Page, identity: ReturnType<typeof newIdentity>) {
  await page.goto("/registro");
  await page.getByLabel("Nombre").fill(identity.name);
  await page.getByLabel("Correo electrónico").fill(identity.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(identity.password);
  await page.getByLabel("Confirmar contraseña").fill(identity.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  const mail = await waitForEmail(identity.email, "Confirma tu cuenta");
  await page.goto(extractConfirmLink(mail.html));
  await expect(page).toHaveURL(/\/app/);
}

export async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app/);
}

export async function dismissOnboarding(page: Page) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Explorar por mi cuenta" }).click();
    await expect(dialog).toBeHidden();
  }
}

export async function deleteByEmail(email: string) {
  const admin = adminClient();
  const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (data) await admin.auth.admin.deleteUser(data.id);
}
