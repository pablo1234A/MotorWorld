import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath as toPath } from 'node:url';

const HERE = path.dirname(toPath(import.meta.url));

export const E2E_DIR = path.resolve(HERE);
export const API_LOG = path.join(E2E_DIR, '.output', 'api.log');
const PID_FILE = path.join(E2E_DIR, '.output', 'api.pid');
const SINK_PID_FILE = path.join(E2E_DIR, '.output', 'sink.pid');
export const SINK_FILE = path.join(E2E_DIR, '.output', 'mailgun-sink.jsonl');
const API_PORT = 3100;
const SINK_PORT = 3101;
// 127.0.0.1 y no «localhost»: Firefox resuelve «localhost» por su cuenta (::1 y 127.0.0.1) y el
// servidor escucha en una sola dirección. En la CI, la primera navegación de un contexto nuevo
// contra localhost:4174 se quedó colgada dos veces; contra 127.0.0.1:4175, nunca.
const WEB_ORIGIN = 'http://127.0.0.1:4174';
// Segunda API con pagos activados contra el simulador local de Stripe (e2e/fake-stripe.mjs).
export const BILLING_API_PORT = 3102;
export const FAKE_STRIPE_PORT = 3103;
export const BILLING_WEB_ORIGIN = 'http://127.0.0.1:4175';
const STRIPE_PID_FILE = path.join(E2E_DIR, '.output', 'stripe.pid');
const BILLING_PID_FILE = path.join(E2E_DIR, '.output', 'api-billing.pid');
export const BILLING_API_LOG = path.join(E2E_DIR, '.output', 'api-billing.log');
// Valores de PRUEBA inventados (no son claves de Stripe): solo los entiende el simulador.
const FAKE_STRIPE = {
  secretKey: 'sk_test_simuladorE2E0123456789',
  webhookSecret: 'whsec_simuladorE2E0123456789',
  prices: { price_e2eStarter: { amount: 2799 }, price_e2ePro: { amount: 5799 }, price_e2eBusiness: { amount: 12799 } },
};

/**
 * Entorno de la API y del proceso de envío en las pruebas. El proveedor «mailgun» apunta a
 * un SIMULADOR LOCAL (e2e/mailgun-sink.mjs): se ejecuta el adaptador HTTP real, pero ningún
 * mensaje sale a Internet. No equivale a una prueba con Mailgun.
 */
export function apiEnv(appUrl: string): NodeJS.ProcessEnv {
  return {
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
    FOLLOWUP_EMAIL_PROVIDER: 'mailgun',
    FOLLOWUP_FROM_EMAIL: 'seguimiento@mg.e2e.test',
    MAILGUN_API_KEY: 'clave-del-simulador',
    MAILGUN_DOMAIN: 'mg.e2e.test',
    MAILGUN_API_BASE: `http://127.0.0.1:${SINK_PORT}`,
    MAILGUN_WEBHOOK_SIGNING_KEY: 'firma-del-simulador',
    PUBLIC_API_URL: WEB_ORIGIN,
    // Varias cuentas por ejecución desde la misma IP, compartidas por las dos APIs.
    RATE_LIMIT_REGISTER_PER_HOUR: '200',
  };
}

/** La misma API con pagos de PRUEBA activados, contra el simulador local de Stripe. */
export function billingApiEnv(appUrl: string): NodeJS.ProcessEnv {
  return {
    ...apiEnv(appUrl),
    PORT: String(BILLING_API_PORT),
    APP_WEB_URL: BILLING_WEB_ORIGIN,
    PUBLIC_API_URL: BILLING_WEB_ORIGIN,
    PAYMENTS_ENABLED: 'true',
    STRIPE_SECRET_KEY: FAKE_STRIPE.secretKey,
    STRIPE_WEBHOOK_SECRET: FAKE_STRIPE.webhookSecret,
    STRIPE_PRICE_STARTER: 'price_e2eStarter',
    STRIPE_PRICE_PRO: 'price_e2ePro',
    STRIPE_PRICE_BUSINESS: 'price_e2eBusiness',
    STRIPE_API_BASE: `http://127.0.0.1:${FAKE_STRIPE_PORT}`,
  };
}

async function waitFor(url: string, log: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`La API de pruebas no arrancó. Revisa ${log}`);
}

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
  rmSync(SINK_FILE, { force: true });
  const sink = spawn(process.execPath, [path.join(E2E_DIR, 'mailgun-sink.mjs'), String(SINK_PORT), SINK_FILE], { detached: true, stdio: 'ignore' });
  sink.unref();
  writeFileSync(SINK_PID_FILE, String(sink.pid));

  const out = openSync(API_LOG, 'w');
  const api = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: apiDir,
    detached: true,
    stdio: ['ignore', out, out],
    env: apiEnv(appUrl),
  });
  api.unref();
  writeFileSync(PID_FILE, String(api.pid));

  const stripe = spawn(
    process.execPath,
    [path.join(E2E_DIR, 'fake-stripe.mjs'), String(FAKE_STRIPE_PORT), `http://127.0.0.1:${BILLING_API_PORT}/api/v1/webhooks/stripe`, FAKE_STRIPE.webhookSecret, JSON.stringify(FAKE_STRIPE.prices)],
    { detached: true, stdio: 'ignore' },
  );
  stripe.unref();
  writeFileSync(STRIPE_PID_FILE, String(stripe.pid));
  const billingOut = openSync(BILLING_API_LOG, 'w');
  const billingApi = spawn('npx', ['tsx', 'src/server.ts'], { cwd: apiDir, detached: true, stdio: ['ignore', billingOut, billingOut], env: billingApiEnv(appUrl) });
  billingApi.unref();
  writeFileSync(BILLING_PID_FILE, String(billingApi.pid));

  await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health/ready`, API_LOG);
  await waitFor(`http://127.0.0.1:${BILLING_API_PORT}/api/v1/health/ready`, BILLING_API_LOG);
}
