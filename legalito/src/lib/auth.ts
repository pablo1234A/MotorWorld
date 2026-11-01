import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { OrganizationRow, ProfileRow } from "@/lib/db/types";

/**
 * Capa de acceso a datos para la sesión. La identidad se obtiene SIEMPRE del
 * token verificado por Supabase Auth (getUser), nunca de datos enviados por
 * el navegador. Las funciones están memorizadas por petición con `cache`.
 */
export interface SessionUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Siempre en tiempo de petición: la sesión y la configuración nunca se congelan en el build.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
});

export async function requireUser(nextPath = "/panel"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/acceder?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export const getRoles = cache(async (): Promise<string[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createSessionClient();
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).map((r) => r.role as string);
});

/** Acceso de administración. Responde 404 para no revelar la existencia del panel. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) notFound();
  const roles = await getRoles();
  if (!roles.includes("admin")) notFound();
  return user;
}

export const getProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSessionClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as ProfileRow) ?? null;
});

/** Organización del usuario actual (resuelta por RLS a partir de su membresía). */
export const getOrganization = cache(async (): Promise<OrganizationRow | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSessionClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  const { data } = await supabase.from("organizations").select("*").eq("id", membership.organization_id).maybeSingle();
  return (data as OrganizationRow) ?? null;
});

export async function requireOrganization(): Promise<{ user: SessionUser; org: OrganizationRow }> {
  const user = await requireUser();
  const org = await getOrganization();
  if (!org) throw new Error("La cuenta no tiene una organización asociada.");
  return { user, org };
}
