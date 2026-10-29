/**
 * Proceso de trabajos en segundo plano del motor de seguimiento.
 *
 *   npm run worker          → bucle continuo (cada WORKER_INTERVAL_SECONDS)
 *   npm run worker -- --once → un único ciclo (para cron o tareas programadas del alojamiento)
 *
 * Todo el estado vive en PostgreSQL: el proceso puede reiniciarse en cualquier momento y
 * pueden ejecutarse varios a la vez sin envíos duplicados.
 */
import pino from 'pino';
import { runCycle } from './automation/runner.js';
import { createFollowUpProvider } from './automation/providers.js';
import { loadConfig } from './config.js';
import { createDb } from './db/database.js';
import { safeErrorSerializer } from './lib/log.js';

const config = loadConfig();
const logger = pino({
  level: config.logLevel === 'silent' ? 'silent' : config.logLevel,
  base: { proc: 'worker' },
  serializers: { err: safeErrorSerializer },
});
const db = createDb(config.databaseUrl, Math.min(config.dbPoolMax, 5));
const provider = createFollowUpProvider(config);
const once = process.argv.includes('--once');
const RETENTION_EVERY_MS = 60 * 60_000;

let stopping = false;
let lastRetention = 0;

async function cycle() {
  const started = Date.now();
  const retention = started - lastRetention >= RETENTION_EVERY_MS;
  try {
    const result = await runCycle({ db, config, provider }, { retention, logger });
    if (retention) lastRetention = started;
    logger.info({ ...result, ms: Date.now() - started }, 'Ciclo del motor completado');
  } catch (error) {
    logger.error({ err: (error as Error).message }, 'Ciclo del motor fallido');
  }
}

async function main() {
  logger.info(
    { provider: provider.name, configured: provider.configured, tracksDelivery: provider.tracksDelivery, intervalMs: config.automation.workerIntervalMs },
    provider.configured ? 'Motor de seguimiento iniciado' : 'Motor iniciado SIN proveedor de email: no se enviará ningún mensaje',
  );
  if (once) {
    await cycle();
    await db.destroy();
    return;
  }
  while (!stopping) {
    await cycle();
    const wait = Date.now() + config.automation.workerIntervalMs;
    while (!stopping && Date.now() < wait) await new Promise((r) => setTimeout(r, 250));
  }
  await db.destroy();
  logger.info('Motor de seguimiento detenido');
}

// Apagado ordenado: se termina el ciclo en curso antes de salir.
process.on('SIGTERM', () => (stopping = true));
process.on('SIGINT', () => (stopping = true));

main().catch((error) => {
  logger.error({ err: (error as Error).message }, 'Error fatal del motor');
  process.exit(1);
});
