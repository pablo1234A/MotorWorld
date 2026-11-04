import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` lanza fuera del runtime de React Server; en tests es un no-op.
  "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Los archivos de integración comparten base de datos: en serie.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Requiere Supabase local (`pnpm db:start`).
          testTimeout: 30_000,
          env: {
            DATABASE_POOL_MAX: "25",
            DATABASE_URL:
              process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          },
        },
      },
    ],
  },
});
