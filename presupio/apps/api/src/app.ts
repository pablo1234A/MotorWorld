import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { Db } from './db/database.js';
import { safeErrorSerializer } from './lib/log.js';
import { AppError, errors, isDatabaseUnavailable, pgErrorCode, PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION } from './lib/errors.js';
import { createMemoryLimiter, type KeyedLimiter } from './lib/rate-limiter.js';
import { createMailer, type Mailer } from './mail/mailer.js';
import { authPlugin } from './plugins/auth.js';
import { activityRoutes } from './modules/activity/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { companyRoutes } from './modules/company/routes.js';
import { contactRoutes } from './modules/contacts/routes.js';
import { exclusionRoutes } from './modules/exclusions/routes.js';
import { automaticFollowUpRoutes, followUpRoutes } from './modules/follow-ups/routes.js';
import { automationRoutes } from './modules/automation/routes.js';
import { publicRoutes } from './modules/public/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { usageRoutes } from './modules/usage/routes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { billingRoutes, stripeWebhookRoutes } from './modules/billing/routes.js';
import { createBillingGateway, type BillingGateway } from './modules/billing/gateway.js';
import { opsRoutes } from './modules/ops/routes.js';
import { createFollowUpProvider, type FollowUpEmailProvider } from './automation/providers.js';
import { healthRoutes } from './modules/health/routes.js';
import { meRoutes } from './modules/me/routes.js';
import { memberRoutes } from './modules/members/routes.js';
import { quoteRoutes } from './modules/quotes/routes.js';

export interface AppDeps {
  config: AppConfig;
  db: Db;
  mailer?: Mailer;
  /** Proveedor de los emails de seguimiento. En pruebas se inyecta uno simulado. */
  followUpProvider?: FollowUpEmailProvider;
  /** Pasarela de pagos. En pruebas se inyecta una simulada; sin pagos activos, null. */
  billingGateway?: BillingGateway | null;
}

export interface AppLimiters {
  loginPerEmail: KeyedLimiter;
  passwordForgotPerEmail: KeyedLimiter;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: Db;
    mailer: Mailer;
    followUpProvider: FollowUpEmailProvider;
    billingGateway: BillingGateway | null;
    limiters: AppLimiters;
    /** Ejecuta trabajo después de responder (p. ej. envío de emails) sin filtrar tiempos de respuesta. */
    runInBackground(name: string, task: () => Promise<unknown>): void;
    /** Espera a que termine el trabajo en segundo plano (apagado ordenado y pruebas). */
    flushBackground(): Promise<void>;
    /** Rutas registradas con su modo de autenticación (pruebas y documentación). */
    routeTable: Array<{ method: string; url: string; auth: string; permission: string | null; readOnlyAllowed: boolean }>;
  }
}

export const API_PREFIX = '/api/v1';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    // Un número indica cuántos saltos de proxy son de confianza (soportado por Fastify en tiempo de ejecución).
    trustProxy: config.trustProxy as boolean,
    bodyLimit: 100 * 1024,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
              censor: '[redactado]',
            },
            serializers: {
              err: safeErrorSerializer,
              // Los enlaces de baja llevan un token en la URL: nunca se escribe en los logs.
              req(req: { method: string; url: string; ip?: string }) {
                return { method: req.method, url: req.url.replace(/([?&]token=)[^&]+/g, '$1[redactado]') };
              },
            },
          },
  });

  app.decorate('config', config);
  app.decorate('db', deps.db);
  app.decorate('mailer', deps.mailer ?? createMailer(config, app.log));
  app.decorate('followUpProvider', deps.followUpProvider ?? createFollowUpProvider(config));
  app.decorate('billingGateway', deps.billingGateway !== undefined ? deps.billingGateway : createBillingGateway(config));
  app.decorate('limiters', {
    loginPerEmail: createMemoryLimiter(config.rateLimits.loginPerEmail),
    passwordForgotPerEmail: createMemoryLimiter(config.rateLimits.passwordForgotPerEmail),
  });

  const pending = new Set<Promise<unknown>>();
  app.decorate('runInBackground', (name: string, task: () => Promise<unknown>) => {
    const p = task()
      .catch((err: unknown) => app.log.error({ task: name, err: (err as Error).message }, 'Tarea en segundo plano fallida'))
      .finally(() => pending.delete(p));
    pending.add(p);
  });
  app.decorate('flushBackground', async () => {
    while (pending.size) await Promise.allSettled([...pending]);
  });
  app.addHook('onClose', async () => app.flushBackground());

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('cache-control', 'no-store');
  });

  // Solo JSON: un formulario de otro sitio no puede enviar peticiones válidas.
  app.removeContentTypeParser('text/plain');
  // Parser JSON por defecto (protegido frente a __proto__/constructor), aceptando cuerpo vacío
  // en acciones sin datos como POST /quotes/:id/archive.
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body === '') return done(null, undefined);
    defaultJsonParser(req, body as string, done);
  });

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimits.global.max,
    timeWindow: config.rateLimits.global.windowMs,
    errorResponseBuilder: () => errors.rateLimited(),
  });

  // Defensa CSRF adicional a SameSite=Lax: las peticiones que modifican datos desde un
  // navegador deben venir de un origen permitido.
  const allowedOrigins = new Set(config.corsOrigins);
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw errors.forbidden('Origen no permitido.');
  });

  // Se aplica a toda la aplicación (no encapsulado): todas las rutas pasan por aquí.
  await authPlugin(app);

  app.setErrorHandler((error: FastifyError | AppError, req, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode === 429) reply.header('retry-after', '60');
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}), requestId: req.id },
      });
    }
    const fe = error as FastifyError;
    const known: Record<string, [number, AppError['code'], string]> = {
      FST_ERR_CTP_INVALID_JSON_BODY: [400, 'INVALID_JSON', 'El cuerpo de la petición no es JSON válido.'],
      FST_ERR_CTP_EMPTY_JSON_BODY: [400, 'INVALID_JSON', 'El cuerpo JSON está vacío.'],
      FST_ERR_CTP_INVALID_MEDIA_TYPE: [415, 'UNSUPPORTED_MEDIA_TYPE', 'Solo se admite application/json.'],
      FST_ERR_CTP_BODY_TOO_LARGE: [413, 'PAYLOAD_TOO_LARGE', 'La petición es demasiado grande.'],
    };
    const mapped = fe.code ? known[fe.code] : undefined;
    if (mapped) {
      return reply.status(mapped[0]).send({ error: { code: mapped[1], message: mapped[2], requestId: req.id } });
    }
    if (error instanceof SyntaxError && fe.statusCode === 400) {
      return reply.status(400).send({ error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido.', requestId: req.id } });
    }
    // Restricciones de la base de datos que se escapan a la validación previa.
    const pgCode = pgErrorCode(error);
    if (pgCode === PG_CHECK_VIOLATION || pgCode === PG_FOREIGN_KEY_VIOLATION) {
      req.log.warn({ pgCode }, 'Restricción de base de datos rechazada');
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son coherentes.', requestId: req.id } });
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.status(fe.statusCode).send({ error: { code: 'VALIDATION_ERROR', message: 'Petición no válida.', requestId: req.id } });
    }
    if (isDatabaseUnavailable(error)) {
      req.log.error({ errCode: pgErrorCode(error) ?? 'connection' }, 'Base de datos no disponible');
      reply.header('retry-after', '30');
      return reply
        .status(503)
        .send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.', requestId: req.id } });
    }
    req.log.error({ err: error }, 'Error no controlado');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Error interno. Inténtalo de nuevo.', requestId: req.id } });
  });

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.', requestId: req.id } });
  });

  const routeTable: FastifyInstance['routeTable'] = [];
  app.decorate('routeTable', routeTable);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      routeTable.push({
        method,
        url: route.url,
        auth: route.config?.auth ?? 'required',
        permission: route.config?.permission ?? null,
        readOnlyAllowed: route.config?.readOnlyAllowed ?? false,
      });
    }
  });

  await app.register(healthRoutes, { prefix: API_PREFIX });
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(meRoutes, { prefix: API_PREFIX });
  await app.register(companyRoutes, { prefix: `${API_PREFIX}/company` });
  await app.register(memberRoutes, { prefix: `${API_PREFIX}/members` });
  await app.register(contactRoutes, { prefix: `${API_PREFIX}/contacts` });
  await app.register(quoteRoutes, { prefix: `${API_PREFIX}/quotes` });
  await app.register(followUpRoutes, { prefix: `${API_PREFIX}/follow-ups` });
  await app.register(exclusionRoutes, { prefix: `${API_PREFIX}/exclusions` });
  await app.register(activityRoutes, { prefix: `${API_PREFIX}/activity` });
  await app.register(automationRoutes, { prefix: `${API_PREFIX}/automation` });
  await app.register(automaticFollowUpRoutes, { prefix: `${API_PREFIX}/follow-ups` });
  await app.register(publicRoutes, { prefix: `${API_PREFIX}/public` });
  await app.register(webhookRoutes, { prefix: `${API_PREFIX}/webhooks` });
  await app.register(usageRoutes, { prefix: `${API_PREFIX}/usage` });
  await app.register(metricsRoutes, { prefix: `${API_PREFIX}/metrics` });
  await app.register(opsRoutes, { prefix: `${API_PREFIX}/ops` });
  await app.register(billingRoutes, { prefix: `${API_PREFIX}/billing` });
  await app.register(stripeWebhookRoutes, { prefix: `${API_PREFIX}/webhooks` });

  return app;
}
