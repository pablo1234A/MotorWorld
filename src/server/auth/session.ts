import "server-only";

import { sql } from "kysely";
import { connection } from "next/server";
import { cache } from "react";

import { withSystem } from "@/server/db/client";
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
const getVerifiedSession = cache(async (): Promise<(AuthUser & { aal: string }) | null> => {
  // La sesión es siempre dato de petición: la verificación compara la
  // caducidad del token con la hora actual y no puede prerenderizarse.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims;
  if (claims.role !== "authenticated") return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "", aal: typeof claims.aal === "string" ? claims.aal : "aal1" };
});

/** ¿Tiene el usuario la verificación en dos pasos activada (un factor TOTP verificado)? */
export const hasVerifiedFactor = cache(async (userId: string): Promise<boolean> => {
  const { rows } = await withSystem((tx) =>
    sql<{ ok: boolean }>`select exists (select 1 from auth.mfa_factors where user_id = ${userId}::uuid and status = 'verified') as ok`.execute(tx),
  );
  return rows[0]?.ok === true;
});

/**
 * Usuario con la sesión COMPLETA. Si tiene la verificación en dos pasos
 * activada y aún no ha introducido el código (sesión aal1), no cuenta como
 * sesión iniciada en ninguna parte: páginas, acciones y rutas lo tratan como
 * anónimo y el acceso le pide el código (ADR-075).
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const s = await getVerifiedSession();
  if (!s) return null;
  if (s.aal !== "aal2" && (await hasVerifiedFactor(s.id))) return null;
  return { id: s.id, email: s.email };
});

/** Sesión a la que solo le falta el segundo paso (para la pantalla del código). */
export async function getPendingMfaUser(): Promise<AuthUser | null> {
  const s = await getVerifiedSession();
  if (!s || s.aal === "aal2" || !(await hasVerifiedFactor(s.id))) return null;
  return { id: s.id, email: s.email };
}
