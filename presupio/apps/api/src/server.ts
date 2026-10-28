import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/database.js';

const config = loadConfig();
const db = createDb(config.databaseUrl, config.dbPoolMax);
const app = await buildApp({ config, db });

if (!app.mailer.configured) {
  app.log.warn(
    'No hay proveedor de correo configurado: los emails de verificación, recuperación e invitación NO se envían. Configura MAIL_TRANSPORT=smtp.',
  );
}

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'Cerrando servidor');
  try {
    await app.close();
    await db.destroy();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Error al cerrar');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'No se pudo iniciar el servidor');
  await db.destroy();
  process.exit(1);
}
