import "server-only";
import Stripe from "stripe";
import { env, stripeMode } from "@/lib/env";
import { ServiceNotConfiguredError } from "@/lib/supabase/server";

let stripe: Stripe | null = null;

/** Cliente de Stripe. Lanza si los pagos no están habilitados en este entorno. */
export function getStripe(): Stripe {
  if (stripeMode() === "disabled") throw new ServiceNotConfiguredError("Stripe");
  if (!stripe) {
    stripe = new Stripe(env().STRIPE_SECRET_KEY!, {
      appInfo: { name: "Legalito", url: env().NEXT_PUBLIC_SITE_URL },
      maxNetworkRetries: 2,
    });
  }
  return stripe;
}

export const toIso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/** ID de la suscripción asociada a una factura (API reciente: invoice.parent.subscription_details). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

export function customerId(c: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}

/** Periodo actual de una suscripción (en la API reciente vive en los items). */
export function subscriptionPeriod(sub: Stripe.Subscription): { start: string | null; end: string | null } {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number }) | undefined;
  return { start: toIso(item?.current_period_start), end: toIso(item?.current_period_end) };
}
