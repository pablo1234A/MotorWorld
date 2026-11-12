import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(root, "src"), "server-only": path.resolve(root, "tests/support/server-only.ts") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/load-env.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Comparten la misma base de datos local: se ejecutan en serie.
          fileParallelism: false,
        },
      },
    ],
  },
});
