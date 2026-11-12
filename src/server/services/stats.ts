import "server-only";
import type { SessionContext } from "@/server/auth/session";
import { fromDbError } from "@/server/http/handler";

export type DashboardStats = {
  productsTotal: number;
  productsArchived: number;
  listingsTotal: number;
  listingsThisMonth: number;
  listingsByStatus: Record<string, number>;
  listingsByPlatform: { platform: string; total: number }[];
  listingsByCategory: { category: string; total: number }[];
  activityByDay: { day: string; listings: number; products: number }[];
  jobs: { completed: number; partially_completed: number; failed: number; active: number };
};

/** Estadísticas reales del workspace calculadas en una única llamada a PostgreSQL. */
export async function getDashboardStats(context: SessionContext): Promise<DashboardStats> {
  const { data, error } = await context.supabase.rpc("get_dashboard_stats", { p_workspace: context.workspace.id });
  if (error) throw fromDbError(error);
  const raw = (data ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
  const jobs = (raw.jobs ?? {}) as Record<string, unknown>;
  return {
    productsTotal: number(raw.products_total),
    productsArchived: number(raw.products_archived),
    listingsTotal: number(raw.listings_total),
    listingsThisMonth: number(raw.listings_this_month),
    listingsByStatus: Object.fromEntries(Object.entries((raw.listings_by_status ?? {}) as Record<string, unknown>).map(([key, value]) => [key, number(value)])),
    listingsByPlatform: ((raw.listings_by_platform ?? []) as { platform: string; total: number }[]).map((row) => ({ platform: row.platform, total: number(row.total) })),
    listingsByCategory: ((raw.listings_by_category ?? []) as { category: string; total: number }[]).map((row) => ({ category: row.category, total: number(row.total) })),
    activityByDay: ((raw.activity_by_day ?? []) as { day: string; listings: number; products: number }[]).map((row) => ({ day: row.day, listings: number(row.listings), products: number(row.products) })),
    jobs: { completed: number(jobs.completed), partially_completed: number(jobs.partially_completed), failed: number(jobs.failed), active: number(jobs.active) },
  };
}

export type ActivityEntry = { id: string; type: "listing" | "product" | "job"; title: string; detail: string; at: string; href: string };

/** Actividad reciente combinando los últimos anuncios, productos y trabajos (3 consultas en paralelo). */
export async function getRecentActivity(context: SessionContext, limit = 8): Promise<ActivityEntry[]> {
  const { supabase, workspace } = context;
  const [listings, products, jobs] = await Promise.all([
    supabase.from("listings").select("id, title, platform, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("products").select("id, name, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(limit),
    supabase.from("generation_jobs").select("id, source_filename, total_items, status, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(limit),
  ]);
  const entries: ActivityEntry[] = [
    ...(listings.data ?? []).map((row) => ({ id: row.id, type: "listing" as const, title: row.title, detail: "Anuncio creado", at: row.created_at, href: `/app/anuncios/${row.id}` })),
    ...(products.data ?? []).map((row) => ({ id: row.id, type: "product" as const, title: row.name, detail: "Producto añadido", at: row.created_at, href: `/app/productos/${row.id}` })),
    ...(jobs.data ?? []).map((row) => ({ id: row.id, type: "job" as const, title: row.source_filename ?? "Importación", detail: `Lote de ${row.total_items} productos`, at: row.created_at, href: `/app/masivo/${row.id}` })),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
