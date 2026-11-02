import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const shots = process.env.E2E_SCREENSHOTS || "";
const fx = (f: string) => path.join(__dirname, "fixtures", f);
const email = `e2e-${Date.now()}@example.com`;
const password = "Estudio2025x";

async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && !m.text().includes("Failed to load resource") && errors.push(m.text()));
  return errors;
}

test.describe.serial("Estudio", () => {
  let page: Page;
  let errors: string[];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    errors = trackErrors(page);
  });

  test("registro e inicio", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await snap(page, "01-login");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await page.getByLabel("Nombre").fill("Directora E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("¿Qué vamos a")).toBeVisible();
    await snap(page, "02-home");
  });

  test("todas las secciones cargan", async () => {
    const sections: [string, RegExp][] = [
      ["/create/image", /Crear\s+imágenes/], ["/create/video", /Crear\s+vídeos/], ["/create/film", /Estudio de\s+producción/],
      ["/edit/image", /Editor de\s+imágenes/], ["/edit/video", /Editor de\s+vídeos/], ["/studio", /Sonido, montaje/],
      ["/models", /Modelos\s+y proveedores/], ["/library", /Tu\s+biblioteca/], ["/projects", /Tus\s+proyectos/],
      ["/history", /Historial de/], ["/favorites", /de tu trabajo/], ["/settings", /Configuración/], ["/help", /ayudamos/],
    ];
    for (const [url, heading] of sections) {
      await page.goto(url);
      await expect(page.locator("h1").first()).toHaveText(heading);
      await snap(page, `10-${url.replaceAll("/", "_")}`);
    }
    await page.goto("/models?tab=providers");
    await expect(page.getByTestId("provider-local")).toContainText("activo");
    await expect(page.getByTestId("provider-replicate")).toContainText("necesita API key");
    await snap(page, "11-providers");
  });

  test("crear imagen: modelos sin clave quedan bloqueados con explicación", async () => {
    await page.goto("/create/image");
    await page.getByTestId("model-picker").click();
    await expect(page.getByText("falta clave").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("prompt").fill("Un deportivo rojo en el desierto al anochecer");
    await expect(page.getByTestId("generate")).toBeDisabled();
    await expect(page.getByText(/necesita un proveedor configurado/)).toBeVisible();
  });

  test("editor de imagen: subir, planificar con instrucción y ejecutar (local)", async () => {
    await page.goto("/edit/image");
    await page.getByTestId("file-input").setInputFiles(fx("photo.png"));
    await expect(page.getByText("Historial de modificaciones")).toBeVisible();
    await page.getByTestId("instruction").fill("Pásala a blanco y negro");
    await page.getByTestId("plan").click();
    await expect(page.getByText("Ajustes locales")).toBeVisible();
    await snap(page, "20-image-plan");
    await page.getByTestId("run-plan").click();
    await expect(page.getByText("ANTES")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("v1")).toBeVisible();
    await snap(page, "21-image-before-after");
  });

  test("editor de vídeo: herramientas FFmpeg", async () => {
    await page.goto("/edit/video");
    await page.getByTestId("file-input").setInputFiles(fx("clip.mp4"));
    await page.getByRole("tab", { name: "Herramientas" }).click();
    await page.getByRole("button", { name: "cinematic" }).click();
    await page.getByText("Cinemascope").click();
    await page.getByRole("button", { name: "Procesar con FFmpeg" }).click();
    await expect(page.getByText("Versiones de esta sesión")).toBeVisible({ timeout: 90_000 });
    await snap(page, "30-video-tools");
    await page.getByRole("tab", { name: "Con instrucciones" }).click();
    await page.getByTestId("instruction").fill("ponlo en cámara lenta y formato vertical para reels");
    await page.getByTestId("plan").click();
    await expect(page.getByText(/Operaciones FFmpeg: slow_motion, reframe/)).toBeVisible();
    await snap(page, "31-video-plan");
  });

  test("montaje: crear línea temporal, añadir clip y renderizar", async () => {
    await page.goto("/studio?tab=montage");
    await page.getByPlaceholder("Spot 30 s · versión 1").fill("Montaje E2E");
    await page.getByRole("button", { name: "Crear línea temporal" }).click();
    await expect(page).toHaveURL(/\/studio\/timeline\//);
    await page.getByRole("button", { name: "Añadir clip" }).first().click();
    await page.getByRole("dialog").locator("button.aspect-square").first().click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Montaje guardado")).toBeVisible();
    await page.getByRole("button", { name: "Renderizar" }).click();
    await expect(page.getByText("Último render (FFmpeg)")).toBeVisible({ timeout: 120_000 });
    await snap(page, "40-timeline");
  });

  test("película: crear producción y escribir storyboard a mano", async () => {
    await page.goto("/create/film");
    await page.getByRole("button", { name: "Nueva producción" }).click();
    await expect(page).toHaveURL(/\/create\/film\//);
    await page.getByRole("tab", { name: /Personajes/ }).click();
    await page.getByRole("button", { name: "Añadir personaje" }).click();
    await page.getByRole("tab", { name: /Storyboard/ }).click();
    await page.getByRole("button", { name: "Añadir escena" }).click();
    await page.getByRole("button", { name: "Plano", exact: true }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();
    await snap(page, "50-film-storyboard");
    await page.getByRole("tab", { name: /Guion/ }).click();
    await page.getByTestId("film-idea").fill("Una piloto veterana corre su última carrera al amanecer");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Desarrollar argumento/ }).click();
    await expect(page.getByText(/configura un LLM/i).first()).toBeVisible();
  });

  test("historial y biblioteca reflejan el trabajo real", async () => {
    await page.goto("/history");
    await expect(page.getByText("Completado").first()).toBeVisible();
    await snap(page, "60-history");
    await page.goto("/library");
    await expect(page.locator("button.aspect-square").first()).toBeVisible();
    await page.locator("button.aspect-square").first().click();
    await expect(page.getByRole("link", { name: "Descargar" })).toBeVisible();
    await snap(page, "61-library-detail");
  });

  test("sin errores de consola", async () => {
    expect(errors).toEqual([]);
  });
});

test("@mobile la navegación funciona en móvil", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Email").fill(`m-${email}`);
  await page.getByLabel("Contraseña").fill(password);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("¿Qué vamos a")).toBeVisible();
  await snap(page, "70-mobile-home");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Crear vídeos" }).click();
  await expect(page.locator("h1").first()).toHaveText(/Crear\s+vídeos/);
  await snap(page, "71-mobile-video");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
