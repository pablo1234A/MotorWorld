import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrator.js';

/*
 * Copia y restauración con los scripts REALES (ops/backup.sh y ops/restore.sh), como en un
 * PostgreSQL gestionado: la base de origen tiene una extensión del proveedor (pg_stat_statements)
 * que el rol propietario no puede crear. Necesita DATABASE_ADMIN_URL (crea y borra bases) y los
 * clientes de PostgreSQL (pg_dump, pg_restore, psql).
 */

const OPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'ops');
const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL!;
const appUrl = process.env.TEST_DATABASE_URL!;
const appRole = decodeURIComponent(new URL(appUrl).username);
const ownerRole = decodeURIComponent(new URL(ownerUrl).username);
const hasTools = ['pg_dump', 'pg_restore', 'psql'].every((t) => spawnSync(t, ['--version']).status === 0);

const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

async function adminQuery(sql: string, db?: string) {
  const c = new pg.Client({ connectionString: db ? withDb(process.env.DATABASE_ADMIN_URL!, db) : process.env.DATABASE_ADMIN_URL });
  await c.connect();
  try {
    return await c.query(sql);
  } finally {
    await c.end();
  }
}

async function ownerQuery<T extends pg.QueryResultRow>(db: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: withDb(ownerUrl, db) });
  await c.connect();
  try {
    return (await c.query<T>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

describe.skipIf(!process.env.DATABASE_ADMIN_URL || !hasTools)('copias de seguridad (ops/backup.sh y ops/restore.sh)', () => {
  it('copia una base en uso y la restaura en una base vacía aunque el origen tenga extensiones del proveedor', async () => {
    const base = `${new URL(ownerUrl).pathname.slice(1)}_bk`;
    const src = `${base}_origen`;
    const dst = `${base}_destino`;
    const dir = mkdtempSync(path.join(tmpdir(), 'presupio-copia-'));
    try {
      for (const db of [src, dst]) {
        await adminQuery(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
        await adminQuery(`CREATE DATABASE ${db} OWNER ${ownerRole}`);
        await adminQuery(`GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO ${appRole}`);
      }
      // Origen: esquema completo, datos y una extensión que solo puede crear un superusuario.
      await migrate({ connectionString: withDb(ownerUrl, src), appRole });
      const [company] = await ownerQuery<{ id: string }>(src, `INSERT INTO companies (name) VALUES ('Empresa copiada') RETURNING id`);
      const [contact] = await ownerQuery<{ id: string }>(src, `INSERT INTO contacts (company_id, full_name, email) VALUES ($1, 'Cliente', 'cliente@ejemplo.test') RETURNING id`, [company!.id]);
      await ownerQuery(src, `INSERT INTO quotes (company_id, contact_id, title) SELECT $1, $2, 'Presupuesto ' || g FROM generate_series(1, 50) g`, [company!.id, contact!.id]);
      await adminQuery('CREATE EXTENSION IF NOT EXISTS pg_stat_statements', src);

      const backup = spawnSync('bash', [path.join(OPS, 'backup.sh'), dir], { env: { ...process.env, BACKUP_DATABASE_URL: withDb(ownerUrl, src) }, encoding: 'utf8' });
      expect(backup.status, backup.stderr).toBe(0);
      const file = readdirSync(dir).find((f) => f.endsWith('.dump'))!;
      expect(readdirSync(dir)).toContain(`${file}.sha256`);

      // Antes: «permission denied to create extension» y la restauración se abortaba entera.
      const restore = spawnSync('bash', [path.join(OPS, 'restore.sh'), path.join(dir, file)], { env: { ...process.env, RESTORE_DATABASE_URL: withDb(ownerUrl, dst) }, encoding: 'utf8' });
      expect(restore.status, restore.stderr).toBe(0);
      // Tras restaurar se migra (vuelve a conceder permisos al rol de la aplicación).
      expect((await migrate({ connectionString: withDb(ownerUrl, dst), appRole })).applied).toEqual([]);
      expect(await ownerQuery(dst, 'SELECT count(*)::int AS n FROM quotes')).toEqual([{ n: 50 }]);
      // RLS sigue activo y el rol de la aplicación tiene sus permisos: sin empresa no ve nada.
      const app = new pg.Client({ connectionString: withDb(appUrl, dst) });
      await app.connect();
      try {
        expect((await app.query('SELECT count(*)::int AS n FROM quotes')).rows).toEqual([{ n: 0 }]);
      } finally {
        await app.end();
      }

      // Restaurar encima de una base que no está vacía se rechaza.
      const again = spawnSync('bash', [path.join(OPS, 'restore.sh'), path.join(dir, file)], { env: { ...process.env, RESTORE_DATABASE_URL: withDb(ownerUrl, dst) }, encoding: 'utf8' });
      expect(again.status).not.toBe(0);
      expect(again.stderr).toMatch(/no está vacía/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      for (const db of [src, dst]) await adminQuery(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    }
  });
});
