import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, HttpSession, extractConfirmLink, resetRateLimits, waitForEmail } from "../support/http";
import { adminClient, createTestUser, deleteTestUser, setPlan, type TestUser } from "../support/supabase";

/**
 * Pruebas de la API HTTP contra el servidor real (`pnpm build && pnpm start`)
 * y la base de datos local. Ejecuta antes: supabase start.
 */
let alice: TestUser;
let bob: TestUser;
const aliceHttp = new HttpSession();
const bobHttp = new HttpSession();
const created: string[] = [];

beforeAll(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`El servidor no responde en ${BASE_URL}. Ejecuta "pnpm build && pnpm start" antes de estas pruebas.`);
  await resetRateLimits();
  [alice, bob] = await Promise.all([createTestUser("api-alice"), createTestUser("api-bob")]);
  await Promise.all([aliceHttp.signInDirect(alice.email, alice.password), bobHttp.signInDirect(bob.email, bob.password)]);
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  const admin = adminClient();
  for (const email of created) {
    const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (data) await admin.auth.admin.deleteUser(data.id);
  }
  await resetRateLimits();
});

describe("registro, confirmación de correo y recuperación de contraseña", () => {
  it("registra, envía el correo de confirmación y activa la cuenta", async () => {
    const email = `registro-${randomUUID().slice(0, 8)}@pruebas.anunciapro.test`;
    created.push(email);
    const http = new HttpSession();
    const register = await http.json<{ requiresEmailConfirmation: boolean }>("/api/auth/register", {
      body: { fullName: "Usuaria Registro", email, password: "Segura123", confirmPassword: "Segura123", acceptTerms: true },
    });
    expect(register.status).toBe(201);
    expect(register.data.requiresEmailConfirmation).toBe(true);

    // Sin confirmar no puede iniciar sesión.
    const early = await http.json("/api/auth/login", { body: { email, password: "Segura123" } });
    expect(early.status).toBe(403);

    const mail = await waitForEmail(email, "Confirma tu cuenta");
    const confirm = await http.request(extractConfirmLink(mail.html));
    expect(confirm.status).toBe(307);
    expect(confirm.headers.get("location")).toContain("/app");
    const dashboard = await http.request("/app");
    expect(dashboard.status).toBe(200);
    expect(await dashboard.text()).toContain("Usuaria");
  });

  it("valida el registro en el servidor", async () => {
    const response = await new HttpSession().json("/api/auth/register", { body: { fullName: "X", email: "no-es-correo", password: "123", confirmPassword: "456", acceptTerms: false } });
    expect(response.status).toBe(422);
    expect(response.error?.code).toBe("validation_error");
  });

  it("recupera la contraseña mediante el enlace del correo", async () => {
    const user = await createTestUser("reset");
    const http = new HttpSession();
    const request = await http.json("/api/auth/forgot-password", { body: { email: user.email } });
    expect(request.status).toBe(200);
    // Misma respuesta para correos inexistentes (sin enumeración de cuentas).
    expect((await http.json("/api/auth/forgot-password", { body: { email: `nadie-${randomUUID()}@x.test` } })).status).toBe(200);

    // Sin enlace válido no se puede fijar contraseña.
    const forged = await new HttpSession().json("/api/auth/reset-password", { body: { password: "Nueva1234", confirmPassword: "Nueva1234" } });
    expect(forged.status).toBe(403);

    const mail = await waitForEmail(user.email, "Restablece tu contraseña");
    const confirm = await http.request(extractConfirmLink(mail.html));
    expect(confirm.headers.get("location")).toContain("/restablecer");
    const reset = await http.json("/api/auth/reset-password", { body: { password: "NuevaClave99", confirmPassword: "NuevaClave99" } });
    expect(reset.status).toBe(200);

    const login = await new HttpSession().json("/api/auth/login", { body: { email: user.email, password: "NuevaClave99" } });
    expect(login.status).toBe(200);
    await deleteTestUser(user);
  });

  it("rechaza enlaces manipulados", async () => {
    const response = await new HttpSession().request("/auth/confirm?token_hash=falso&type=recovery");
    expect(response.headers.get("location")).toContain("/login?error=enlace");
  });

  it("inicia y cierra sesión con cookies httpOnly", async () => {
    const user = await createTestUser("login");
    const http = new HttpSession();
    const bad = await http.json("/api/auth/login", { body: { email: user.email, password: "incorrecta1" } });
    expect(bad.status).toBe(401);
    const login = await http.request("/api/auth/login", { body: { email: user.email, password: user.password } });
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie().some((cookie) => /HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie))).toBe(true);
    expect((await http.request("/app")).status).toBe(200);
    await http.json("/api/auth/logout", { method: "POST" });
    const after = await http.request("/app");
    expect(after.status).toBe(307);
    expect(after.headers.get("location")).toContain("/login");
    await deleteTestUser(user);
  });
});

describe("protección de rutas y endpoints", () => {
  it("las páginas privadas redirigen al login sin sesión", async () => {
    for (const path of ["/app", "/app/productos", "/app/crear", "/admin"]) {
      const response = await new HttpSession().request(path);
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location")).toContain("/login");
    }
  });

  it("los endpoints privados devuelven 401 sin sesión", async () => {
    const anon = new HttpSession();
    for (const [path, method] of [["/api/products", "GET"], ["/api/listings", "GET"], ["/api/jobs", "GET"], ["/api/generate", "POST"], ["/api/account", "PATCH"]] as const) {
      const response = await anon.json(path, { method, body: method === "GET" ? undefined : {} });
      expect(response.status, path).toBe(401);
    }
  });

  it("rechaza peticiones de otro origen (CSRF)", async () => {
    const response = await aliceHttp.json("/api/products", { body: { name: "CSRF" }, origin: "https://atacante.example" });
    expect(response.status).toBe(403);
    const noOrigin = await aliceHttp.json("/api/products", { body: { name: "CSRF" }, origin: null });
    expect(noOrigin.status).toBe(403);
  });

  it("el panel de administración no existe para usuarios normales", async () => {
    expect((await aliceHttp.request("/admin")).status).toBe(404);
    const api = await aliceHttp.json(`/api/admin/users/${bob.id}`, { method: "PATCH", body: { action: "disable", reason: "intento de abuso de privilegios" } });
    expect(api.status).toBe(404);
  });

  it("el webhook de Stripe y el cron no son utilizables sin credenciales", async () => {
    const webhook = await new HttpSession().request("/api/stripe/webhook", { body: { type: "checkout.session.completed" }, origin: null });
    expect(webhook.status).toBe(503); // pagos desactivados
    const cron = await fetch(`${BASE_URL}/api/cron/process-jobs`);
    expect(cron.status).toBe(404);
    const cronForged = await fetch(`${BASE_URL}/api/cron/process-jobs`, { headers: { authorization: "Bearer incorrecto" } });
    expect(cronForged.status).toBe(404);
  });

  it("con pagos desactivados no se puede iniciar un checkout", async () => {
    const response = await aliceHttp.json("/api/billing/checkout", { body: { plan: "pro" } });
    expect(response.status).toBe(503);
    expect(response.error?.code).toBe("payments_disabled");
  });
});

describe("catálogo, generación y anuncios", () => {
  let productId: string;
  let listingId: string;

  it("crea un producto con atributos validados en servidor", async () => {
    const { data: category } = await adminClient().from("categories").select("id").eq("slug", "smartphones").is("workspace_id", null).single();
    const bad = await aliceHttp.json("/api/products", { body: { name: "Móvil", categoryId: category!.id, attributes: { almacenamiento: "3 TB" } } });
    expect(bad.status).toBe(422);
    const response = await aliceHttp.json<{ id: string; workspace_id: string; created_by: string }>("/api/products", {
      body: { name: "Móvil de prueba", categoryId: category!.id, brand: "Marca", price: "199,90", condition: "like_new", attributes: { almacenamiento: "128 GB", color: "Negro" }, features: ["Doble SIM"], workspace_id: bob.workspaceId, created_by: bob.id },
    });
    expect(response.status).toBe(201);
    // El servidor ignora el workspace/propietario enviado por el cliente.
    expect(response.data.workspace_id).toBe(alice.workspaceId);
    expect(response.data.created_by).toBe(alice.id);
    productId = response.data.id;
  });

  it("edita, busca y pagina en servidor", async () => {
    const update = await aliceHttp.json(`/api/products/${productId}`, { method: "PATCH", body: { name: "Móvil editado", price: "189", condition: "like_new" } });
    expect(update.status).toBe(200);
    const list = await aliceHttp.json<{ items: { name: string }[]; total: number; pageSize: number }>("/api/products?q=editado&pageSize=5");
    expect(list.data.items.map((item) => item.name)).toEqual(["Móvil editado"]);
    expect(list.data.pageSize).toBe(5);
    const injection = await aliceHttp.json<{ items: unknown[] }>("/api/products?q=%25'%2C(name.neq.x)");
    expect(injection.status).toBe(200);
    expect(injection.data.items).toEqual([]);
  });

  it("otro usuario recibe 404 al acceder por identificador", async () => {
    for (const [path, method] of [[`/api/products/${productId}`, "GET"], [`/api/products/${productId}`, "PATCH"], [`/api/products/${productId}`, "DELETE"], [`/api/products/${productId}/duplicate`, "POST"]] as const) {
      const response = await bobHttp.json(path, { method, body: method === "PATCH" ? { name: "x" } : undefined });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
    // Con loading.tsx Next.js ya ha empezado a transmitir la respuesta (código 200) cuando la
    // página llama a notFound(): lo que importa es que no se muestra ningún dato ajeno.
    const page = await bobHttp.request(`/app/productos/${productId}`);
    const html = await page.text();
    expect([200, 404]).toContain(page.status);
    expect(html).toContain("Esta página no existe");
    expect(html).not.toContain("Móvil editado");
    const generate = await bobHttp.json("/api/generate", { body: { productId, idempotencyKey: randomUUID().replace(/-/g, "") } });
    expect(generate.status).toBe(404);
    const listing = await bobHttp.json("/api/listings", { body: { productId, title: "x" } });
    expect(listing.status).toBe(404);
  });

  it("genera un anuncio y descuenta una generación (idempotente)", async () => {
    const key = randomUUID().replace(/-/g, "");
    const first = await aliceHttp.json<{ listing: { title: string; description: string; method: string }; usage: { used: number } }>("/api/generate", { body: { productId, idempotencyKey: key, options: { platform: "wallapop" } } });
    expect(first.status).toBe(200);
    expect(first.data.listing.title).toContain("Móvil editado");
    expect(first.data.listing.title.length).toBeLessThanOrEqual(50);
    expect(first.data.listing.method).toBe("template");
    const retry = await aliceHttp.json<{ usage: { used: number } }>("/api/generate", { body: { productId, idempotencyKey: key, options: { platform: "wallapop" } } });
    expect(retry.data.usage.used).toBe(first.data.usage.used);
  });

  it("guarda, edita, versiona, marca favorito y restaura el anuncio", async () => {
    const save = await aliceHttp.json<{ id: string }>("/api/listings", { body: { productId, title: "Anuncio <b>guardado</b>", description: '<p onclick="x()">Hola</p><script>alert(1)</script>', keywords: ["móvil"], generationMethod: "template" } });
    expect(save.status).toBe(201);
    listingId = save.data.id;
    const detail = await aliceHttp.json<{ title: string; description: string }>(`/api/listings/${listingId}`);
    expect(detail.data.title).toBe("Anuncio guardado");
    expect(detail.data.description).toBe("<p>Hola</p>");

    expect((await aliceHttp.json(`/api/listings/${listingId}`, { method: "PATCH", body: { title: "Título editado", status: "ready" } })).status).toBe(200);
    const versions = await aliceHttp.json<{ version_number: number }[]>(`/api/listings/${listingId}/versions`);
    expect(versions.data.map((version) => version.version_number)).toEqual([2, 1]);
    expect((await aliceHttp.json(`/api/listings/${listingId}/versions`, { body: { versionNumber: 1 } })).status).toBe(200);
    expect((await aliceHttp.json<{ title: string }>(`/api/listings/${listingId}`)).data.title).toBe("Anuncio guardado");

    expect((await aliceHttp.json(`/api/listings/${listingId}/favorite`, { method: "PUT" })).status).toBe(200);
    const favorites = await aliceHttp.json<{ items: { id: string }[] }>("/api/listings?favorites=1");
    expect(favorites.data.items.map((item) => item.id)).toEqual([listingId]);
    expect((await bobHttp.json(`/api/listings/${listingId}/favorite`, { method: "PUT" })).status).toBe(404);

    const adapted = await aliceHttp.json<{ listing: { platform: string; description: string } }>(`/api/listings/${listingId}/adapt`, { body: { platform: "ebay" } });
    expect(adapted.data.listing.platform).toBe("ebay");
    const duplicate = await aliceHttp.json<{ id: string }>(`/api/listings/${listingId}/duplicate`, { method: "POST" });
    expect(duplicate.status).toBe(201);
  });

  it("exporta según el plan y nunca incluye datos de otros usuarios", async () => {
    const csv = await aliceHttp.request("/api/listings/export?format=csv");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    const body = await csv.text();
    expect(body).toContain("Anuncio guardado");
    const json = await aliceHttp.json("/api/listings/export?format=json");
    expect(json.status).toBe(402); // JSON no está incluido en Free
    const bobExport = await bobHttp.request(`/api/listings/export?format=csv&ids=${listingId}`);
    expect(bobExport.status).toBe(404);
  });

  it("valida las imágenes por su contenido real", async () => {
    const fake = new FormData();
    fake.set("file", new File([new TextEncoder().encode("<svg onload=alert(1)>")], "foto.jpg", { type: "image/jpeg" }));
    const rejected = await aliceHttp.json(`/api/products/${productId}/images`, { form: fake });
    expect(rejected.status).toBe(415);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const form = new FormData();
    form.set("file", new File([png], "../../foto real.png", { type: "image/png" }));
    const accepted = await aliceHttp.json<{ id: string; filename: string; url: string }>(`/api/products/${productId}/images`, { form });
    expect(accepted.status).toBe(201);
    expect(accepted.data.filename).toBe("foto real.png");
    expect(accepted.data.url).toContain("token=");
    const { data: row } = await adminClient().from("product_images").select("storage_path").eq("id", accepted.data.id).single();
    expect(row!.storage_path).toMatch(new RegExp(`^${alice.workspaceId}/${productId}/[0-9a-f-]{36}\\.png$`));
    // Bob no puede borrar la imagen de Alice.
    expect((await bobHttp.json(`/api/products/${productId}/images/${accepted.data.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("borra el producto y sus archivos en cascada", async () => {
    const { data: images } = await adminClient().from("product_images").select("storage_path").eq("product_id", productId);
    expect((await aliceHttp.json(`/api/products/${productId}`, { method: "DELETE" })).status).toBe(200);
    const stored = await adminClient().storage.from("product-images").download(images![0]!.storage_path);
    expect(stored.data).toBeNull();
    expect((await aliceHttp.json(`/api/listings/${listingId}`)).status).toBe(404);
  });

  it("bloquea las generaciones al alcanzar el límite mensual", async () => {
    const user = await createTestUser("quota");
    const http = new HttpSession();
    await http.signInDirect(user.email, user.password);
    const product = await http.json<{ id: string }>("/api/products", { body: { name: "Lámpara" } });
    const results = await Promise.all(Array.from({ length: 12 }, () => http.json("/api/generate", { body: { productId: product.data.id, idempotencyKey: randomUUID().replace(/-/g, "") } })));
    expect(results.filter((result) => result.status === 200)).toHaveLength(10);
    expect(results.filter((result) => result.status === 402)).toHaveLength(2);
    await deleteTestUser(user);
  });
});

describe("importación CSV y generación masiva por HTTP", () => {
  it("importa, valida, procesa por lotes y exporta los resultados", async () => {
    const user = await createTestUser("bulk");
    await setPlan(user.workspaceId, "pro");
    const http = new HttpSession();
    await http.signInDirect(user.email, user.password);

    const csv = ["nombre;precio;estado;sku;color", "Silla nórdica;35,5;Como nuevo;S-1;Blanco", ";10;;S-2;", "Mesa;abc;;;", "Lámpara;20;Nuevo;S-1;", "Estantería;60;;E-1;Roble"].join("\n");
    const form = new FormData();
    form.set("file", new File([csv], "inventario.csv", { type: "text/csv" }));
    const analysis = await http.json<{ importId: string; headers: string[]; suggestedMapping: Record<string, string>; totalRows: number }>("/api/imports", { form });
    expect(analysis.status).toBe(201);
    expect(analysis.data.headers).toEqual(["nombre", "precio", "estado", "sku", "color"]);
    expect(analysis.data.totalRows).toBe(5);

    const mapping = { ...analysis.data.suggestedMapping, color: "attr:color" };
    const validation = await http.json<{ validRows: number; invalidRows: number; duplicateRows: number; errors: { row: number }[] }>("/api/imports/validate", { body: { importId: analysis.data.importId, mapping, defaults: {} } });
    expect(validation.data).toMatchObject({ validRows: 2, invalidRows: 2, duplicateRows: 1 });
    expect(validation.data.errors.map((issue) => issue.row).sort()).toEqual([3, 4, 5]);

    // Otro usuario no puede usar la importación ajena.
    expect((await aliceHttp.json("/api/imports/validate", { body: { importId: analysis.data.importId, mapping, defaults: {} } })).status).toBe(404);

    const job = await http.json<{ jobId: string; totalItems: number }>("/api/jobs", { body: { importId: analysis.data.importId, mapping, defaults: {}, filename: "inventario.csv", options: { platform: "vinted", templateId: null } } });
    expect(job.status).toBe(201);
    expect(job.data.totalItems).toBe(2);
    expect((await aliceHttp.json(`/api/jobs/${job.data.jobId}/process`, { method: "POST" })).status).toBe(404);

    let state = { status: "pending", successful_items: 0 };
    for (let guard = 0; guard < 10 && ["pending", "processing"].includes(state.status); guard += 1) {
      state = (await http.json<typeof state>(`/api/jobs/${job.data.jobId}/process`, { method: "POST" })).data;
    }
    expect(state).toMatchObject({ status: "completed", successful_items: 2 });

    const listings = await http.json<{ items: { title: string; platform: string }[] }>("/api/listings");
    expect(listings.data.items.map((item) => item.platform)).toEqual(["vinted", "vinted"]);
    const exported = await http.request(`/api/jobs/${job.data.jobId}/export`);
    const text = await exported.text();
    expect(text).toContain("Silla nórdica");
    expect(text).toContain("completado");

    // El archivo temporal se elimina tras crear el trabajo.
    expect((await http.json("/api/imports/validate", { body: { importId: analysis.data.importId, mapping, defaults: {} } })).status).toBe(404);
    await deleteTestUser(user);
  });

  it("rechaza archivos no válidos", async () => {
    const user = await createTestUser("bulk-bad");
    const http = new HttpSession();
    await http.signInDirect(user.email, user.password);
    const binary = new FormData();
    binary.set("file", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])], "datos.csv"));
    expect((await http.json("/api/imports", { form: binary })).status).toBe(415);
    const exe = new FormData();
    exe.set("file", new File(["MZ"], "virus.exe"));
    expect((await http.json("/api/imports", { form: exe })).status).toBe(415);
    const big = new FormData();
    big.set("file", new File([new Uint8Array(5 * 1024 * 1024 + 10).fill(65)], "grande.csv"));
    expect((await http.json("/api/imports", { form: big })).status).toBe(413);
    await deleteTestUser(user);
  });
});

describe("limitación de peticiones", () => {
  it("bloquea los intentos de inicio de sesión abusivos", async () => {
    await resetRateLimits();
    const http = new HttpSession();
    const email = `fuerza-bruta-${randomUUID().slice(0, 6)}@pruebas.anunciapro.test`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push((await http.json("/api/auth/login", { body: { email, password: `intento${attempt}` } })).status);
    }
    expect(statuses.slice(0, 8).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(-2)).toEqual([429, 429]);
    await resetRateLimits();
  });
});
