import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { createSupabaseServerClient } from "@/server/supabase/server";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Usuario de la sesión actual, VERIFICADO: `getClaims()` valida la firma del
 * JWT (claves asimétricas) o consulta a Supabase Auth; nunca se confía en
 * datos de la cookie sin verificar. Con la verificación de email obligatoria
 * (config de Auth), una sesión solo existe tras confirmar el correo.
 * Memorizado por petición.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  // La sesión es siempre dato de petición: la verificación compara la
  // caducidad del token con la hora actual y no puede prerenderizarse.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  if (claims.role !== "authenticated") return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});
