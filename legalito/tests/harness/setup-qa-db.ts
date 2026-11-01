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
    ["plan-desktop@legalito.test", "Marta Gil"],
    ["plan-mobile@legalito.test", "Jordi Puig"],
  ];
  for (const [email, name] of users) {
    await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now())", [email, JSON.stringify({ full_name: name })]);
  }
  // Agencias (registro con tipo de cuenta «agency») con plan Medium activo.
  for (const [email, name] of [
    ["agencia-desktop@legalito.test", "Estudio Norte"],
    ["agencia-mobile@legalito.test", "Gestoría Sur"],
  ]) {
    await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now())", [email, JSON.stringify({ full_name: name, account_type: "agency" })]);
  }
  await db.query("insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'admin@legalito.test'");
  await db.query("update public.products set stripe_price_id = 'price_qa_one' where code = 'one_time_pack'");
  for (const code of ["subscription_basic", "subscription_medium", "subscription_business"]) {
    await db.query("update public.products set stripe_price_id = $1 where code = $2", [`price_qa_${code}`, code]);
  }
  // Suscriptores del plan Básico con el formulario completado (para probar el cupo).
  const answers = (await import("../../src/lib/documents/samples")).freelancerAnswers;
  for (const email of ["plan-desktop@legalito.test", "plan-mobile@legalito.test"]) {
    const org = (await db.query("select o.id, o.owner_id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1", [email])).rows[0];
    await db.query(
      "insert into public.form_responses (organization_id, created_by, questionnaire_version, answers, status, completed_at) values ($1, $2, 1, $3, 'completed', now())",
      [org.id, org.owner_id, JSON.stringify(answers)],
    );
    await db.query("update public.organizations set stripe_customer_id = $1 where id = $2", [`cus_qa_${email.split("@")[0]}`, org.id]);
    await db.query(
      `insert into public.subscriptions (organization_id, product_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, status, amount_cents, currency, billing_interval, current_period_start, current_period_end)
       select $1, id, $2, $3, stripe_price_id, 'active', 599, 'eur', 'month', now() - interval '3 days', now() + interval '27 days' from public.products where code = 'subscription_basic'`,
      [org.id, `sub_qa_${email.split("@")[0]}`, `cus_qa_${email.split("@")[0]}`],
    );
  }
  for (const email of ["agencia-desktop@legalito.test", "agencia-mobile@legalito.test"]) {
    const key = email.split("@")[0];
    const org = (await db.query("select o.id from public.organizations o join auth.users u on u.id = o.owner_id where u.email = $1 and o.parent_organization_id is null", [email])).rows[0];
    await db.query("update public.organizations set stripe_customer_id = $1, legal_name = $2 where id = $3", [`cus_qa_${key}`, key === "agencia-desktop" ? "Estudio Norte SL" : "Gestoría Sur SL", org.id]);
    await db.query(
      `insert into public.subscriptions (organization_id, product_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, status, amount_cents, currency, billing_interval, current_period_start, current_period_end)
       select $1, id, $2, $3, stripe_price_id, 'active', 999, 'eur', 'month', now() - interval '3 days', now() + interval '27 days' from public.products where code = 'subscription_medium'`,
      [org.id, `sub_qa_${key}`, `cus_qa_${key}`],
    );
  }
  await db.end();
  console.log(url.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
