import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { TEST_WORKERS } from './test/worker-db.js';

// Variables locales (TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL, DATABASE_ADMIN_URL) desde ../../.env si existe.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// Con DATABASE_ADMIN_URL cada trabajador usa su propia base de datos (test/global-setup.ts) y los
// archivos se ejecutan en paralelo. Sin ella, todos comparten una base y se ejecutan en serie.
const isolated = !!process.env.DATABASE_ADMIN_URL;

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/worker-db.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    pool: 'forks',
    maxWorkers: TEST_WORKERS,
    fileParallelism: isolated,
    // npm run test:coverage. Umbrales por debajo de lo medido para detectar retrocesos.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/worker.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 88, branches: 75, functions: 90, lines: 92 },
    },
  },
});
