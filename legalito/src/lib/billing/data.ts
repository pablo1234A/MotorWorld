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
  return computeEntitlements({
    subscriptions: (subs.data ?? []) as SubscriptionRow[],
    purchases: (purchases.data ?? []) as PurchaseRow[],
    products: (products.data ?? []) as ProductRow[],
  });
}

export async function listActiveProducts(db: SupabaseClient): Promise<ProductRow[]> {
  const { data, error } = await db.from("products").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}
