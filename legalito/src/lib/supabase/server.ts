import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente con la sesión del usuario (anon key + cookies): todas las consultas
 * quedan sujetas a las políticas RLS. Es el cliente por defecto.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ServiceNotConfiguredError("Supabase");
  }
  const cookieStore = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

let adminClient: SupabaseClient | null = null;

/**
 * Cliente con service_role: IGNORA RLS. Solo para operaciones de sistema
 * (webhooks, generación de documentos, registros) tras verificar permisos en
 * servidor. Nunca debe llegar al navegador.
 */
export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ServiceNotConfiguredError("Supabase (service role)");
  }
  adminClient = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export class ServiceNotConfiguredError extends Error {
  constructor(public readonly service: string) {
    super(`${service} no está configurado en este entorno.`);
    this.name = "ServiceNotConfiguredError";
  }
}
