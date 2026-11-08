import "server-only";

import { sql } from "kysely";

import { escapeLike, type Page } from "@/lib/pagination";
import type { CreateInstallationInput, UpdateInstallationInput } from "@/lib/validation/pci";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Instalaciones (establecimientos del cliente). RLS: lectura en las sucursales
 * del usuario; escritura con «customers.write» y suscripción activa. La
 * instalación hereda la sucursal de su cliente (FK compuesta).
 */

export interface InstallationListRow {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string | null;
  establishmentType: string;
  status: string;
  equipment: number;
  overdue: number;
  nextActionOn: string | null;
}

export interface InstallationFilters {
  q?: string;
  customerId?: string;
  status?: "active" | "inactive";
  due?: "overdue" | "30";
  page: number;
  pageSize: number;
}

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export async function listInstallations(ctx: ServiceCtx, f: InstallationFilters): Promise<Page<InstallationListRow>> {
  const orgId = ctx.membership.organizationId;
  const like = f.q?.trim() ? `%${escapeLike(f.q.trim().toLowerCase())}%` : null;
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      with base as (
        select i.id, i.name, i.customer_id, trim(c.first_name || ' ' || c.last_name) as customer_name, i.address_line1, i.city,
               i.establishment_type, i.status, i.created_at,
               (select count(*) from equipment e where e.installation_id = i.id and e.deleted_at is null and e.status <> 'retired') as equipment,
               (select count(*) from equipment e where e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service'
                  and e.next_action_on < current_date) as overdue,
               (select min(e.next_action_on) from equipment e where e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service') as next_action_on
          from installations i join customers c on c.id = i.customer_id
         where i.organization_id = ${orgId} and i.deleted_at is null
           ${f.customerId ? sql`and i.customer_id = ${f.customerId}` : sql``}
           ${f.status ? sql`and i.status = ${f.status}` : sql``}
           ${like ? sql`and (lower(i.name || ' ' || i.address_line1 || ' ' || coalesce(i.city, '')) like ${like} or lower(c.first_name || ' ' || c.last_name || ' ' || coalesce(c.legal_name, '')) like ${like})` : sql``}
      )
      select *, count(*) over () as total from base
       where true ${f.due === "overdue" ? sql`and overdue > 0` : f.due === "30" ? sql`and next_action_on <= current_date + 30` : sql``}
       order by ${f.due ? sql`next_action_on nulls last,` : sql``} name
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}
    `.execute(tx);
    return {
      rows: rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        customerId: r.customer_id as string,
        customerName: r.customer_name as string,
        addressLine1: r.address_line1 as string,
        city: r.city as string | null,
        establishmentType: r.establishment_type as string,
        status: r.status as string,
        equipment: Number(r.equipment),
        overdue: Number(r.overdue),
        nextActionOn: day(r.next_action_on),
      })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export interface InstallationDetail {
  id: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  name: string;
  establishmentType: string;
  addressLine1: string;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}

export async function getInstallation(ctx: ServiceCtx, id: string): Promise<InstallationDetail | null> {
  return withRls(ctx.auth, async (tx) => {
    const r = await tx
      .selectFrom("installations as i")
      .innerJoin("customers as c", "c.id", "i.customer_id")
      .select([
        "i.id", "i.branch_id", "i.customer_id", "i.name", "i.establishment_type", "i.address_line1", "i.postal_code", "i.city",
        "i.province", "i.contact_name", "i.contact_phone", "i.notes", "i.status", "i.created_at",
        sql<string | null>`i.contact_email::text`.as("contact_email"),
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customer_name"),
        sql<string | null>`c.email::text`.as("customer_email"),
      ])
      .where("i.id", "=", id)
      .where("i.organization_id", "=", ctx.membership.organizationId)
      .where("i.deleted_at", "is", null)
      .executeTakeFirst();
    if (!r) return null;
    return {
      id: r.id, branchId: r.branch_id, customerId: r.customer_id, customerName: r.customer_name, customerEmail: r.customer_email,
      name: r.name, establishmentType: r.establishment_type, addressLine1: r.address_line1, postalCode: r.postal_code, city: r.city,
      province: r.province, contactName: r.contact_name, contactPhone: r.contact_phone, contactEmail: r.contact_email,
      notes: r.notes, status: r.status, createdAt: r.created_at,
    };
  });
}

/** Alta dentro de una transacción ya abierta (panel, API e importaciones). */
export async function insertInstallation(tx: Tx, ctx: ServiceCtx, input: CreateInstallationInput, extra: { importBatchId?: string } = {}): Promise<string> {
  const customer = await tx
    .selectFrom("customers")
    .select(["branch_id"])
    .where("id", "=", input.customerId)
    .where("organization_id", "=", ctx.membership.organizationId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!customer) throw new DomainError("not_found");
  const row = await tx
    .insertInto("installations")
    .values({
      organization_id: ctx.membership.organizationId,
      branch_id: customer.branch_id,
      customer_id: input.customerId,
      name: input.name,
      establishment_type: input.establishmentType,
      address_line1: input.addressLine1,
      postal_code: input.postalCode,
      city: input.city,
      province: input.province,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      contact_email: input.contactEmail,
      notes: input.notes,
      created_by: ctx.auth.userId,
      ...(extra.importBatchId ? { import_batch_id: extra.importBatchId } : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function createInstallation(ctx: ServiceCtx, input: CreateInstallationInput): Promise<string> {
  return withRls(ctx.auth, (tx) => insertInstallation(tx, ctx, input));
}

export async function updateInstallation(ctx: ServiceCtx, input: UpdateInstallationInput): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const exists = await tx.selectFrom("installations").select("id").where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst();
    if (!exists) throw new DomainError("not_found");
    const r = await tx
      .updateTable("installations")
      .set({
        name: input.name,
        establishment_type: input.establishmentType,
        address_line1: input.addressLine1,
        postal_code: input.postalCode,
        city: input.city,
        province: input.province,
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        contact_email: input.contactEmail,
        notes: input.notes,
        status: input.status,
      })
      .where("id", "=", input.id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

/** A la papelera (30 días). La BD lo impide si quedan equipos activos. */
export async function deleteInstallation(ctx: ServiceCtx, id: string): Promise<{ customerId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const visible = await tx.selectFrom("installations").select("id").where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst();
    if (!visible) throw new DomainError("not_found");
    const r = await tx
      .updateTable("installations")
      .set({ deleted_at: new Date() })
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .returning("customer_id")
      .executeTakeFirst();
    // Visible pero sin actualizar: sin permiso (RLS).
    if (!r) throw new DomainError("permission_denied");
    return { customerId: r.customer_id };
  });
}

/** Opciones para los selectores (instalaciones activas de un cliente o de todos). */
export async function installationOptions(ctx: ServiceCtx, customerId?: string): Promise<Array<{ id: string; label: string; customerId: string }>> {
  return withRls(ctx.auth, async (tx) => {
    const rows = await tx
      .selectFrom("installations as i")
      .innerJoin("customers as c", "c.id", "i.customer_id")
      .select(["i.id", "i.name", "i.customer_id", sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customer")])
      .where("i.organization_id", "=", ctx.membership.organizationId)
      .where("i.deleted_at", "is", null)
      .where("i.status", "=", "active")
      .$if(Boolean(customerId), (q) => q.where("i.customer_id", "=", customerId!))
      .orderBy("c.first_name")
      .orderBy("i.name")
      .limit(500)
      .execute();
    return rows.map((r) => ({ id: r.id, label: `${r.customer} · ${r.name}`, customerId: r.customer_id }));
  });
}
