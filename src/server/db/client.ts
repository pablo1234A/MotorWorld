import "server-only";

import { Pool, type PoolClient } from "pg";

import { mapDatabaseError } from "./errors";

/**
 * Acceso a PostgreSQL (ADR-003).
 *
 * - `withRls`: transacción con `role = authenticated` y los claims del JWT YA
 *   VERIFICADO del usuario. Las políticas RLS se aplican también a las
 *   consultas del servidor (defensa en profundidad).
 * - `withSystem`: transacción con el rol de la conexión (evita RLS). Solo para
 *   jobs, webhooks y procesos internos, que deben filtrar siempre por
 *   organization_id de forma explícita.
 *
 * Ambos usan `set_config(..., true)` (equivalente a SET LOCAL): el contexto
 * desaparece al terminar la transacción, compatible con el pooler en modo
 * transacción.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pool: Pool | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DATABASE_URL no está configurada o no es una URL de PostgreSQL");
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "revisaya",
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export interface AuthContext {
  /** `sub` del JWT verificado por Supabase Auth. */
  userId: string;
  /** Claims adicionales verificados (email, aal, session_id…). */
  claims?: Record<string, unknown>;
}

export type Tx = PoolClient;

async function runInTransaction<T>(setup: (tx: Tx) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await setup(client);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw mapDatabaseError(err);
  } finally {
    client.release();
  }
}

export function withRls<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(auth.userId)) {
    throw new Error("withRls: userId no es un UUID válido");
  }
  const claims = JSON.stringify({ ...auth.claims, sub: auth.userId, role: "authenticated" });
  return runInTransaction(async (tx) => {
    await tx.query(
      "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)",
      [claims],
    );
  }, fn);
}

export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runInTransaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', '', true)");
  }, fn);
}
