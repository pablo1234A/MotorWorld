import { expect, test } from "@playwright/test";
import { activateSubscription, connectGmail, db, linkIn, mockState, registerAndVerify, setMockMode, waitForMail } from "./helpers";
import { E2E_ENV } from "./env";

/**
 * Recorrido completo de un negocio en la app de producción (next start) con el
 * worker real procesando la cola. Gmail se sustituye SOLO en el borde HTTP por
 * un servidor local que reproduce su API (tests/e2e/mock-services.ts).
 */
test.describe.serial("recorrido completo de un negocio", () => {
  const email = `duena.${Date.now()}@peluqueria-e2e.es`;
  const password = "ClaveE2E-2026x";
  let businessId = "";

  test("1-3. registro, verificación, cierre e inicio de sesión", async ({ page, request }) => {
    await registerAndVerify(page, request, { name: "Marta Peluquera", email, password });
    // Cierra sesión y vuelve a entrar: la cuenta persiste
    await page.context().clearCookies();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("5-6. onboarding: negocio, plan (webhook Stripe), conexión Gmail OAuth", async ({ page, request }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel("Nombre comercial").fill("Peluquería Marta");
    await page.getByLabel("Enlace directo para dejar una reseña").fill("https://g.page/r/peluqueria-marta/review");
    await page.getByLabel("Dirección").fill("Calle Real 10");
    await page.getByLabel("Ciudad").fill("Sevilla");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
    await expect(page.getByRole("heading", { name: "Elige tu plan" })).toBeVisible();

    const b = await db.business.findFirstOrThrow({ where: { owner: { email } } });
    businessId = b.id;
    await db.business.update({ where: { id: b.id }, data: { stripeCustomerId: `cus_e2e_${b.id}` } });
    await activateSubscription(request, b.id, "pro");
    await page.goto("/onboarding?checkout=ok");
    await expect(page.getByRole("heading", { name: "Conecta tu correo" })).toBeVisible();

    await connectGmail(page, "onboarding");
    await expect(page).toHaveURL(/\/onboarding\?connected=1/);
    await expect(page.getByText("Todo preparado")).toBeVisible();
    await page.getByRole("button", { name: "Ir a mi panel" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
    await expect(page.getByText("Todavía no hay envíos")).toBeVisible();
  });

  test("7. editar la plantilla con vista previa", async ({ page }) => {
    await login(page, email, password);
    await page.goto("/app/plantillas");
    const subject = page.getByLabel("Asunto del correo");
    await subject.fill("{{nombre_cliente}}, ¿qué tal tu {{nombre_servicio}} en {{nombre_negocio}}?");
    await expect(page.getByText("Asunto: Laura, ¿qué tal tu limpieza dental en Peluquería Marta?")).toBeVisible();
    // Contenido no neutral → bloqueado
    const body = page.getByLabel("Mensaje principal");
    const original = await body.inputValue();
    await body.fill(original + "\n\nTe regalamos un descuento si nos dejas 5 estrellas.");
    await expect(page.getByText("Solicitud no neutral")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled();
    await body.fill(original);
    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(page.getByText("Plantilla guardada")).toBeVisible();
    const t = await db.emailTemplate.findFirstOrThrow({ where: { businessId } });
    expect(t.subject).toBe("{{nombre_cliente}}, ¿qué tal tu {{nombre_servicio}} en {{nombre_negocio}}?");
  });

  test("8-13. registrar cliente → envío real por el worker → variables personalizadas → contador", async ({ page, request }) => {
    await login(page, email, password);
    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Añadir cliente" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Nombre").fill("Lucía Fernández");
    await dlg.getByLabel("Correo electrónico").fill("lucia.fernandez@cliente-e2e.es");
    await dlg.getByLabel("Servicio o producto").fill("mechas balayage");
    await dlg.getByText("Enviar ahora").click();
    await dlg.getByText("Este cliente ha contratado").click();
    await dlg.getByRole("button", { name: "Añadir cliente" }).click();
    await expect(page.getByText(/Cliente añadido\. Solicitud creada/)).toBeVisible();

    // El worker envía de verdad a través de la "Gmail API" local
    await expect.poll(async () => (await mockState(request)).gmailSent.length, { timeout: 20_000 }).toBe(1);
    const raw = (await mockState(request)).gmailSent[0].raw.replace(/\r\n[ \t]+/g, " ");
    expect(raw).toMatch(/^To: .*lucia\.fernandez@cliente-e2e\.es/m);
    expect(raw).toMatch(/^From: .*negocio\.e2e@gmail\.com/m);
    expect(raw).toMatch(/^Subject: =\?UTF-8\?/m); // asunto codificado RFC 2047
    expect(raw).toMatch(/^List-Unsubscribe: </m);
    const job = await db.emailJob.findFirstOrThrow({ where: { businessId } });
    expect(job.status).toBe("SENT");
    expect(job.subject).toBe("Lucía Fernández, ¿qué tal tu mechas balayage en Peluquería Marta?");
    expect(job.bodyText).toContain("Hola Lucía Fernández,");
    expect(job.bodyText).toContain(`${E2E_ENV.APP_URL}/r/${job.publicToken}`);

    await page.goto("/app/envios");
    await expect(page.getByText("Lucía Fernández").first()).toBeVisible();
    await expect(page.getByText("Enviado", { exact: true }).first()).toBeVisible();
    await page.getByText("Lucía Fernández").first().click();
    await expect(page.getByText("Aceptado por Gmail")).toBeVisible();

    await page.goto("/app");
    await expect(page.getByText("de 70 del plan este periodo")).toBeVisible();
    const usage = await db.monthlyUsage.findFirstOrThrow({ where: { businessId } });
    expect(usage.sent).toBe(1);

    // El enlace del correo redirige al perfil de Google y registra el clic
    const click = await request.get(`/r/${job.publicToken}`, { maxRedirects: 0 });
    expect(click.status()).toBe(302);
    expect(click.headers().location).toBe("https://g.page/r/peluqueria-marta/review");
  });

  test("14-15. límite mensual: bloquea el envío adicional", async ({ page, request }) => {
    await login(page, email, password);
    await db.monthlyUsage.updateMany({ where: { businessId }, data: { sent: 70 } });
    const c = await db.customer.create({ data: { businessId, name: "Pedro Límite", email: "pedro.limite@cliente-e2e.es", serviceName: "corte" } });
    await page.goto(`/app/clientes/${c.id}`);
    await page.getByRole("button", { name: "Solicitar reseña ahora" }).click();
    await expect(page.getByText("Has alcanzado el límite de correos de tu plan para este periodo.")).toBeVisible();
    // API directa (sin interfaz) → también bloqueada
    const r = await page.request.post(`/api/v1/customers/${c.id}/request`, { data: { sendNow: true }, headers: { origin: E2E_ENV.APP_URL } });
    expect(r.status()).toBe(402);
    await page.waitForTimeout(1500);
    expect((await mockState(request)).gmailSent.length).toBe(1);
    expect(await db.emailJob.count({ where: { customerId: c.id } })).toBe(0);
    await page.goto("/app");
    await expect(page.getByText("Has agotado los correos de este periodo")).toBeVisible();
    await db.monthlyUsage.updateMany({ where: { businessId }, data: { sent: 1 } });
  });

  test("16-17. planes: cambio a Starter y pago fallido vía webhooks de Stripe", async ({ page, request }) => {
    await login(page, email, password);
    await activateSubscription(request, businessId, "starter");
    await page.goto("/app/facturacion");
    await expect(page.getByText("Plan actual", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("15,00 €/mes IVA incluido · 30 correos/mes")).toBeVisible();
    await activateSubscription(request, businessId, "business");
    await page.reload();
    await expect(page.getByText("69,97 €/mes IVA incluido · 200 correos/mes")).toBeVisible();
    await activateSubscription(request, businessId, "business", "past_due");
    await page.reload();
    await expect(page.getByText("Pago pendiente", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Hay un problema con el pago de tu suscripción/)).toBeVisible();
    await activateSubscription(request, businessId, "pro");
  });

  test("19. error de conexión del correo: token revocado → aviso y reconexión", async ({ page, request }) => {
    await login(page, email, password);
    await setMockMode(request, { refresh: "invalid_grant" });
    await page.goto("/app/conexion-correo");
    await page.getByRole("button", { name: "Comprobar conexión" }).click();
    await expect(page.getByText(/La conexión no funciona/)).toBeVisible();
    await expect(page.getByText("Requiere reconexión").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Hemos perdido la autorización de negocio\.e2e@gmail\.com/)).toBeVisible();
    await waitForMail(request, email, "vuelve a conectar tu correo");
    await setMockMode(request, {});
    await connectGmail(page, "app");
    await expect(page.getByText("Cuenta conectada correctamente")).toBeVisible();
    await expect(page.getByText("Conectada", { exact: true })).toBeVisible();
  });

  test("4. recuperar contraseña", async ({ page, request }) => {
    await page.goto("/recuperar-contrasena");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Revisa tu correo")).toBeVisible();
    const mail = await waitForMail(request, email, "Restablece tu contraseña");
    await page.goto(linkIn(mail.text, "/restablecer-contrasena"));
    await page.getByLabel("Nueva contraseña").fill("NuevaClaveE2E-99");
    await page.getByLabel("Repite la contraseña").fill("NuevaClaveE2E-99");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("Contraseña actualizada")).toBeVisible();
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill("NuevaClaveE2E-99");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app/);
  });

  test("18. aislamiento: otro usuario no accede a los datos del primero", async ({ browser, request }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const other = `otro.${Date.now()}@empresa-e2e.es`;
    await registerAndVerify(page, request, { name: "Otro Usuario", email: other, password: "OtraClave-2026" });
    await page.request.post("/api/v1/business", { data: { name: "Otra empresa", acceptDpa: true }, headers: { origin: E2E_ENV.APP_URL } });
    const victim = await db.customer.findFirstOrThrow({ where: { businessId } });
    const job = await db.emailJob.findFirstOrThrow({ where: { businessId } });
    const h = { origin: E2E_ENV.APP_URL };
    expect((await page.request.get(`/api/v1/customers/${victim.id}`)).status()).toBe(404);
    expect((await page.request.patch(`/api/v1/customers/${victim.id}`, { data: { name: "x" }, headers: h })).status()).toBe(404);
    expect((await page.request.delete(`/api/v1/customers/${victim.id}`, { headers: h })).status()).toBe(404);
    expect((await page.request.get(`/api/v1/emails/${job.id}`)).status()).toBe(404);
    const list = await (await page.request.get("/api/v1/customers")).json();
    expect(list.total).toBe(0);
    expect(await db.customer.findUnique({ where: { id: victim.id } })).not.toBeNull();
    await ctx.close();
  });
});

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app/);
}
