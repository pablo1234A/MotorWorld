import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Variables locales (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL) desde ../../.env si existe.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export const E2E_API_PORT = 3100;
export const E2E_WEB_PORT = 4174;
export const E2E_BILLING_WEB_PORT = 4175;

/**
 * Pruebas de extremo a extremo: API real + base de datos de pruebas + compilación de
 * producción servida con las cabeceras de seguridad (CSP) en un navegador real.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
  webServer: [{
    // Servidor de producción incluido (server/serve.mjs): las pruebas recorren la aplicación
    // con las mismas cabeceras de seguridad que en producción.
    command: `npm run build && node server/serve.mjs`,
    url: `http://localhost:${E2E_WEB_PORT}/iniciar-sesion`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { API_URL: `http://127.0.0.1:${E2E_API_PORT}`, PORT: String(E2E_WEB_PORT), HOST: 'localhost' },
  }, {
    // Misma compilación, frente a la API con pagos de prueba (simulador local de Stripe).
    command: 'node server/serve.mjs',
    url: `http://127.0.0.1:${E2E_BILLING_WEB_PORT}/iniciar-sesion`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { API_URL: 'http://127.0.0.1:3102', PORT: String(E2E_BILLING_WEB_PORT), HOST: '127.0.0.1' },
  }],
});
