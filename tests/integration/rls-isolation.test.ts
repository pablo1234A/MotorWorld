import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createProduct, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

/**
 * Aislamiento entre espacios de trabajo verificado directamente contra PostgreSQL
 * con las políticas RLS reales y dos usuarios distintos.
 */
let alice: TestUser;
let bob: TestUser;
let aliceProductId: string;
let aliceListingId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser("alice"), createTestUser("bob")]);
  const product = await createProduct(alice, "Producto privado de Alice");
  aliceProductId = product.id;
  const { data: listing, error } = await alice.client.from("listings").insert({ workspace_id: alice.workspaceId, product_id: product.id, title: "Anuncio privado" }).select().single();
  if (error) throw error;
  aliceListingId = listing.id;
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});

describe("alta de usuario", () => {
  it("crea perfil, espacio, membresía de propietario y suscripción gratuita", async () => {
    const [{ data: profile }, { data: members }, { data: subscription }] = await Promise.all([
      alice.client.from("profiles").select("email, full_name").eq("id", alice.id).single(),
      alice.client.from("workspace_members").select("role").eq("workspace_id", alice.workspaceId),
      alice.client.from("subscriptions").select("status, plans(code)").eq("workspace_id", alice.workspaceId).single(),
    ]);
    expect(profile).toEqual({ email: alice.email, full_name: "Prueba alice" });
    expect(members).toEqual([{ role: "owner" }]);
    expect(subscription).toMatchObject({ status: "active", plans: { code: "free" } });
  });
});

describe("aislamiento entre usuarios (RLS)", () => {
  it("un usuario no ve productos, anuncios ni versiones de otro", async () => {
    const [products, listings, versions, workspaces, profiles] = await Promise.all([
      bob.client.from("products").select("id").eq("id", aliceProductId),
      bob.client.from("listings").select("id").eq("id", aliceListingId),
      bob.client.from("listing_versions").select("id").eq("listing_id", aliceListingId),
      bob.client.from("workspaces").select("id").eq("id", alice.workspaceId),
      bob.client.from("profiles").select("id").eq("id", alice.id),
    ]);
    for (const result of [products, listings, versions, workspaces, profiles]) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it("no puede editar ni borrar datos de otro espacio", async () => {
    const update = await bob.client.from("products").update({ name: "hackeado" }).eq("id", aliceProductId).select();
    expect(update.data).toEqual([]);
    const remove = await bob.client.from("listings").delete().eq("id", aliceListingId).select();
    expect(remove.data).toEqual([]);
    const { data } = await adminClient().from("products").select("name").eq("id", aliceProductId).single();
    expect(data?.name).toBe("Producto privado de Alice");
  });

  it("no puede insertar en el espacio de otro manipulando el workspace_id", async () => {
    const { error } = await bob.client.from("products").insert({ workspace_id: alice.workspaceId, name: "intruso" });
    expect(error?.code).toBe("42501");
  });

  it("no puede crear un anuncio propio apuntando a un producto ajeno", async () => {
    const { error } = await bob.client.from("listings").insert({ workspace_id: bob.workspaceId, product_id: aliceProductId, title: "x" });
    expect(error).not.toBeNull(); // la clave foránea compuesta (producto, workspace) lo impide
  });

  it("no puede mover un producto propio a otro espacio", async () => {
    const own = await createProduct(bob, "Producto de Bob");
    const { data } = await bob.client.from("products").update({ workspace_id: alice.workspaceId }).eq("id", own.id).select("workspace_id").single();
    expect(data?.workspace_id).toBe(bob.workspaceId);
  });

  it("no puede marcar como favorito un anuncio ajeno", async () => {
    const { error } = await bob.client.from("favorites").insert({ user_id: bob.id, listing_id: aliceListingId });
    expect(error?.code).toBe("42501");
  });

  it("no puede escribir en tablas de sistema", async () => {
    const attempts = await Promise.all([
      bob.client.from("subscriptions").update({ status: "active" }).eq("workspace_id", bob.workspaceId).select(),
      bob.client.from("usage_records").insert({ workspace_id: bob.workspaceId, operation_type: "refund", quantity: -100, idempotency_key: "trampa-12345", refund_of: "generation" }),
      bob.client.from("platform_admins").insert({ user_id: bob.id }),
      bob.client.from("plans").update({ monthly_listing_limit: 999999 }).eq("code", "free").select(),
      bob.client.from("listing_versions").insert({ listing_id: aliceListingId, workspace_id: bob.workspaceId, version_number: 99, title: "x" }),
    ]);
    for (const attempt of attempts) {
      expect(attempt.error !== null || (Array.isArray(attempt.data) && attempt.data.length === 0)).toBe(true);
    }
    const { data: plan } = await adminClient().from("plans").select("monthly_listing_limit").eq("code", "free").single();
    expect(plan?.monthly_listing_limit).toBe(10);
  });

  it("no puede escalar privilegios desde su propio perfil", async () => {
    const { error } = await bob.client.from("profiles").update({ disabled_at: null, email: "otro@x.com" }).eq("id", bob.id);
    expect(error?.code).toBe("42501"); // solo puede cambiar nombre, avatar y onboarding
    const { data: admins } = await bob.client.from("platform_admins").select("*");
    expect(admins ?? []).toEqual([]);
  });

  it("no puede consumir cuota ni leer el consumo de otro espacio", async () => {
    const consume = await bob.client.rpc("consume_usage", { p_workspace: alice.workspaceId, p_operation: "generation", p_idempotency_key: "intruso-123456" });
    expect(consume.error?.code).toBe("42501");
    const summary = await bob.client.rpc("get_usage_summary", { p_workspace: alice.workspaceId });
    expect(summary.error?.code).toBe("42501");
    const refund = await bob.client.rpc("refund_usage", { p_workspace: bob.workspaceId, p_idempotency_key: "x".repeat(10) });
    expect(refund.error).not.toBeNull(); // solo service_role
  });

  it("las estadísticas solo cuentan los datos propios", async () => {
    const { data } = await bob.client.rpc("get_dashboard_stats", { p_workspace: alice.workspaceId });
    expect((data as { listings_total: number }).listings_total).toBe(0);
  });

  it("un visitante anónimo no ve datos privados pero sí los planes", async () => {
    const anon = anonClient();
    const [products, plans] = await Promise.all([anon.from("products").select("id"), anon.from("plans").select("code")]);
    expect(products.error !== null || products.data?.length === 0).toBe(true);
    expect(plans.data?.length).toBe(4);
  });

  it("una cuenta desactivada pierde el acceso a sus datos aunque conserve el token", async () => {
    const victim = await createTestUser("disabled");
    await createProduct(victim);
    await adminClient().from("profiles").update({ disabled_at: new Date().toISOString(), disabled_reason: "Prueba de desactivación" }).eq("id", victim.id);
    const { data } = await victim.client.from("products").select("id");
    expect(data).toEqual([]);
    await deleteTestUser(victim);
  });
});

describe("versionado de anuncios", () => {
  it("cada cambio de contenido crea una versión inmutable", async () => {
    await alice.client.from("listings").update({ title: "Título v2" }).eq("id", aliceListingId);
    await alice.client.from("listings").update({ status: "ready" }).eq("id", aliceListingId); // sin cambio de contenido
    await alice.client.from("listings").update({ description: "Descripción v3" }).eq("id", aliceListingId);
    const { data: listing } = await alice.client.from("listings").select("current_version").eq("id", aliceListingId).single();
    const { data: versions } = await alice.client.from("listing_versions").select("version_number, title").eq("listing_id", aliceListingId).order("version_number");
    expect(listing?.current_version).toBe(3);
    expect(versions).toEqual([
      { version_number: 1, title: "Anuncio privado" },
      { version_number: 2, title: "Título v2" },
      { version_number: 3, title: "Título v2" },
    ]);
    const tamper = await alice.client.from("listing_versions").update({ title: "falso" }).eq("listing_id", aliceListingId).select();
    expect(tamper.error !== null || tamper.data?.length === 0).toBe(true);
  });
});

describe("integridad del catálogo", () => {
  it("el SKU es único por espacio pero puede repetirse entre espacios", async () => {
    await alice.client.from("products").insert({ workspace_id: alice.workspaceId, name: "A", sku: "SKU-1" });
    const duplicate = await alice.client.from("products").insert({ workspace_id: alice.workspaceId, name: "B", sku: "SKU-1" });
    expect(duplicate.error?.code).toBe("23505");
    const other = await bob.client.from("products").insert({ workspace_id: bob.workspaceId, name: "C", sku: "SKU-1" });
    expect(other.error).toBeNull();
  });

  it("no se puede usar la categoría personalizada de otro espacio", async () => {
    const { data: category } = await alice.client.from("categories").insert({ workspace_id: alice.workspaceId, name: "Privada", slug: "privada-alice" }).select().single();
    const visible = await bob.client.from("categories").select("id").eq("id", category!.id);
    expect(visible.data).toEqual([]);
    const { error } = await bob.client.from("products").insert({ workspace_id: bob.workspaceId, name: "x", category_id: category!.id });
    expect(error?.code).toBe("AP002");
  });

  it("aplica el límite de productos del plan", async () => {
    const user = await createTestUser("limit");
    await adminClient().from("plans").select("id").eq("code", "free");
    const rows = Array.from({ length: 50 }, (_, index) => ({ workspace_id: user.workspaceId, name: `P${index}` }));
    const first = await user.client.from("products").insert(rows);
    expect(first.error).toBeNull();
    const extra = await user.client.from("products").insert({ workspace_id: user.workspaceId, name: "Uno de más" });
    expect(extra.error?.code).toBe("AP001");
    await deleteTestUser(user);
  });

  it("al eliminar un producto se eliminan en cascada sus anuncios y versiones", async () => {
    const product = await createProduct(alice, "Para borrar");
    const { data: listing } = await alice.client.from("listings").insert({ workspace_id: alice.workspaceId, product_id: product.id, title: "Temporal" }).select().single();
    await alice.client.from("products").delete().eq("id", product.id);
    const admin = adminClient();
    const [listings, versions] = await Promise.all([admin.from("listings").select("id").eq("id", listing!.id), admin.from("listing_versions").select("id").eq("listing_id", listing!.id)]);
    expect(listings.data).toEqual([]);
    expect(versions.data).toEqual([]);
  });
});
