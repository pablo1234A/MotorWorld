import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { expectAccessible } from "./a11y";

/**
 * Área privada de extremo a extremo con el backend de pruebas
 * (LEGALITO_TEST_BACKEND=1, ver docs/TESTING.md): servidor Next real,
 * PostgreSQL real con RLS, navegador real. Stripe no interviene: el pago se
 * registra en la base de datos como lo haría el webhook.
 */
test.skip(process.env.E2E_APP !== "1", "Requiere el servidor con backend de pruebas (E2E_APP=1)");
test.describe.configure({ mode: "serial" });

const PASSWORD = "Legalito-QA-2026";
const SHOTS = process.env.E2E_SCREENSHOTS_DIR;
const db = new pg.Pool({ connectionString: process.env.TEST_BACKEND_DATABASE_URL });

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png`, fullPage: true });
}

async function login(page: Page, email: string) {
  await page.goto("/acceder");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Acceder" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

async function choose(page: Page, question: RegExp | string, option: string) {
  await page.getByRole("group", { name: question }).getByText(option, { exact: true }).click();
}

const next = (page: Page) => page.getByRole("button", { name: "Siguiente" }).click();

test.afterAll(async () => {
  await db.end();
});

test("credenciales incorrectas muestran un error claro", async ({ page }) => {
  await page.goto("/acceder");
  await page.getByRole("textbox", { name: "Email" }).fill("cliente@legalito.test");
  await page.locator("#password").fill("incorrecta");
  await page.getByRole("button", { name: "Acceder" }).click();
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
});

test("recorrido del cliente: formulario, vista previa, compra, generación y descarga", async ({ page, isMobile }) => {
  const email = isMobile ? "suscriptora@legalito.test" : "cliente@legalito.test";
  await login(page, email);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola");
  await shot(page, "01-dashboard-vacio");

  // Formulario
  await page.getByRole("link", { name: /Empezar|Continuar formulario/ }).first().click();
  await expect(page).toHaveURL(/\/panel\/generador$/);
  await choose(page, "¿Qué tipo de negocio tienes?", "Tienda online");
  await choose(page, "¿Quién es el titular de la web?", "Una sociedad o entidad");
  await shot(page, "02-formulario-paso1");
  await next(page);

  // Validación del paso antes de avanzar
  await next(page);
  await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();
  await page.getByLabel("Razón social").fill("Cerámicas Ficticias S.L.");
  await page.getByLabel("Nombre comercial").fill("Barro & Co");
  await page.getByLabel("NIF de la entidad").fill("B12345675");
  await page.getByLabel("Domicilio").fill("Calle Inventada 12");
  await page.getByLabel("Código postal").fill("28013");
  await page.getByLabel("Municipio").fill("Madrid");
  await page.getByLabel("Provincia").fill("Madrid");
  await page.getByLabel("Datos de inscripción registral").fill("Registro Mercantil de Madrid, Tomo 1, Folio 1, Hoja M-1");
  await next(page);
  await expect(page.getByText(/El NIF de la entidad no es válido/)).toBeVisible();
  await page.getByLabel("NIF de la entidad").fill("B12345674");
  await shot(page, "03-formulario-titular");
  await next(page);

  await page.getByLabel("Email de contacto público").fill("hola@barro.example");
  await page.getByLabel("Dirección de tu página web").fill("barro.example");
  await next(page);
  await page.getByLabel("Describe brevemente tu actividad").fill("Venta online de cerámica artesanal.");
  await choose(page, "¿A quién vendes?", "A consumidores particulares");
  await choose(page, "¿Envías productos físicos?", "Sí");
  await next(page);

  await page.getByRole("group", { name: /recoges datos personales/ }).getByText("Formulario de contacto o email", { exact: true }).click();
  await page.getByRole("group", { name: /recoges datos personales/ }).getByText("Pedidos o compras", { exact: true }).click();
  await choose(page, /categorías especiales/, "No");
  await choose(page, /menores de 14 años/, "No");
  await choose(page, /Delegado de Protección de Datos/, "No");
  await next(page);

  await choose(page, "¿Usas alguna herramienta de analítica web?", "Google Analytics");
  await page.getByRole("group", { name: /publicidad o píxeles/ }).getByText("No uso publicidad ni píxeles", { exact: true }).click();
  await page.getByRole("group", { name: /contenido o servicios de terceros/ }).getByText("Ninguno", { exact: true }).click();
  await choose(page, /banner o gestor de consentimiento/, "No");
  await expect(page.getByText(/La política de cookies no basta/)).toBeVisible();
  await shot(page, "04-formulario-cookies");
  await next(page);

  await page.getByLabel("¿Dónde está alojada tu web?").fill("Raiola Networks");
  await page.getByLabel("¿Qué servicio de correo electrónico usas?").selectOption("google_workspace");
  await page.getByRole("group", { name: /pasarelas de pago/ }).getByText("Stripe", { exact: true }).click();
  await page.getByLabel("¿Con qué empresas de transporte envías?").fill("Correos");

  // Autoguardado: recargar conserva las respuestas.
  await expect(page.getByText("Guardado")).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel("¿Dónde está alojada tu web?")).toHaveValue("Raiola Networks");
  await page.getByRole("button", { name: "Revisar mis respuestas" }).click();

  // Revisión y vista previa
  await expect(page).toHaveURL(/\/panel\/generador\/revision/);
  await expect(page.locator(".legal-prose").first()).toContainText("Cerámicas Ficticias S.L.");
  await expect(page.getByText("Instala un sistema de gestión del consentimiento")).toBeVisible();
  await expect(page.getByText("Necesitas condiciones generales de contratación")).toBeVisible();
  await shot(page, "05-revision");

  // Editar un paso concreto desde la revisión abre el formulario en ese paso.
  await page.getByRole("button", { name: "Editar Servicios externos" }).click();
  await expect(page).toHaveURL(/\/panel\/generador\?paso=servicios/);
  await expect(page.getByRole("heading", { name: "Servicios externos" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar mis respuestas" }).click();
  await expect(page).toHaveURL(/\/panel\/generador\/revision/);

  // Sin pago: no hay documentos.
  await page.goto("/panel/documentos");
  await expect(page.getByText("Todavía no has generado documentos")).toBeVisible();
  await shot(page, "06-documentos-vacio");

  await page.goto("/panel/precompra");
  await expect(page.getByRole("button", { name: "Continuar al pago" })).toBeVisible();
  for (const plan of ["Básico", "Medium", "Business", "Pago único"]) await expect(page.getByText(plan, { exact: true }).first()).toBeVisible();
  await shot(page, "07-precompra");

  // Pago registrado como lo haría el webhook de Stripe.
  const org = (await db.query("select o.id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1", [email])).rows[0].id;
  const product = (await db.query("select id from public.products where code = 'one_time_pack'")).rows[0].id;
  const pay = await db.query(
    "insert into public.payments (organization_id, product_id, kind, status, amount_cents, currency, paid_at) values ($1, $2, 'one_time', 'succeeded', 3900, 'eur', now()) returning id",
    [org, product],
  );
  await db.query("insert into public.purchases (organization_id, product_id, payment_id, document_types, generations_limit) values ($1, $2, $3, array['aviso_legal','privacidad','cookies'], 3)", [
    org,
    product,
    pay.rows[0].id,
  ]);

  await page.goto("/panel/generador/revision");
  await page.getByRole("button", { name: "Generar mis documentos" }).click();
  await expect(page).toHaveURL(/\/panel\/documentos\?generado=1/, { timeout: 30_000 });
  await expect(page.getByText("Documentos generados")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aviso legal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de cookies" })).toBeVisible();
  await shot(page, "08-documentos");

  const href = await page.getByRole("link", { name: "Descargar PDF" }).first().getAttribute("href");
  const res = await page.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toContain("https://storage.test/documents/");

  // Copiar el código HTML para pegarlo en la web
  const versionId = href!.split("/")[3];
  const fragment = await page.request.get(`/api/documentos/${versionId}/fragmento`);
  expect(fragment.status()).toBe(200);
  expect(await fragment.text()).toMatch(/^<article class="legalito-doc"/);
  await expect(page.getByRole("button", { name: "Copiar código HTML" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo publicarlos en tu web" })).toBeVisible();

  await page.getByRole("link", { name: /Historial/ }).first().click();
  await expect(page.getByRole("heading", { name: "Estado de revisión" })).toBeVisible();
  await shot(page, "09-historial");

  await page.goto("/panel");
  await expect(page.getByText("Tus documentos están listos")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tu progreso" })).toContainText("4 de 5");
  await shot(page, "10-dashboard");
});

test("suscripción Básico: generación, cupo mensual y regeneración de un documento", async ({ page, isMobile }) => {
  await login(page, isMobile ? "plan-mobile@legalito.test" : "plan-desktop@legalito.test");
  await expect(page.getByText("Plan Básico")).toBeVisible();
  await page.goto("/panel/generador/revision");
  await page.getByRole("button", { name: "Generar mis documentos" }).click();
  await expect(page).toHaveURL(/\/panel\/documentos\?generado=1/, { timeout: 30_000 });
  await expect(page.getByText("3 de 20")).toBeVisible();
  await page.getByRole("button", { name: "Regenerar", exact: true }).first().click();
  await expect(page.getByText("4 de 20")).toBeVisible({ timeout: 20_000 });
  await shot(page, "14-documentos-suscripcion");
  await page.goto("/panel/suscripcion");
  await expect(page.getByText("4 de 20")).toBeVisible();
  await expect(page.getByRole("button", { name: /Cambiar de plan o gestionar/ })).toBeVisible();
  await shot(page, "15-suscripcion-plan");
});

test("agencia: clientes, formulario propio, generación con cupo compartido y archivo", async ({ page, isMobile }) => {
  const email = isMobile ? "agencia-mobile@legalito.test" : "agencia-desktop@legalito.test";
  await login(page, email);
  await expect(page.getByText("Añade tu primer cliente")).toBeVisible();
  await expect(page.getByLabel("Trabajando en")).toBeVisible();

  // Alta de un cliente: se crea y se abre su formulario.
  await page.goto("/panel/clientes");
  await expect(page.getByRole("heading", { name: "Clientes", level: 1 })).toBeVisible();
  await page.getByLabel(/Nombre del cliente/).fill("Panadería Sol");
  await page.getByLabel(/Notas internas/).fill("WordPress");
  await page.getByRole("button", { name: /Añadir y rellenar su formulario/ }).click();
  await expect(page).toHaveURL(/\/panel\/generador\?cliente=nuevo/);
  await expect(page.getByRole("heading", { name: "Formulario de Panadería Sol" })).toBeVisible();
  await expect(page.getByLabel("Trabajando en el cliente")).toHaveValue(/[0-9a-f-]{36}/);
  await shot(page, "16-agencia-formulario-cliente");

  // El formulario del cliente se completa (el asistente ya se prueba en otro recorrido).
  const client = (
    await db.query(
      "select o.id, o.owner_id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1 and o.client_name = 'Panadería Sol'",
      [email],
    )
  ).rows[0];
  const answers = (await import("../../src/lib/documents/samples")).freelancerAnswers;
  await db.query("delete from public.form_responses where organization_id = $1", [client.id]);
  await db.query(
    "insert into public.form_responses (organization_id, created_by, questionnaire_version, answers, status, completed_at) values ($1, $2, 1, $3, 'completed', now())",
    [client.id, client.owner_id, JSON.stringify(answers)],
  );
  await page.goto("/panel/generador/revision");
  await page.getByRole("button", { name: "Generar mis documentos" }).click();
  await expect(page).toHaveURL(/\/panel\/documentos\?generado=1/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Documentos de Panadería Sol" })).toBeVisible();
  await expect(page.getByText("3 · ilimitados")).toBeVisible();
  await shot(page, "17-agencia-documentos-cliente");

  // Segundo cliente: sus documentos están vacíos y el cupo es el mismo.
  await page.goto("/panel/clientes");
  await page.getByLabel(/Nombre del cliente/).fill("Clínica Mar");
  await page.getByRole("button", { name: /Añadir y rellenar su formulario/ }).click();
  await expect(page.getByRole("heading", { name: "Formulario de Clínica Mar" })).toBeVisible();
  await page.goto("/panel/documentos");
  await expect(page.getByRole("heading", { name: "Documentos de Clínica Mar" })).toBeVisible();
  await expect(page.getByText("Panadería Sol")).toHaveCount(1); // solo en el selector

  // Cambio de cliente desde el selector.
  await page.getByLabel("Trabajando en el cliente").selectOption({ label: "Panadería Sol" });
  await expect(page.getByRole("heading", { name: "Documentos de Panadería Sol" })).toBeVisible();

  // Listado: estados y archivo.
  await page.goto("/panel/clientes");
  await expect(page.getByText("Documentos generados").first()).toBeVisible();
  await shot(page, "18-agencia-clientes");
  const row = page.getByRole("listitem").filter({ hasText: "Clínica Mar" }).first();
  await row.getByText("Editar", { exact: true }).click();
  await row.getByRole("button", { name: "Archivar cliente" }).click();
  await expect(page.getByText(/Cliente archivado/)).toBeVisible();
  await expect(page.getByText("Clientes archivados (1)")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Trabajando en/ }).locator("option", { hasText: "Clínica Mar" })).toHaveCount(0);

  // La facturación es la de la agencia.
  await page.goto("/panel/suscripcion");
  await expect(page.getByText("Agencia", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("3 · ilimitados").first()).toBeVisible();
});

test("banner de cookies: categorías del formulario y consentimiento real en el navegador", async ({ page, isMobile, baseURL }) => {
  const email = isMobile ? "agencia-mobile@legalito.test" : "agencia-desktop@legalito.test";
  const client = (
    await db.query("select o.id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1 and o.client_name = 'Panadería Sol'", [email])
  ).rows[0];
  const shop = (await import("../../src/lib/documents/samples")).shopAnswers;
  await db.query("update public.form_responses set answers = $2 where organization_id = $1 and status = 'completed'", [client.id, JSON.stringify(shop)]);
  await login(page, email);
  await page.context().addCookies([{ name: "lg_cuenta", value: client.id, url: baseURL! }]);
  await page.goto("/panel/banner-cookies");
  await expect(page.getByRole("heading", { name: "Banner de cookies", level: 1 })).toBeVisible();
  await expect(page.getByText("Publicidad", { exact: true })).toBeVisible();
  await expect(page.getByText(/ya usas/)).toBeVisible(); // indicó que tiene una herramienta de consentimiento
  await expect(page.getByLabel(/Código para pegar/)).toHaveValue(/data-cookie-settings/);
  await shot(page, "19-banner-cookies");

  await page.goto("/panel/banner-cookies/vista-previa?color=%230F766E&pos=box");
  const banner = page.getByRole("region", { name: "Consentimiento de cookies" });
  await expect(banner).toBeVisible();
  await expect(page.locator("#estado-analitica")).toHaveText("Bloqueado");
  await expectAccessible(page);

  // Rechazar: nada se activa y la elección se recuerda.
  await banner.getByRole("button", { name: "Rechazar" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: "Consentimiento de cookies" })).toHaveCount(0);
  await expect(page.locator("#estado-analitica")).toHaveText("Bloqueado");

  // Configurar: aceptar solo analítica.
  await page.getByRole("link", { name: "Configurar cookies" }).click();
  const dialog = page.getByRole("dialog", { name: "Configuración de cookies" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Analítica").check();
  await dialog.getByRole("button", { name: "Guardar selección" }).click();
  await expect(page.locator("#estado-analitica")).toHaveText("Activado");
  await expect(page.locator("#estado-publicitaria")).toHaveText("Bloqueado");

  // Retirar el consentimiento recarga la página sin activar la analítica.
  await page.getByRole("link", { name: "Configurar cookies" }).click();
  await page.getByRole("dialog").getByLabel("Analítica").uncheck();
  await Promise.all([page.waitForEvent("load"), page.getByRole("dialog").getByRole("button", { name: "Guardar selección" }).click()]);
  await expect(page.locator("#estado-analitica")).toHaveText("Bloqueado");
});

test("aislamiento de agencias: la cookie de cliente no da acceso a cuentas ajenas", async ({ page, isMobile, baseURL }) => {
  const agency = isMobile ? "agencia-mobile@legalito.test" : "agencia-desktop@legalito.test";
  const other = isMobile ? "suscriptora@legalito.test" : "cliente@legalito.test";
  const client = (
    await db.query(
      "select o.id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1 and o.client_name = 'Panadería Sol'",
      [agency],
    )
  ).rows[0];
  const version = (await db.query("select id from public.document_versions where organization_id = $1 limit 1", [client.id])).rows[0];
  await login(page, other);
  await page.context().addCookies([{ name: "lg_cuenta", value: client.id, url: baseURL! }]);
  await page.goto("/panel/documentos");
  await expect(page.getByRole("heading", { name: "Mis documentos" })).toBeVisible();
  await expect(page.getByText("Panadería Sol")).toHaveCount(0);
  const dl = await page.request.get(`/api/documentos/${version.id}/descargar?formato=pdf`, { maxRedirects: 0 });
  expect(dl.status()).toBe(404);
  await page.goto("/panel/clientes");
  await expect(page.getByRole("button", { name: "Activar modo agencia" })).toBeVisible();
});

test("mis datos, suscripción y ayuda", async ({ page, isMobile }) => {
  await login(page, isMobile ? "suscriptora@legalito.test" : "cliente@legalito.test");
  await page.goto("/panel/datos");
  await page.getByLabel("Teléfono").fill("+34 910 000 000");
  await page.getByRole("button", { name: "Guardar datos del negocio" }).click();
  await expect(page.getByText(/Datos guardados/)).toBeVisible();
  await shot(page, "11-datos");

  await page.goto("/panel/suscripcion");
  await expect(page.getByRole("heading", { name: "Historial de pagos" })).toBeVisible();
  await expect(page.getByText("39,00 €").first()).toBeVisible();
  await shot(page, "12-suscripcion");

  await page.goto("/panel/banner-cookies");
  await expect(page.getByText("Incluido en las suscripciones")).toBeVisible(); // pago único: sin banner

  await page.goto("/panel/ayuda");
  await page.getByLabel("Asunto").fill("Duda sobre cookies");
  await page.getByLabel("Mensaje").fill("¿Debo añadir las cookies de mi plataforma de reservas?");
  await page.getByText(/He leído la/).click();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByText(/Mensaje enviado/)).toBeVisible();
  await shot(page, "13-ayuda");
});

test("aislamiento: un cliente no accede a documentos ni administración ajenos", async ({ page, isMobile }) => {
  const owner = isMobile ? "suscriptora@legalito.test" : "cliente@legalito.test";
  const other = isMobile ? "cliente@legalito.test" : "suscriptora@legalito.test";
  const v = await db.query(
    "select dv.id, dv.document_id from public.document_versions dv join public.organizations o on o.id = dv.organization_id join auth.users u on u.id = o.owner_id where u.email = $1 limit 1",
    [owner],
  );
  await login(page, other);
  const dl = await page.request.get(`/api/documentos/${v.rows[0].id}/descargar?formato=pdf`, { maxRedirects: 0 });
  expect(dl.status()).toBe(404);
  await page.goto(`/panel/documentos/${v.rows[0].document_id}`);
  await expect(page.getByRole("heading", { name: /No encontramos esta página/ })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /No encontramos esta página/ })).toBeVisible();
});

test("administración: todas las secciones cargan", async ({ page }) => {
  await login(page, "admin@legalito.test");
  const sections = [
    ["/admin", "Métricas"],
    ["/admin/usuarios", "Clientes"],
    ["/admin/suscripciones", "Suscripciones"],
    ["/admin/pagos", "Pagos e incidencias"],
    ["/admin/documentos", "Documentos generados"],
    ["/admin/plantillas", "Plantillas"],
    ["/admin/productos", "Planes"],
    ["/admin/actualizaciones", "Actualizaciones legales"],
    ["/admin/avisos", "Avisos"],
    ["/admin/faq", "Preguntas frecuentes"],
    ["/admin/soporte", "Soporte"],
    ["/admin/errores", "Errores"],
    ["/admin/auditoria", "Auditoría"],
  ];
  for (const [path, title] of sections) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/No se pudieron cargar|Application error/)).toHaveCount(0);
    await shot(page, `20-admin${path.replace(/\//g, "-")}`);
  }
  await page.goto("/admin/plantillas");
  await page.getByRole("link", { name: "Aviso legal" }).click();
  await page.getByRole("link", { name: /v0\.1\.0-demo/ }).click();
  await expect(page.getByText("Vista previa con datos ficticios")).toBeVisible();
  await shot(page, "21-admin-plantilla");
});
