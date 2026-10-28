import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Variables locales (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL) desde ../../.env si existe.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export const E2E_API_PORT = 3100;
export const E2E_WEB_PORT = 4174;

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
  webServer: {
    command: `npm run build && npx vite preview --port ${E2E_WEB_PORT} --strictPort`,
    url: `http://localhost:${E2E_WEB_PORT}/iniciar-sesion`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PRESUPIO_API_PROXY: `http://localhost:${E2E_API_PORT}`, PREVIEW_PORT: String(E2E_WEB_PORT) },
  },
});
