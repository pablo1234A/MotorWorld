import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { cancelPendingRuleSteps, currentTemplate, loadCompanyContext, templateValues } from '../../automation/engine.js';
import { composeMessage, renderBody, SAMPLE_VALUES, TEMPLATE_VARIABLES, validateTemplate } from '../../automation/templates.js';
import { errors } from '../../lib/errors.js';
import { parseWith, uuid } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';

const stepParams = z.strictObject({ step: z.coerce.number().int().min(1).max(6) });
const templateBody = z.strictObject({
  subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200, 'Máximo 200 caracteres'),
  body: z.string().trim().min(1, 'El mensaje es obligatorio').max(5000, 'Máximo 5000 caracteres'),
});
const previewBody = templateBody.extend({ quoteId: uuid.optional() });
const enableBody = z.strictObject({
  confirmLegalBasis: z.literal(true, 'Confirma que tu empresa tiene base jurídica para contactar a estos clientes'),
});

const EXAMPLE_UNSUBSCRIBE = 'https://… (enlace personal de baja)';

export async function automationRoutes(app: FastifyInstance) {
  /** Estado del envío automático, del proveedor y del proceso de trabajos. */
  app.get('/', { config: { permission: 'company:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => {
      const now = new Date();
      const ctx = await loadCompanyContext(trx, auth.companyId, now);
      const s = await trx
        .selectFrom('companySettings as s')
        .leftJoin('users as u', 'u.id', 's.automationEnabledByUserId')
        .select(['s.automationEnabledAt', 's.legalBasisNote', 'u.fullName as enabledByName'])
        .where('s.companyId', '=', auth.companyId)
        .executeTakeFirstOrThrow();
      const counts = await trx
        .selectFrom('followUps')
        .select([
          sql<string>`count(*) filter (where status = 'pending' and (approved_at is not null or ${!ctx.requireApproval}))`.as('scheduled'),
          sql<string>`count(*) filter (where status = 'pending' and approved_at is null and ${ctx.requireApproval})`.as('awaitingApproval'),
          sql<string>`count(*) filter (where status = 'sending')`.as('sending'),
          sql<string>`count(*) filter (where status = 'sent' and sent_at > now() - interval '30 days')`.as('sent30d'),
          sql<string>`count(*) filter (where status = 'failed')`.as('failed'),
        ])
        .where('companyId', '=', auth.companyId)
        .where('source', '=', 'rule')
        .executeTakeFirstOrThrow();
      const delivered = await trx
        .selectFrom('messageDeliveries')
        .select(sql<string>`count(*)`.as('n'))
        .where('companyId', '=', auth.companyId)
        .where('status', '=', 'delivered')
        .where('deliveredAt', '>', new Date(now.getTime() - 30 * 86_400_000))
        .executeTakeFirstOrThrow();
      const runs = await trx
        .selectFrom('jobRuns')
        .select(['job', 'status', 'startedAt', 'finishedAt'])
        .where('job', 'in', ['planner', 'dispatcher'])
        .orderBy('startedAt', 'desc')
        .limit(10)
        .execute();
      const lastDispatcher = runs.find((r) => r.job === 'dispatcher');
      const workerHealthy = !!lastDispatcher && now.getTime() - lastDispatcher.startedAt.getTime() < app.config.automation.workerIntervalMs * 3 + 60_000;
      const provider = app.followUpProvider;
      return {
        automation: {
          enabled: ctx.automationEnabled,
          enabledAt: s.automationEnabledAt,
          enabledBy: s.enabledByName,
          requireApproval: ctx.requireApproval,
          schedule: ctx.schedule,
          requirements: {
            providerConfigured: provider.configured,
            replyToEmail: !!ctx.replyTo,
            legalBasisNote: !!s.legalBasisNote && s.legalBasisNote.trim().length >= 20,
            activePlan: ctx.hasAccess,
          },
        },
        provider: {
          name: provider.name,
          configured: provider.configured,
          tracksDelivery: provider.tracksDelivery,
          fromDomain: app.config.automation.fromEmail?.split('@')[1] ?? null,
        },
        counts: {
          scheduled: Number(counts.scheduled),
          awaitingApproval: Number(counts.awaitingApproval),
          sending: Number(counts.sending),
          sent30d: Number(counts.sent30d),
          delivered30d: Number(delivered.n),
          failed: Number(counts.failed),
        },
        worker: {
          healthy: workerHealthy,
          lastRuns: runs.map((r) => ({ job: r.job, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt })),
        },
      };
    }),
  );

  /** Activación: requiere proveedor, dirección de respuesta, base legal y confirmación expresa. */
  app.post('/enable', { config: { permission: 'settings:update' } }, async (req) => {
    parseWith(enableBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const ctx = await loadCompanyContext(trx, auth.companyId, new Date());
      const s = await trx.selectFrom('companySettings').select(['legalBasisNote']).where('companyId', '=', auth.companyId).forUpdate().executeTakeFirstOrThrow();
      if (!app.followUpProvider.configured) {
        throw errors.conflict('El envío de email no está configurado en el servidor (FOLLOWUP_EMAIL_PROVIDER). Contacta con el administrador técnico.');
      }
      const details = [
        ...(!ctx.replyTo ? [{ path: 'replyToEmail', message: 'Indica la dirección donde quieres recibir las respuestas' }] : []),
        ...(!s.legalBasisNote || s.legalBasisNote.trim().length < 20
          ? [{ path: 'legalBasisNote', message: 'Documenta la base legal para contactar (mínimo 20 caracteres)' }]
          : []),
        ...(!ctx.hasAccess ? [{ path: 'plan', message: 'Tu cuenta no tiene un plan activo' }] : []),
      ];
      if (details.length) throw errors.validation('Faltan requisitos para activar el envío automático.', details);
      if (ctx.automationEnabled) return { enabled: true };
      await trx
        .updateTable('companySettings')
        .set({ automationEnabled: true, automationEnabledAt: new Date(), automationEnabledByUserId: auth.userId })
        .where('companyId', '=', auth.companyId)
        .execute();
      for (let step = 1; step <= ctx.schedule.length; step++) await currentTemplate(trx, auth.companyId, step, auth.userId);
      await logActivity(trx, auth, {
        action: 'automation.enabled',
        entityType: 'settings',
        entityId: auth.companyId,
        metadata: { requireApproval: ctx.requireApproval, schedule: ctx.schedule, provider: app.followUpProvider.name },
      });
      return { enabled: true };
    });
  });

  /** Desactivación: detiene en el acto todos los envíos automáticos pendientes. */
  app.post('/disable', { config: { permission: 'settings:update' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => {
      await trx
        .updateTable('companySettings')
        .set({ automationEnabled: false, automationEnabledAt: null, automationEnabledByUserId: null })
        .where('companyId', '=', auth.companyId)
        .execute();
      const cancelled = await cancelPendingRuleSteps(trx, auth.companyId, 'automation_disabled');
      await logActivity(trx, auth, {
        action: 'automation.disabled',
        entityType: 'settings',
        entityId: auth.companyId,
        metadata: { cancelledFollowUps: cancelled },
      });
      return { enabled: false, cancelledFollowUps: cancelled };
    }),
  );

  // -------------------------------------------------------------------------
  // Plantillas (versionadas)
  // -------------------------------------------------------------------------

  app.get('/templates', { config: { permission: 'company:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => {
      const ctx = await loadCompanyContext(trx, auth.companyId, new Date());
      const items = [];
      for (let step = 1; step <= ctx.schedule.length; step++) {
        const t = await currentTemplate(trx, auth.companyId, step);
        items.push({ step, offsetDays: ctx.schedule[step - 1], version: t.version, subject: t.subject, body: t.body, updatedAt: t.createdAt });
      }
      return { items, variables: TEMPLATE_VARIABLES };
    }),
  );

  app.get('/templates/:step/versions', { config: { permission: 'company:read' } }, async (req) => {
    const { step } = parseWith(stepParams, req.params);
    return inTenant(app, req, async (trx, auth) => ({
      items: await trx
        .selectFrom('messageTemplateVersions as v')
        .leftJoin('users as u', 'u.id', 'v.createdByUserId')
        .select(['v.id', 'v.version', 'v.subject', 'v.body', 'v.createdAt', 'u.fullName as createdBy'])
        .where('v.companyId', '=', auth.companyId)
        .where('v.step', '=', step)
        .orderBy('v.version', 'desc')
        .execute(),
    }));
  });

  /** Guardar una plantilla crea una versión nueva; las anteriores no se modifican. */
  app.put('/templates/:step', { config: { permission: 'settings:update' } }, async (req) => {
    const { step } = parseWith(stepParams, req.params);
    const body = parseWith(templateBody, req.body);
    validateTemplate(body);
    return inTenant(app, req, async (trx, auth) => {
      const latest = await currentTemplate(trx, auth.companyId, step, auth.userId);
      if (latest.subject === body.subject && latest.body === body.body) return { template: { step, version: latest.version, subject: latest.subject, body: latest.body } };
      const created = await trx
        .insertInto('messageTemplateVersions')
        .values({ companyId: auth.companyId, step, version: latest.version + 1, subject: body.subject, body: body.body, createdByUserId: auth.userId })
        .returning(['version', 'subject', 'body'])
        .executeTakeFirstOrThrow();
      await logActivity(trx, auth, { action: 'template.updated', entityType: 'settings', entityId: auth.companyId, metadata: { step, version: created.version } });
      return { template: { step, ...created } };
    });
  });

  /** Vista previa sin enviar nada: con datos de ejemplo o de un presupuesto real de la empresa. */
  app.post('/templates/preview', { config: { permission: 'quotes:read' } }, async (req) => {
    const body = parseWith(previewBody, req.body);
    validateTemplate(body);
    return inTenant(app, req, async (trx, auth) => {
      const ctx = await loadCompanyContext(trx, auth.companyId, new Date());
      let values = { ...SAMPLE_VALUES, empresa: ctx.sender.companyName, remitente: ctx.senderName ?? ctx.sender.companyName };
      if (body.quoteId) {
        const quote = await trx.selectFrom('quotes').selectAll().where('companyId', '=', auth.companyId).where('id', '=', body.quoteId).executeTakeFirst();
        if (!quote) throw errors.notFound('Presupuesto no encontrado.');
        const contact = await trx.selectFrom('contacts').selectAll().where('companyId', '=', auth.companyId).where('id', '=', quote.contactId).executeTakeFirstOrThrow();
        values = templateValues(ctx, quote, contact);
      }
      const rendered = renderBody(body, values);
      const message = composeMessage(rendered.subject, rendered.body, ctx.sender, EXAMPLE_UNSUBSCRIBE);
      return { preview: { subject: message.subject, text: message.text, html: message.html, sample: !body.quoteId } };
    });
  });

  /** Envío de prueba al email de la persona que lo pide (nunca a un cliente). */
  app.post('/test-email', { config: { permission: 'settings:update', rateLimit: { max: 5, timeWindow: 60 * 60_000 } } }, async (req) => {
    const provider = app.followUpProvider;
    if (!provider.configured) throw errors.conflict('El envío de email no está configurado en el servidor.');
    const { message, auth } = await inTenant(app, req, async (trx, auth) => {
      const ctx = await loadCompanyContext(trx, auth.companyId, new Date());
      const t = await currentTemplate(trx, auth.companyId, 1, auth.userId);
      const rendered = renderBody(t, { ...SAMPLE_VALUES, empresa: ctx.sender.companyName, remitente: ctx.senderName ?? ctx.sender.companyName });
      const composed = composeMessage(`[Prueba] ${rendered.subject}`, rendered.body, ctx.sender, `${app.config.appWebUrl}/baja?token=prueba`);
      return { message: { ...composed, replyTo: ctx.replyTo ?? auth.email, fromName: ctx.senderName ?? ctx.sender.companyName }, auth };
    });
    const result = await provider.send({
      deliveryId: `test-${Date.now()}`,
      from: `"${message.fromName.replace(/["\r\n<>]/g, '')}" <${app.config.automation.fromEmail}>`,
      to: auth.email,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      unsubscribeUrl: `${app.config.appWebUrl}/baja?token=prueba`,
    });
    await inTenant(app, req, (trx) =>
      logActivity(trx, auth, {
        action: 'automation.test_email',
        entityType: 'settings',
        entityId: auth.companyId,
        metadata: { ok: result.ok, provider: provider.name, ...(result.ok ? {} : { code: result.code }) },
      }),
    );
    return result.ok
      ? { delivery: 'sent', providerMessageId: result.providerMessageId, to: auth.email }
      : { delivery: 'failed', error: { code: result.code, detail: result.detail } };
  });
}
