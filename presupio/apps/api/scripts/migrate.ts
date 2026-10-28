import { migrate } from '../src/db/migrator.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!migrationUrl || !appUrl) {
  console.error('Faltan MIGRATION_DATABASE_URL (rol propietario) y/o DATABASE_URL (rol de la aplicación).');
  process.exit(1);
}

const appRole = decodeURIComponent(new URL(appUrl).username);

try {
  const result = await migrate({ connectionString: migrationUrl, appRole, log: (m) => console.log(m) });
  console.log(
    result.applied.length
      ? `Migraciones aplicadas: ${result.applied.join(', ')}`
      : `Base de datos al día (${result.alreadyApplied.length} migraciones).`,
  );
  console.log(`Permisos de datos concedidos al rol "${appRole}".`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
