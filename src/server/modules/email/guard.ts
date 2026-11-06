import "server-only";

import { sql } from "kysely";

import { type AuthContext, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

/**
 * Para operaciones que escriben con la conexión del sistema (sin RLS): se
 * comprueba EN LA BASE DE DATOS que el usuario es administrador activo de ESE
 * taller, sin fiarse del contexto recibido.
 */
export async function assertOrgAdmin(ctx: { auth: AuthContext; membership: { organizationId: string } }): Promise<void> {
  const ok = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ ok: boolean }>`select ${ctx.membership.organizationId}::uuid in (select app.admin_orgs()) as ok`.execute(tx);
    return rows[0]?.ok === true;
  });
  if (!ok) throw new DomainError("permission_denied");
}
