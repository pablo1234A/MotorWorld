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
  mail: {
    transport: 'disabled' | 'log' | 'smtp';
    from?: string;
    smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string };
  };
  tokens: { passwordResetTtlMs: number; emailVerificationTtlMs: number; invitationTtlMs: number };
  rateLimits: {
    global: RateLimitRule;
    login: RateLimitRule;
    loginPerEmail: RateLimitRule;
    register: RateLimitRule;
    passwordForgot: RateLimitRule;
    passwordForgotPerEmail: RateLimitRule;
    tokenRedeem: RateLimitRule;
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
    mail: { transport: e.MAIL_TRANSPORT, from: e.MAIL_FROM, smtp },
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
    },
  };
}
