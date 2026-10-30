import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/db → apps/api ; dist/src/db → apps/api
const apiRoot = here.includes(`${path.sep}dist${path.sep}`) ? path.resolve(here, '../../..') : path.resolve(here, '../..');
export const MIGRATIONS_DIR = path.join(apiRoot, 'migrations');

// Clave arbitraria para el bloqueo consultivo que evita migraciones concurrentes.
const LOCK_KEY = 4_815_162_342;

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(path.join(dir, file), 'utf8');
      return {
        version: file.replace(/\.sql$/, ''),
        sql: content,
        checksum: createHash('sha256').update(content).digest('hex'),
      };
    }),
  );
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Nombre de rol inválido: ${name}`);
  return `"${name}"`;
}

/**
 * Aplica las migraciones pendientes con el rol propietario del esquema y concede al rol
 * de la aplicación únicamente los permisos de datos que necesita (sin DDL, sin BYPASSRLS).
 */
export async function migrate(options: {
  connectionString: string;
  appRole: string;
  dir?: string;
  log?: (msg: string) => void;
}): Promise<MigrationResult> {
  const log = options.log ?? (() => {});
  const migrations = await loadMigrations(options.dir ?? MIGRATIONS_DIR);
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const done = new Map(rows.map((r) => [r.version, r.checksum]));
    const known = new Set(migrations.map((m) => m.version));
    for (const version of done.keys()) {
      if (!known.has(version)) throw new Error(`La base de datos tiene la migración ${version}, que no existe en el código`);
    }

    const result: MigrationResult = { applied: [], alreadyApplied: [] };
    for (const m of migrations) {
      const existing = done.get(m.version);
      if (existing) {
        if (existing !== m.checksum) {
          throw new Error(`La migración ${m.version} ya aplicada ha sido modificada. Crea una migración nueva en su lugar.`);
        }
        result.alreadyApplied.push(m.version);
        continue;
      }
      log(`Aplicando ${m.version}…`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [m.version, m.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Error en la migración ${m.version}: ${(error as Error).message}`, { cause: error });
      }
      result.applied.push(m.version);
    }

    await applyGrants(client, options.appRole);
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function applyGrants(client: pg.Client, appRole: string): Promise<void> {
  const role = quoteIdent(appRole);
  const { rows } = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [appRole],
  );
  const info = rows[0];
  if (!info) throw new Error(`El rol de aplicación "${appRole}" no existe. Ejecuta npm run db:bootstrap o créalo manualmente.`);
  if (info.rolsuper || info.rolbypassrls) {
    throw new Error(`El rol de aplicación "${appRole}" no puede ser superusuario ni tener BYPASSRLS`);
  }
  const { rows: owner } = await client.query<{ current_user: string }>('SELECT current_user');
  if (owner[0]?.current_user === appRole) {
    throw new Error('Las migraciones deben ejecutarse con un rol distinto del rol de la aplicación');
  }

  // Esquema que se está migrando (el primero del search_path: «public» en una instalación normal).
  const { rows: current } = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
  const schemaName = current[0]?.schema;
  if (!schemaName) throw new Error('No hay ningún esquema en el search_path');
  const schema = quoteIdent(schemaName);

  await client.query('BEGIN');
  try {
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    // Solo los objetos del rol de migraciones (los de Presupio). Un PostgreSQL gestionado puede
    // tener extensiones en el mismo esquema (p. ej. pg_stat_statements) cuyas funciones este rol
    // no puede conceder: con «ON ALL … IN SCHEMA» el despliegue fallaba con «permission denied».
    const owned = async (sql: string) => (await client.query<{ name: string }>(sql, [schemaName])).rows.map((r) => r.name);
    const tables = await owned(
      `SELECT format('%I.%I', n.nspname, c.relname) AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm') AND pg_has_role(c.relowner, 'USAGE') ORDER BY 1`,
    );
    for (const table of tables) {
      await client.query(`REVOKE ALL ON ${table} FROM ${role}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${role}`);
    }
    // Restricciones por tabla (solo si la tabla existe: así se puede migrar paso a paso).
    const restrict = async (table: string, privileges: string) => {
      const qualified = `${schema}.${quoteIdent(table)}`;
      const { rows: found } = await client.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [qualified]);
      if (found[0]?.exists) await client.query(`REVOKE ${privileges} ON ${qualified} FROM ${role}`);
    };
    // El historial de actividad es de solo inserción.
    await restrict('activity_log', 'UPDATE, DELETE');
    // El plan y su estado no se modifican desde la aplicación: solo los crea el alta (prueba
    // gratuita) y los cambia un proceso de operación o, en la fase 5, el proveedor de pagos
    // (con otro rol). Aunque un endpoint tuviera un fallo, la base de datos lo impide.
    await restrict('subscriptions', 'UPDATE, DELETE');
    // Las recuperaciones y los periodos de uso no se borran ni se reescriben desde la aplicación.
    await restrict('recovery_events', 'UPDATE, DELETE');
    await restrict('usage_periods', 'DELETE');
    // Los intentos no se borran (sus cambios de estado los limita un disparador) y el historial
    // de facturación solo lo escriben las funciones acotadas que aplican webhooks verificados.
    await restrict('attempt_events', 'DELETE');
    await restrict('billing_events', 'INSERT, UPDATE, DELETE');
    await restrict('retention_notices', 'UPDATE, DELETE');
    await restrict('trial_notices', 'UPDATE, DELETE');
    // Las huellas de prueba no se modifican ni se borran desde la aplicación (solo la retención).
    await restrict('trial_claims', 'UPDATE, DELETE');
    // La tabla de migraciones no es asunto de la aplicación.
    await client.query(`REVOKE ALL ON ${schema}.schema_migrations FROM ${role}`);
    // Funciones auxiliares, incluidas las SECURITY DEFINER acotadas (revocadas a PUBLIC en su migración).
    const functions = await owned(
      `SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.prokind = 'f' AND pg_has_role(p.proowner, 'USAGE') ORDER BY 1`,
    );
    for (const fn of functions) await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO ${role}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
