import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { parsePlanFeatures, type PlanFeatures } from "@/domain/plans";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  monthlyListingLimit: number;
  monthlyBulkLimit: number;
  features: PlanFeatures;
};

/**
 * Planes activos leídos de la base de datos (fuente de verdad de precios y límites).
 * Se cachean 5 minutos; si la base de datos no responde se devuelve una lista vacía
 * y la interfaz muestra un estado de "no disponible" en lugar de datos inventados.
 */
export const getPublicPlans = unstable_cache(
  async (): Promise<PublicPlan[]> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return [];
    try {
      const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.from("plans").select("*").eq("is_active", true).order("display_order");
      if (error) throw new Error(error.message);
      return data.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        price: Number(plan.price),
        currency: plan.currency,
        monthlyListingLimit: plan.monthly_listing_limit,
        monthlyBulkLimit: plan.monthly_bulk_limit,
        features: parsePlanFeatures(plan.features),
      }));
    } catch (error) {
      logger.error("plans.public_load_failed", { error });
      return [];
    }
  },
  ["public-plans"],
  { revalidate: 300, tags: ["plans"] },
);
