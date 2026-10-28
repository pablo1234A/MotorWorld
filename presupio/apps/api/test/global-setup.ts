import pg from 'pg';
import { migrate } from '../src/db/migrator.js';

/**
 * Recrea el esquema de la base de datos de pruebas y aplica todas las migraciones.
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
}
