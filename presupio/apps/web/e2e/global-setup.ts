import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath as toPath } from 'node:url';

const HERE = path.dirname(toPath(import.meta.url));

export const E2E_DIR = path.resolve(HERE);
export const API_LOG = path.join(E2E_DIR, '.output', 'api.log');
const PID_FILE = path.join(E2E_DIR, '.output', 'api.pid');
const API_PORT = 3100;
const WEB_ORIGIN = 'http://localhost:4174';

/**
 * 1) Recrea el esquema de la base de datos de pruebas y aplica las migraciones reales.
 * 2) Arranca la API real con correo en modo "log" (solo pruebas) para poder leer los
 *    enlaces de recuperación de contraseña desde su salida.
 */
export default async function globalSetup() {
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL;
  const appUrl = process.env.TEST_DATABASE_URL;
  if (!ownerUrl || !appUrl) throw new Error('Faltan TEST_MIGRATION_DATABASE_URL y TEST_DATABASE_URL (ver README).');
  if (!new URL(ownerUrl).pathname.endsWith('_test')) throw new Error('Las pruebas E2E solo se ejecutan sobre una base *_test');

  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await client.end();

  const apiDir = path.resolve(E2E_DIR, '../../api');
  const migrate = spawnSync('npx', ['tsx', 'scripts/migrate.ts'], {
    cwd: apiDir,
    env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl, DATABASE_URL: appUrl },
    encoding: 'utf8',
  });
  if (migrate.status !== 0) throw new Error(`Migración fallida: ${migrate.stderr || migrate.stdout}`);

  mkdirSync(path.dirname(API_LOG), { recursive: true });
  const out = openSync(API_LOG, 'w');
  const api = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: apiDir,
    detached: true,
    stdio: ['ignore', out, out],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      PORT: String(API_PORT),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'warn',
      DATABASE_URL: appUrl,
      APP_WEB_URL: WEB_ORIGIN,
      MAIL_TRANSPORT: 'log',
      TRIAL_DAYS: '14',
      // Las pruebas recorren muchas pantallas desde una sola IP en pocos segundos.
      RATE_LIMIT_PER_MINUTE: '20000',
    },
  });
  api.unref();
  writeFileSync(PID_FILE, String(api.pid));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/health/ready`);
      if (res.ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`La API de pruebas no arrancó. Revisa ${API_LOG}`);
}
