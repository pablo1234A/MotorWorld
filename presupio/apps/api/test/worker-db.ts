import { cpus } from 'node:os';

/** Trabajadores de Vitest en paralelo (uno por base de datos clonada). */
export const TEST_WORKERS = Math.max(1, Math.min(Number(process.env.TEST_WORKERS) || cpus().length, 6));

export function workerDatabaseName(base: string, worker: number): string {
  return `${base}_w${worker}`;
}

/**
 * Se ejecuta antes de cada archivo de pruebas (setupFiles): apunta las variables de la base de
 * datos de pruebas a la base propia del trabajador (VITEST_POOL_ID = 1..TEST_WORKERS).
 */
const worker = Number(process.env.VITEST_POOL_ID);
if (process.env.DATABASE_ADMIN_URL && Number.isInteger(worker) && worker >= 1) {
  for (const key of ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL'] as const) {
    const url = new URL(process.env[key]!);
    url.pathname = `/${workerDatabaseName(url.pathname.slice(1), worker)}`;
    process.env[key] = url.toString();
  }
}
