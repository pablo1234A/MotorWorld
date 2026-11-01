import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductRow, PurchaseRow, SubscriptionRow } from "@/lib/db/types";
import { computeEntitlements, type Entitlements } from "./entitlements";

/** Carga los datos económicos de una organización y calcula sus permisos. */
export async function loadEntitlements(db: SupabaseClient, organizationId: string): Promise<Entitlements> {
  const [subs, purchases, products] = await Promise.all([
    db.from("subscriptions").select("*").eq("organization_id", organizationId),
    db.from("purchases").select("*").eq("organization_id", organizationId),
    db.from("products").select("*"),
  ]);
  for (const r of [subs, purchases, products]) if (r.error) throw r.error;
  const subscriptions = (subs.data ?? []) as SubscriptionRow[];

  // Uso del cupo: documentos generados con cada suscripción viva desde el inicio de su periodo.
  const usage: Record<string, number> = {};
  for (const s of subscriptions.filter((x) => ["active", "trialing"].includes(x.status))) {
    usage[s.id] = await documentsUsedInPeriod(db, s);
  }
  return computeEntitlements({
    subscriptions,
    purchases: (purchases.data ?? []) as PurchaseRow[],
    products: (products.data ?? []) as ProductRow[],
    usage,
  });
}

/** Inicio del periodo de facturación actual (o los últimos 30 días si Stripe no lo informa). */
export function periodStart(sub: Pick<SubscriptionRow, "current_period_start">, now = new Date()): string {
  return sub.current_period_start ?? new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
}

async function documentsUsedInPeriod(db: SupabaseClient, sub: SubscriptionRow): Promise<number> {
  const { data, error } = await db.from("document_versions").select("id").eq("subscription_id", sub.id).gte("generated_at", periodStart(sub));
  if (error) throw error;
  return (data ?? []).length;
}

export async function listActiveProducts(db: SupabaseClient): Promise<ProductRow[]> {
  const { data, error } = await db.from("products").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}
