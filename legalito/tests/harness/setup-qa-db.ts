/**
 * Prepara la base de datos `legalito_qa` para las pruebas E2E del área privada:
 * migraciones, seed y usuarios de prueba (contraseña: QA_PASSWORD).
 *   npx tsx tests/harness/setup-qa-db.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = join(__dirname, "..", "..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const NAME = "legalito_qa";

async function main() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${NAME} with (force)`);
  await admin.query(`create database ${NAME}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${NAME}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const files = [
    "tests/db/supabase-shim.sql",
    ...readdirSync(join(ROOT, "supabase/migrations")).sort().map((f) => `supabase/migrations/${f}`),
    "supabase/seed/base.sql",
    "supabase/seed/templates.sql",
  ];
  for (const f of files) await db.query(readFileSync(join(ROOT, f), "utf8"));
  const users = [
    ["cliente@legalito.test", "Lucía Martín"],
    ["suscriptora@legalito.test", "Carmen Vidal"],
    ["admin@legalito.test", "Equipo Legalito"],
  ];
  for (const [email, name] of users) {
    await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now())", [email, JSON.stringify({ full_name: name })]);
  }
  await db.query("insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'admin@legalito.test'");
  await db.query("update public.products set stripe_price_id = 'price_qa_one' where code = 'one_time_pack'");
  await db.query("update public.products set stripe_price_id = 'price_qa_sub' where code = 'subscription_monthly'");
  await db.end();
  console.log(url.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
