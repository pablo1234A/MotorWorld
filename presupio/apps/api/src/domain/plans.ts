import type { SubscriptionPlan, SubscriptionStatus } from '../db/types.js';

/**
 * Catálogo de planes. Fuente de verdad en el servidor: el navegador solo elige un plan por su
 * identificador; nunca envía precios, límites ni identificadores de precio del proveedor.
 *
 * Límites (docs/limites-y-metricas.md):
 *  - monthlyAttemptLimit: INTENTOS de seguimiento por periodo de facturación. Un intento es un
 *    seguimiento automático que el proveedor de email ha aceptado; cuenta aunque el cliente
 *    no responda. No cuentan los programados que se cancelan, los envíos que fallan antes de
 *    realizarse ni los reintentos técnicos del mismo seguimiento. Al alcanzar el límite se
 *    detiene el envío automático hasta el periodo siguiente.
 *  - dailyAutomaticEmailLimit: límite técnico e independiente de emails automáticos por
 *    empresa y día (en su zona horaria), para proteger la reputación de envío.
 *  - Business no es «ilimitado»: tiene un límite amplio y publicado (uso razonable).
 *
 * Las recuperaciones (clientes que responden tras un seguimiento) son una métrica de
 * resultados: no consumen el plan.
 *
 * Precios: importe mensual que se cobra en el proveedor de pagos. Si ese importe incluye o no
 * IVA está pendiente de validación fiscal (docs/facturacion.md); la presentación se configura
 * aparte (PRICES_TAX_DISPLAY) y nunca se calcula aquí un desglose de impuestos.
 */
export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  priceCents: number;
  currency: 'EUR';
  interval: 'month';
  monthlyAttemptLimit: number;
  dailyAutomaticEmailLimit: number;
  fairUse: boolean;
}

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceCents: 2799,
    currency: 'EUR',
    interval: 'month',
    monthlyAttemptLimit: 25,
    // Límite técnico previo a la fase 5 (no forma parte de la oferta comercial publicada).
    dailyAutomaticEmailLimit: 60,
    fairUse: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 5799,
    currency: 'EUR',
    interval: 'month',
    monthlyAttemptLimit: 65,
    // Límite técnico previo a la fase 5 (no forma parte de la oferta comercial publicada).
    dailyAutomaticEmailLimit: 150,
    fairUse: false,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceCents: 12799,
    currency: 'EUR',
    interval: 'month',
    // Límite amplio y publicado de uso razonable (no «ilimitado»).
    monthlyAttemptLimit: 300,
    dailyAutomaticEmailLimit: 400,
    fairUse: true,
  },
};

export const PLAN_IDS = Object.keys(PLANS) as SubscriptionPlan[];

/** Se avisa al llegar a este porcentaje del límite de intentos. */
export const USAGE_WARNING_RATIO = 0.8;

/** Plan asignado durante el periodo de prueba (sin cobro). */
export const TRIAL_PLAN: SubscriptionPlan = 'starter';

/**
 * Días de acceso con un cobro pendiente (past_due) mientras el proveedor reintenta el pago.
 * Pendiente de confirmación comercial (docs/decisiones-comerciales.md).
 */
export const PAST_DUE_GRACE_DAYS = 7;

/** Días que se conservan los datos de una cuenta sin plan activo antes de poder borrarse. */
export const DATA_RETENTION_DAYS = 90;

const DAY_MS = 86_400_000;

export interface AccessFields {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  pastDueSince?: Date | null;
}

/**
 * Si la cuenta puede usar las funciones de su plan en este momento. Sin acceso, la cuenta
 * queda en solo lectura (plugins/auth.ts) y el motor no programa ni envía nada.
 */
export function hasActiveAccess(sub: AccessFields, now = new Date()): boolean {
  if (sub.status === 'active') return true;
  if (sub.status === 'trialing') return !!sub.trialEndsAt && sub.trialEndsAt > now;
  // Cobro pendiente: acceso solo durante los días de gracia desde el primer fallo.
  if (sub.status === 'past_due') return !!sub.pastDueSince && sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS > now.getTime();
  return false;
}

/**
 * Cuándo terminó el acceso (para el plazo de conservación de datos). Solo tiene sentido sin
 * acceso activo: fin de la suscripción de pago, fin del cobro en gracia o fin de la prueba.
 */
export function accessEndedAt(sub: AccessFields & { endedAt?: Date | null; createdAt?: Date | null }, now = new Date()): Date | null {
  if (hasActiveAccess(sub, now)) return null;
  if (sub.status === 'past_due' && sub.pastDueSince) return new Date(sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS);
  return sub.endedAt ?? sub.trialEndsAt ?? sub.createdAt ?? null;
}

/** Fecha a partir de la cual se podrían borrar los datos (borrado manual, nunca automático). */
export function dataRetentionUntil(endedAt: Date | null): Date | null {
  return endedAt ? new Date(endedAt.getTime() + DATA_RETENTION_DAYS * DAY_MS) : null;
}
