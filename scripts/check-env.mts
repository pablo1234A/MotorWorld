/**
 * Comprueba la configuración antes de desplegar: `pnpm check:env`
 * Lee .env.local (y el entorno del proceso) y valida con el mismo esquema que usa la app.
 */
import { config } from "dotenv";
import { envSchema } from "../src/lib/config/env-schema.ts";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const result = envSchema.safeParse(process.env);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const warn = (text: string) => console.log(`  ! ${text}`);

console.log("\nComprobación de configuración de AnunciaPro\n");
if (!result.success) {
  console.log("Errores:");
  for (const issue of result.error.issues) console.log(`  ✗ ${issue.path.join(".")}: ${issue.message}`);
  console.log("\nConsulta docs/VARIABLES-ENTORNO.md\n");
  process.exit(1);
}

const env = result.data;
ok(`NEXT_PUBLIC_APP_URL = ${env.NEXT_PUBLIC_APP_URL}`);
ok("Supabase: URL y clave pública configuradas");
if (env.SUPABASE_SERVICE_ROLE_KEY) ok("SUPABASE_SERVICE_ROLE_KEY configurada (solo servidor)");
else warn("SUPABASE_SERVICE_ROLE_KEY ausente: no funcionarán el panel de administración, la eliminación de cuentas, la devolución de cuota ni la tarea programada; la limitación de peticiones será solo por instancia.");
if (env.PAYMENTS_ENABLED) ok("Pagos ACTIVADOS: credenciales de Stripe presentes");
else ok("Pagos desactivados (PAYMENTS_ENABLED=false): no se realizará ningún cobro");
ok(`Motor de generación: ${env.AI_PROVIDER === "anthropic" ? `Anthropic (${env.AI_MODEL ?? "modelo por defecto"})` : "plantillas (sin IA)"}`);
if (!env.CRON_SECRET) warn("CRON_SECRET ausente: la tarea programada que reanuda trabajos masivos estará desactivada.");
if (env.NEXT_PUBLIC_APP_URL.startsWith("http://") && !/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_APP_URL)) warn("NEXT_PUBLIC_APP_URL no usa HTTPS.");
if (process.env.NODE_ENV === "production" && /127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL)) warn("Estás apuntando a un Supabase local en producción.");
console.log("\nConfiguración válida.\n");
