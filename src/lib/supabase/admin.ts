import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/config/env";
import type { Database } from "./database.types";
import type { Db } from "./types";

let client: Db | null = null;

export function hasAdminClient(): boolean {
  return Boolean(getEnv().SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Cliente con service_role: OMITE RLS. Solo para operaciones de sistema
 * (administración, webhooks, cron, eliminación de cuentas, rate limiting).
 * Nunca debe importarse desde código de cliente ("server-only" lo impide).
 */
export function getAdminClient(): Db {
  const env = getEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada: esta operación no está disponible.");
  }
  client ??= createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
