import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/** Registra un evento de producto desde el servidor (embudo de conversión). */
export async function trackServer(name: string, opts: { userId?: string | null; path?: string; props?: Record<string, unknown> } = {}) {
  if (!isSupabaseConfigured()) return;
  try {
    await createAdminClient()
      .from("analytics_events")
      .insert({ name, user_id: opts.userId ?? null, path: opts.path ?? null, props: opts.props ?? {} });
  } catch {
    // La analítica nunca interrumpe el flujo principal.
  }
}
