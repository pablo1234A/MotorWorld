import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/database.js';

const config = loadConfig();
let logPoolError: (code: string) => void = () => {};
// Una conexión inactiva cerrada por PostgreSQL no tumba el proceso (ver db/database.ts).
const db = createDb(config.databaseUrl, config.dbPoolMax, (error) => logPoolError(error.code ?? 'connection'));
const app = await buildApp({ config, db });
logPoolError = (code) => app.log.warn({ errCode: code }, 'Conexión inactiva con PostgreSQL cerrada; se reabrirá al necesitarla');

// Una promesa rechazada sin capturar se registra; un error síncrono sin capturar deja el
// proceso en un estado desconocido: se registra y se sale para que el gestor lo reinicie.
process.on('unhandledRejection', (reason) => app.log.error({ err: reason }, 'Promesa rechazada sin capturar'));
process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'Error no capturado: se reinicia el proceso');
  process.exit(1);
});

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
