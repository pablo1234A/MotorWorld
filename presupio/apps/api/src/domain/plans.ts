import type { SubscriptionPlan, SubscriptionStatus } from '../db/types.js';

/**
 * Catálogo de planes. Fuente de verdad en el servidor: el cliente nunca envía precios ni
 * límites, y la API no tiene ningún endpoint para cambiar de plan.
 *
 * Límites (docs/limites-y-metricas.md):
 *  - monthlyRecoveryLimit: recuperaciones contabilizadas por periodo de facturación. Al
 *    alcanzarlo se pausa el envío automático hasta el periodo siguiente; registrar respuestas,
 *    consultar datos e historial y trabajar a mano siguen disponibles.
 *  - dailyAutomaticEmailLimit: límite técnico de emails automáticos por empresa y día (en su
 *    zona horaria), para proteger la reputación de envío.
 *  - Business no es «ilimitado»: tiene un límite amplio y publicado (uso razonable).
 *
 * Pendiente de decisión de negocio (fase 5): si los precios incluyen IVA (vatIncluded = null).
 */
export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceCents: number;
  currency: 'EUR';
  interval: 'month';
  monthlyRecoveryLimit: number;
  dailyAutomaticEmailLimit: number;
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
    dailyAutomaticEmailLimit: 60,
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
    dailyAutomaticEmailLimit: 150,
    fairUse: false,
    vatIncluded: null,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceCents: 12799,
    currency: 'EUR',
    interval: 'month',
    // Límite amplio y publicado de uso razonable (no «ilimitado»).
    monthlyRecoveryLimit: 300,
    dailyAutomaticEmailLimit: 400,
    fairUse: true,
    vatIncluded: null,
  },
};

/** Se avisa al llegar a este porcentaje del límite de recuperaciones. */
export const USAGE_WARNING_RATIO = 0.8;

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
