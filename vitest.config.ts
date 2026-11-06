import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` lanza fuera del runtime de React Server; en tests es un no-op.
  "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
};

/**
 * Variables locales que necesitan los tests de integración (Supabase Storage):
 * se leen de `.env.local` (valores de la instancia LOCAL, nunca de producción).
 */
function localEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (process.env[k]) out[k] = process.env[k]!;
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && keys.includes(m[1]) && !out[m[1]]) out[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
    }
  }
  return out;
}

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
            ...localEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]),
            DATABASE_POOL_MAX: "25",
            DATABASE_URL:
              process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          },
        },
      },
    ],
  },
});
