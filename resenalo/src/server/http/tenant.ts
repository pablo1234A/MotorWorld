import { requireTenant, requireUser, type TenantContext } from "../auth/context";
import type { AuthContext } from "../auth/session";
import { route } from "./handler";

type RouteCtx = { params: Promise<Record<string, string>> };

/** Ruta autenticada con negocio (tenant) resuelto desde la sesión. */
export function tenantRoute(fn: (req: Request, t: TenantContext, params: Record<string, string>) => Promise<Response>) {
  return route(async (req, ctx: RouteCtx) => fn(req, await requireTenant(req), await ctx.params));
}

/** Ruta autenticada sin necesidad de negocio (perfil, onboarding). */
export function userRoute(fn: (req: Request, a: AuthContext, params: Record<string, string>) => Promise<Response>, opts: { verified?: boolean } = {}) {
  return route(async (req, ctx: RouteCtx) => fn(req, await requireUser(req, opts), await ctx.params));
}
