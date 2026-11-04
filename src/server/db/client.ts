import "server-only";

import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";

import { mapDatabaseError } from "./errors";
import type { DB } from "./schema.gen";

/**
 * Acceso a PostgreSQL (ADR-003) con Kysely y tipos generados
 * (`pnpm db:types` → src/server/db/schema.gen.ts).
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

// Las fechas de negocio (`date`) se tratan como texto AAAA-MM-DD: convertirlas
// a Date de JS desplazaría el día según la zona horaria del servidor.
pg.types.setTypeParser(1082, (value: string) => value);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Tx = Transaction<DB>;

let pool: pg.Pool | undefined;
let db: Kysely<DB> | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DATABASE_URL no está configurada o no es una URL de PostgreSQL");
  }
  return url;
}

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "revisaya",
  });
  return pool;
}

function getDb(): Kysely<DB> {
  db ??= new Kysely<DB>({ dialect: new PostgresDialect({ pool: getPool() }) });
  return db;
}

export async function closePool(): Promise<void> {
  // Kysely.destroy() cierra también el pool que se le pasó.
  if (db) await db.destroy();
  else await pool?.end();
  db = undefined;
  pool = undefined;
}

export interface AuthContext {
  /** `sub` del JWT verificado por Supabase Auth. */
  userId: string;
  /** Claims adicionales verificados (email, aal, session_id…). */
  claims?: Record<string, unknown>;
}

async function run<T>(setup: (tx: Tx) => Promise<unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await getDb()
      .transaction()
      .execute(async (tx) => {
        await setup(tx);
        return fn(tx);
      });
  } catch (err) {
    throw mapDatabaseError(err);
  }
}

export function withRls<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(auth.userId)) {
    throw new Error("withRls: userId no es un UUID válido");
  }
  const claims = JSON.stringify({ ...auth.claims, sub: auth.userId, role: "authenticated" });
  return run(
    (tx) => sql`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`.execute(tx),
    fn,
  );
}

export function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run((tx) => sql`select set_config('request.jwt.claims', '', true)`.execute(tx), fn);
}
