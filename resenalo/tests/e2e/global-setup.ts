import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { E2E_ENV } from "./env";

/** Prepara la BD dedicada de E2E (migraciones + planes) y arranca el worker real. */
export default async function globalSetup() {
  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const tables = execSync(
    `psql "${E2E_ENV.DATABASE_URL}" -Atc "SELECT string_agg(format('%I', tablename), ',') FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('_prisma_migrations','plans')"`,
    { env },
  ).toString().trim();
  if (tables) execSync(`psql "${E2E_ENV.DATABASE_URL}" -c "TRUNCATE ${tables} RESTART IDENTITY CASCADE"`, { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
  execSync("redis-cli -n 6 FLUSHDB", { stdio: "pipe" });

  const logDir = path.join(__dirname, ".artifacts");
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, "worker.log"), "w");
  const worker = spawn("npx", ["tsx", "src/worker/index.ts"], { env: { ...env, LOG_LEVEL: "info" }, stdio: ["ignore", out, out], detached: true });
  await new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const log = fs.readFileSync(path.join(logDir, "worker.log"), "utf8");
      if (log.includes("worker de Rese")) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - t0 > 60_000) {
        clearInterval(iv);
        reject(new Error("el worker no arrancó:\n" + log));
      }
    }, 300);
  });
  return async () => {
    try {
      process.kill(-worker.pid!, "SIGTERM");
    } catch {
      /* ya terminado */
    }
  };
}
