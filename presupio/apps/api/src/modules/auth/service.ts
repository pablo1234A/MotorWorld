import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { setTenant, withUser, type Trx } from '../../db/database.js';
import type { MembershipRole, UserTokenPurpose } from '../../db/types.js';
import { TRIAL_PLAN } from '../../domain/plans.js';
import { generateToken, hashToken } from '../../lib/crypto.js';
import { errors, pgConstraint, pgErrorCode, PG_UNIQUE_VIOLATION } from '../../lib/errors.js';
import type { DeliveryResult } from '../../mail/mailer.js';
import { emailVerificationEmail } from '../../mail/templates.js';
import { logActivity } from '../activity/service.js';
import { recordTrialClaim, trialEligibility, type TrialDenial } from './trial.js';

export function publicUser(u: { id: string; email: string; fullName: string; emailVerifiedAt: Date | null }) {
  return { id: u.id, email: u.email, fullName: u.fullName, emailVerified: u.emailVerifiedAt !== null };
}

/** Crea la empresa con su configuración, suscripción inicial y el usuario como propietario. */
export async function createCompanyForOwner(
  trx: Trx,
  input: { userId: string; companyName: string; trialDays: number; ownerEmail: string; trialDomainRuleDays: number },
): Promise<{ id: string; name: string; trial: { granted: boolean; endsAt: Date | null; denied: TrialDenial | null } }> {
  const companyId = randomUUID();
  await setTenant(trx, { companyId, userId: input.userId });
  const company = await trx
    .insertInto('companies')
    .values({ id: companyId, name: input.companyName, legalName: null, taxId: null, phone: null, website: null })
    .returning(['id', 'name'])
    .executeTakeFirstOrThrow();
  await trx.insertInto('memberships').values({ companyId, userId: input.userId, role: 'owner' }).execute();
  await trx.insertInto('companySettings').values({ companyId, legalBasisNote: null, updatedByUserId: null }).execute();

  // Prueba gratuita sin cobro con los límites de Starter. Nunca se activa un plan de pago aquí:
  // el estado 'active' solo lo establecerá un webhook verificado del proveedor de pagos (fase 5).
  // Una prueba por persona y, para dominios de empresa, una por dominio y año (auth/trial.ts).
  const denied = input.trialDays > 0 ? await trialEligibility(trx, input.ownerEmail, input.trialDomainRuleDays) : null;
  const trialEndsAt = input.trialDays > 0 && !denied ? new Date(Date.now() + input.trialDays * 86_400_000) : null;
  if (trialEndsAt) await recordTrialClaim(trx, companyId, input.ownerEmail);
  await trx
    .insertInto('subscriptions')
    .values({
      companyId,
      plan: trialEndsAt ? TRIAL_PLAN : null,
      status: trialEndsAt ? 'trialing' : 'none',
      trialEndsAt,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
    })
    .execute();

  await logActivity(trx, { companyId, userId: input.userId }, {
    action: 'company.created',
    entityType: 'company',
    entityId: companyId,
    metadata: { trialDays: trialEndsAt ? input.trialDays : 0, ...(denied ? { trialDenied: denied } : {}) },
  });
  return { ...company, trial: { granted: !!trialEndsAt, endsAt: trialEndsAt, denied } };
}

export async function createUser(
  trx: Trx,
  input: { email: string; fullName: string; passwordHash: string },
): Promise<{ id: string; email: string; fullName: string; emailVerifiedAt: Date | null }> {
  try {
    return await trx
      .insertInto('users')
      .values({
        email: input.email,
        fullName: input.fullName,
        passwordHash: input.passwordHash,
        emailVerifiedAt: null,
        termsAcceptedAt: new Date(),
        lastLoginAt: null,
      })
      .returning(['id', 'email', 'fullName', 'emailVerifiedAt'])
      .executeTakeFirstOrThrow();
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === 'users_email_key') {
      throw errors.conflict('Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.');
    }
    throw error;
  }
}

/** Emite un token de un solo uso e invalida los anteriores del mismo tipo. */
export async function issueUserToken(
  trx: Trx,
  userId: string,
  purpose: UserTokenPurpose,
  ttlMs: number,
): Promise<string> {
  const now = new Date();
  await trx
    .updateTable('userTokens')
    .set({ usedAt: now })
    .where('userId', '=', userId)
    .where('purpose', '=', purpose)
    .where('usedAt', 'is', null)
    .execute();
  const token = generateToken();
  await trx
    .insertInto('userTokens')
    .values({ userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMs), usedAt: null })
    .execute();
  return token;
}

/** Consume un token de forma atómica: dos peticiones simultáneas no pueden usarlo dos veces. */
export async function consumeUserToken(trx: Trx, token: string, purpose: UserTokenPurpose): Promise<string> {
  const row = await trx
    .updateTable('userTokens')
    .set({ usedAt: new Date() })
    .where('tokenHash', '=', hashToken(token))
    .where('purpose', '=', purpose)
    .where('usedAt', 'is', null)
    .where('expiresAt', '>', new Date())
    .returning('userId')
    .executeTakeFirst();
  if (!row) throw errors.invalidToken();
  return row.userId;
}

export function buildLink(app: FastifyInstance, path: string, token: string): string {
  const url = new URL(path, app.config.appWebUrl + '/');
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendVerificationEmail(
  app: FastifyInstance,
  user: { email: string; fullName: string },
  token: string,
): Promise<DeliveryResult> {
  return app.mailer.send(emailVerificationEmail(user.email, user.fullName, buildLink(app, 'verificar-email', token)));
}

export interface MembershipSummary {
  companyId: string;
  companyName: string;
  role: MembershipRole;
}

/** Empresas a las que pertenece el usuario (RLS permite ver las propias membresías). */
export function listMemberships(app: FastifyInstance, userId: string): Promise<MembershipSummary[]> {
  return withUser(app.db, userId, (trx) =>
    trx
      .selectFrom('memberships as m')
      .innerJoin('companies as c', 'c.id', 'm.companyId')
      .select(['m.companyId', 'c.name as companyName', 'm.role'])
      .where('m.userId', '=', userId)
      .orderBy('m.createdAt', 'asc')
      .execute(),
  );
}
