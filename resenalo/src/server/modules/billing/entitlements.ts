import { BillingInterval, SubscriptionStatus, type Plan, type Subscription } from "@prisma/client";
import { prisma, type Tx } from "../../db";
import { AppError } from "../../http/errors";
import { TRIAL_EMAIL_CAP, TRIAL_SMS_CAP, type PlanFeatures } from "@/config/plans";

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

/** Suma meses en UTC ajustando el día al último del mes (31 ene + 1 mes = 28/29 feb). */
export function addMonthsUtc(d: Date, months: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

/**
 * Ventana de consumo vigente. En planes mensuales coincide con el periodo de
 * Stripe. En planes ANUALES el cupo sigue siendo mensual: el año se divide en
 * 12 ventanas consecutivas desde el inicio del periodo.
 */
export function usageWindow(sub: Pick<Subscription, "currentPeriodStart" | "currentPeriodEnd" | "billingInterval">, now = new Date()) {
  if (sub.billingInterval !== BillingInterval.YEAR) return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
  for (let i = 0; i < 12; i++) {
    const start = addMonthsUtc(sub.currentPeriodStart, i);
    const nextRaw = addMonthsUtc(sub.currentPeriodStart, i + 1);
    const end = nextRaw > sub.currentPeriodEnd || i === 11 ? sub.currentPeriodEnd : nextRaw;
    if (now < end || i === 11) return { start, end };
  }
  return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
}

/** Cupos del periodo: durante la prueba gratuita se limitan para evitar abusos. */
export function limitsFor(sub: Pick<Subscription, "status">, plan: Pick<Plan, "monthlyEmailLimit" | "monthlySmsLimit">) {
  const trial = sub.status === SubscriptionStatus.TRIALING;
  return {
    emailLimit: trial ? Math.min(plan.monthlyEmailLimit, TRIAL_EMAIL_CAP) : plan.monthlyEmailLimit,
    smsLimit: trial ? Math.min(plan.monthlySmsLimit, TRIAL_SMS_CAP) : plan.monthlySmsLimit,
  };
}

/** Crea/actualiza la fila de consumo de la ventana vigente. `refresh` reaplica los límites (cambio de plan, fin de prueba). */
export async function ensureUsageRow(db: Tx | typeof prisma, sub: Subscription, plan: Plan, refresh: boolean, now = new Date()) {
  const w = usageWindow(sub, now);
  const limits = limitsFor(sub, plan);
  return db.monthlyUsage.upsert({
    where: { businessId_periodStart: { businessId: sub.businessId, periodStart: w.start } },
    create: { businessId: sub.businessId, periodStart: w.start, periodEnd: w.end, ...limits },
    update: refresh ? { periodEnd: w.end, ...limits } : {},
  });
}

/**
 * Obtiene (o crea) la fila de consumo de la ventana vigente. Cada nueva
 * ventana (renovación mensual o nuevo mes de un plan anual) crea una fila
 * nueva, lo que reinicia el contador.
 */
export async function getCurrentUsage(businessId: string, db: Tx | typeof prisma = prisma) {
  const sub = await db.subscription.findUnique({ where: { businessId }, include: { plan: true } });
  if (!sub) return null;
  return ensureUsageRow(db, sub, sub.plan, false);
}
