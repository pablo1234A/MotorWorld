import { SubscriptionStatus, type Plan, type Subscription } from "@prisma/client";
import { prisma, type Tx } from "../../db";
import { AppError } from "../../http/errors";
import type { PlanFeatures } from "@/config/plans";

/** Margen tras el fin de periodo mientras llega el webhook de renovación. */
export const RENEWAL_GRACE_MS = 2 * 86400_000;

const SENDING_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING];

export function subscriptionAllowsSending(sub: Pick<Subscription, "status" | "currentPeriodEnd"> | null | undefined, now = new Date()) {
  if (!sub) return false;
  if (!SENDING_STATUSES.includes(sub.status)) return false;
  return sub.currentPeriodEnd.getTime() + RENEWAL_GRACE_MS > now.getTime();
}

export type Entitlements = {
  subscription: (Subscription & { plan: Plan }) | null;
  plan: Plan | null;
  features: PlanFeatures | null;
  canSend: boolean;
};

export async function getEntitlements(businessId: string, db: Tx | typeof prisma = prisma): Promise<Entitlements> {
  const subscription = await db.subscription.findUnique({ where: { businessId }, include: { plan: true } });
  const plan = subscription?.plan ?? null;
  return {
    subscription,
    plan,
    features: (plan?.features as PlanFeatures | undefined) ?? null,
    canSend: subscriptionAllowsSending(subscription),
  };
}

export async function requireFeature(businessId: string, feature: keyof PlanFeatures, label: string) {
  const ent = await getEntitlements(businessId);
  if (!ent.subscription || !subscriptionAllowsSending(ent.subscription))
    throw new AppError("PAYMENT_REQUIRED", "Necesitas una suscripción activa para usar esta función.");
  if (!ent.features?.[feature]) throw new AppError("PLAN_FEATURE", `${label} no está incluido en tu plan actual. Mejora tu plan para usarlo.`);
  return ent;
}

/**
 * Obtiene (o crea) la fila de consumo del periodo de facturación vigente.
 * El periodo lo marca Stripe (currentPeriodStart/End); cada renovación crea una
 * fila nueva, lo que reinicia el contador.
 */
export async function getCurrentUsage(businessId: string, db: Tx | typeof prisma = prisma) {
  const sub = await db.subscription.findUnique({ where: { businessId }, include: { plan: true } });
  if (!sub) return null;
  return db.monthlyUsage.upsert({
    where: { businessId_periodStart: { businessId, periodStart: sub.currentPeriodStart } },
    create: { businessId, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd, emailLimit: sub.plan.monthlyEmailLimit },
    update: {},
  });
}
