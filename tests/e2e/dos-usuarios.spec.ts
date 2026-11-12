import { expect, test } from "@playwright/test";
import { dismissOnboarding, loginThroughUi, resetRateLimits } from "./helpers";
import { createProduct, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let alice: TestUser;
let bob: TestUser;
let productId: string;
let listingId: string;

test.beforeAll(async () => {
  await resetRateLimits();
  [alice, bob] = await Promise.all([createTestUser("e2e-alice"), createTestUser("e2e-bob")]);
  const product = await createProduct(alice, "Reloj de bolsillo exclusivo de Alice");
  productId = product.id;
  const { data } = await alice.client.from("listings").insert({ workspace_id: alice.workspaceId, product_id: productId, title: "Anuncio secreto de Alice" }).select().single();
  listingId = data!.id;
});
test.afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  await resetRateLimits();
});

test("dos usuarios no ven los datos del otro", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alicePage = await aliceContext.newPage();
  const bobPage = await bobContext.newPage();

  await loginThroughUi(alicePage, alice.email, alice.password);
  await dismissOnboarding(alicePage);
  await alicePage.goto("/app/productos");
  await expect(alicePage.getByText("Reloj de bolsillo exclusivo de Alice")).toBeVisible();

  await loginThroughUi(bobPage, bob.email, bob.password);
  await dismissOnboarding(bobPage);
  await bobPage.goto("/app/productos");
  await expect(bobPage.getByText("Tu catálogo está vacío")).toBeVisible();
  await bobPage.goto("/app/anuncios");
  await expect(bobPage.getByText("Todavía no has guardado anuncios")).toBeVisible();

  // Manipulación directa de identificadores en la URL.
  for (const path of [`/app/productos/${productId}`, `/app/anuncios/${listingId}`, `/app/crear?producto=${productId}`]) {
    await bobPage.goto(path);
    await expect(bobPage.getByText("Reloj de bolsillo exclusivo de Alice")).toHaveCount(0);
    await expect(bobPage.getByText("Anuncio secreto de Alice")).toHaveCount(0);
  }

  // Un usuario normal no ve el panel de administración.
  await bobPage.goto("/admin");
  await expect(bobPage.getByText("Esta página no existe")).toBeVisible();
  await Promise.all([aliceContext.close(), bobContext.close()]);
});
