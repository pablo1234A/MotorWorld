import { prisma } from "../db";
import { decrypt } from "../crypto";
import { AppError } from "../http/errors";
import { logger } from "../logger";
import { verifyPassword } from "../auth/password";
import { getProvider } from "../email/providers";
import { env } from "../env";
import { stripe } from "./billing/stripe";
import { audit } from "./audit";

/** Portabilidad (art. 20 RGPD): exporta los datos de la cuenta en JSON. */
export async function exportAccountData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true, emailVerifiedAt: true, termsAcceptedAt: true, termsVersion: true, lastLoginAt: true },
  });
  const businesses = await prisma.business.findMany({
    where: { ownerId: userId },
    include: {
      subscription: { include: { plan: { select: { code: true, name: true } } } },
      customers: true,
      templates: true,
      automationRules: true,
      campaigns: true,
      invoices: true,
      usage: true,
      emailConnection: { select: { provider: true, emailAddress: true, status: true, connectedAt: true } },
      emailJobs: { select: { id: true, toEmail: true, toName: true, subject: true, status: true, statusReason: true, scheduledFor: true, sentAt: true, createdAt: true, clickCount: true } },
    },
  });
  return { exportedAt: new Date().toISOString(), user, businesses };
}

/**
 * Supresión (art. 17 RGPD). Cancela la suscripción, revoca OAuth y elimina
 * todos los datos operativos (clientes, envíos, plantillas…). Las facturas se
 * conservan desvinculadas por obligación legal (normativa mercantil y tributaria).
 */
export async function deleteAccount(userId: string, password: string, req?: Request) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, password))) throw new AppError("VALIDATION", "La contraseña no es correcta.");
  const businesses = await prisma.business.findMany({ where: { ownerId: userId }, include: { subscription: true, emailConnection: true } });

  for (const b of businesses) {
    if (b.subscription && !["CANCELED", "INCOMPLETE_EXPIRED"].includes(b.subscription.status)) {
      if (!env().STRIPE_SECRET_KEY) throw new AppError("NOT_CONFIGURED", "No se puede cancelar la suscripción: Stripe no está configurado.");
      await stripe().subscriptions.cancel(b.subscription.stripeSubscriptionId, { invoice_now: false, prorate: false });
    }
    if (b.emailConnection?.refreshTokenEnc) {
      try {
        await getProvider(b.emailConnection.provider).revoke(decrypt(b.emailConnection.refreshTokenEnc));
      } catch (err) {
        logger.warn({ err }, "revocación OAuth fallida al borrar cuenta");
      }
    }
    await audit({ action: "account.deleted", businessId: null, meta: { businessId: b.id }, req });
  }
  await prisma.$transaction(async (tx) => {
    // Desvincula facturas y eventos de facturación (se conservan), luego borra en cascada.
    for (const b of businesses) {
      await tx.invoice.updateMany({ where: { businessId: b.id }, data: { businessId: null } });
      await tx.billingEvent.updateMany({ where: { businessId: b.id }, data: { businessId: null } });
    }
    await tx.business.deleteMany({ where: { ownerId: userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
