import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas end-to-end.
 *  - `tests/e2e/*.spec.ts`: se ejecutan contra un build de producción con
 *    servicios externos apuntando a direcciones no alcanzables (comprueban la
 *    web pública, la protección de rutas y las validaciones de servidor).
 *  - `tests/e2e/full-journey.spec.ts`: recorrido completo; solo se ejecuta con
 *    E2E_FULL=1 y un proyecto Supabase + Stripe en modo test (ver docs/TESTING.md).
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const full = process.env.E2E_FULL === "1";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: full ? 120_000 : 30_000,
  fullyParallel: !full,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: full
          ? {}
          : {
              APP_ENV: "test",
              SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key-not-real-000000",
              STRIPE_SECRET_KEY: "sk_test_e2e_not_real",
              STRIPE_WEBHOOK_SECRET: "whsec_e2e_not_real",
              // El comprobador puede analizar el propio servidor local (nunca con APP_ENV=production).
              CHECKER_ALLOW_PRIVATE: "1",
            },
      },
});
