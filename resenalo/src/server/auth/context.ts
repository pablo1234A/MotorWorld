import type { Business } from "@prisma/client";
import { prisma } from "../db";
import { AppError } from "../http/errors";
import { getAuthFromRequest, type AuthContext } from "./session";

export async function requireUser(req: Request, opts: { verified?: boolean } = {}): Promise<AuthContext> {
  const auth = await getAuthFromRequest(req);
  if (!auth) throw new AppError("UNAUTHENTICATED", "Debes iniciar sesión.");
  if (opts.verified !== false && !auth.user.emailVerifiedAt)
    throw new AppError("EMAIL_NOT_VERIFIED", "Confirma tu correo electrónico para continuar.");
  return auth;
}

export type TenantContext = AuthContext & { business: Business };

/**
 * Contexto multi-tenant. El negocio SIEMPRE se deriva de la sesión del
 * servidor; nunca de un identificador enviado por el cliente.
 */
export async function requireTenant(req: Request): Promise<TenantContext> {
  const auth = await requireUser(req);
  const business = await getBusinessForUser(auth.user.id);
  if (!business) throw new AppError("NOT_FOUND", "Completa primero la configuración de tu negocio.");
  return { ...auth, business };
}

export function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}
