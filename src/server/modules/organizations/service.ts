import "server-only";

import { randomBytes } from "node:crypto";

import { sql } from "kysely";

import { slugify } from "@/lib/slug";
import type { AuthContext } from "@/server/db/client";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

export interface CreateOrganizationInput {
  tradeName: string;
  slug?: string;
  timezone: string;
}

/**
 * Alta de taller: organización + sucursal principal + propietario, en una sola
 * transacción (app.create_organization). Si no se indica dirección pública,
 * se deriva del nombre y, si está ocupada, se añade un sufijo aleatorio.
 */
export async function createOrganization(auth: AuthContext, input: CreateOrganizationInput): Promise<string> {
  const explicit = input.slug && input.slug.length > 0 ? input.slug : undefined;
  const candidates = explicit ? [explicit] : [slugify(input.tradeName)];
  if (!explicit) {
    for (let i = 0; i < 3; i++) {
      candidates.push(`${candidates[0].slice(0, 44)}-${randomBytes(3).toString("hex")}`);
    }
  }

  let lastError: unknown;
  for (const slug of candidates) {
    try {
      return await withRls(auth, async (tx) => {
        const { rows } = await sql<{ id: string }>`
          select app.create_organization(${input.tradeName}, ${slug}, ${input.timezone}) as id
        `.execute(tx);
        return rows[0].id;
      });
    } catch (err) {
      lastError = err;
      // Ocupada o reservada (p. ej. "admin"): si la dirección no la eligió el
      // usuario, se prueba la siguiente candidata con sufijo.
      const retry = err instanceof DomainError && (err.code === "conflict" || (!explicit && err.detail === "slug_reserved"));
      if (!retry) throw err;
    }
  }
  throw lastError;
}

/** El usuario es miembro activo de la organización (para cambiar de taller). */
export async function isActiveMember(auth: AuthContext, organizationId: string): Promise<boolean> {
  const row = await withRls(auth, (tx) =>
    tx
      .selectFrom("organization_members")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("user_id", "=", auth.userId)
      .where("status", "=", "active")
      .executeTakeFirst(),
  );
  return row !== undefined;
}
