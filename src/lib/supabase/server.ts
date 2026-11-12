import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/config/env";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase ligado a la sesión del usuario (cookies httpOnly).
 * Todas las consultas pasan por RLS con la identidad del usuario autenticado.
 */
export async function createClient() {
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
          }
        } catch {
          // En Server Components no se pueden escribir cookies: el proxy refresca la sesión.
        }
      },
    },
  });
}
