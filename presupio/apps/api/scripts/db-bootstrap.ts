/**
 * Prepara PostgreSQL para desarrollo y pruebas locales (idempotente):
 *  - Rol propietario (ejecuta migraciones) y rol de aplicación (sin BYPASSRLS ni DDL).
 *  - Bases de datos de desarrollo y de pruebas.
 *
 * Necesita DATABASE_ADMIN_URL (un superusuario local). No se usa en producción:
 * allí los roles los crea el proveedor o el equipo de infraestructura.
 */
import pg from 'pg';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('Falta DATABASE_ADMIN_URL (superusuario de PostgreSQL local).');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('db:bootstrap es solo para desarrollo y pruebas.');
  process.exit(1);
}

interface Target {
  ownerUrl: string;
  appUrl: string;
}

const targets: Target[] = [];
if (process.env.MIGRATION_DATABASE_URL && process.env.DATABASE_URL) {
  targets.push({ ownerUrl: process.env.MIGRATION_DATABASE_URL, appUrl: process.env.DATABASE_URL });
}
if (process.env.TEST_MIGRATION_DATABASE_URL && process.env.TEST_DATABASE_URL) {
  targets.push({ ownerUrl: process.env.TEST_MIGRATION_DATABASE_URL, appUrl: process.env.TEST_DATABASE_URL });
}
if (targets.length === 0) {
  console.error('Define MIGRATION_DATABASE_URL + DATABASE_URL y/o TEST_MIGRATION_DATABASE_URL + TEST_DATABASE_URL.');
  process.exit(1);
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Identificador no permitido: ${name}`);
  return `"${name}"`;
}

function parse(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

async function ensureRole(name: string, password: string) {
  const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
  const verb = exists.rowCount ? 'ALTER' : 'CREATE';
  // La contraseña se escapa como literal; no se registra en ningún log.
  const literal = (await admin.query<{ q: string }>('SELECT quote_literal($1) AS q', [password])).rows[0]!.q;
  await admin.query(
    `${verb} ROLE ${ident(name)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${literal}`,
  );
  console.log(`Rol ${name}: ${exists.rowCount ? 'actualizado' : 'creado'}`);
}

try {
  for (const target of targets) {
    const owner = parse(target.ownerUrl);
    const app = parse(target.appUrl);
    if (owner.database !== app.database) throw new Error('Las URLs de propietario y aplicación deben apuntar a la misma base de datos');
    if (owner.user === app.user) throw new Error('El rol propietario y el de aplicación deben ser distintos');

    await ensureRole(owner.user, owner.password);
    await ensureRole(app.user, app.password);

    const db = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [owner.database]);
    if (!db.rowCount) {
      await admin.query(`CREATE DATABASE ${ident(owner.database)} OWNER ${ident(owner.user)} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`Base de datos ${owner.database}: creada`);
    } else {
      await admin.query(`ALTER DATABASE ${ident(owner.database)} OWNER TO ${ident(owner.user)}`);
      console.log(`Base de datos ${owner.database}: ya existía`);
    }
    await admin.query(`REVOKE ALL ON DATABASE ${ident(owner.database)} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${ident(owner.database)} TO ${ident(app.user)}`);

    // En la nueva base de datos: el esquema public pertenece al propietario.
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${owner.database}`;
    const c = new pg.Client({ connectionString: dbUrl.toString() });
    await c.connect();
    try {
      await c.query(`ALTER SCHEMA public OWNER TO ${ident(owner.user)}`);
      await c.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    } finally {
      await c.end();
    }
  }
  console.log('Listo. Ahora ejecuta: npm run db:migrate');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await admin.end();
}
