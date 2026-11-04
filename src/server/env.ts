import "server-only";

import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas al arrancar. Ningún secreto
 * usa el prefijo NEXT_PUBLIC_. Las integraciones son opcionales: si faltan,
 * la funcionalidad aparece como "no configurada" (nunca se simula).
 *
 * Guardas de pagos (SEGURIDAD §5): las claves LIVE de Stripe solo se aceptan
 * con PAYMENTS_LIVE_ENABLED=true en producción, flag que únicamente activará
 * el responsable adulto del proyecto tras la revisión fiscal y legal.
 */

const optionalString = z.string().min(1).optional();
const booleanFlag = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

export const serverEnvSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    APP_URL: z.url(),

    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "Debe ser una URL de PostgreSQL"),

    CRON_SECRET: z.string().min(32).optional(),
    BOOKING_TOKEN_SECRET: z.string().min(32).optional(),
    API_KEY_PEPPER: z.string().min(32).optional(),
    INTEGRATIONS_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "Debe ser una clave de 32 bytes en base64")
      .optional(),

    RESEND_API_KEY: optionalString,
    RESEND_WEBHOOK_SECRET: optionalString,
    EMAIL_SHARED_DOMAIN: optionalString,

    STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "Clave secreta de Stripe no válida").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/).optional(),
    PAYMENTS_LIVE_ENABLED: booleanFlag,

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,
    SENTRY_DSN: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    const live = env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
    if (live && !env.PAYMENTS_LIVE_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "Clave LIVE de Stripe bloqueada: los pagos están en modo TEST (PAYMENTS_LIVE_ENABLED=false)",
      });
    }
    if (env.PAYMENTS_LIVE_ENABLED && env.APP_ENV !== "production") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_LIVE_ENABLED"],
        message: "Los pagos reales solo se pueden activar en producción",
      });
    }
    if (env.PAYMENTS_LIVE_ENABLED && !live) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_LIVE_ENABLED"],
        message: "PAYMENTS_LIVE_ENABLED=true exige una clave sk_live_",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Solo nombres de variables y motivos: nunca los valores.
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración de entorno no válida:\n${issues}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
