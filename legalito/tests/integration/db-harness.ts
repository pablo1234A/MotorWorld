import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Arnés de pruebas de base de datos.
 * Crea una base de datos efímera en un PostgreSQL local, aplica la emulación
 * mínima de Supabase, todas las migraciones y los datos iniciales.
 *
 * Variable: TEST_DATABASE_URL (por defecto postgres://postgres:postgres@localhost:5432/postgres)
 */
const ROOT = join(__dirname, "..", "..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export interface TestDb {
  pool: pg.Pool;
  name: string;
  drop: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDb> {
  const name = `legalito_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });

  const files = [
    join(ROOT, "tests/db/supabase-shim.sql"),
    ...readdirSync(join(ROOT, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(ROOT, "supabase/migrations", f)),
    join(ROOT, "supabase/seed/base.sql"),
  ];
  const templatesSeed = join(ROOT, "supabase/seed/templates.sql");
  if (existsSync(templatesSeed)) files.push(templatesSeed);

  for (const file of files) {
    await pool.query(readFileSync(file, "utf8"));
  }

  return {
    pool,
    name,
    drop: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

export async function createAuthUser(pool: pg.Pool, email: string, meta: Record<string, unknown> = {}) {
  const { rows } = await pool.query(
    "insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id",
    [email, JSON.stringify(meta)],
  );
  const userId: string = rows[0].id;
  const org = await pool.query("select id from public.organizations where owner_id = $1", [userId]);
  return { userId, orgId: org.rows[0].id as string };
}

type Role = "anon" | "authenticated" | "service_role";

/** Ejecuta `fn` dentro de una transacción con el rol y los claims JWT indicados. Siempre revierte. */
export async function as<T>(
  pool: pg.Pool,
  role: Role,
  userId: string | null,
  fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const claims = userId ? { sub: userId, role } : { role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    let n = 0;
    const q = async (sql: string, params?: unknown[]) => {
      // Cada sentencia en su savepoint para que un error esperado no aborte la transacción.
      const sp = `sp_${n++}`;
      await client.query(`savepoint ${sp}`);
      try {
        const r = await client.query(sql, params);
        await client.query(`release savepoint ${sp}`);
        return r;
      } catch (e) {
        await client.query(`rollback to savepoint ${sp}`);
        throw e;
      }
    };
    return await fn(q);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
