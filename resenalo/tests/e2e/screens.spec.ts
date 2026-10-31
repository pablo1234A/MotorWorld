import { test, expect } from "@playwright/test";

test("capturas de escritorio de las páginas públicas", async ({ page }) => {
  for (const p of ["/", "/login", "/registro", "/legal/privacidad", "/legal/precios-e-impuestos"]) {
    await page.goto(p);
    await expect(page.locator("body")).toBeVisible();
    await page.screenshot({ path: `tests/e2e/.artifacts/screens/escritorio${p.replace(/\//g, "-") || "-inicio"}.png`, fullPage: true });
  }
});
