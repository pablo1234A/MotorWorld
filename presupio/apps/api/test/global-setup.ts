import pg from 'pg';
import { migrate } from '../src/db/migrator.js';
import { TEST_WORKERS, workerDatabaseName } from './worker-db.js';

/**
 * 1) Recrea el esquema de la base de datos de pruebas (plantilla) y aplica las migraciones.
 * 2) Con DATABASE_ADMIN_URL, clona una base de datos por trabajador de Vitest a partir de la
 *    plantilla: cada archivo de pruebas trabaja en la base de su trabajador y ningún proceso
 *    del motor (p. ej. runCycle, que recorre todas las empresas) ve los datos de otro archivo.
 * Solo actúa sobre bases de datos cuyo nombre termina en "_test".
 */
export default async function setup() {
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  const appUrl = process.env.TEST_DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    throw new Error('Faltan TEST_MIGRATION_DATABASE_URL y TEST_DATABASE_URL (ver .env.example y README).');
  }
  const dbName = new URL(ownerUrl).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Por seguridad, las pruebas solo se ejecutan en una base *_test (recibido: ${dbName})`);
  const appRole = decodeURIComponent(new URL(appUrl).username);
  const ownerRole = decodeURIComponent(new URL(ownerUrl).username);

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally {
    await client.end();
  }
  await migrate({ connectionString: ownerUrl, appRole });

  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) return; // sin administrador: una sola base y archivos en serie (vitest.config.ts)
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const ident = (v: string) => `"${v.replace(/"/g, '""')}"`;
    for (let i = 1; i <= TEST_WORKERS; i++) {
      const name = workerDatabaseName(dbName, i);
      await admin.query(`DROP DATABASE IF EXISTS ${ident(name)} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${ident(name)} TEMPLATE ${ident(dbName)} OWNER ${ident(ownerRole)}`);
    }
  } finally {
    await admin.end();
  }
}
