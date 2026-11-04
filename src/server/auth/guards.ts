import "server-only";

import { redirect } from "next/navigation";

import type { OperatorPermission } from "@/lib/permissions";
import { DomainError } from "@/server/db/errors";

import { can, getOrgContext, isAdmin, type OrgContext } from "./context";
import { type AuthUser, getAuthUser } from "./session";

/**
 * Guards de autorización. Las páginas redirigen; las Server Actions y Route
 * Handlers lanzan DomainError (que `runAction` traduce). Ocultar un botón en
 * la UI nunca sustituye a estas comprobaciones.
 */

function loginUrl(next?: string): string {
  return next ? `/acceso?next=${encodeURIComponent(next)}` : "/acceso";
}

// ------------------------------------------------------------------ páginas
export async function requireUserPage(next?: string): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect(loginUrl(next));
  return user;
}

export async function requireOrgPage(next?: string): Promise<OrgContext> {
  const user = await getAuthUser();
  if (!user) redirect(loginUrl(next));
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

// ------------------------------------------------------------------ acciones
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new DomainError("unauthenticated");
  return user;
}

export async function requireOrg(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) {
    if (!(await getAuthUser())) throw new DomainError("unauthenticated");
    throw new DomainError("permission_denied", "no_organization");
  }
  return ctx;
}

export function assertAdmin(ctx: OrgContext): void {
  if (!isAdmin(ctx)) throw new DomainError("permission_denied");
}

export function assertPermission(ctx: OrgContext, permission: OperatorPermission): void {
  if (!can(ctx, permission)) throw new DomainError("permission_denied", permission);
}
