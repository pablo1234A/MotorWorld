import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";

test.skip(process.env.E2E_FULL === "1" || process.env.E2E_APP === "1", "Suite pública: se ejecuta sin servicios externos reales");

const PUBLIC_PAGES = [
  "/",
  "/como-funciona",
  "/precios",
  "/preguntas-frecuentes",
  "/contacto",
  "/generador-aviso-legal",
  "/politica-de-privacidad-autonomos",
  "/generador-politica-de-cookies",
  "/textos-legales-pagina-web",
  "/documentos-legales-tienda-online",
  "/agencias-y-gestorias",
  "/guias",
  "/guias/aviso-legal-que-es-y-que-debe-incluir",
  "/guias/politica-de-privacidad-que-debe-incluir",
  "/guias/politica-de-cookies-y-banner-de-consentimiento",
  "/guias/es-obligatorio-aviso-legal-privacidad-cookies",
  "/guias/textos-legales-tienda-online",
  "/guias/rgpd-para-autonomos",
  "/legal/aviso-legal",
  "/legal/privacidad",
  "/legal/cookies",
  "/legal/condiciones",
  "/acceder",
  "/registro",
  "/recuperar",
];

test.describe("Web pública", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} carga, tiene título y no desborda horizontalmente`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(/Legalito/);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expectAccessible(page);
    });
  }

  test("la portada explica la propuesta y muestra los planes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("textos legales");
    await expect(page.getByText("39,00 €").first()).toBeVisible();
    for (const price of ["5,99 €", "9,99 €", "19,99 €"]) await expect(page.getByText(price).first()).toBeVisible();
    await expect(page.getByText("Hasta 20 documentos al mes").first()).toBeVisible();
    await expect(page.getByText("Hasta 50 documentos al mes").first()).toBeVisible();
    await expect(page.getByText("Documentos ilimitados").first()).toBeVisible();
    await expect(page.getByText(/no es un despacho de abogados/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/cumplimiento legal garantizado/i);
    const cta = page.getByRole("link", { name: /Crear mis documentos/ }).first();
    await expect(cta).toHaveAttribute("href", "/registro");
  });

  test("las páginas legales propias muestran el aviso de borrador", async ({ page }) => {
    await page.goto("/legal/privacidad");
    await expect(page.getByText("Borrador pendiente de revisión jurídica")).toBeVisible();
  });

  async function structuredTypes(page: import("@playwright/test").Page) {
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    return blocks.flatMap((b) => {
      const data = JSON.parse(b);
      return (data["@graph"] ?? [data]).map((n: { "@type": string }) => n["@type"]);
    });
  }

  test("el FAQ publica datos estructurados", async ({ page }) => {
    await page.goto("/preguntas-frecuentes");
    const types = await structuredTypes(page);
    expect(types).toContain("FAQPage");
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
  });

  test("las guías publican artículo, migas y FAQ, y enlazan a la landing", async ({ page }) => {
    await page.goto("/guias/aviso-legal-que-es-y-que-debe-incluir");
    expect(await structuredTypes(page)).toEqual(expect.arrayContaining(["Article", "BreadcrumbList", "FAQPage"]));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/guias\/aviso-legal-que-es-y-que-debe-incluir$/);
    await expect(page.getByRole("navigation", { name: "Ruta de navegación" })).toBeVisible();
    await page.getByRole("navigation", { name: "En esta guía" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/#/);
    await page.getByRole("link", { name: "Generador de aviso legal" }).first().click();
    await expect(page).toHaveURL(/\/generador-aviso-legal$/);
    await expect(page.getByRole("heading", { name: "Guías relacionadas" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/cumplimiento legal garantizado/i);
  });

  test("la página de agencias explica el modelo y preselecciona la cuenta de agencia al registrarse", async ({ page }) => {
    await page.goto("/agencias-y-gestorias");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("webs de tus clientes");
    for (const price of ["5,99 €", "9,99 €", "19,99 €"]) await expect(page.getByText(price).first()).toBeVisible();
    await expect(page.getByText("Unos 16 clientes completos al mes")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/cumplimiento legal garantizado/i);
    await page.getByRole("link", { name: /Crear cuenta de agencia/ }).click();
    await expect(page).toHaveURL(/\/registro\?tipo=agencia/);
    await expect(page.getByRole("radio", { name: /Agencia o gestoría/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Mi negocio/ })).not.toBeChecked();
  });

  test("la portada enlaza a las guías y tiene URL canónica", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page).toHaveTitle(/Generador de aviso legal, política de privacidad y cookies/);
    await page.getByRole("link", { name: "Ver todas las guías" }).click();
    await expect(page).toHaveURL(/\/guias$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Guías");
  });

  test("sitemap y robots", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/generador-aviso-legal");
    expect(sitemap).toContain("/guias/rgpd-para-autonomos");
    expect(sitemap).toContain("/agencias-y-gestorias");
    expect(sitemap).toContain("<lastmod>");
    expect(sitemap).not.toContain("/panel");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//); // Entornos que no son producción no se indexan.
  });

  test("cabeceras de seguridad", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("Navegación móvil", () => {
  test("el menú se abre y navega", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Solo móvil");
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("navigation", { name: "Principal móvil" }).getByRole("link", { name: "Precios" }).click();
    await expect(page).toHaveURL(/\/precios$/);
    await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
  });
});

test.describe("Protección de zonas privadas", () => {
  for (const path of ["/panel", "/panel/documentos", "/admin", "/admin/plantillas"]) {
    test(`${path} redirige a acceder sin sesión`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/acceder\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
      await expect(page.getByRole("heading", { name: "Accede a tu cuenta" })).toBeVisible();
    });
  }

  test("la descarga de documentos exige sesión", async ({ request }) => {
    const res = await request.get("/api/documentos/22222222-2222-2222-2222-222222222222/descargar?formato=pdf", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("el webhook de Stripe rechaza peticiones sin firma", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
    expect(res.status()).toBe(400);
  });

  test("la analítica rechaza eventos no permitidos", async ({ request }) => {
    const res = await request.post("/api/analytics", { data: { name: "drop_table" }, headers: { "user-agent": "Mozilla/5.0" } });
    expect([400, 204]).toContain(res.status());
  });
});

test.describe("Formularios con validación en servidor", () => {
  test("registro: exige contraseña robusta y aceptar condiciones", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Nombre").fill("Prueba");
    await page.getByRole("textbox", { name: "Email" }).fill("prueba@example.com");
    await page.locator("#password").fill("corta");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("La contraseña debe tener al menos 10 caracteres.")).toBeVisible();
    await expect(page.getByText("Debes aceptar las condiciones y la política de privacidad.")).toBeVisible();
  });

  test("contacto: muestra errores por campo", async ({ page }) => {
    await page.goto("/contacto");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(page.getByText("Indica tu nombre.")).toBeVisible();
    await expect(page.getByText("Introduce un email válido.")).toBeVisible();
  });

  test("recuperación: no revela si el email existe", async ({ page }) => {
    await page.goto("/recuperar");
    await page.getByLabel("Email de tu cuenta").fill("no-existe@example.com");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    // Sin servicio de autenticación alcanzable, la respuesta sigue sin revelar información de cuentas.
    await expect(page.getByText("Si existe una cuenta con ese email, recibirás un enlace")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/no existe ninguna cuenta/i);
  });
});
