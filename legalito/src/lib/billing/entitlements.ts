import type { ProductRow, PurchaseRow, SubscriptionRow, SubscriptionStatus } from "@/lib/db/types";

/**
 * Permisos derivados del estado de pago. Función pura: la base de datos
 * (alimentada solo por webhooks verificados de Stripe) es la fuente de verdad;
 * el navegador nunca decide qué puede hacer un cliente.
 */
export type EntitlementSource =
  | { type: "subscription"; subscriptionId: string; documentTypes: string[]; includesUpdates: boolean }
  | { type: "purchase"; purchaseId: string; documentTypes: string[]; remaining: number | null; lockedVersions: Record<string, string> };

export interface Entitlements {
  plan: "none" | "one_time" | "subscription";
  /** Puede generar o regenerar documentos ahora mismo. */
  canGenerate: boolean;
  /** Fuente que se usará para la próxima generación. */
  source: EntitlementSource | null;
  subscription: SubscriptionRow | null;
  activePurchases: PurchaseRow[];
  /** Motivo legible cuando no puede generar. */
  blockedReason: string | null;
  /** Hay una incidencia de pago que requiere acción. */
  paymentIssue: boolean;
}

const ACTIVE: SubscriptionStatus[] = ["active", "trialing"];
const LIVE: SubscriptionStatus[] = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"];

export function computeEntitlements(input: {
  subscriptions: SubscriptionRow[];
  purchases: PurchaseRow[];
  products: ProductRow[];
}): Entitlements {
  const productById = new Map(input.products.map((p) => [p.id, p]));

  // Suscripción más relevante: activa primero, después la más reciente que siga viva.
  const subs = [...input.subscriptions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const subscription = subs.find((s) => ACTIVE.includes(s.status)) ?? subs.find((s) => LIVE.includes(s.status)) ?? null;

  const activePurchases = input.purchases.filter((p) => p.status === "active");
  const remaining = (p: PurchaseRow) => (p.generations_limit === null ? Infinity : p.generations_limit - p.generations_used);
  const usablePurchase = [...activePurchases].filter((p) => remaining(p) > 0).sort((a, b) => remaining(b) - remaining(a))[0];

  if (subscription && ACTIVE.includes(subscription.status)) {
    const product = subscription.product_id ? productById.get(subscription.product_id) : undefined;
    return {
      plan: "subscription",
      canGenerate: true,
      source: {
        type: "subscription",
        subscriptionId: subscription.id,
        documentTypes: product?.included_document_types ?? ["aviso_legal", "privacidad", "cookies"],
        includesUpdates: product?.includes_updates ?? true,
      },
      subscription,
      activePurchases,
      blockedReason: null,
      paymentIssue: false,
    };
  }

  const paymentIssue = Boolean(subscription && ["past_due", "unpaid", "incomplete"].includes(subscription.status));

  if (usablePurchase) {
    const r = remaining(usablePurchase);
    return {
      plan: "one_time",
      canGenerate: true,
      source: {
        type: "purchase",
        purchaseId: usablePurchase.id,
        documentTypes: usablePurchase.document_types,
        remaining: Number.isFinite(r) ? r : null,
        lockedVersions: usablePurchase.template_version_ids ?? {},
      },
      subscription,
      activePurchases,
      blockedReason: null,
      paymentIssue,
    };
  }

  let blockedReason = "Necesitas una compra o una suscripción activa para generar documentos.";
  if (paymentIssue) blockedReason = "Hay un pago pendiente en tu suscripción. Actualiza tu método de pago para seguir generando documentos.";
  else if (activePurchases.length > 0) blockedReason = "Has agotado las generaciones incluidas en tu compra.";

  return {
    plan: activePurchases.length > 0 ? "one_time" : subscription ? "subscription" : "none",
    canGenerate: false,
    source: null,
    subscription,
    activePurchases,
    blockedReason,
    paymentIssue,
  };
}

/** Una versión de documento es descargable si pertenece al cliente y no ha sido revocada (p. ej. por reembolso). */
export function canDownloadVersion(version: { revoked_at: string | null }): boolean {
  return version.revoked_at === null;
}

export function formatPrice(cents: number, currency = "eur"): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
