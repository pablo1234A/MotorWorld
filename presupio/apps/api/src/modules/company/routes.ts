import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLANS, hasActiveAccess } from '../../domain/plans.js';
import { errors } from '../../lib/errors.js';
import { email, optionalText, parseWith, phone, requiredText } from '../../lib/validation.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';

const TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

// Solo los campos que la empresa puede editar. El id, el plan o la suscripción no están aquí:
// cualquier campo no listado se rechaza (strictObject).
const updateCompanyBody = z
  .strictObject({
    name: requiredText(120),
    legalName: optionalText(200),
    taxId: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/[\s-]/g, ''))
      .pipe(z.string().regex(/^[A-Z0-9]{8,15}$/, 'NIF/CIF no válido'))
      .nullable()
      .or(z.literal('').transform(() => null)),
    phone: phone.nullable().or(z.literal('').transform(() => null)),
    website: z
      .url({ protocol: /^https?$/, error: 'URL no válida' })
      .max(200)
      .nullable()
      .or(z.literal('').transform(() => null)),
    timezone: z.string().refine((tz) => TIMEZONES.has(tz), 'Zona horaria no válida'),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay cambios');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)');

const updateSettingsBody = z
  .strictObject({
    // Días tras el envío del presupuesto en que toca cada seguimiento (por defecto 3, 7 y 14).
    followUpScheduleDays: z
      .array(z.number().int().min(1, 'Mínimo 1 día').max(180, 'Máximo 180 días'))
      .min(1, 'Indica al menos un seguimiento')
      .max(6, 'Como máximo 6 seguimientos')
      .refine((d) => d.every((v, i) => i === 0 || v > d[i - 1]!), 'Los días deben ir de menor a mayor, sin repetir'),
    allowedWeekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Elige al menos un día')
      .max(7)
      .refine((d) => new Set(d).size === d.length, 'Días repetidos'),
    contactWindowStart: time,
    contactWindowEnd: time,
    defaultChannel: z.enum(['email', 'phone', 'whatsapp', 'sms']),
    requireManualApproval: z.boolean(),
    legalBasisNote: optionalText(2000),
    senderName: optionalText(80),
    replyToEmail: email.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'No hay cambios');

function settingsDto(s: {
  followUpScheduleDays: number[];
  allowedWeekdays: number[];
  contactWindowStart: string;
  contactWindowEnd: string;
  defaultChannel: string;
  requireManualApproval: boolean;
  legalBasisNote: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  automationEnabled: boolean;
  automationEnabledAt: Date | null;
  updatedAt: Date;
}) {
  return {
    followUpScheduleDays: s.followUpScheduleDays,
    allowedWeekdays: [...s.allowedWeekdays].sort(),
    contactWindowStart: s.contactWindowStart.slice(0, 5),
    contactWindowEnd: s.contactWindowEnd.slice(0, 5),
    defaultChannel: s.defaultChannel,
    requireManualApproval: s.requireManualApproval,
    legalBasisNote: s.legalBasisNote,
    senderName: s.senderName,
    replyToEmail: s.replyToEmail,
    automationEnabled: s.automationEnabled,
    automationEnabledAt: s.automationEnabledAt,
    updatedAt: s.updatedAt,
  };
}

const COMPANY_FIELDS = [
  'id',
  'name',
  'legalName',
  'taxId',
  'phone',
  'website',
  'country',
  'timezone',
  'locale',
  'currency',
  'createdAt',
  'updatedAt',
] as const;

export async function companyRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'company:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({
      company: await trx.selectFrom('companies').select(COMPANY_FIELDS).where('id', '=', auth.companyId).executeTakeFirstOrThrow(),
    })),
  );

  app.patch('/', { config: { permission: 'company:update' } }, async (req) => {
    const body = parseWith(updateCompanyBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const company = await trx
        .updateTable('companies')
        .set(body)
        .where('id', '=', auth.companyId)
        .returning(COMPANY_FIELDS)
        .executeTakeFirstOrThrow();
      await logActivity(trx, auth, {
        action: 'company.updated',
        entityType: 'company',
        entityId: auth.companyId,
        metadata: { fields: Object.keys(body) },
      });
      return { company };
    });
  });

  app.get('/settings', { config: { permission: 'company:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => {
      const s = await trx.selectFrom('companySettings').selectAll().where('companyId', '=', auth.companyId).executeTakeFirstOrThrow();
      return { settings: settingsDto(s) };
    }),
  );

  app.patch('/settings', { config: { permission: 'settings:update' } }, async (req) => {
    const body = parseWith(updateSettingsBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      const current = await trx
        .selectFrom('companySettings')
        .select(['contactWindowStart', 'contactWindowEnd', 'automationEnabled', 'legalBasisNote', 'replyToEmail'])
        .where('companyId', '=', auth.companyId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      // Con el envío automático activo no se pueden quitar sus requisitos.
      if (current.automationEnabled) {
        const note = body.legalBasisNote !== undefined ? body.legalBasisNote : current.legalBasisNote;
        const reply = body.replyToEmail !== undefined ? body.replyToEmail : current.replyToEmail;
        const details = [
          ...(!note || note.trim().length < 20 ? [{ path: 'legalBasisNote', message: 'Obligatoria mientras el envío automático esté activo' }] : []),
          ...(!reply ? [{ path: 'replyToEmail', message: 'Obligatoria mientras el envío automático esté activo' }] : []),
        ];
        if (details.length) throw errors.validation('Desactiva antes el envío automático.', details);
      }
      const start = body.contactWindowStart ?? current.contactWindowStart.slice(0, 5);
      const end = body.contactWindowEnd ?? current.contactWindowEnd.slice(0, 5);
      if (start >= end) {
        throw errors.validation('La franja horaria no es válida.', [
          { path: 'contactWindowEnd', message: 'La hora de fin debe ser posterior a la de inicio' },
        ]);
      }
      const s = await trx
        .updateTable('companySettings')
        .set({ ...body, updatedByUserId: auth.userId })
        .where('companyId', '=', auth.companyId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await logActivity(trx, auth, {
        action: 'settings.updated',
        entityType: 'settings',
        entityId: auth.companyId,
        metadata: { fields: Object.keys(body) },
      });
      return { settings: settingsDto(s) };
    });
  });

  /** Estado del plan: solo lectura. Lo modifica el servidor (alta) y, en la fase 5, el proveedor de pagos. */
  app.get('/subscription', { config: { permission: 'subscription:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => {
      const sub = await trx
        .selectFrom('subscriptions')
        .select(['plan', 'status', 'trialEndsAt', 'currentPeriodStart', 'currentPeriodEnd', 'cancelAtPeriodEnd'])
        .where('companyId', '=', auth.companyId)
        .executeTakeFirstOrThrow();
      return {
        subscription: {
          ...sub,
          hasActiveAccess: hasActiveAccess(sub),
          planDetails: sub.plan ? PLANS[sub.plan] : null,
          paymentsEnabled: false,
        },
        plans: Object.values(PLANS),
      };
    }),
  );
}
