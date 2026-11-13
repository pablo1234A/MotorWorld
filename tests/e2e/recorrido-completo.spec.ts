import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminClient, deleteByEmail, newIdentity, registerThroughUi, resetRateLimits, setPlan } from "./helpers";

const user = newIdentity("recorrido");

test.beforeAll(resetRateLimits);
test.afterAll(async () => {
  await deleteByEmail(user.email);
  await resetRateLimits();
});

test("recorrido completo de un vendedor", async ({ page }) => {
  // 1. Accede a la web pública.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("anuncios que venden");
  await expect(page.getByRole("heading", { name: "Planes y precios" })).toBeVisible();
  await expect(page.getByText("12,99 €")).toBeVisible();

  // 2-3. Se registra y confirma el correo en el entorno de pruebas.
  await registerThroughUi(page, user);

  // 4-5. Llega al dashboard con la bienvenida y datos reales (vacíos).
  const onboarding = page.getByRole("dialog");
  await expect(onboarding).toContainText("Te damos la bienvenida");
  await onboarding.getByRole("button", { name: "Crear mi primer anuncio" }).click();
  await expect(page).toHaveURL(/\/app\/crear/);

  // 6. Crea un producto con atributos de su categoría.
  await page.getByLabel("Nombre del producto").fill("Bicicleta de montaña");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Bicicletas" });
  await page.getByLabel("Marca").fill("Orbea");
  await page.locator("#product-condition").selectOption("very_good");
  await page.getByLabel("Precio", { exact: true }).fill("420");
  await page.getByLabel("Tipo", { exact: true }).selectOption("Montaña");
  await page.getByLabel("Número de marchas").fill("12");
  await page.getByLabel("Descripción original").fill("Revisada en taller el mes pasado.");
  await page.getByLabel("Características").fill("Frenos de disco hidráulicos");
  await page.getByRole("button", { name: "Añadir característica" }).click();
  await page.getByLabel("Defectos o detalles a tener en cuenta").fill("Arañazo en la vaina trasera.");
  await page.getByRole("button", { name: "Guardar y generar anuncio" }).click();

  // 7. Se genera el anuncio automáticamente.
  const title = page.getByLabel("Título comercial");
  await expect(title).toHaveValue(/Bicicleta de montaña Orbea/);
  const description = page.getByLabel("Descripción completa");
  await expect(description).toHaveValue(/arañazo en la vaina trasera/i);
  await expect(description).toHaveValue(/frenos de disco hidráulicos/i);
  // Medidor de calidad en vivo: sin fotografías no llega a 100 y explica cómo mejorar.
  await expect(page.getByRole("region", { name: "Calidad del anuncio" })).toContainText("Al menos una fotografía");
  expect(Number(await page.getByTestId("quality-score").innerText())).toBeLessThan(100);

  // Ajuste rápido: cambiar el tono (consume una generación).
  await page.getByRole("button", { name: "Cambiar tono" }).click();
  await page.getByRole("menuitem", { name: "Cercano" }).click();
  await expect(description).toHaveValue(/[Vv]endo bicicleta de montaña Orbea/);

  // 8-9. Lo edita a mano y lo guarda.
  await title.fill("Bicicleta Orbea revisada, lista para rodar");
  await page.getByRole("button", { name: "Guardar anuncio" }).click();
  await expect(page).toHaveURL(/\/app\/anuncios\/[0-9a-f-]{36}/);
  await expect(page.getByText("Anuncio guardado").first()).toBeVisible();
  const listingUrl = page.url();

  // 10. Lo recupera desde «Mis anuncios».
  await page.getByRole("link", { name: "Mis anuncios" }).first().click();
  await page.getByRole("link", { name: "Bicicleta Orbea revisada, lista para rodar" }).click();
  await expect(page).toHaveURL(listingUrl);
  await expect(page.getByLabel("Título comercial")).toHaveValue("Bicicleta Orbea revisada, lista para rodar");

  // Historial de versiones disponible.
  await page.getByRole("button", { name: "Versiones" }).click();
  await expect(page.getByRole("dialog").getByText("v1")).toBeVisible();
  await page.keyboard.press("Escape");

  // El dashboard refleja datos reales.
  await page.goto("/app");
  await expect(page.getByText("Productos registrados").locator("..").locator("..")).toContainText("1");
  await expect(page.getByText(/2\s*\/\s*10/).first()).toBeVisible();

  // 11. Importa un CSV (la generación masiva requiere plan Pro: se asigna como haría un administrador).
  const { data: workspace } = await adminClient().from("workspaces").select("id, profiles!workspaces_owner_id_fkey(email)").eq("profiles.email", user.email).not("profiles", "is", null).single();
  await setPlan(workspace!.id, "pro");
  await page.goto("/app/masivo");
  const csv = ["nombre,precio,estado,sku,talla", "Chaqueta vaquera,25,Muy buen estado,CH-1,M", ",10,,CH-2,", "Botas de montaña,40,Buen estado,BO-1,42"].join("\n");
  await page.locator('input[type="file"]').setInputFiles({ name: "inventario.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("inventario.csv")).toBeVisible();
  await page.getByLabel("Destino de la columna talla").selectOption("attr:talla");
  await page.getByRole("button", { name: "Validar filas" }).click();
  await expect(page.getByText("Filas que no se importarán")).toBeVisible();
  await expect(page.getByText("Fila 3")).toBeVisible();

  // 12. Genera los anuncios masivos y sigue el progreso.
  await page.getByLabel("Plataforma o plantilla").selectOption("p:vinted");
  await page.getByRole("button", { name: /Confirmar y generar 2 anuncios/ }).click();
  await expect(page).toHaveURL(/\/app\/masivo\/[0-9a-f-]{36}/);
  await expect(page.getByText("Todos los anuncios se han generado")).toBeVisible();
  await expect(page.getByText("Completado").first()).toBeVisible();

  // 13. Exporta los resultados.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultados (CSV)" }).click();
  const file = await download;
  const content = await readFile((await file.path())!, "utf8");
  expect(content).toContain("Chaqueta vaquera");
  expect(content).toContain("completado");

  // 14. Cierra sesión.
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);

  // 15. Las rutas privadas quedan protegidas.
  for (const path of ["/app", "/app/productos", "/app/anuncios", "/app/masivo", "/app/cuenta"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
  await page.goto(listingUrl);
  await expect(page).toHaveURL(/\/login/);
});
