import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Variables locales (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL) desde ../../.env si existe.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
});
