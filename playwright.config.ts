import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Pruebas E2E. Requisitos: `supabase start` (base de datos, Auth y Mailpit locales)
 * y la aplicación compilada (`pnpm build`). El servidor se arranca solo si no está ya activo.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, locale: "es-ES", trace: "off", screenshot: "only-on-failure" },
  webServer: { command: "pnpm start -H 127.0.0.1 -p 3000", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, testIgnore: /movil\.spec/ },
    { name: "movil", use: { ...devices["Pixel 7"] }, testMatch: /movil\.spec/ },
  ],
});
