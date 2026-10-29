import { CamelCasePlugin, Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

// int8 → number (los importes en céntimos caben de sobra en un entero seguro de JS).
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Entero fuera de rango seguro');
  return n;
});
// date → 'YYYY-MM-DD' (sin conversiones de zona horaria).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export type Db = Kysely<Database>;
export type Trx = Transaction<Database>;

export type PoolErrorHandler = (error: Error & { code?: string }) => void;

/** Registro mínimo por defecto (sin URL, credenciales ni datos de la consulta). */
const defaultPoolErrorHandler: PoolErrorHandler = (error) => {
  process.stderr.write(
    `${JSON.stringify({ level: 40, time: Date.now(), code: error.code ?? null, msg: 'Conexión inactiva con PostgreSQL cerrada; se abrirá otra al necesitarla' })}\n`,
  );
};

export function createDb(connectionString: string, poolMax = 10, onPoolError: PoolErrorHandler = defaultPoolErrorHandler): Db {
  const pool = new pg.Pool({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: 'presupio-api',
  });
  // Sin este manejador, el cierre de una conexión INACTIVA por PostgreSQL (reinicio, corte de
  // red, mantenimiento: código 57P01) emite un evento 'error' que termina el proceso. El pool
  // ya descarta esa conexión; las consultas en curso fallan con su propio error (→ 503).
  pool.on('error', (error) => onPoolError(error as Error & { code?: string }));
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin()],
  });
}

export interface TenantContext {
  companyId: string;
  userId: string | null;
}

/**
 * Ejecuta `fn` en una transacción con la empresa activa fijada para Row-Level Security.
 * Fuera de esta función, las tablas de empresa no devuelven ni aceptan filas.
 */
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.company_id', ${ctx.companyId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`.execute(
      trx,
    );
    return fn(trx);
  });
}

/** Transacción con solo el usuario fijado (p. ej. para listar sus membresías al iniciar sesión). */
export async function withUser<T>(db: Db, userId: string, fn: (trx: Trx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.company_id', '', true), set_config('app.user_id', ${userId}, true)`.execute(trx);
    return fn(trx);
  });
}

/** Cambia la empresa activa dentro de una transacción ya abierta. */
export async function setTenant(trx: Trx, ctx: TenantContext): Promise<void> {
  await sql`select set_config('app.company_id', ${ctx.companyId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`.execute(
    trx,
  );
}
