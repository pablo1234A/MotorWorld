/**
 * Comprueba la configuración ANTES de desplegar (pnpm check:env). Lee el
 * entorno del proceso (o un archivo: pnpm check:env -- .env.production) y
 * nunca imprime valores, solo nombres y motivos.
 *   ✖ error: la aplicación no arrancaría o algo importante no funcionaría
 *   ! aviso: funciona, pero falta algo antes de abrir al público
 */
import { readFileSync } from "node:fs";

import { parseServerEnv } from "../src/server/env.ts";

const file = process.argv.slice(2).find((a) => !a.startsWith("-"));
const env: Record<string, string | undefined> = { ...process.env };
if (file) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim() || undefined;
  }
}

const errors: string[] = [];
const warnings: string[] = [];
const has = (k: string) => Boolean(env[k]?.trim());

try {
  parseServerEnv(env);
} catch (err) {
  errors.push(...(err as Error).message.split("\n").slice(1).map((l) => l.replace(/^\s*-\s*/, "")));
}

const prod = env.APP_ENV === "production";
if (prod && !env.APP_URL?.startsWith("https://")) errors.push("APP_URL: en producción tiene que ser https://");
for (const k of ["CRON_SECRET", "EMAIL_LINK_SECRET"]) if (!has(k)) errors.push(`${k}: obligatorio (openssl rand -base64 48)`);
if (!has("EMAIL_PROVIDER")) errors.push("EMAIL_PROVIDER: sin proveedor de correo no se envía ningún aviso (resend recomendado)");
if (env.EMAIL_PROVIDER === "resend" && !has("RESEND_WEBHOOK_SECRET")) warnings.push("RESEND_WEBHOOK_SECRET: sin él no se registran entregas, rebotes ni quejas");
if (!has("STRIPE_SECRET_KEY") || !has("STRIPE_WEBHOOK_SECRET")) warnings.push("STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET: sin ellos no se puede contratar ningún plan");
if (env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && prod) warnings.push("Stripe en modo TEST en producción: nadie paga de verdad (es lo esperado hasta la autorización del responsable)");
if (!has("NEXT_PUBLIC_TURNSTILE_SITE_KEY") || !has("TURNSTILE_SECRET_KEY")) warnings.push("Turnstile: la página pública de citas no tendrá captcha (sí límite de peticiones y campo trampa)");
if (!has("GOOGLE_CLIENT_ID")) warnings.push("Google Calendar no configurado (plan Max): se mostrará como «no configurado»");
if (!has("API_KEY_PEPPER")) warnings.push("API_KEY_PEPPER: la API (plan Excelencia) no estará disponible");
if (has("GOOGLE_CLIENT_ID") && !has("INTEGRATIONS_ENCRYPTION_KEY")) errors.push("INTEGRATIONS_ENCRYPTION_KEY: obligatorio con Google Calendar");
for (const k of ["LEGAL_OWNER_NAME", "LEGAL_OWNER_TAX_ID", "LEGAL_OWNER_ADDRESS", "LEGAL_OWNER_EMAIL"]) if (!has(k)) warnings.push(`${k}: los textos legales mostrarán «pendiente»`);
if (prod && (env.DATABASE_URL ?? "").includes("127.0.0.1")) errors.push("DATABASE_URL apunta a una base de datos local");
if (prod && env.DATABASE_URL && !/pooler\.supabase\.com:6543/.test(env.DATABASE_URL)) warnings.push("DATABASE_URL: en Vercel usa el pooler de Supabase en modo transacción (puerto 6543)");

for (const e of errors) console.log(`✖ ${e}`);
for (const w of warnings) console.log(`! ${w}`);
console.log(errors.length ? `\n${errors.length} error(es): corrígelos antes de desplegar.` : `\nConfiguración válida${warnings.length ? ` con ${warnings.length} aviso(s)` : ""}.`);
process.exit(errors.length ? 1 : 0);
