import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Recorrido completo del cliente contra servicios REALES en modo de pruebas.
 * Requiere (ver docs/TESTING.md):
 *   E2E_FULL=1, E2E_BASE_URL (despliegue de staging o `next start` con .env de pruebas),
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (proyecto Supabase de pruebas),
 *   Stripe en modo test con los precios configurados y el webhook apuntando al entorno,
 *   ALLOW_DEMO_TEMPLATES=true o plantillas publicadas.
 * El usuario se crea ya verificado mediante la API de administración de Supabase,
 * que sustituye al clic en el email de verificación.
 */
test.skip(process.env.E2E_FULL !== "1", "Requiere E2E_FULL=1 y servicios de prueba configurados");
test.describe.configure({ mode: "serial" });

const email = `e2e+${Date.now()}@example.com`;
const password = "PruebaSegura2026";

test("registro → formulario → vista previa → pago de prueba → descarga → regeneración → portal", async ({ page, request }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Prueba E2E" } });
  expect(error).toBeNull();

  // 1-3. Acceso
  await page.goto("/acceder");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Acceder" }).click();
  await expect(page).toHaveURL(/\/panel$/);

  // 4. Formulario (autónomo sin recogida de datos)
  await page.goto("/panel/generador");
  await page.getByText("Autónomo o freelance").click();
  await page.getByText("Una persona física").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Nombre y apellidos del titular").fill("Lucía Ejemplo Pérez");
  await page.getByLabel("NIF o NIE").fill("12345678Z");
  await page.getByLabel("Domicilio").fill("Avenida Ficticia 3");
  await page.getByLabel("Código postal").fill("46001");
  await page.getByLabel("Municipio").fill("Valencia");
  await page.getByLabel("Provincia").fill("Valencia");
  await page.getByRole("group", { name: "¿Ejerces una profesión regulada?" }).getByText("No").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Email de contacto público").fill("lucia@example.com");
  await page.getByLabel("Dirección de tu página web").fill("https://lucia.example");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("Describe brevemente tu actividad").fill("Ilustración editorial.");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByText("No recojo datos personales").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByText("Plausible").click();
  await page.getByText("No uso publicidad ni píxeles").click();
  await page.getByRole("group", { name: /contenido o servicios de terceros/ }).getByText("Ninguno").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByLabel("¿Dónde está alojada tu web?").fill("Netlify");
  await page.getByLabel("¿Qué servicio de correo electrónico usas?").selectOption("hosting");
  await page.getByRole("button", { name: "Revisar mis respuestas" }).click();

  // 5. Vista previa
  await expect(page).toHaveURL(/\/panel\/generador\/revision/);
  await expect(page.locator(".legal-prose").first()).toContainText("Lucía Ejemplo Pérez");

  // Sin pago no hay documentos que descargar.
  await page.goto("/panel/documentos");
  await expect(page.getByText("Todavía no has generado documentos")).toBeVisible();

  // 6. Compra de prueba
  await page.goto("/panel/precompra");
  await page.getByText("Pago único").first().click();
  await page.getByLabel(/Acepto las condiciones/).check();
  await page.getByLabel(/Solicito el acceso inmediato/).check();
  await page.getByRole("button", { name: "Continuar al pago" }).click();
  await page.waitForURL(/checkout\.stripe\.com/);
  await page.getByLabel(/Card number|Número de tarjeta/i).fill("4242424242424242");
  await page.getByLabel(/Expiration|Caducidad/i).fill("12 / 34");
  await page.getByLabel(/CVC/i).fill("123");
  await page.getByLabel(/Cardholder name|Nombre del titular/i).fill("Prueba E2E");
  await page.getByRole("button", { name: /Pagar|Pay/ }).click();

  // 7-8. Verificación del pago y generación
  await page.waitForURL(/\/panel\/compra\/confirmacion/, { timeout: 60_000 });
  await expect(page.getByText("Pago confirmado")).toBeVisible({ timeout: 60_000 });
  await page.goto("/panel/documentos");
  await expect(page.getByRole("heading", { name: "Aviso legal" })).toBeVisible();

  // 9. Descarga privada
  const href = await page.getByRole("link", { name: "Descargar PDF" }).first().getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  // Otro visitante sin sesión no puede descargar el mismo documento.
  expect((await request.get(href!, { maxRedirects: 0 })).status()).toBe(401);

  // 10-12. Historial, cambio de datos y regeneración
  await page.getByRole("link", { name: /Historial/ }).first().click();
  await expect(page.getByText("v1")).toBeVisible();
  await page.goto("/panel/documentos");
  await page.getByRole("button", { name: "Regenerar ahora" }).click();
  await expect(page.getByText("Documentos generados")).toBeVisible();

  // 13. Portal de cliente
  await page.goto("/panel/suscripcion");
  await page.getByRole("button", { name: /Abrir portal de facturación/ }).click();
  await page.waitForURL(/billing\.stripe\.com/);
});
