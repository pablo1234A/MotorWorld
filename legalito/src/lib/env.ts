import "server-only";
import { z } from "zod";

/**
 * Configuración de entorno validada. Los secretos solo se leen en servidor.
 * Los servicios externos son opcionales en desarrollo: si faltan, la
 * funcionalidad correspondiente se muestra como "no configurada" (nunca se
 * simula), y en producción se exige su presencia.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, "Clave de Stripe no válida").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_LIVE_PAYMENTS_ENABLED: bool,
  STRIPE_AUTOMATIC_TAX: bool,

  RESEND_API_KEY: z.string().startsWith("re_").optional(),
  EMAIL_FROM: z.string().default("Legalito <hola@legalito.es>"),
  EMAIL_REPLY_TO: z.string().email().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),

  ALLOW_DEMO_TEMPLATES: bool,
  HASH_SALT: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(24).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de entorno no válida: ${issues}`);
  }
  const e = parsed.data;

  // Salvaguardas de producción.
  if (e.APP_ENV === "production") {
    if (e.ALLOW_DEMO_TEMPLATES) {
      throw new Error("ALLOW_DEMO_TEMPLATES no puede activarse en producción: las plantillas demo no son documentos válidos.");
    }
    const missing = (
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "HASH_SALT"] as const
    ).filter((k) => !e[k]);
    if (missing.length) throw new Error(`Faltan variables obligatorias en producción: ${missing.join(", ")}`);
  }
  if (e.STRIPE_SECRET_KEY?.includes("_live_") && e.APP_ENV !== "production") {
    throw new Error("Se ha configurado una clave LIVE de Stripe fuera de producción.");
  }

  cached = e;
  return e;
}

export const siteUrl = () => env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

export const isSupabaseConfigured = () => {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY && e.SUPABASE_SERVICE_ROLE_KEY);
};
export const isStripeConfigured = () => Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET);
export const isEmailConfigured = () => Boolean(env().RESEND_API_KEY);
export const demoTemplatesAllowed = () => env().APP_ENV !== "production" && env().ALLOW_DEMO_TEMPLATES;

/** Los cobros reales exigen clave live + producción + autorización expresa por variable. */
export function stripeMode(): "test" | "live" | "disabled" {
  const e = env();
  if (!e.STRIPE_SECRET_KEY) return "disabled";
  if (e.STRIPE_SECRET_KEY.includes("_live_")) {
    return e.APP_ENV === "production" && e.STRIPE_LIVE_PAYMENTS_ENABLED ? "live" : "disabled";
  }
  return "test";
}

/** Para pruebas: invalida la caché de configuración. */
export function resetEnvCache() {
  cached = null;
}
