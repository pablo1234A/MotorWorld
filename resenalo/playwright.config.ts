import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./tests/e2e/env";

const env = { ...process.env, ...E2E_ENV } as Record<string, string>;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "es-ES" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    { command: "npx tsx tests/e2e/mock-services.ts", port: 4010, reuseExistingServer: false, env },
    { command: `npx next start -p ${E2E_PORT}`, port: E2E_PORT, reuseExistingServer: false, env, timeout: 120_000 },
  ],
});
