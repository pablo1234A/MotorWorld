import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/database.js';
import { permissionsOf } from '../../domain/permissions.js';
import { hasActiveAccess } from '../../domain/plans.js';
import { parseWith, requiredText } from '../../lib/validation.js';
import { requireAuth, tenantOf } from '../../plugins/auth.js';
import { listMemberships, publicUser } from '../auth/service.js';

const updateMeBody = z.strictObject({ fullName: requiredText(120) });

export async function meRoutes(app: FastifyInstance) {
  /** Usuario autenticado, empresa activa, rol, permisos y estado del plan. */
  app.get('/me', async (req) => {
    const auth = requireAuth(req);
    const [user, memberships, tenantData] = await Promise.all([
      app.db
        .selectFrom('users')
        .select(['id', 'email', 'fullName', 'emailVerifiedAt'])
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow(),
      listMemberships(app, auth.userId),
      withTenant(app.db, tenantOf(auth), async (trx) => {
        const company = await trx
          .selectFrom('companies')
          .select(['id', 'name'])
          .where('id', '=', auth.companyId)
          .executeTakeFirstOrThrow();
        const subscription = await trx
          .selectFrom('subscriptions')
          .select(['plan', 'status', 'trialEndsAt', 'currentPeriodEnd'])
          .where('companyId', '=', auth.companyId)
          .executeTakeFirstOrThrow();
        return { company, subscription };
      }),
    ]);
    return {
      user: publicUser(user),
      company: tenantData.company,
      role: auth.role,
      permissions: permissionsOf(auth.role),
      memberships,
      subscription: { ...tenantData.subscription, hasActiveAccess: hasActiveAccess(tenantData.subscription) },
    };
  });

  app.patch('/me', { config: { readOnlyAllowed: true } }, async (req) => {
    const auth = requireAuth(req);
    const body = parseWith(updateMeBody, req.body);
    const user = await app.db
      .updateTable('users')
      .set({ fullName: body.fullName })
      .where('id', '=', auth.userId)
      .returning(['id', 'email', 'fullName', 'emailVerifiedAt'])
      .executeTakeFirstOrThrow();
    return { user: publicUser(user) };
  });
}
