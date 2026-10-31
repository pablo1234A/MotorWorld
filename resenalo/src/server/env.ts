import { z } from "zod";

/**
 * Configuración validada del servidor. Las integraciones externas son
 * opcionales a nivel de arranque: si faltan sus credenciales, la funcionalidad
 * correspondiente informa claramente de que no está configurada (nunca se simula).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  // 32 bytes en base64. Se admite rotación: ENCRYPTION_KEYS="v2:base64,v1:base64" (la primera cifra).
  ENCRYPTION_KEYS: z.string().min(1),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Correo transaccional de la plataforma (verificación, recuperación, avisos)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Reseñalo <no-reply@resenalo.local>"),
  ADMIN_NOTIFICATIONS_EMAIL: z.string().email().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
  STRIPE_AUTOMATIC_TAX: z.enum(["true", "false"]).default("true"),
  STRIPE_TAX_RATE_ID: z.string().optional(),

  // Google OAuth (Gmail API)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Microsoft OAuth (Graph)
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT: z.string().default("common"),

  // Overrides de endpoints (solo para pruebas automatizadas con servidores locales)
  GOOGLE_OAUTH_TOKEN_URL: z.string().url().default("https://oauth2.googleapis.com/token"),
  GOOGLE_GMAIL_API_URL: z.string().url().default("https://gmail.googleapis.com"),
  GOOGLE_USERINFO_URL: z.string().url().default("https://openidconnect.googleapis.com/v1/userinfo"),
  MICROSOFT_LOGIN_URL: z.string().url().default("https://login.microsoftonline.com"),
  MICROSOFT_GRAPH_URL: z.string().url().default("https://graph.microsoft.com"),

  // Monitorización de errores (webhook genérico compatible con Slack/Discord/Sentry relay)
  ERROR_WEBHOOK_URL: z.string().url().optional(),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para tests: fuerza a releer process.env */
export function resetEnvCache() {
  cached = null;
}

export const isProd = () => env().NODE_ENV === "production";

export function integrationStatus() {
  const e = env();
  return {
    stripe: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_STARTER && e.STRIPE_PRICE_PRO && e.STRIPE_PRICE_BUSINESS),
    google: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(e.MICROSOFT_CLIENT_ID && e.MICROSOFT_CLIENT_SECRET),
    smtp: Boolean(e.SMTP_HOST),
  };
}
