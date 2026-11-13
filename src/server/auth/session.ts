import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound as notFoundPage, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { Db, Row } from "@/lib/supabase/types";
import { ApiError } from "@/server/http/errors";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRole };

export type SessionContext = {
  supabase: Db;
  user: User;
  profile: Row<"profiles">;
  /** Espacio de trabajo activo. */
  workspace: Row<"workspaces">;
  role: WorkspaceRole;
  /** Todos los espacios a los que pertenece el usuario. */
  workspaces: WorkspaceSummary[];
};

export const WORKSPACE_COOKIE = "ap_workspace";

/**
 * Resuelve la identidad SIEMPRE a partir de la sesión verificada por Supabase Auth
 * (getUser valida el JWT contra el servidor de autenticación). Nunca se acepta un
 * identificador de usuario o de workspace enviado por el cliente.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role, workspaces(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const valid = (memberships ?? []).filter((item) => item.workspaces);
  if (!profile || valid.length === 0) return null;
  if (profile.disabled_at) return null;

  // El espacio activo sale de una cookie, pero SOLO se acepta si el usuario es miembro
  // (la lista de membresías viene de la base de datos con RLS). Por defecto, el propio.
  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const membership = valid.find((item) => item.workspaces!.id === preferred) ?? valid.find((item) => item.role === "owner") ?? valid[0]!;

  return {
    supabase,
    user,
    profile,
    workspace: membership.workspaces!,
    role: membership.role as WorkspaceRole,
    workspaces: valid.map((item) => ({ id: item.workspaces!.id, name: item.workspaces!.name, role: item.role as WorkspaceRole })),
  };
});

/** Para páginas: redirige al login si no hay sesión válida. */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

/** Para Route Handlers: lanza 401 si no hay sesión válida. */
export async function requireApiSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) throw new ApiError("unauthorized", "Inicia sesión para continuar.");
  return context;
}

export function assertCanEdit(context: SessionContext) {
  if (context.role === "viewer") {
    throw new ApiError("forbidden", "Tu rol en este espacio de trabajo es de solo lectura.");
  }
}

/**
 * Rol de administrador de plataforma. Se comprueba exclusivamente en servidor
 * contra la tabla platform_admins (inaccesible para los usuarios por RLS).
 */
export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  if (!hasAdminClient()) return false;
  const { data } = await getAdminClient().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
});

export async function requireApiAdmin(): Promise<SessionContext> {
  const context = await requireApiSession();
  if (!(await isPlatformAdmin(context.user.id))) {
    throw new ApiError("not_found", "El recurso no existe.");
  }
  return context;
}

/** Para páginas de /admin: quien no es administrador recibe un 404 (no se revela que el panel existe). */
export async function requireAdminPage(): Promise<SessionContext> {
  const context = await requireSession();
  if (!(await isPlatformAdmin(context.user.id))) notFoundPage();
  return context;
}
