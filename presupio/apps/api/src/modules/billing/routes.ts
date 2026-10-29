import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLAN_IDS, PLANS } from '../../domain/plans.js';
import { errors } from '../../lib/errors.js';
import { parseWith } from '../../lib/validation.js';
import { inTenant, requireAuth } from '../../plugins/auth.js';
import { BillingUnavailableError, WebhookSignatureError } from './gateway.js';
import { changePlan, openPortal, processWebhookEvent, recentBillingEvents, setCancellation, startCheckout, subscriptionView, type BillingDeps } from './service.js';

// El navegador solo elige un plan por su identificador: ni precio ni identificador de Stripe.
const planBody = z.strictObject({ plan: z.enum(PLAN_IDS as [string, ...string[]]) });

function deps(app: FastifyInstance, log: BillingDeps['log']): BillingDeps {
  return { db: app.db, config: app.config, gateway: app.billingGateway, log };
}

/**
 * Suscripción de la empresa activa. Las acciones solo PIDEN cambios a Stripe: el plan y el
 * acceso de Presupio cambian cuando llega el webhook verificado, nunca al volver del pago.
 * Todas funcionan también en solo lectura (son la vía para salir de ella).
 */
export async function billingRoutes(app: FastifyInstance) {
  const limit = app.config.rateLimits.billing;
  const manage = { permission: 'billing:manage' as const, readOnlyAllowed: true, rateLimit: { max: limit.max, timeWindow: limit.windowMs } };

  app.get('/', { config: { permission: 'subscription:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({
      subscription: await subscriptionView(trx, app.config, auth),
      plans: Object.values(PLANS),
      events: await recentBillingEvents(trx, auth.companyId),
    })),
  );

  app.post('/checkout', { config: manage }, async (req) => {
    const { plan } = parseWith(planBody, req.body);
    return { checkout: await startCheckout(deps(app, req.log), requireAuth(req), plan as keyof typeof PLANS) };
  });

  app.post('/change-plan', { config: manage }, async (req) => {
    const { plan } = parseWith(planBody, req.body);
    return { change: await changePlan(deps(app, req.log), requireAuth(req), plan as keyof typeof PLANS) };
  });

  app.post('/cancel', { config: manage }, async (req) => ({ cancellation: await setCancellation(deps(app, req.log), requireAuth(req), true) }));
  app.post('/resume', { config: manage }, async (req) => ({ cancellation: await setCancellation(deps(app, req.log), requireAuth(req), false) }));
  app.post('/portal', { config: manage }, async (req) => ({ portal: await openPortal(deps(app, req.log), requireAuth(req)) }));
}

/**
 * Webhook de Stripe. Pública (sin sesión) pero solo procesa lo firmado con STRIPE_WEBHOOK_SECRET.
 * La firma se calcula sobre los bytes exactos del cuerpo: en este ámbito el JSON NO se analiza
 * antes de verificarla.
 */
export async function stripeWebhookRoutes(app: FastifyInstance) {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 512 * 1024 }, (_req, body, done) => done(null, body));

  app.post('/stripe', { config: { auth: 'none', rateLimit: { max: 600, timeWindow: 60_000 } }, bodyLimit: 512 * 1024 }, async (req, reply) => {
    if (!app.config.billing.enabled || !app.billingGateway) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
    if (!Buffer.isBuffer(req.body)) throw errors.validation('Cuerpo no válido.');
    const signature = req.headers['stripe-signature'];
    let event;
    try {
      event = app.billingGateway.parseWebhook(req.body, typeof signature === 'string' ? signature : undefined);
    } catch (error) {
      if (error instanceof WebhookSignatureError) {
        req.log.warn('Webhook de Stripe con firma no válida');
        return reply.status(400).send({ error: { code: 'INVALID_SIGNATURE', message: 'Firma no válida.' } });
      }
      throw error;
    }
    try {
      const outcome = await processWebhookEvent(deps(app, req.log), event);
      req.log.info({ eventId: event.id, type: event.type, outcome }, 'Webhook de Stripe procesado');
      return { received: true, outcome };
    } catch (error) {
      if (error instanceof BillingUnavailableError) {
        // Stripe reintentará el evento: no se ha registrado nada.
        req.log.error({ eventId: event.id, kind: error.kind }, 'No se pudo leer la suscripción en Stripe');
        return reply.status(503).send({ error: { code: 'PAYMENTS_UNAVAILABLE', message: 'Reintentar más tarde.' } });
      }
      throw error;
    }
  });
}
