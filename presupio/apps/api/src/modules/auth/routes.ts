import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { setTenant, withTenant } from '../../db/database.js';
import { TOKEN_PATTERN, hashToken } from '../../lib/crypto.js';
import { errors } from '../../lib/errors.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { email, parseWith, password, requiredText, uuid } from '../../lib/validation.js';
import { passwordResetEmail } from '../../mail/templates.js';
import { clearSessionCookie, createSession, requireAuth, setSessionCookie } from '../../plugins/auth.js';
import { logActivity } from '../activity/service.js';
import {
  buildLink,
  consumeUserToken,
  createCompanyForOwner,
  createUser,
  issueUserToken,
  listMemberships,
  publicUser,
  sendVerificationEmail,
} from './service.js';

const token = z.string().regex(TOKEN_PATTERN, 'Token no válido');

const registerBody = z.strictObject({
  fullName: requiredText(120),
  email,
  password,
  companyName: requiredText(120),
  acceptTerms: z.literal(true, 'Debes aceptar los términos del servicio y la política de privacidad'),
});

const loginBody = z.strictObject({
  email,
  password: z.string().min(1, 'Introduce tu contraseña').max(128),
  companyId: uuid.optional(),
});

const forgotBody = z.strictObject({ email });
const resetBody = z.strictObject({ token, password });
const verifyBody = z.strictObject({ token });
const changePasswordBody = z
  .strictObject({ currentPassword: z.string().min(1).max(128), newPassword: password })
  .refine((b) => b.currentPassword !== b.newPassword, {
    path: ['newPassword'],
    message: 'La nueva contraseña debe ser distinta de la actual',
  });
const switchBody = z.strictObject({ companyId: uuid });
const invitationPreviewBody = z.strictObject({ token });
const invitationAcceptBody = z.strictObject({
  token,
  fullName: requiredText(120).optional(),
  password: password.optional(),
  acceptTerms: z.literal(true).optional(),
});

function rule(r: { max: number; windowMs: number }) {
  return { max: r.max, timeWindow: r.windowMs };
}

export async function authRoutes(app: FastifyInstance) {
  const limits = app.config.rateLimits;

  // -------------------------------------------------------------------------
  // Registro: crea usuario, empresa (propietario), configuración y prueba gratuita.
  // -------------------------------------------------------------------------
  app.post('/register', { config: { auth: 'none', rateLimit: rule(limits.register) } }, async (req, reply) => {
    const body = parseWith(registerBody, req.body);
    const passwordHash = await hashPassword(body.password);

    const result = await app.db.transaction().execute(async (trx) => {
      const user = await createUser(trx, { email: body.email, fullName: body.fullName, passwordHash });
      const company = await createCompanyForOwner(trx, {
        userId: user.id,
        companyName: body.companyName,
        trialDays: app.config.trialDays,
      });
      await logActivity(trx, { companyId: company.id, userId: user.id }, {
        action: 'member.joined',
        entityType: 'member',
        entityId: user.id,
        metadata: { role: 'owner', via: 'registration' },
      });
      const session = await createSession(trx, {
        userId: user.id,
        companyId: company.id,
        userAgent: req.headers['user-agent'],
        ttlMs: app.config.session.ttlMs,
      });
      const verificationToken = await issueUserToken(trx, user.id, 'email_verification', app.config.tokens.emailVerificationTtlMs);
      return { user, company, session, verificationToken };
    });

    setSessionCookie(app, reply, result.session.token, result.session.expiresAt);
    const delivery = await sendVerificationEmail(app, result.user, result.verificationToken);
    return reply.status(201).send({
      user: publicUser(result.user),
      company: result.company,
      role: 'owner',
      emailVerification: { delivery: delivery.status },
    });
  });

  // -------------------------------------------------------------------------
  // Inicio de sesión
  // -------------------------------------------------------------------------
  app.post('/login', { config: { auth: 'none', rateLimit: rule(limits.login) } }, async (req, reply) => {
    const body = parseWith(loginBody, req.body);
    const limiter = app.limiters.loginPerEmail;
    if (limiter.isBlocked(body.email)) throw errors.rateLimited();

    const user = await app.db
      .selectFrom('users')
      .select(['id', 'email', 'fullName', 'passwordHash', 'emailVerifiedAt'])
      .where('email', '=', body.email)
      .executeTakeFirst();

    if (!user) {
      await verifyAgainstDummy(body.password);
      limiter.hit(body.email);
      throw errors.invalidCredentials();
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      limiter.hit(body.email);
      req.log.info({ userId: user.id }, 'Inicio de sesión fallido');
      throw errors.invalidCredentials();
    }
    limiter.reset(body.email);

    const memberships = await listMemberships(app, user.id);
    const active = (body.companyId && memberships.find((m) => m.companyId === body.companyId)) || memberships[0];
    if (!active) throw errors.forbidden('Tu usuario no pertenece a ninguna empresa activa.');

    const session = await app.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('sessions').where('userId', '=', user.id).where('expiresAt', '<=', new Date()).execute();
      await trx.updateTable('users').set({ lastLoginAt: new Date() }).where('id', '=', user.id).execute();
      const s = await createSession(trx, {
        userId: user.id,
        companyId: active.companyId,
        userAgent: req.headers['user-agent'],
        ttlMs: app.config.session.ttlMs,
      });
      await setTenant(trx, { companyId: active.companyId, userId: user.id });
      await logActivity(trx, { companyId: active.companyId, userId: user.id }, {
        action: 'auth.login',
        entityType: 'member',
        entityId: user.id,
      });
      return s;
    });

    setSessionCookie(app, reply, session.token, session.expiresAt);
    return {
      user: publicUser(user),
      company: { id: active.companyId, name: active.companyName },
      role: active.role,
      memberships,
    };
  });

  // -------------------------------------------------------------------------
  // Cierre de sesión (idempotente)
  // -------------------------------------------------------------------------
  app.post('/logout', { config: { auth: 'optional', readOnlyAllowed: true } }, async (req, reply) => {
    if (req.auth) await app.db.deleteFrom('sessions').where('id', '=', req.auth.sessionId).execute();
    clearSessionCookie(app, reply);
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Recuperación de contraseña. La respuesta es idéntica exista o no el email.
  // -------------------------------------------------------------------------
  app.post('/password/forgot', { config: { auth: 'none', rateLimit: rule(limits.passwordForgot) } }, async (req, reply) => {
    const body = parseWith(forgotBody, req.body);
    if (app.limiters.passwordForgotPerEmail.hit(body.email)) {
      // El trabajo real ocurre después de responder: el tiempo de respuesta no revela nada.
      app.runInBackground('password_reset_request', async () => {
        const user = await app.db
          .selectFrom('users')
          .select(['id', 'email', 'fullName'])
          .where('email', '=', body.email)
          .executeTakeFirst();
        if (!user) return;
        const resetToken = await app.db
          .transaction()
          .execute((trx) => issueUserToken(trx, user.id, 'password_reset', app.config.tokens.passwordResetTtlMs));
        const result = await app.mailer.send(
          passwordResetEmail(user.email, user.fullName, buildLink(app, 'restablecer-contrasena', resetToken)),
        );
        if (result.status !== 'sent') req.log.warn({ delivery: result.status }, 'Email de recuperación no enviado');
      });
    }
    return reply.status(202).send({
      message: 'Si existe una cuenta con ese email, recibirás un enlace para restablecer la contraseña.',
    });
  });

  app.post('/password/reset', { config: { auth: 'none', rateLimit: rule(limits.tokenRedeem) } }, async (req, reply) => {
    const body = parseWith(resetBody, req.body);
    const passwordHash = await hashPassword(body.password);
    await app.db.transaction().execute(async (trx) => {
      const userId = await consumeUserToken(trx, body.token, 'password_reset');
      await trx
        .updateTable('users')
        .set({ passwordHash, passwordChangedAt: new Date() })
        .where('id', '=', userId)
        .execute();
      // Cerrar todas las sesiones: si alguien tenía acceso, lo pierde.
      await trx.deleteFrom('sessions').where('userId', '=', userId).execute();
      req.log.info({ userId }, 'Contraseña restablecida');
    });
    clearSessionCookie(app, reply);
    return reply.status(200).send({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  });

  app.post('/password/change', { config: { readOnlyAllowed: true } }, async (req, reply) => {
    const auth = requireAuth(req);
    const body = parseWith(changePasswordBody, req.body);
    const user = await app.db
      .selectFrom('users')
      .select(['passwordHash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw errors.validation('La contraseña actual no es correcta.', [
        { path: 'currentPassword', message: 'La contraseña actual no es correcta' },
      ]);
    }
    const passwordHash = await hashPassword(body.newPassword);
    await app.db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ passwordHash, passwordChangedAt: new Date() }).where('id', '=', auth.userId).execute();
      // Se mantienen solo la sesión actual.
      await trx.deleteFrom('sessions').where('userId', '=', auth.userId).where('id', '<>', auth.sessionId).execute();
    });
    return reply.status(200).send({ message: 'Contraseña actualizada. Se han cerrado las demás sesiones.' });
  });

  // -------------------------------------------------------------------------
  // Verificación de email
  // -------------------------------------------------------------------------
  app.post('/email/verify', { config: { auth: 'none', rateLimit: rule(limits.tokenRedeem) } }, async (req) => {
    const body = parseWith(verifyBody, req.body);
    await app.db.transaction().execute(async (trx) => {
      const userId = await consumeUserToken(trx, body.token, 'email_verification');
      await trx
        .updateTable('users')
        .set({ emailVerifiedAt: new Date() })
        .where('id', '=', userId)
        .where('emailVerifiedAt', 'is', null)
        .execute();
    });
    return { message: 'Email confirmado.' };
  });

  app.post('/email/verification', { config: { rateLimit: rule(limits.passwordForgot), readOnlyAllowed: true } }, async (req, reply) => {
    const auth = requireAuth(req);
    if (auth.emailVerified) return reply.status(200).send({ message: 'Tu email ya está confirmado.', delivery: null });
    const verificationToken = await app.db
      .transaction()
      .execute((trx) => issueUserToken(trx, auth.userId, 'email_verification', app.config.tokens.emailVerificationTtlMs));
    const delivery = await sendVerificationEmail(app, auth, verificationToken);
    return reply.status(202).send({
      message: delivery.status === 'sent' ? 'Te hemos enviado un nuevo enlace de confirmación.' : 'No se ha podido enviar el email.',
      delivery: delivery.status,
    });
  });

  // -------------------------------------------------------------------------
  // Cambio de empresa activa (usuarios en varias empresas)
  // -------------------------------------------------------------------------
  app.post('/switch-company', { config: { readOnlyAllowed: true } }, async (req) => {
    const auth = requireAuth(req);
    const body = parseWith(switchBody, req.body);
    const memberships = await listMemberships(app, auth.userId);
    const target = memberships.find((m) => m.companyId === body.companyId);
    if (!target) throw errors.notFound('Empresa no encontrada.');
    await app.db.updateTable('sessions').set({ companyId: target.companyId }).where('id', '=', auth.sessionId).execute();
    return { company: { id: target.companyId, name: target.companyName }, role: target.role };
  });

  // -------------------------------------------------------------------------
  // Invitaciones
  // -------------------------------------------------------------------------
  async function findOpenInvitation(rawToken: string) {
    const found = await app.db
      .selectFrom((eb) => eb.fn<{ invitationId: string; companyId: string }>('app_find_open_invitation', [eb.val(hashToken(rawToken))]).as('i'))
      .select(['i.invitationId', 'i.companyId'])
      .executeTakeFirst();
    if (!found) throw errors.invalidToken();
    return found;
  }

  app.post('/invitations/preview', { config: { auth: 'none', rateLimit: rule(limits.tokenRedeem) } }, async (req) => {
    const body = parseWith(invitationPreviewBody, req.body);
    const found = await findOpenInvitation(body.token);
    const invitation = await withTenant(app.db, { companyId: found.companyId, userId: null }, (trx) =>
      trx
        .selectFrom('invitations as i')
        .innerJoin('companies as c', 'c.id', 'i.companyId')
        .select(['i.email', 'i.role', 'i.expiresAt', 'c.name as companyName'])
        .where('i.id', '=', found.invitationId)
        .executeTakeFirstOrThrow(),
    );
    const existing = await app.db.selectFrom('users').select('id').where('email', '=', invitation.email).executeTakeFirst();
    return { ...invitation, accountExists: !!existing };
  });

  app.post(
    '/invitations/accept',
    { config: { auth: 'optional', rateLimit: rule(limits.tokenRedeem), readOnlyAllowed: true } },
    async (req, reply) => {
      const body = parseWith(invitationAcceptBody, req.body);
      const found = await findOpenInvitation(body.token);
      const auth = req.auth;

      // Sin sesión y sin cuenta: se crea la cuenta (el hash se calcula fuera de la transacción).
      const newPasswordHash = !auth && body.password ? await hashPassword(body.password) : null;

      const result = await app.db.transaction().execute(async (trx) => {
        await setTenant(trx, { companyId: found.companyId, userId: auth?.userId ?? null });
        // Bloqueo de la fila: dos aceptaciones simultáneas no crean dos membresías.
        const invitation = await trx
          .selectFrom('invitations')
          .selectAll()
          .where('id', '=', found.invitationId)
          .where('acceptedAt', 'is', null)
          .where('revokedAt', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (!invitation) throw errors.invalidToken();

        let user: { id: string; email: string; fullName: string; emailVerifiedAt: Date | null };
        if (auth) {
          if (auth.email !== invitation.email) {
            throw errors.forbidden('Esta invitación es para otro email. Inicia sesión con la cuenta invitada.');
          }
          user = await trx
            .selectFrom('users')
            .select(['id', 'email', 'fullName', 'emailVerifiedAt'])
            .where('id', '=', auth.userId)
            .executeTakeFirstOrThrow();
        } else {
          const existing = await trx.selectFrom('users').select('id').where('email', '=', invitation.email).executeTakeFirst();
          if (existing) throw errors.conflict('Ya tienes una cuenta con este email. Inicia sesión para aceptar la invitación.');
          if (!body.fullName || !newPasswordHash || body.acceptTerms !== true) {
            throw errors.validation('Faltan datos para crear tu cuenta.', [
              ...(!body.fullName ? [{ path: 'fullName', message: 'Este campo es obligatorio' }] : []),
              ...(!newPasswordHash ? [{ path: 'password', message: 'Este campo es obligatorio' }] : []),
              ...(body.acceptTerms !== true ? [{ path: 'acceptTerms', message: 'Debes aceptar los términos del servicio' }] : []),
            ]);
          }
          user = await createUser(trx, { email: invitation.email, fullName: body.fullName, passwordHash: newPasswordHash });
          await setTenant(trx, { companyId: found.companyId, userId: user.id });
        }

        const already = await trx
          .selectFrom('memberships')
          .select('id')
          .where('companyId', '=', invitation.companyId)
          .where('userId', '=', user.id)
          .executeTakeFirst();
        if (already) throw errors.conflict('Ya perteneces a esta empresa.');

        await trx.insertInto('memberships').values({ companyId: invitation.companyId, userId: user.id, role: invitation.role }).execute();
        await trx.updateTable('invitations').set({ acceptedAt: new Date() }).where('id', '=', invitation.id).execute();
        await logActivity(trx, { companyId: invitation.companyId, userId: user.id }, {
          action: 'member.joined',
          entityType: 'member',
          entityId: user.id,
          metadata: { role: invitation.role, via: 'invitation', invitationId: invitation.id },
        });

        let session: { token: string; expiresAt: Date } | null = null;
        if (auth) {
          await trx.updateTable('sessions').set({ companyId: invitation.companyId }).where('id', '=', auth.sessionId).execute();
        } else {
          session = await createSession(trx, {
            userId: user.id,
            companyId: invitation.companyId,
            userAgent: req.headers['user-agent'],
            ttlMs: app.config.session.ttlMs,
          });
        }
        const company = await trx
          .selectFrom('companies')
          .select(['id', 'name'])
          .where('id', '=', invitation.companyId)
          .executeTakeFirstOrThrow();
        return { user, company, role: invitation.role, session };
      });

      if (result.session) setSessionCookie(app, reply, result.session.token, result.session.expiresAt);
      return reply.status(200).send({ user: publicUser(result.user), company: result.company, role: result.role });
    },
  );
}
