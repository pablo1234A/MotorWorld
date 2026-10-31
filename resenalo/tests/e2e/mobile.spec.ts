import { expect, test } from "@playwright/test";
import { activateSubscription, connectGmail, db, registerAndVerify } from "./helpers";
import { E2E_ENV } from "./env";

const shots = "tests/e2e/.artifacts/screens";

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "la página no debe tener scroll horizontal").toBeLessThanOrEqual(1);
}

test("20. funcionamiento en móvil: landing, registro, panel y secciones", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${shots}/movil-landing.png`, fullPage: true });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.getByRole("navigation", { name: "Móvil" }).getByText("Precios")).toBeVisible();
  await page.getByRole("navigation", { name: "Móvil" }).getByText("Precios").click();
  await expect(page.locator("#precios")).toBeInViewport();

  const email = `movil.${Date.now()}@negocio-e2e.es`;
  await registerAndVerify(page, request, { name: "Usuario Móvil", email, password: "ClaveMovil-2026" });
  await page.request.post("/api/v1/business", { data: { name: "Clínica Móvil", reviewUrl: "https://g.page/r/clinica-movil/review", acceptDpa: true }, headers: { origin: E2E_ENV.APP_URL } });
  const b = await db.business.findFirstOrThrow({ where: { owner: { email } } });
  await activateSubscription(request, b.id, "pro");
  await connectGmail(page, "onboarding");
  await page.getByRole("button", { name: "Ir a mi panel" }).click();
  await expect(page).toHaveURL(/\/app$/);

  for (const [path, title] of [
    ["/app", "Inicio"], ["/app/clientes", "Clientes"], ["/app/plantillas", "Plantillas de correo"], ["/app/automatizaciones", "Automatizaciones"],
    ["/app/envios", "Historial de envíos"], ["/app/estadisticas", "Estadísticas"], ["/app/conexion-correo", "Conexión de correo"],
    ["/app/facturacion", "Suscripción y facturación"], ["/app/perfil", "Perfil y seguridad"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${shots}/movil-${path.split("/").pop() || "app"}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL(/\/app\/clientes/);
});
