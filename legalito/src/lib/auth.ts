import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
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

/** Cookie con la cuenta en la que trabaja una agencia. Solo es una preferencia: se valida siempre contra las membresías. */
export const ACTIVE_ORG_COOKIE = "lg_cuenta";

export interface Account {
  /** Cuenta principal: la que factura (cliente de Stripe, suscripción y cupo). */
  root: OrganizationRow;
  /** Cuenta en la que se trabaja ahora: la principal o uno de sus clientes. */
  active: OrganizationRow;
  isAgency: boolean;
  /** Clientes de la agencia (incluidos los archivados), por nombre. */
  clients: OrganizationRow[];
}

/**
 * Cuentas visibles para el usuario (resueltas por RLS a partir de sus
 * membresías). Nunca se confía en el identificador de la cookie: solo se usa
 * si corresponde a una cuenta del propio usuario que no esté archivada.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createSessionClient();
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const ids = (memberships ?? []).map((m) => m.organization_id as string);
  if (ids.length === 0) return null;
  const { data } = await supabase.from("organizations").select("*").in("id", ids);
  const orgs = (data ?? []) as OrganizationRow[];
  const root = ids.map((id) => orgs.find((o) => o.id === id)).find((o): o is OrganizationRow => Boolean(o && !o.parent_organization_id));
  if (!root) return null;
  const isAgency = root.account_type === "agency";
  const clients = orgs
    .filter((o) => o.parent_organization_id === root.id)
    .sort((a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? "", "es"));
  let active = root;
  if (isAgency) {
    const wanted = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
    const match = clients.find((c) => c.id === wanted && !c.archived_at);
    if (match) active = match;
  }
  return { root, active, isAgency, clients };
});

/** Cuenta activa del usuario actual. */
export const getOrganization = cache(async (): Promise<OrganizationRow | null> => {
  return (await getAccount())?.active ?? null;
});

export async function requireOrganization(): Promise<{ user: SessionUser; org: OrganizationRow; account: Account }> {
  const user = await requireUser();
  const account = await getAccount();
  if (!account) throw new Error("La cuenta no tiene una organización asociada.");
  return { user, org: account.active, account };
}
