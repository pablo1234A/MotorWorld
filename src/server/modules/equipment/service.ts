import "server-only";

import { sql } from "kysely";

import { escapeLike, type Page } from "@/lib/pagination";
import { AGENT_BY_TYPE_CODE, type CategoryCode } from "@/lib/pci/labels";
import type { CreateEquipmentInput, UpdateEquipmentInput } from "@/lib/validation/pci";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

import type { ServiceCtx } from "../branches/service";

/**
 * Equipos PCI. RLS: lectura en las sucursales del usuario; escritura con el
 * permiso de equipos («vehicles.write», código heredado: ADR-079) y la
 * suscripción activa. El equipo hereda la sucursal de su instalación; el
 * límite del plan (max_equipment) lo impone la BD con bloqueo.
 */

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export interface EquipmentListRow {
  id: string;
  code: string;
  categoryCode: CategoryCode;
  typeName: string | null;
  location: string | null;
  status: string;
  installationId: string;
  installationName: string;
  customerName: string;
  lastActionOn: string | null;
  nextActionOn: string | null;
}

export interface EquipmentFilters {
  q?: string;
  installationId?: string;
  categoryCode?: CategoryCode;
  status?: string;
  due?: "overdue" | "30" | "none";
  page: number;
  pageSize: number;
}

export async function listEquipment(ctx: ServiceCtx, f: EquipmentFilters): Promise<Page<EquipmentListRow>> {
  const orgId = ctx.membership.organizationId;
  const like = f.q?.trim() ? `%${escapeLike(f.q.trim().toLowerCase())}%` : null;
  return withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<Record<string, unknown>>`
      select e.id, e.code, e.category_code, t.name as type_name, e.location, e.status, e.installation_id, i.name as installation_name,
             trim(c.first_name || ' ' || c.last_name) as customer_name, e.last_action_on, e.next_action_on, count(*) over () as total
        from equipment e
        join installations i on i.id = e.installation_id
        join customers c on c.id = i.customer_id
        left join equipment_types t on t.id = e.type_id
       where e.organization_id = ${orgId} and e.deleted_at is null
         ${f.installationId ? sql`and e.installation_id = ${f.installationId}` : sql``}
         ${f.categoryCode ? sql`and e.category_code = ${f.categoryCode}` : sql``}
         ${f.status ? sql`and e.status = ${f.status}` : sql`and e.status <> 'retired'`}
         ${f.due === "overdue" ? sql`and e.status = 'in_service' and e.next_action_on < current_date` : sql``}
         ${f.due === "30" ? sql`and e.status = 'in_service' and e.next_action_on between current_date and current_date + 30` : sql``}
         ${f.due === "none" ? sql`and e.next_action_on is null` : sql``}
         ${like ? sql`and (lower(e.code || ' ' || coalesce(e.serial_number, '') || ' ' || coalesce(e.location, '') || ' ' || coalesce(e.manufacturer, '') || ' ' || i.name) like ${like})` : sql``}
       order by ${f.due ? sql`e.next_action_on nulls last,` : sql``} i.name, e.code
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}
    `.execute(tx);
    return {
      rows: rows.map((r) => ({
        id: r.id as string,
        code: r.code as string,
        categoryCode: r.category_code as CategoryCode,
        typeName: r.type_name as string | null,
        location: r.location as string | null,
        status: r.status as string,
        installationId: r.installation_id as string,
        installationName: r.installation_name as string,
        customerName: r.customer_name as string,
        lastActionOn: day(r.last_action_on),
        nextActionOn: day(r.next_action_on),
      })),
      total: rows.length ? Number(rows[0].total) : 0,
      page: f.page,
      pageSize: f.pageSize,
    };
  });
}

export interface ScheduleRow {
  actionTypeId: string;
  actionName: string;
  kind: string;
  intervalMonths: number | null;
  legalReference: string | null;
  lastDoneOn: string | null;
  nextDueOn: string | null;
  retimbradosDone: number | null;
}

export interface EquipmentDetail {
  id: string;
  branchId: string;
  code: string;
  qrToken: string;
  categoryCode: CategoryCode;
  typeId: string | null;
  typeName: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  installedOn: string | null;
  manufacturedOn: string | null;
  status: string;
  notes: string | null;
  lastActionOn: string | null;
  nextActionOn: string | null;
  installationId: string;
  installationName: string;
  installationAddress: string;
  customerId: string;
  customerName: string;
  extinguisher: {
    agent: string;
    chargeValue: number | null;
    chargeUnit: string | null;
    efficacy: string | null;
    mobility: string;
    stampedOn: string | null;
    putInServiceOn: string | null;
    retimbradosBefore: number;
    /** Fecha de timbrado + 3 retimbrados de 5 años (RIPCI, anexo II, tabla II). */
    retimbradoLimitOn: string | null;
  } | null;
  schedules: ScheduleRow[];
}

async function loadDetail(tx: Tx, orgId: string, where: { id?: string; qrToken?: string; code?: string }): Promise<EquipmentDetail | null> {
  let q = tx
    .selectFrom("equipment as e")
    .innerJoin("installations as i", "i.id", "e.installation_id")
    .innerJoin("customers as c", "c.id", "i.customer_id")
    .leftJoin("equipment_types as t", "t.id", "e.type_id")
    .leftJoin("equipment_extinguishers as x", "x.equipment_id", "e.id")
    .select([
      "e.id", "e.branch_id", "e.code", "e.qr_token", "e.category_code", "e.type_id", "t.name as type_name", "e.manufacturer", "e.model",
      "e.serial_number", "e.location", "e.installed_on", "e.manufactured_on", "e.status", "e.notes", "e.last_action_on", "e.next_action_on",
      "e.installation_id", "i.name as installation_name", sql<string>`concat_ws(', ', i.address_line1, i.city)`.as("installation_address"),
      "i.customer_id", sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customer_name"),
      "x.agent", "x.charge_value", "x.charge_unit", "x.efficacy", "x.mobility", "x.stamped_on", "x.put_in_service_on", "x.retimbrados_before",
    ])
    .where("e.organization_id", "=", orgId)
    .where("e.deleted_at", "is", null);
  if (where.id) q = q.where("e.id", "=", where.id);
  if (where.qrToken) q = q.where("e.qr_token", "=", where.qrToken);
  if (where.code) q = q.where(sql<boolean>`upper(e.code) = upper(${where.code})`);
  const r = await q.executeTakeFirst();
  if (!r) return null;
  const schedules = await tx
    .selectFrom("equipment_action_schedules as s")
    .innerJoin("maintenance_action_types as a", "a.id", "s.action_type_id")
    .leftJoin("org_action_type_settings as o", (j) => j.onRef("o.action_type_id", "=", "a.id").on("o.organization_id", "=", orgId))
    .select([
      "a.id", "a.name", "a.kind", "a.legal_reference", "s.last_done_on", "s.next_due_on", "s.retimbrados_done",
      sql<number | null>`coalesce(o.interval_months, a.interval_months)`.as("interval_months"),
    ])
    .where("s.equipment_id", "=", r.id)
    .orderBy("a.position")
    .execute();
  const stamped = day(r.stamped_on);
  return {
    id: r.id, branchId: r.branch_id, code: r.code, qrToken: r.qr_token, categoryCode: r.category_code as CategoryCode,
    typeId: r.type_id, typeName: r.type_name, manufacturer: r.manufacturer, model: r.model, serialNumber: r.serial_number,
    location: r.location, installedOn: day(r.installed_on), manufacturedOn: day(r.manufactured_on), status: r.status, notes: r.notes,
    lastActionOn: day(r.last_action_on), nextActionOn: day(r.next_action_on), installationId: r.installation_id,
    installationName: r.installation_name, installationAddress: r.installation_address, customerId: r.customer_id, customerName: r.customer_name,
    extinguisher: r.agent
      ? {
          agent: r.agent,
          chargeValue: r.charge_value === null ? null : Number(r.charge_value),
          chargeUnit: r.charge_unit,
          efficacy: r.efficacy,
          mobility: r.mobility ?? "portable",
          stampedOn: stamped,
          putInServiceOn: day(r.put_in_service_on),
          retimbradosBefore: r.retimbrados_before ?? 0,
          retimbradoLimitOn: stamped ? `${Number(stamped.slice(0, 4)) + 20}${stamped.slice(4)}` : null,
        }
      : null,
    schedules: schedules.map((s) => ({
      actionTypeId: s.id, actionName: s.name, kind: s.kind, intervalMonths: s.interval_months, legalReference: s.legal_reference,
      lastDoneOn: day(s.last_done_on), nextDueOn: day(s.next_due_on), retimbradosDone: s.retimbrados_done,
    })),
  };
}

export async function getEquipment(ctx: ServiceCtx, id: string): Promise<EquipmentDetail | null> {
  return withRls(ctx.auth, (tx) => loadDetail(tx, ctx.membership.organizationId, { id }));
}

/**
 * Resuelve el QR o el código escrito a mano. Solo dentro del taller activo y
 * con la RLS del usuario: un QR de otra empresa (o de una sucursal sin acceso)
 * no devuelve nada.
 */
export async function findEquipment(ctx: ServiceCtx, term: string): Promise<EquipmentDetail | null> {
  const t = term.trim();
  if (/^[a-f0-9]{64}$/.test(t)) return withRls(ctx.auth, (tx) => loadDetail(tx, ctx.membership.organizationId, { qrToken: t }));
  if (/^[A-Za-z0-9._/-]{1,40}$/.test(t)) return withRls(ctx.auth, (tx) => loadDetail(tx, ctx.membership.organizationId, { code: t }));
  return null;
}

export interface CatalogType {
  id: string;
  categoryCode: CategoryCode;
  code: string;
  name: string;
  own: boolean;
}
export interface CatalogAction {
  id: string;
  categoryCode: CategoryCode | null;
  code: string;
  name: string;
  kind: string;
  intervalMonths: number | null;
  defaultIntervalMonths: number | null;
  performedBy: string;
  enabled: boolean;
  legalReference: string | null;
  description: string | null;
  own: boolean;
}

export async function catalog(ctx: ServiceCtx): Promise<{ types: CatalogType[]; actions: CatalogAction[] }> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const types = await tx.selectFrom("equipment_types").select(["id", "category_code", "code", "name", "organization_id"])
      .where("active", "=", true).orderBy("category_code").orderBy("name").execute();
    const actions = await tx
      .selectFrom("maintenance_action_types as a")
      .leftJoin("org_action_type_settings as s", (j) => j.onRef("s.action_type_id", "=", "a.id").on("s.organization_id", "=", orgId))
      .select(["a.id", "a.category_code", "a.code", "a.name", "a.kind", "a.interval_months", "a.performed_by", "a.legal_reference",
        "a.description", "a.organization_id", "a.enabled_by_default", "s.enabled", sql<number | null>`s.interval_months`.as("own_interval")])
      .where("a.active", "=", true)
      .orderBy("a.category_code")
      .orderBy("a.position")
      .execute();
    return {
      types: types.map((t) => ({ id: t.id, categoryCode: t.category_code as CategoryCode, code: t.code, name: t.name, own: t.organization_id !== null })),
      actions: actions.map((a) => ({
        id: a.id, categoryCode: a.category_code as CategoryCode | null, code: a.code, name: a.name, kind: a.kind,
        intervalMonths: a.own_interval ?? a.interval_months, defaultIntervalMonths: a.interval_months, performedBy: a.performed_by,
        enabled: a.enabled ?? a.enabled_by_default, legalReference: a.legal_reference, description: a.description, own: a.organization_id !== null,
      })),
    };
  });
}

async function writeExtinguisher(tx: Tx, orgId: string, branchId: string, equipmentId: string, input: CreateEquipmentInput | UpdateEquipmentInput, agent: string) {
  const values = {
    agent,
    charge_value: input.chargeValue === null ? null : String(input.chargeValue),
    charge_unit: input.chargeUnit,
    efficacy: input.efficacy,
    mobility: input.mobility,
    stamped_on: input.stampedOn,
    put_in_service_on: input.putInServiceOn,
    retimbrados_before: input.retimbradosBefore,
  };
  await tx
    .insertInto("equipment_extinguishers")
    .values({ equipment_id: equipmentId, organization_id: orgId, branch_id: branchId, ...values })
    .onConflict((oc) => oc.column("equipment_id").doUpdateSet(values))
    .execute();
}

async function resolveAgent(tx: Tx, input: CreateEquipmentInput | UpdateEquipmentInput): Promise<string | null> {
  if (input.categoryCode !== "extinguisher") return null;
  if (input.agent) return input.agent;
  if (input.typeId) {
    const t = await tx.selectFrom("equipment_types").select("code").where("id", "=", input.typeId).executeTakeFirst();
    if (t && AGENT_BY_TYPE_CODE[t.code]) return AGENT_BY_TYPE_CODE[t.code]!;
  }
  throw new DomainError("validation_error", "extinguisher_agent_required");
}

export async function createEquipment(ctx: ServiceCtx, input: CreateEquipmentInput): Promise<string> {
  const orgId = ctx.membership.organizationId;
  return withRls(ctx.auth, async (tx) => {
    const inst = await tx.selectFrom("installations").select(["branch_id"]).where("id", "=", input.installationId)
      .where("organization_id", "=", orgId).where("deleted_at", "is", null).executeTakeFirst();
    if (!inst) throw new DomainError("not_found");
    const agent = await resolveAgent(tx, input);
    const row = await tx
      .insertInto("equipment")
      .values({
        organization_id: orgId,
        branch_id: inst.branch_id,
        installation_id: input.installationId,
        category_code: input.categoryCode,
        type_id: input.typeId,
        code: input.code,
        manufacturer: input.manufacturer,
        model: input.model,
        serial_number: input.serialNumber,
        location: input.location,
        installed_on: input.installedOn,
        manufactured_on: input.manufacturedOn,
        notes: input.notes,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (agent) await writeExtinguisher(tx, orgId, inst.branch_id, row.id, input, agent);
    return row.id;
  });
}

export async function updateEquipment(ctx: ServiceCtx, input: UpdateEquipmentInput): Promise<void> {
  const orgId = ctx.membership.organizationId;
  await withRls(ctx.auth, async (tx) => {
    const cur = await tx.selectFrom("equipment").select(["branch_id", "installation_id", "category_code"]).where("id", "=", input.id)
      .where("organization_id", "=", orgId).where("deleted_at", "is", null).executeTakeFirst();
    if (!cur) throw new DomainError("not_found");
    if (cur.category_code !== input.categoryCode) throw new DomainError("validation_error", "equipment_category_immutable");
    if (input.installationId !== cur.installation_id) {
      // Solo a otra instalación de la MISMA sucursal (la FK compuesta lo exige igualmente).
      const target = await tx.selectFrom("installations").select("branch_id").where("id", "=", input.installationId)
        .where("organization_id", "=", orgId).where("deleted_at", "is", null).executeTakeFirst();
      if (!target || target.branch_id !== cur.branch_id) throw new DomainError("validation_error", "installation_other_branch");
    }
    const agent = await resolveAgent(tx, input);
    const r = await tx
      .updateTable("equipment")
      .set({
        installation_id: input.installationId,
        type_id: input.typeId,
        ...(input.code ? { code: input.code } : {}),
        manufacturer: input.manufacturer,
        model: input.model,
        serial_number: input.serialNumber,
        location: input.location,
        installed_on: input.installedOn,
        manufactured_on: input.manufacturedOn,
        status: input.status,
        notes: input.notes,
      })
      .where("id", "=", input.id)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("permission_denied");
    if (agent) await writeExtinguisher(tx, orgId, cur.branch_id, input.id, input, agent);
  });
}

export async function deleteEquipment(ctx: ServiceCtx, id: string): Promise<{ installationId: string }> {
  return withRls(ctx.auth, async (tx) => {
    const visible = await tx.selectFrom("equipment").select("id").where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst();
    if (!visible) throw new DomainError("not_found");
    const r = await tx
      .updateTable("equipment")
      .set({ deleted_at: new Date() })
      .where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("deleted_at", "is", null)
      .returning("installation_id")
      .executeTakeFirst();
    // Visible pero sin actualizar: sin permiso (RLS).
    if (!r) throw new DomainError("permission_denied");
    return { installationId: r.installation_id };
  });
}

/** Configuración del taller sobre una operación del catálogo (solo administradores; RLS). */
export async function setActionSetting(ctx: ServiceCtx, actionTypeId: string, enabled: boolean, intervalMonths: number | null): Promise<void> {
  await withRls(ctx.auth, (tx) =>
    tx
      .insertInto("org_action_type_settings")
      .values({ organization_id: ctx.membership.organizationId, action_type_id: actionTypeId, enabled, interval_months: intervalMonths })
      .onConflict((oc) => oc.columns(["organization_id", "action_type_id"]).doUpdateSet({ enabled, interval_months: intervalMonths, updated_at: new Date() }))
      .execute(),
  );
}
