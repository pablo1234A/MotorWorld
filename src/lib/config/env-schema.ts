import { z } from "zod";

/**
 * Configuración del servidor validada con Zod.
 * Las variables opcionales solo se exigen cuando se activa su funcionalidad
 * (por ejemplo, las de Stripe solo si PAYMENTS_ENABLED=true).
 */
const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const booleanFlag = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() === "true" : false),
  z.boolean(),
);

export const envSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://127.0.0.1:3000")),
    NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida" }),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY es obligatoria"),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    PAYMENTS_ENABLED: booleanFlag,
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_PRICE_STARTER: optionalString,
    STRIPE_PRICE_PRO: optionalString,
    STRIPE_PRICE_BUSINESS: optionalString,
    AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["template", "anthropic"]).default("template")),
    ANTHROPIC_API_KEY: optionalString,
    AI_MODEL: optionalString,
    CRON_SECRET: optionalString,
    LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(["debug", "info", "warn", "error"]).default("info")),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENTS_ENABLED) {
      for (const key of [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_STARTER",
        "STRIPE_PRICE_PRO",
        "STRIPE_PRICE_BUSINESS",
        "SUPABASE_SERVICE_ROLE_KEY",
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: `${key} es obligatoria cuando PAYMENTS_ENABLED=true` });
        }
      }
    }
    if (env.AI_PROVIDER === "anthropic") {
      if (!env.ANTHROPIC_API_KEY) {
        ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "ANTHROPIC_API_KEY es obligatoria cuando AI_PROVIDER=anthropic" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>) {
  return envSchema.safeParse(source);
}
