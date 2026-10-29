import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  APP_WEB_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.string().default('false'),

  COOKIE_SECURE: booleanFromEnv.optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 30),
  SESSION_IDLE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),

  TRIAL_DAYS: z.coerce.number().int().min(0).max(60).default(14),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(600),

  MAIL_TRANSPORT: z.enum(['disabled', 'log', 'smtp']).default('disabled'),
  MAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: booleanFromEnv.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // Motor de seguimiento (fase 3)
  FOLLOWUP_EMAIL_PROVIDER: z.enum(['disabled', 'mailgun', 'smtp']).default('disabled'),
  FOLLOWUP_FROM_EMAIL: z.string().optional(),
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  MAILGUN_API_BASE: z.url({ protocol: /^https?$/ }).default('https://api.eu.mailgun.net'),
  MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),
  // Dominio de entrada para detectar respuestas (respuestas+<token>@dominio). Ver docs/automatizacion.md.
  INBOUND_EMAIL_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'INBOUND_EMAIL_DOMAIN no es un dominio válido')
    .optional(),
  PUBLIC_API_URL: z.url({ protocol: /^https?$/ }).optional(),
  WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  FOLLOWUP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  MESSAGE_CONTENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  // Token de la supervisión externa (GET /api/v1/ops/status). Sin él, la ruta no existe.
  OPS_STATUS_TOKEN: z.string().min(32, 'OPS_STATUS_TOKEN debe tener al menos 32 caracteres').optional(),

  // Pagos (fase 5). SOLO modo de prueba de Stripe: las claves live se rechazan al arrancar.
  PAYMENTS_ENABLED: booleanFromEnv.optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().optional(),
  // Cómo se presentan los precios respecto al IVA. «pending» mientras no haya validación fiscal.
  PRICES_TAX_DISPLAY: z.enum(['pending', 'included', 'excluded']).default('pending'),
});

export type RateLimitRule = { max: number; windowMs: number };

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  dbPoolMax: number;
  appWebUrl: string;
  corsOrigins: string[];
  trustProxy: boolean | number;
  cookie: { name: string; secure: boolean };
  session: { ttlMs: number; idleTimeoutMs: number; touchIntervalMs: number };
  trialDays: number;
  /** Token de la supervisión externa; sin él, /ops/status responde 404. */
  opsStatusToken?: string;
  billing: {
    /** Contratación y webhooks de pago activos. Sin ellos, Presupio funciona como antes (prueba y planes asignados por operación). */
    enabled: boolean;
    /** Presentación de precios respecto al IVA: no es una configuración fiscal (docs/facturacion.md). */
    taxDisplay: 'pending' | 'included' | 'excluded';
    stripe?: {
      secretKey: string;
      webhookSecret: string;
      prices: Record<'starter' | 'pro' | 'business', string>;
      portalConfigurationId?: string;
    };
  };
  mail: {
    transport: 'disabled' | 'log' | 'smtp';
    from?: string;
    smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string };
  };
  tokens: { passwordResetTtlMs: number; emailVerificationTtlMs: number; invitationTtlMs: number };
  automation: {
    provider: 'disabled' | 'mailgun' | 'smtp';
    fromEmail?: string;
    mailgun?: { apiKey: string; domain: string; apiBase: string; webhookSigningKey?: string };
    /** Dominio de entrada para la detección de respuestas (solo con Mailgun y clave de firma). */
    inboundDomain?: string;
    /** URL pública de la API (enlace de baja de un clic en la cabecera List-Unsubscribe). */
    publicApiUrl: string;
    workerIntervalMs: number;
    maxAttempts: number;
    /** Esperas entre reintentos de un mismo mensaje (ms). */
    retryBackoffMs: number[];
    /** Un envío "en curso" más antiguo que esto se considera de resultado desconocido. */
    stuckAfterMs: number;
    /** Un paso que no pudo enviarse en este plazo tras su fecha prevista se cancela (evita ráfagas tras una parada). */
    expireAfterMs: number;
    /** Separación mínima entre dos contactos con el mismo cliente. */
    minGapBetweenContactsMs: number;
    contentRetentionDays: number;
  };
  rateLimits: {
    global: RateLimitRule;
    login: RateLimitRule;
    loginPerEmail: RateLimitRule;
    register: RateLimitRule;
    passwordForgot: RateLimitRule;
    passwordForgotPerEmail: RateLimitRule;
    tokenRedeem: RateLimitRule;
    /** Acciones de facturación (contratar, cambiar, cancelar, portal) por IP. */
    billing: RateLimitRule;
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function parseTrustProxy(raw: string): boolean | number {
  if (raw === 'true') return true;
  if (raw === 'false' || raw === '') return false;
  const hops = Number(raw);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  throw new Error('TRUST_PROXY debe ser true, false o un número de saltos de proxy');
}

const STRIPE_LIVE = /^(sk|rk|pk)_live_/;
const STRIPE_TEST_SECRET = /^(sk|rk)_test_[A-Za-z0-9]{10,}$/;

/**
 * Configuración de pagos. Esta versión SOLO admite el modo de prueba de Stripe: cualquier
 * clave live (sk_live_, rk_live_, pk_live_) detiene el arranque, aunque los pagos estén
 * desactivados, para que nunca pueda activarse un cobro real por error.
 */
function parseBilling(e: z.infer<typeof envSchema>): AppConfig['billing'] {
  const stripeValues = [e.STRIPE_SECRET_KEY, e.STRIPE_WEBHOOK_SECRET, e.STRIPE_PRICE_STARTER, e.STRIPE_PRICE_PRO, e.STRIPE_PRICE_BUSINESS];
  if (stripeValues.some((v) => v && STRIPE_LIVE.test(v.trim()))) {
    throw new Error('Claves live de Stripe no permitidas: esta versión de Presupio solo funciona con el modo de prueba (sk_test_/rk_test_).');
  }
  const enabled = e.PAYMENTS_ENABLED ?? false;
  if (!enabled) return { enabled: false, taxDisplay: e.PRICES_TAX_DISPLAY };

  const missing = (
    [
      ['STRIPE_SECRET_KEY', e.STRIPE_SECRET_KEY],
      ['STRIPE_WEBHOOK_SECRET', e.STRIPE_WEBHOOK_SECRET],
      ['STRIPE_PRICE_STARTER', e.STRIPE_PRICE_STARTER],
      ['STRIPE_PRICE_PRO', e.STRIPE_PRICE_PRO],
      ['STRIPE_PRICE_BUSINESS', e.STRIPE_PRICE_BUSINESS],
    ] as const
  )
    .filter(([, v]) => !v?.trim())
    .map(([k]) => k);
  if (missing.length) throw new Error(`PAYMENTS_ENABLED=true requiere ${missing.join(', ')}`);
  const secretKey = e.STRIPE_SECRET_KEY!.trim();
  if (!STRIPE_TEST_SECRET.test(secretKey)) throw new Error('STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_… o rk_test_…)');
  const webhookSecret = e.STRIPE_WEBHOOK_SECRET!.trim();
  if (!/^whsec_[A-Za-z0-9]{10,}$/.test(webhookSecret)) throw new Error('STRIPE_WEBHOOK_SECRET no tiene el formato esperado (whsec_…)');
  const prices = {
    starter: e.STRIPE_PRICE_STARTER!.trim(),
    pro: e.STRIPE_PRICE_PRO!.trim(),
    business: e.STRIPE_PRICE_BUSINESS!.trim(),
  };
  for (const [plan, id] of Object.entries(prices)) {
    if (!/^price_[A-Za-z0-9]{6,}$/.test(id)) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} no tiene el formato esperado (price_…)`);
  }
  if (new Set(Object.values(prices)).size !== 3) throw new Error('Cada plan necesita su propio precio de Stripe (STRIPE_PRICE_* repetidos)');
  const portal = e.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (portal && !/^bpc_[A-Za-z0-9]{6,}$/.test(portal)) throw new Error('STRIPE_PORTAL_CONFIGURATION_ID no tiene el formato esperado (bpc_…)');
  return {
    enabled: true,
    taxDisplay: e.PRICES_TAX_DISPLAY,
    stripe: { secretKey, webhookSecret, prices, ...(portal ? { portalConfigurationId: portal } : {}) },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${problems}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';

  const cookieSecure = e.COOKIE_SECURE ?? isProd;
  if (isProd && !cookieSecure) throw new Error('COOKIE_SECURE no puede ser false en producción');
  if (isProd && !e.APP_WEB_URL.startsWith('https://')) throw new Error('APP_WEB_URL debe usar https en producción');
  if (isProd && e.MAIL_TRANSPORT === 'log') {
    throw new Error('MAIL_TRANSPORT=log no está permitido en producción (escribiría enlaces privados en los logs)');
  }

  let smtp: AppConfig['mail']['smtp'];
  if (e.MAIL_TRANSPORT === 'smtp') {
    if (!e.SMTP_HOST || !e.SMTP_PORT || !e.MAIL_FROM) {
      throw new Error('MAIL_TRANSPORT=smtp requiere SMTP_HOST, SMTP_PORT y MAIL_FROM');
    }
    smtp = {
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE ?? e.SMTP_PORT === 465,
      user: e.SMTP_USER,
      password: e.SMTP_PASSWORD,
    };
  }

  let mailgun: AppConfig['automation']['mailgun'];
  if (e.FOLLOWUP_EMAIL_PROVIDER !== 'disabled' && !e.FOLLOWUP_FROM_EMAIL) {
    throw new Error('FOLLOWUP_EMAIL_PROVIDER requiere FOLLOWUP_FROM_EMAIL (dirección del dominio verificado)');
  }
  if (e.FOLLOWUP_EMAIL_PROVIDER === 'mailgun') {
    if (!e.MAILGUN_API_KEY || !e.MAILGUN_DOMAIN) throw new Error('FOLLOWUP_EMAIL_PROVIDER=mailgun requiere MAILGUN_API_KEY y MAILGUN_DOMAIN');
    if (isProd && !e.MAILGUN_API_BASE.startsWith('https://')) throw new Error('MAILGUN_API_BASE debe usar https en producción');
    if (isProd && !e.MAILGUN_WEBHOOK_SIGNING_KEY) throw new Error('MAILGUN_WEBHOOK_SIGNING_KEY es obligatoria en producción');
    mailgun = {
      apiKey: e.MAILGUN_API_KEY,
      domain: e.MAILGUN_DOMAIN,
      apiBase: e.MAILGUN_API_BASE.replace(/\/$/, ''),
      webhookSigningKey: e.MAILGUN_WEBHOOK_SIGNING_KEY,
    };
  }
  if (e.INBOUND_EMAIL_DOMAIN && (e.FOLLOWUP_EMAIL_PROVIDER !== 'mailgun' || !e.MAILGUN_WEBHOOK_SIGNING_KEY)) {
    throw new Error('INBOUND_EMAIL_DOMAIN requiere FOLLOWUP_EMAIL_PROVIDER=mailgun y MAILGUN_WEBHOOK_SIGNING_KEY (los mensajes entrantes llegan firmados por Mailgun)');
  }
  if (e.FOLLOWUP_EMAIL_PROVIDER === 'smtp' && !smtp) {
    throw new Error('FOLLOWUP_EMAIL_PROVIDER=smtp requiere MAIL_TRANSPORT=smtp y los datos SMTP_*');
  }

  const billing = parseBilling(e);

  const corsOrigins = (e.CORS_ORIGINS ?? e.APP_WEB_URL)
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  for (const origin of corsOrigins) {
    if (origin === '*') throw new Error('CORS_ORIGINS no admite "*" porque la API usa cookies');
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error(`Origen CORS inválido: ${origin}`);
  }

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    appWebUrl: e.APP_WEB_URL.replace(/\/$/, ''),
    corsOrigins,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    // El prefijo __Host- obliga al navegador a exigir Secure, Path=/ y sin Domain.
    cookie: { name: cookieSecure ? '__Host-presupio_session' : 'presupio_session', secure: cookieSecure },
    session: {
      ttlMs: e.SESSION_TTL_HOURS * HOUR,
      idleTimeoutMs: e.SESSION_IDLE_TIMEOUT_HOURS * HOUR,
      touchIntervalMs: 5 * MINUTE,
    },
    trialDays: e.TRIAL_DAYS,
    ...(e.OPS_STATUS_TOKEN ? { opsStatusToken: e.OPS_STATUS_TOKEN } : {}),
    billing,
    mail: { transport: e.MAIL_TRANSPORT, from: e.MAIL_FROM, smtp },
    automation: {
      provider: e.FOLLOWUP_EMAIL_PROVIDER,
      fromEmail: e.FOLLOWUP_FROM_EMAIL,
      mailgun,
      ...(e.INBOUND_EMAIL_DOMAIN ? { inboundDomain: e.INBOUND_EMAIL_DOMAIN } : {}),
      publicApiUrl: (e.PUBLIC_API_URL ?? e.APP_WEB_URL).replace(/\/$/, ''),
      workerIntervalMs: e.WORKER_INTERVAL_SECONDS * 1000,
      maxAttempts: e.FOLLOWUP_MAX_ATTEMPTS,
      retryBackoffMs: [5 * MINUTE, 30 * MINUTE, 2 * HOUR, 6 * HOUR],
      stuckAfterMs: 15 * MINUTE,
      expireAfterMs: 72 * HOUR,
      minGapBetweenContactsMs: 48 * HOUR,
      contentRetentionDays: e.MESSAGE_CONTENT_RETENTION_DAYS,
    },
    tokens: {
      passwordResetTtlMs: 30 * MINUTE,
      emailVerificationTtlMs: 48 * HOUR,
      invitationTtlMs: 7 * 24 * HOUR,
    },
    rateLimits: {
      // Peticiones por IP y minuto. Una oficina entera puede compartir IP: no conviene un valor bajo.
      global: { max: e.RATE_LIMIT_PER_MINUTE, windowMs: MINUTE },
      login: { max: 20, windowMs: 15 * MINUTE },
      loginPerEmail: { max: 5, windowMs: 15 * MINUTE },
      register: { max: 10, windowMs: HOUR },
      passwordForgot: { max: 10, windowMs: HOUR },
      passwordForgotPerEmail: { max: 3, windowMs: HOUR },
      tokenRedeem: { max: 20, windowMs: 15 * MINUTE },
      billing: { max: 30, windowMs: HOUR },
    },
  };
}
