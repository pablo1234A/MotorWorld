import "server-only";

import { sql } from "kysely";

import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Papelera: clientes y vehículos borrados en los últimos 30 días (después los
 * elimina definitivamente `private.purge_expired_data`). Restaurar exige los
 * mismos permisos que borrar y vuelve a comprobar los límites del plan y la
 * matrícula única (triggers e índices de la BD).
 */

export const RETENTION_DAYS = 30;

export interface TrashedCustomer {
  id: string;
  name: string;
  email: string | null;
  branchName: string;
  deletedAt: Date;
  vehicles: number;
}

export interface TrashedVehicle {
  id: string;
  plate: string;
  description: string;
  customerId: string;
  customerName: string;
  deletedAt: Date;
}

export async function listTrash(ctx: ServiceCtx): Promise<{ customers: TrashedCustomer[]; vehicles: TrashedVehicle[] }> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const customers = await tx
      .selectFrom("customers as c")
      .innerJoin("branches as b", "b.id", "c.branch_id")
      .select([
        "c.id",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("name"),
        "c.email",
        "b.name as branchName",
        "c.deleted_at as deletedAt",
        sql<number>`(select count(*)::int from vehicles v where v.customer_id = c.id and v.deleted_at = c.deleted_at)`.as("vehicles"),
      ])
      .where("c.organization_id", "=", orgId)
      .where("c.deleted_at", "is not", null)
      .where("c.deleted_at", ">", sql<Date>`now() - make_interval(days => ${RETENTION_DAYS})`)
      .orderBy("c.deleted_at", "desc")
      .limit(200)
      .execute();

    // Vehículos borrados por separado (su propietario sigue activo).
    const vehicles = await tx
      .selectFrom("vehicles as v")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .select([
        "v.id",
        "v.plate",
        sql<string>`trim(coalesce(v.make, '') || ' ' || coalesce(v.model, ''))`.as("description"),
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "v.deleted_at as deletedAt",
      ])
      .where("v.organization_id", "=", orgId)
      .where("v.deleted_at", "is not", null)
      .where("c.deleted_at", "is", null)
      .where("v.deleted_at", ">", sql<Date>`now() - make_interval(days => ${RETENTION_DAYS})`)
      .orderBy("v.deleted_at", "desc")
      .limit(200)
      .execute();

    return {
      customers: customers.map((c) => ({ ...c, email: c.email ? String(c.email) : null, deletedAt: c.deletedAt as Date })),
      vehicles: vehicles.map((v) => ({ ...v, deletedAt: v.deletedAt as Date })),
    };
  });
}

/** Restaura el cliente y los vehículos que se borraron junto con él. */
export async function restoreCustomer(ctx: ServiceCtx, id: string): Promise<{ vehicles: number }> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const c = await tx
      .selectFrom("customers")
      .select("deleted_at")
      .where("id", "=", id)
      .where("organization_id", "=", orgId)
      .where("deleted_at", "is not", null)
      .executeTakeFirst();
    if (!c?.deleted_at) throw new DomainError("not_found");

    const r = await tx.updateTable("customers").set({ deleted_at: null }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");

    const { n } = await tx
      .selectFrom("vehicles")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("customer_id", "=", id)
      .where("deleted_at", "=", c.deleted_at)
      .executeTakeFirstOrThrow();
    const rv = await tx
      .updateTable("vehicles")
      .set({ deleted_at: null })
      .where("customer_id", "=", id)
      .where("deleted_at", "=", c.deleted_at)
      .executeTakeFirst();
    if (Number(rv.numUpdatedRows) < Number(n)) throw new DomainError("permission_denied", "vehicles.delete");
    return { vehicles: Number(rv.numUpdatedRows) };
  });
}

export async function restoreVehicle(ctx: ServiceCtx, id: string): Promise<{ customerId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const v = await tx
      .selectFrom("vehicles as v")
      .innerJoin("customers as c", "c.id", "v.customer_id")
      .select(["v.customer_id", "c.deleted_at as customerDeletedAt"])
      .where("v.id", "=", id)
      .where("v.organization_id", "=", ctx.membership.organizationId)
      .where("v.deleted_at", "is not", null)
      .executeTakeFirst();
    if (!v) throw new DomainError("not_found");
    if (v.customerDeletedAt) throw new DomainError("integrity_violation", "customer_deleted");
    const r = await tx.updateTable("vehicles").set({ deleted_at: null }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    return { customerId: v.customer_id };
  });
}
