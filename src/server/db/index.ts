import "server-only";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

/**
 * Database access. With DATABASE_URL (Neon, Supabase or any Postgres) it uses postgres-js;
 * without it, an embedded PGlite database in .data/pglite (real Postgres compiled to WASM,
 * persistent on disk) so the product works end to end with zero setup.
 * Migrations in ./drizzle run once per process before the first query.
 */
/** Both drivers expose the same pg-core query builder; one static type keeps call sites simple. */
type Db = import("drizzle-orm/pglite").PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __wbDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const migrationsFolder = join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 10, prepare: false });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__wbDb) {
    g.__wbDb = connect().catch((e) => {
      g.__wbDb = undefined;
      throw e;
    });
  }
  return g.__wbDb;
}

export { schema };
export type { Db };
