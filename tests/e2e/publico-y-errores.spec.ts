import { expect, test } from "@playwright/test";
import { resetRateLimits } from "./helpers";

test.beforeAll(resetRateLimits);

test("páginas públicas y legales", async ({ page }) => {
  for (const [path, heading] of [
    ["/como-funciona", "Cómo funciona AnunciaPro"],
    ["/precios", "Precios sencillos"],
    ["/contacto", "Contacto"],
    ["/legal/privacidad", "Política de privacidad"],
    ["/legal/condiciones", "Condiciones de uso"],
    ["/legal/cookies", "Política de cookies"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  await page.goto("/legal/privacidad");
  await expect(page.getByText("Borrador pendiente de revisión jurídica")).toBeVisible();
  await page.goto("/precios");
  await expect(page.getByText("Planes de pago todavía no disponibles")).toBeVisible();
});

test("formulario de contacto con validación y envío real", async ({ page }) => {
  await page.goto("/contacto");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText("Introduce tu nombre")).toBeVisible();
  await page.getByLabel("Nombre").fill("Visitante de prueba");
  await page.getByLabel("Correo electrónico").fill("visitante@pruebas.anunciapro.test");
  await page.getByLabel("Asunto").fill("Consulta E2E");
  await page.getByLabel("Mensaje").fill("Mensaje enviado desde la prueba automática.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText("Mensaje enviado")).toBeVisible();
});

test("errores de inicio de sesión y validación del registro", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("nadie@pruebas.anunciapro.test");
  await page.getByLabel("Contraseña").fill("incorrecta1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" })).toBeVisible();

  await page.goto("/registro");
  await page.getByLabel("Contraseña", { exact: true }).fill("corta");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("La contraseña debe tener al menos 8 caracteres")).toBeVisible();
  await expect(page.getByText("Debes aceptar las condiciones")).toBeVisible();
});

test("página 404", async ({ page }) => {
  const response = await page.goto("/no-existe-esta-ruta");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Esta página no existe")).toBeVisible();
});
