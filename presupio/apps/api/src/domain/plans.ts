import type { SubscriptionPlan, SubscriptionStatus } from '../db/types.js';

/**
 * Catálogo de planes según el plan maestro. Fuente de verdad en el servidor:
 * el cliente nunca envía precios ni límites.
 *
 * Pendiente de decisión de negocio (fase 4/5):
 *  - Si los precios incluyen IVA (vatIncluded = null hasta confirmarlo).
 *  - Definición exacta de "recuperación", reinicio del cupo y qué ocurre al superarlo.
 *  - Límite técnico publicado del plan Business (uso razonable).
 */
export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceCents: number;
  currency: 'EUR';
  interval: 'month';
  monthlyRecoveryLimit: number | null;
  fairUse: boolean;
  vatIncluded: boolean | null;
}

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceCents: 2799,
    currency: 'EUR',
    interval: 'month',
    monthlyRecoveryLimit: 25,
    fairUse: false,
    vatIncluded: null,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 5799,
    currency: 'EUR',
    interval: 'month',
    monthlyRecoveryLimit: 65,
    fairUse: false,
    vatIncluded: null,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceCents: 12799,
    currency: 'EUR',
    interval: 'month',
    monthlyRecoveryLimit: null,
    fairUse: true,
    vatIncluded: null,
  },
};

/** Plan asignado durante el periodo de prueba (sin cobro). */
export const TRIAL_PLAN: SubscriptionPlan = 'starter';

/** Si la cuenta puede usar las funciones de su plan en este momento. */
export function hasActiveAccess(
  sub: { status: SubscriptionStatus; trialEndsAt: Date | null },
  now = new Date(),
): boolean {
  if (sub.status === 'active') return true;
  if (sub.status === 'trialing') return !!sub.trialEndsAt && sub.trialEndsAt > now;
  // past_due: periodo de gracia mientras el proveedor reintenta el cobro (se concretará en la fase 5).
  if (sub.status === 'past_due') return true;
  return false;
}
