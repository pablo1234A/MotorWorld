import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db/database.js';
import { MemoryMailer } from '../src/mail/mailer.js';
import type { FollowUpEmailProvider } from '../src/automation/providers.js';
import type { BillingGateway } from '../src/modules/billing/gateway.js';

export const API = '/api/v1';
export const TEST_PASSWORD = 'Contraseña-de-prueba-1';
export const WEB_ORIGIN = 'http://localhost:5173';

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  mailer: MemoryMailer;
  config: AppConfig;
}

/** App con base de datos de pruebas, correo en memoria y límites amplios (salvo que se indiquen). */
export async function createTestApp(
  customize?: (config: AppConfig) => void,
  deps: { followUpProvider?: FollowUpEmailProvider; billingGateway?: BillingGateway | null; keepRateLimitCounters?: boolean } = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    APP_WEB_URL: WEB_ORIGIN,
    DB_POOL_MAX: '5',
  });
  const generous = { max: 10_000, windowMs: 60_000 };
  config.rateLimits = {
    global: generous,
    login: generous,
    loginPerEmail: generous,
    register: generous,
    passwordForgot: generous,
    passwordForgotPerEmail: generous,
    tokenRedeem: generous,
    billing: generous,
  };
  // La regla «una prueba por dominio de empresa» (auth/trial.ts) se prueba en limits-trials.test.ts;
  // el resto de pruebas registran muchas cuentas del mismo dominio de ejemplo.
  config.trialDomainRuleDays = 0;
  customize?.(config);
  const db = createDb(config.databaseUrl, config.dbPoolMax);
  const mailer = new MemoryMailer();
  const { keepRateLimitCounters, ...appDeps } = deps;
  const app = await buildApp({ config, db, mailer, ...appDeps });
  await app.ready();
  // Los contadores de límites viven en la base de datos (compartidos y persistentes): cada
  // aplicación de prueba empieza sin golpes previos de otros archivos o pruebas.
  // (Algunas pruebas usan a propósito una base de datos inalcanzable.)
  if (!keepRateLimitCounters) await db.deleteFrom('rateLimitCounters').execute().catch(() => undefined);
  afterAll(async () => {
    await app.close();
    await db.destroy();
  });
  return { app, db, mailer, config };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | number | undefined>;
}

/** Cliente HTTP que conserva la cookie de sesión, como un navegador. */
export class Client {
  cookie: string | null = null;
  constructor(private readonly app: FastifyInstance) {}

  async request<T = any>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    const res = await this.app.inject({
      method,
      url: url.startsWith('/api') ? url : `${API}${url}`,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      ...(body !== undefined ? { payload: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    });
    const setCookie = res.headers['set-cookie'];
    for (const c of Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []) {
      const [pair] = c.split(';');
      if (!pair) continue;
      const value = pair.slice(pair.indexOf('=') + 1);
      this.cookie = value ? pair : null;
    }
    return { status: res.statusCode, body: (res.body ? res.json() : undefined) as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = any>(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', url, body, headers);
  }
  patch<T = any>(url: string, body?: unknown) {
    return this.request<T>('PATCH', url, body);
  }
  delete<T = any>(url: string) {
    return this.request<T>('DELETE', url);
  }
}

export function uniqueEmail(prefix = 'usuario'): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@ejemplo.test`;
}

export interface RegisteredAccount {
  client: Client;
  email: string;
  userId: string;
  companyId: string;
}

/** Registra un usuario con su empresa (datos ficticios) y devuelve un cliente con sesión. */
export async function registerAccount(app: FastifyInstance, companyName = 'Reformas Prueba SL'): Promise<RegisteredAccount> {
  const client = new Client(app);
  const email = uniqueEmail();
  const res = await client.post('/auth/register', {
    fullName: 'Persona de Prueba',
    email,
    password: TEST_PASSWORD,
    companyName,
    acceptTerms: true,
  });
  if (res.status !== 201) throw new Error(`Registro fallido: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, email, userId: res.body.user.id, companyId: res.body.company.id };
}

/** Invita a un usuario con el rol dado y devuelve su cliente con sesión en la empresa. */
export async function addMember(
  app: FastifyInstance,
  owner: RegisteredAccount,
  role: 'admin' | 'member' | 'viewer',
): Promise<RegisteredAccount> {
  const email = uniqueEmail(role);
  const inv = await owner.client.post('/members/invitations', { email, role });
  if (inv.status !== 201) throw new Error(`Invitación fallida: ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = new URL(inv.body.acceptUrl).searchParams.get('token');
  const client = new Client(app);
  const res = await client.post('/auth/invitations/accept', {
    token,
    fullName: `Usuario ${role}`,
    password: TEST_PASSWORD,
    acceptTerms: true,
  });
  if (res.status !== 200) throw new Error(`Aceptación fallida: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, email, userId: res.body.user.id, companyId: owner.companyId };
}

/** Crea un presupuesto enviado con un contacto nuevo. */
export async function createQuote(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/quotes', {
    title: 'Reforma integral de cocina',
    reference: `P-${randomUUID().slice(0, 8)}`,
    amountCents: 1_850_000,
    contact: { fullName: 'Cliente Ficticio', email: uniqueEmail('cliente'), phone: '+34600111222' },
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`Presupuesto fallido: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.quote;
}

export function tokenFromMail(text: string): string {
  const match = text.match(/token=([A-Za-z0-9_-]{43})/);
  if (!match?.[1]) throw new Error('No se encontró token en el email');
  return match[1];
}

/** Confirma el email de la cuenta con el enlace que recibió al registrarse (correo en memoria). */
export async function verifyEmail(app: FastifyInstance, mailer: MemoryMailer, acc: RegisteredAccount): Promise<void> {
  const mail = mailer.lastTo(acc.email);
  if (!mail) throw new Error(`No hay email de verificación para ${acc.email}`);
  const res = await new Client(app).post('/auth/email/verify', { token: tokenFromMail(mail.text) });
  if (res.status !== 200) throw new Error(`Verificación fallida: ${res.status} ${JSON.stringify(res.body)}`);
}
