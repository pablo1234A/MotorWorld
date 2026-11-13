import { expect, test } from "@playwright/test";
import { dismissOnboarding, loginThroughUi, resetRateLimits, setPlan } from "./helpers";
import { createProduct, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let owner: TestUser;
let guest: TestUser;

test.beforeAll(async () => {
  await resetRateLimits();
  [owner, guest] = await Promise.all([createTestUser("e2e-owner"), createTestUser("e2e-guest")]);
  await setPlan(owner.workspaceId, "pro");
  await createProduct(owner, "Tocadiscos compartido del equipo");
});
test.afterAll(async () => {
  await Promise.all([deleteTestUser(owner), deleteTestUser(guest)]);
  await resetRateLimits();
});

test("invitar a una persona al equipo y compartir el catálogo", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const guestPage = await guestContext.newPage();

  // El propietario invita desde Configuración → Equipo.
  await loginThroughUi(ownerPage, owner.email, owner.password);
  await dismissOnboarding(ownerPage);
  await ownerPage.goto("/app/configuracion");
  await ownerPage.getByLabel("Invitar por correo").fill(guest.email);
  await ownerPage.getByLabel("Rol", { exact: true }).selectOption("viewer");
  await ownerPage.getByRole("button", { name: "Invitar" }).click();
  await expect(ownerPage.getByText("Invitación pendiente")).toBeVisible();

  // La persona invitada lo ve en su panel y acepta.
  await loginThroughUi(guestPage, guest.email, guest.password);
  await dismissOnboarding(guestPage);
  await expect(guestPage.getByText("te ha invitado al espacio de trabajo")).toBeVisible();
  await guestPage.getByRole("button", { name: "Aceptar" }).click();
  await expect(guestPage).toHaveURL(/\/app$/);
  await dismissOnboarding(guestPage);

  // Ve el catálogo compartido y puede volver a su espacio personal.
  await guestPage.goto("/app/productos");
  await expect(guestPage.getByText("Tocadiscos compartido del equipo")).toBeVisible();
  await guestPage.getByRole("button", { name: "Cambiar de espacio de trabajo" }).click();
  await guestPage.getByRole("menuitem", { name: /Espacio de Prueba e2e-guest/ }).click();
  await expect(guestPage).toHaveURL(/\/app$/);
  await guestPage.goto("/app/productos");
  await expect(guestPage.getByText("Tu catálogo está vacío")).toBeVisible();

  // El propietario ve al nuevo miembro y puede quitarlo.
  await ownerPage.reload();
  await expect(ownerPage.getByText(guest.email)).toBeVisible();
  await Promise.all([ownerContext.close(), guestContext.close()]);
});
