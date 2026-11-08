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

// ------------------------------------------------------------------- PCI

export interface TrashedInstallation {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  customerDeleted: boolean;
  deletedAt: Date;
}

export interface TrashedEquipment {
  id: string;
  code: string;
  location: string | null;
  installationId: string;
  installationName: string;
  installationDeleted: boolean;
  deletedAt: Date;
}

/** Instalaciones y equipos borrados en los últimos 30 días. */
export async function listPciTrash(ctx: ServiceCtx): Promise<{ installations: TrashedInstallation[]; equipment: TrashedEquipment[] }> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const installations = await tx
      .selectFrom("installations as i")
      .innerJoin("customers as c", "c.id", "i.customer_id")
      .select([
        "i.id",
        "i.name",
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        sql<boolean>`c.deleted_at is not null`.as("customerDeleted"),
        "i.deleted_at as deletedAt",
      ])
      .where("i.organization_id", "=", orgId)
      .where("i.deleted_at", "is not", null)
      .where("i.deleted_at", ">", sql<Date>`now() - make_interval(days => ${RETENTION_DAYS})`)
      .orderBy("i.deleted_at", "desc")
      .limit(200)
      .execute();
    const equipment = await tx
      .selectFrom("equipment as e")
      .innerJoin("installations as i", "i.id", "e.installation_id")
      .select([
        "e.id",
        "e.code",
        "e.location",
        "i.id as installationId",
        "i.name as installationName",
        sql<boolean>`i.deleted_at is not null`.as("installationDeleted"),
        "e.deleted_at as deletedAt",
      ])
      .where("e.organization_id", "=", orgId)
      .where("e.deleted_at", "is not", null)
      .where("e.deleted_at", ">", sql<Date>`now() - make_interval(days => ${RETENTION_DAYS})`)
      .orderBy("e.deleted_at", "desc")
      .limit(500)
      .execute();
    return {
      installations: installations.map((i) => ({ ...i, deletedAt: i.deletedAt as Date })),
      equipment: equipment.map((e) => ({ ...e, deletedAt: e.deletedAt as Date })),
    };
  });
}

/** Restaura una instalación (su cliente tiene que estar activo). La BD comprueba el permiso. */
export async function restoreInstallation(ctx: ServiceCtx, id: string): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const i = await tx
      .selectFrom("installations as i")
      .innerJoin("customers as c", "c.id", "i.customer_id")
      .select(["c.deleted_at as customerDeletedAt"])
      .where("i.id", "=", id)
      .where("i.organization_id", "=", ctx.membership.organizationId)
      .where("i.deleted_at", "is not", null)
      .executeTakeFirst();
    if (!i) throw new DomainError("not_found");
    if (i.customerDeletedAt) throw new DomainError("integrity_violation", "customer_deleted");
    const r = await tx.updateTable("installations").set({ deleted_at: null }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

/** Restaura un equipo (su instalación tiene que estar activa; vuelve a contar en el límite del plan). */
export async function restoreEquipment(ctx: ServiceCtx, id: string): Promise<{ installationId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const e = await tx
      .selectFrom("equipment as e")
      .innerJoin("installations as i", "i.id", "e.installation_id")
      .select(["e.installation_id", "i.deleted_at as installationDeletedAt"])
      .where("e.id", "=", id)
      .where("e.organization_id", "=", ctx.membership.organizationId)
      .where("e.deleted_at", "is not", null)
      .executeTakeFirst();
    if (!e) throw new DomainError("not_found");
    if (e.installationDeletedAt) throw new DomainError("integrity_violation", "installation_deleted");
    const r = await tx.updateTable("equipment").set({ deleted_at: null }).where("id", "=", id).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    return { installationId: e.installation_id };
  });
}
