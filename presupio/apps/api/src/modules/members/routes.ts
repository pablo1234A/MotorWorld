import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Trx } from '../../db/database.js';
import { canManageRole } from '../../domain/permissions.js';
import { generateToken, hashToken } from '../../lib/crypto.js';
import { errors } from '../../lib/errors.js';
import { email, idParams, parseWith, uuid } from '../../lib/validation.js';
import { invitationEmail } from '../../mail/templates.js';
import { inTenant } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import { buildLink } from '../auth/service.js';

const userParams = z.strictObject({ userId: uuid });
const inviteBody = z.strictObject({ email, role: z.enum(['admin', 'member', 'viewer']) });
const updateMemberBody = z.strictObject({ role: z.enum(['owner', 'admin', 'member', 'viewer']) });

async function countOwners(trx: Trx, companyId: string): Promise<number> {
  const row = await trx
    .selectFrom('memberships')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('companyId', '=', companyId)
    .where('role', '=', 'owner')
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

async function getMemberForUpdate(trx: Trx, companyId: string, userId: string) {
  const member = await trx
    .selectFrom('memberships')
    .select(['id', 'userId', 'role'])
    .where('companyId', '=', companyId)
    .where('userId', '=', userId)
    .forUpdate()
    .executeTakeFirst();
  if (!member) throw errors.notFound('Miembro no encontrado.');
  return member;
}

export async function memberRoutes(app: FastifyInstance) {
  app.get('/', { config: { permission: 'members:read' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({
      items: await trx
        .selectFrom('memberships as m')
        .innerJoin('users as u', 'u.id', 'm.userId')
        .select(['u.id as userId', 'u.fullName', 'u.email', 'm.role', 'm.createdAt as joinedAt'])
        .where('m.companyId', '=', auth.companyId)
        .orderBy('m.createdAt', 'asc')
        .execute(),
    })),
  );

  app.patch('/:userId', { config: { permission: 'members:manage', readOnlyAllowed: true } }, async (req) => {
    const { userId } = parseWith(userParams, req.params);
    const body = parseWith(updateMemberBody, req.body);
    return inTenant(app, req, async (trx, auth) => {
      if (userId === auth.userId) throw errors.forbidden('No puedes cambiar tu propio rol.');
      // Serializa los cambios de rol de la empresa para que nunca quede sin propietario.
      await trx.selectFrom('companies').select('id').where('id', '=', auth.companyId).forUpdate().execute();
      const member = await getMemberForUpdate(trx, auth.companyId, userId);
      if (!canManageRole(auth.role, member.role, body.role)) throw errors.forbidden();
      if (member.role === body.role) return { member: { userId, role: member.role } };
      if (member.role === 'owner' && (await countOwners(trx, auth.companyId)) <= 1) {
        throw errors.conflict('La empresa debe tener al menos un propietario.');
      }
      await trx.updateTable('memberships').set({ role: body.role }).where('id', '=', member.id).execute();
      await logActivity(trx, auth, {
        action: 'member.role_changed',
        entityType: 'member',
        entityId: userId,
        metadata: { from: member.role, to: body.role },
      });
      return { member: { userId, role: body.role } };
    });
  });

  app.delete('/:userId', { config: { permission: 'members:manage', readOnlyAllowed: true } }, async (req, reply) => {
    const { userId } = parseWith(userParams, req.params);
    await inTenant(app, req, async (trx, auth) => {
      if (userId === auth.userId) throw errors.forbidden('No puedes eliminarte a ti mismo de la empresa.');
      await trx.selectFrom('companies').select('id').where('id', '=', auth.companyId).forUpdate().execute();
      const member = await getMemberForUpdate(trx, auth.companyId, userId);
      if (!canManageRole(auth.role, member.role)) throw errors.forbidden();
      if (member.role === 'owner' && (await countOwners(trx, auth.companyId)) <= 1) {
        throw errors.conflict('La empresa debe tener al menos un propietario.');
      }
      // Las sesiones del usuario en esta empresa se eliminan en cascada.
      await trx.deleteFrom('memberships').where('id', '=', member.id).execute();
      await logActivity(trx, auth, {
        action: 'member.removed',
        entityType: 'member',
        entityId: userId,
        metadata: { role: member.role },
      });
    });
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Invitaciones
  // -------------------------------------------------------------------------
  app.get('/invitations', { config: { permission: 'members:manage' } }, async (req) =>
    inTenant(app, req, async (trx, auth) => ({
      items: await trx
        .selectFrom('invitations')
        .select(['id', 'email', 'role', 'expiresAt', 'createdAt'])
        .where('companyId', '=', auth.companyId)
        .where('acceptedAt', 'is', null)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', new Date())
        .orderBy('createdAt', 'desc')
        .execute(),
    })),
  );

  app.post('/invitations', { config: { permission: 'members:manage' } }, async (req, reply) => {
    const body = parseWith(inviteBody, req.body);
    const rawToken = generateToken();
    const result = await inTenant(app, req, async (trx, auth) => {
      if (!canManageRole(auth.role, 'member', body.role)) throw errors.forbidden();
      const alreadyMember = await trx
        .selectFrom('memberships as m')
        .innerJoin('users as u', 'u.id', 'm.userId')
        .select('m.id')
        .where('m.companyId', '=', auth.companyId)
        .where('u.email', '=', body.email)
        .executeTakeFirst();
      if (alreadyMember) throw errors.conflict('Esa persona ya es miembro de la empresa.');

      // Reenviar = revocar la invitación abierta anterior y emitir una nueva.
      await trx
        .updateTable('invitations')
        .set({ revokedAt: new Date() })
        .where('companyId', '=', auth.companyId)
        .where('email', '=', body.email)
        .where('acceptedAt', 'is', null)
        .where('revokedAt', 'is', null)
        .execute();
      const invitation = await trx
        .insertInto('invitations')
        .values({
          companyId: auth.companyId,
          email: body.email,
          role: body.role,
          tokenHash: hashToken(rawToken),
          invitedByUserId: auth.userId,
          expiresAt: new Date(Date.now() + app.config.tokens.invitationTtlMs),
          acceptedAt: null,
          revokedAt: null,
        })
        .returning(['id', 'email', 'role', 'expiresAt', 'createdAt'])
        .executeTakeFirstOrThrow();
      const company = await trx.selectFrom('companies').select('name').where('id', '=', auth.companyId).executeTakeFirstOrThrow();
      await logActivity(trx, auth, {
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: invitation.id,
        metadata: { role: body.role },
      });
      return { invitation, companyName: company.name, inviterName: auth.fullName };
    });

    const acceptUrl = buildLink(app, 'aceptar-invitacion', rawToken);
    const delivery = await app.mailer.send(invitationEmail(body.email, result.companyName, result.inviterName, acceptUrl));
    // El enlace se devuelve a quien invita para que pueda compartirlo si no hay email configurado.
    // La cuenta creada así queda con el email sin verificar.
    return reply.status(201).send({ invitation: result.invitation, acceptUrl, delivery: delivery.status });
  });

  app.delete('/invitations/:id', { config: { permission: 'members:manage', readOnlyAllowed: true } }, async (req, reply) => {
    const { id } = parseWith(idParams, req.params);
    await inTenant(app, req, async (trx, auth) => {
      const revoked = await trx
        .updateTable('invitations')
        .set({ revokedAt: new Date() })
        .where('id', '=', id)
        .where('companyId', '=', auth.companyId)
        .where('acceptedAt', 'is', null)
        .where('revokedAt', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!revoked) throw errors.notFound('Invitación no encontrada.');
      await logActivity(trx, auth, { action: 'invitation.revoked', entityType: 'invitation', entityId: id });
    });
    return reply.status(204).send();
  });
}
