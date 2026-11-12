import { expect, test } from "@playwright/test";
import { dismissOnboarding, loginThroughUi, resetRateLimits } from "./helpers";
import { createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let user: TestUser;
test.beforeAll(async () => {
  await resetRateLimits();
  user = await createTestUser("e2e-movil");
});
test.afterAll(async () => deleteTestUser(user));

test("la web y el panel funcionan en móvil sin desbordamiento horizontal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await loginThroughUi(page, user.email, user.password);
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("dialog", { name: "Menú" }).getByRole("link", { name: "Mis productos" }).click();
  await expect(page).toHaveURL(/\/app\/productos/);
  await expect(page.getByRole("heading", { name: "Mis productos" })).toBeVisible();
  const appOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(appOverflow).toBeLessThanOrEqual(1);
});
