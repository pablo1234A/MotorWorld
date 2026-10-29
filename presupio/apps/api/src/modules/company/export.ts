import type { Trx } from '../../db/database.js';

/** Máximo de filas por tabla en una exportación (se indica si se recorta). */
export const EXPORT_ROW_LIMIT = 50_000;

/**
 * Exportación completa de los datos de una empresa en JSON (portabilidad y copia propia).
 * Incluye datos personales de sus clientes: solo la pueden pedir propietarios y
 * administradores. No incluye secretos: ni contraseñas, ni sesiones, ni tokens.
 */
export async function exportCompanyData(trx: Trx, companyId: string) {
  const take = <T>(rows: T[]) => ({ items: rows.slice(0, EXPORT_ROW_LIMIT), truncated: rows.length > EXPORT_ROW_LIMIT });
  const limit = EXPORT_ROW_LIMIT + 1;
  const byCompany = <T extends keyof import('../../db/types.js').Database>(table: T) =>
    (trx.selectFrom(table as any) as any).selectAll().where('companyId', '=', companyId).limit(limit).execute();

  const company = await trx
    .selectFrom('companies')
    .select(['id', 'name', 'legalName', 'taxId', 'phone', 'website', 'country', 'timezone', 'locale', 'currency', 'createdAt'])
    .where('id', '=', companyId)
    .executeTakeFirstOrThrow();
  const members = await trx
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.userId')
    .select(['u.id as userId', 'u.fullName', 'u.email', 'm.role', 'm.createdAt as joinedAt'])
    .where('m.companyId', '=', companyId)
    .execute();

  return {
    format: 'presupio-export',
    version: 2,
    exportedAt: new Date(),
    company,
    members,
    settings: await trx.selectFrom('companySettings').selectAll().where('companyId', '=', companyId).executeTakeFirst(),
    subscription: await trx
      .selectFrom('subscriptions')
      .select(['plan', 'status', 'trialEndsAt', 'currentPeriodStart', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'pastDueSince', 'endedAt'])
      .where('companyId', '=', companyId)
      .executeTakeFirst(),
    contacts: take(await byCompany('contacts')),
    exclusions: take(await byCompany('contactExclusions')),
    quotes: take(await byCompany('quotes')),
    followUps: take(await byCompany('followUps')),
    messageDeliveries: take(await byCompany('messageDeliveries')),
    messageTemplates: take(await byCompany('messageTemplateVersions')),
    recoveries: take(await byCompany('recoveryEvents')),
    usagePeriods: take(await byCompany('usagePeriods')),
    attempts: take(await byCompany('attemptEvents')),
    // Historial de facturación: tipos de evento y resultados (sin datos de tarjeta).
    billingEvents: take(
      await trx
        .selectFrom('billingEvents')
        .select(['eventType', 'outcome', 'subscriptionStatus', 'plan', 'createdAt'])
        .where('companyId', '=', companyId)
        .limit(limit)
        .execute(),
    ),
    activity: take(await byCompany('activityLog')),
  };
}
