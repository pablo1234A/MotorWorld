import "server-only";

import { sql } from "kysely";
import { z } from "zod";

import {
  CATEGORY_CODES,
  EQUIPMENT_STATUSES,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
  INCIDENT_STATUSES,
  RESULTS,
  SERVICE_TYPES,
  SEVERITIES,
  WORK_ORDER_STATUSES,
} from "@/lib/pci/labels";
import {
  createEquipmentSchema,
  createIncidentSchema,
  createInstallationSchema,
  createWorkOrderSchema,
  recordSchema,
  updateEquipmentSchema,
  updateIncidentSchema,
  updateInstallationSchema,
  workOrderStatusSchema,
} from "@/lib/validation/pci";
import { withRls } from "@/server/db/client";
import * as equipmentService from "@/server/modules/equipment/service";
import * as incidentsService from "@/server/modules/incidents/service";
import * as installationsService from "@/server/modules/installations/service";
import { syncWorkOrderLater } from "@/server/modules/integrations/calendar";
import * as records from "@/server/modules/maintenance/records";
import * as orders from "@/server/modules/work-orders/service";

import {
  ApiError,
  type ApiContext,
  type ApiPrincipal,
  type ApiResult,
  assertBranch,
  nextCursor,
  pageParams,
  uuidParam,
} from "../handler";

/**
 * API v1 · protección contra incendios: instalaciones, equipos, actuaciones,
 * órdenes de trabajo e incidencias. Mismos servicios, RLS, límites y
 * validaciones que el panel. JSON en snake_case; un recurso de otra empresa o
 * de una sucursal que la clave no ve responde 404.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const day = (d: unknown) =>
  d instanceof Date
    ? d.toISOString().slice(0, 10)
    : ((d as string | null) ?? null);
const snake = (k: string) =>
  k
    .replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
    .replace(/([a-z])(\d)/g, "$1_$2");
const camel = (k: string) =>
  k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Valida con el esquema del panel y devuelve los errores con los nombres de la API. */
function parseAs<S extends z.ZodType>(
  schema: S,
  data: Record<string, unknown>,
): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string[]> = {};
  for (const i of r.error.issues)
    (fields[i.path.map((p) => snake(String(p))).join(".") || "_"] ??= []).push(
      i.message,
    );
  throw new ApiError(
    400,
    "validation_error",
    "Los datos no son válidos",
    fields,
  );
}
/** Cuerpo snake_case → objeto camelCase del formulario; los null se envían como «vacío». */
function formFrom(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [
      camel(k),
      v === null ? "" : typeof v === "number" ? String(v) : v,
    ]),
  );
}
function objectBody(
  body: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ApiError(
      400,
      "bad_request",
      "El cuerpo tiene que ser un objeto JSON",
    );
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length)
    throw new ApiError(
      400,
      "validation_error",
      `Campo no admitido: ${unknown[0]}`,
    );
  return body as Record<string, unknown>;
}

async function rowBranch(
  p: ApiPrincipal,
  table:
    | "installations"
    | "equipment"
    | "work_orders"
    | "equipment_incidents"
    | "equipment_maintenance_records",
  id: string,
): Promise<string> {
  const row = await withRls(p.ctx.auth, async (tx) => {
    const { rows } = await sql<{ branch_id: string }>`
      select branch_id from ${sql.table(table)} where id = ${id} and organization_id = ${p.orgId}
        ${table === "installations" || table === "equipment" ? sql`and deleted_at is null` : sql``}
    `.execute(tx);
    return rows[0];
  });
  if (!row) throw new ApiError(404, "not_found", "No existe");
  assertBranch(p, row.branch_id);
  return row.branch_id;
}

type Cursor = ReturnType<typeof pageParams>["cursor"];
const cursorWhere = (alias: string, c: Cursor) =>
  c
    ? sql`and (${sql.ref(`${alias}.created_at`)}, ${sql.ref(`${alias}.id`)}) < (${c.at}::timestamptz, ${c.id}::uuid)`
    : sql``;
const branchWhere = (alias: string, p: ApiPrincipal) =>
  p.branchIds
    ? sql`and ${sql.ref(`${alias}.branch_id`)} = any(${p.branchIds}::uuid[])`
    : sql``;
const optUuid = (url: URL, name: string) => {
  const v = url.searchParams.get(name);
  if (v && !/^[0-9a-f-]{36}$/i.test(v))
    throw new ApiError(
      400,
      "validation_error",
      `${name} no es un identificador válido`,
    );
  return v;
};
const optEnum = <T extends string>(
  url: URL,
  name: string,
  values: readonly T[],
) => {
  const v = url.searchParams.get(name);
  if (v && !(values as readonly string[]).includes(v))
    throw new ApiError(
      400,
      "validation_error",
      `${name} no válido (${values.join(", ")})`,
    );
  return v as T | null;
};

// ============================================================ instalaciones

type InstallationDb = Record<string, unknown> & {
  id: string;
  created_at: Date;
};
const installationJson = (r: InstallationDb) => ({
  id: r.id,
  object: "installation",
  branch_id: r.branch_id,
  customer_id: r.customer_id,
  name: r.name,
  establishment_type: r.establishment_type,
  address_line1: r.address_line1,
  postal_code: r.postal_code,
  city: r.city,
  province: r.province,
  contact_name: r.contact_name,
  contact_phone: r.contact_phone,
  contact_email: r.contact_email ? String(r.contact_email) : null,
  notes: r.notes,
  status: r.status,
  next_action_on: day(r.next_action_on),
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at as Date),
});
const INSTALLATION_SELECT = sql`i.id, i.branch_id, i.customer_id, i.name, i.establishment_type, i.address_line1, i.postal_code, i.city, i.province,
  i.contact_name, i.contact_phone, i.contact_email, i.notes, i.status, i.created_at, i.updated_at,
  (select min(e.next_action_on) from equipment e where e.installation_id = i.id and e.deleted_at is null and e.status = 'in_service') as next_action_on`;

async function installationRow(p: ApiPrincipal, id: string) {
  await rowBranch(p, "installations", id);
  return withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<InstallationDb>`select ${INSTALLATION_SELECT} from installations i where i.id = ${id}`.execute(
          tx,
        )
      ).rows[0],
  );
}

export async function listInstallations({
  principal: p,
  url,
}: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const customerId = optUuid(url, "customer_id");
  const status = optEnum(url, "status", ["active", "inactive"] as const);
  const rows = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<InstallationDb>`
        select ${INSTALLATION_SELECT} from installations i
         where i.organization_id = ${p.orgId} and i.deleted_at is null ${branchWhere("i", p)}
           ${customerId ? sql`and i.customer_id = ${customerId}` : sql``} ${status ? sql`and i.status = ${status}` : sql``} ${cursorWhere("i", cursor)}
         order by i.created_at desc, i.id desc limit ${limit + 1}`.execute(tx)
      ).rows,
  );
  return {
    body: {
      object: "list",
      data: rows.slice(0, limit).map(installationJson),
      next_cursor: nextCursor(rows, limit),
    },
  };
}

export async function getInstallation(
  { principal: p }: ApiContext,
  id: string,
): Promise<ApiResult> {
  return { body: installationJson(await installationRow(p, uuidParam(id))) };
}

const INSTALLATION_FIELDS = [
  "name",
  "establishment_type",
  "address_line1",
  "postal_code",
  "city",
  "province",
  "contact_name",
  "contact_phone",
  "contact_email",
  "notes",
] as const;

export async function createInstallation({
  principal: p,
  body,
}: ApiContext): Promise<ApiResult> {
  const b = objectBody(body, ["customer_id", ...INSTALLATION_FIELDS]);
  const customerId = uuidParam(String(b.customer_id ?? ""));
  const cust = await withRls(p.ctx.auth, (tx) =>
    tx
      .selectFrom("customers")
      .select("branch_id")
      .where("id", "=", customerId)
      .where("organization_id", "=", p.orgId)
      .where("deleted_at", "is", null)
      .executeTakeFirst(),
  );
  if (!cust) throw new ApiError(404, "not_found", "No existe el cliente");
  assertBranch(p, cust.branch_id);
  const input = parseAs(createInstallationSchema, formFrom(b));
  const id = await installationsService.createInstallation(p.ctx, input);
  return { status: 201, body: installationJson(await installationRow(p, id)) };
}

export async function updateInstallation(
  { principal: p, body }: ApiContext,
  id: string,
): Promise<ApiResult> {
  const b = objectBody(body, [...INSTALLATION_FIELDS, "status"]);
  const cur = await installationRow(p, uuidParam(id));
  const merged = {
    ...Object.fromEntries(
      [...INSTALLATION_FIELDS, "status"].map((k) => [k, cur[k] ?? null]),
    ),
    ...b,
    contact_email:
      b.contact_email !== undefined
        ? b.contact_email
        : cur.contact_email
          ? String(cur.contact_email)
          : null,
  };
  const input = parseAs(updateInstallationSchema, {
    ...formFrom(merged),
    id: cur.id,
  });
  await installationsService.updateInstallation(p.ctx, input);
  return { body: installationJson(await installationRow(p, cur.id)) };
}

// ================================================================== equipos

type EquipmentDb = Record<string, unknown> & { id: string; created_at: Date };
const equipmentJson = (r: EquipmentDb) => ({
  id: r.id,
  object: "equipment",
  branch_id: r.branch_id,
  installation_id: r.installation_id,
  category: r.category_code,
  type_id: r.type_id,
  code: r.code,
  manufacturer: r.manufacturer,
  model: r.model,
  serial_number: r.serial_number,
  location: r.location,
  installed_on: day(r.installed_on),
  manufactured_on: day(r.manufactured_on),
  status: r.status,
  notes: r.notes,
  last_action_on: day(r.last_action_on),
  next_action_on: day(r.next_action_on),
  extinguisher:
    r.category_code === "extinguisher"
      ? {
          agent: r.agent,
          charge_value:
            r.charge_value === null || r.charge_value === undefined
              ? null
              : Number(r.charge_value),
          charge_unit: r.charge_unit,
          efficacy: r.efficacy,
          mobility: r.mobility,
          stamped_on: day(r.stamped_on),
          put_in_service_on: day(r.put_in_service_on),
          retimbrados_before: r.retimbrados_before,
        }
      : null,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at as Date),
});
const EQUIPMENT_SELECT = sql`e.id, e.branch_id, e.installation_id, e.category_code, e.type_id, e.code, e.manufacturer, e.model, e.serial_number, e.location,
  e.installed_on, e.manufactured_on, e.status, e.notes, e.last_action_on, e.next_action_on, e.created_at, e.updated_at,
  x.agent, x.charge_value, x.charge_unit, x.efficacy, x.mobility, x.stamped_on, x.put_in_service_on, x.retimbrados_before`;

async function equipmentRow(p: ApiPrincipal, id: string) {
  await rowBranch(p, "equipment", id);
  return withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<EquipmentDb>`select ${EQUIPMENT_SELECT} from equipment e left join equipment_extinguishers x on x.equipment_id = e.id where e.id = ${id}`.execute(
          tx,
        )
      ).rows[0],
  );
}

export async function listEquipment({
  principal: p,
  url,
}: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const installationId = optUuid(url, "installation_id");
  const category = optEnum(url, "category", CATEGORY_CODES);
  const status = optEnum(url, "status", EQUIPMENT_STATUSES);
  const dueBefore = url.searchParams.get("due_before");
  if (dueBefore && !/^\d{4}-\d{2}-\d{2}$/.test(dueBefore))
    throw new ApiError(
      400,
      "validation_error",
      "due_before tiene que ser AAAA-MM-DD",
    );
  const rows = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<EquipmentDb>`
        select ${EQUIPMENT_SELECT} from equipment e left join equipment_extinguishers x on x.equipment_id = e.id
         where e.organization_id = ${p.orgId} and e.deleted_at is null ${branchWhere("e", p)}
           ${installationId ? sql`and e.installation_id = ${installationId}` : sql``}
           ${category ? sql`and e.category_code = ${category}` : sql``}
           ${status ? sql`and e.status = ${status}` : sql``}
           ${dueBefore ? sql`and e.next_action_on <= ${dueBefore}::date` : sql``} ${cursorWhere("e", cursor)}
         order by e.created_at desc, e.id desc limit ${limit + 1}`.execute(tx)
      ).rows,
  );
  return {
    body: {
      object: "list",
      data: rows.slice(0, limit).map(equipmentJson),
      next_cursor: nextCursor(rows, limit),
    },
  };
}

export async function getEquipment(
  { principal: p }: ApiContext,
  id: string,
): Promise<ApiResult> {
  return { body: equipmentJson(await equipmentRow(p, uuidParam(id))) };
}

const EQUIPMENT_FIELDS = [
  "type_id",
  "code",
  "manufacturer",
  "model",
  "serial_number",
  "location",
  "installed_on",
  "manufactured_on",
  "notes",
] as const;
const EXT_FIELDS = [
  "agent",
  "charge_value",
  "charge_unit",
  "efficacy",
  "mobility",
  "stamped_on",
  "put_in_service_on",
  "retimbrados_before",
] as const;

function flattenExtinguisher(
  b: Record<string, unknown>,
): Record<string, unknown> {
  const { extinguisher, ...rest } = b;
  if (extinguisher === undefined || extinguisher === null) return rest;
  return { ...rest, ...objectBody(extinguisher, EXT_FIELDS) };
}

export async function createEquipment({
  principal: p,
  body,
}: ApiContext): Promise<ApiResult> {
  const b = flattenExtinguisher(
    objectBody(body, [
      "installation_id",
      "category",
      ...EQUIPMENT_FIELDS,
      "extinguisher",
    ]),
  );
  await rowBranch(
    p,
    "installations",
    uuidParam(String(b.installation_id ?? "")),
  );
  const { category, ...rest } = b;
  const input = parseAs(
    createEquipmentSchema,
    formFrom({ ...rest, category_code: category }),
  );
  const id = await equipmentService.createEquipment(p.ctx, input);
  return { status: 201, body: equipmentJson(await equipmentRow(p, id)) };
}

export async function updateEquipment(
  { principal: p, body }: ApiContext,
  id: string,
): Promise<ApiResult> {
  const b = flattenExtinguisher(
    objectBody(body, [...EQUIPMENT_FIELDS, "status", "extinguisher"]),
  );
  const cur = await equipmentRow(p, uuidParam(id));
  const current = Object.fromEntries(
    [...EQUIPMENT_FIELDS, ...EXT_FIELDS, "status"].map((k) => [
      k,
      k.endsWith("_on") ? day(cur[k]) : (cur[k] ?? null),
    ]),
  );
  const input = parseAs(updateEquipmentSchema, {
    ...formFrom({
      ...current,
      ...b,
      category_code: cur.category_code,
      installation_id: cur.installation_id,
    }),
    id: cur.id,
  });
  await equipmentService.updateEquipment(p.ctx, input);
  return { body: equipmentJson(await equipmentRow(p, cur.id)) };
}

// ================================================================ actuaciones

type RecordDb = Record<string, unknown> & { id: string; created_at: Date };
const recordJson = (r: RecordDb) => ({
  id: r.id,
  object: "action",
  branch_id: r.branch_id,
  equipment_id: r.equipment_id,
  installation_id: r.installation_id,
  action_type: {
    id: r.action_type_id,
    code: r.action_code,
    name: r.action_name,
  },
  performed_on: day(r.performed_on),
  result: r.result,
  observations: r.observations,
  next_action_recommended_on: day(r.next_action_recommended_on),
  technician_id: r.technician_id,
  work_order_id: r.work_order_id,
  amended_at: iso(r.amended_at as Date | null),
  voided_at: iso(r.voided_at as Date | null),
  void_reason: r.void_reason,
  created_at: iso(r.created_at),
});
const RECORD_SELECT = sql`m.id, m.branch_id, m.equipment_id, m.installation_id, m.action_type_id, a.code as action_code, a.name as action_name, m.performed_on, m.result,
  m.observations, m.next_action_recommended_on, m.technician_id, m.work_order_id, m.amended_at, m.voided_at, m.void_reason, m.created_at`;

export async function listActions({
  principal: p,
  url,
}: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const equipmentId = optUuid(url, "equipment_id");
  const installationId = optUuid(url, "installation_id");
  const from = url.searchParams.get("from");
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from))
    throw new ApiError(
      400,
      "validation_error",
      "from tiene que ser AAAA-MM-DD",
    );
  const rows = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<RecordDb>`
        select ${RECORD_SELECT} from equipment_maintenance_records m join maintenance_action_types a on a.id = m.action_type_id
         where m.organization_id = ${p.orgId} ${branchWhere("m", p)}
           ${equipmentId ? sql`and m.equipment_id = ${equipmentId}` : sql``}
           ${installationId ? sql`and m.installation_id = ${installationId}` : sql``}
           ${from ? sql`and m.performed_on >= ${from}::date` : sql``} ${cursorWhere("m", cursor)}
         order by m.created_at desc, m.id desc limit ${limit + 1}`.execute(tx)
      ).rows,
  );
  return {
    body: {
      object: "list",
      data: rows.slice(0, limit).map(recordJson),
      next_cursor: nextCursor(rows, limit),
    },
  };
}

export async function createAction({
  principal: p,
  body,
}: ApiContext): Promise<ApiResult> {
  const b = objectBody(body, [
    "equipment_id",
    "action_type_id",
    "performed_on",
    "result",
    "observations",
    "next_action_recommended_on",
    "technician_id",
    "materials",
  ]);
  await rowBranch(p, "equipment", uuidParam(String(b.equipment_id ?? "")));
  const { materials, ...rest } = b;
  const input = parseAs(recordSchema, {
    ...formFrom(rest),
    materials: Array.isArray(materials) ? materials : [],
  });
  const id = await records.createRecord(p.ctx, input);
  const row = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<RecordDb>`select ${RECORD_SELECT} from equipment_maintenance_records m join maintenance_action_types a on a.id = m.action_type_id where m.id = ${id}`.execute(
          tx,
        )
      ).rows[0],
  );
  return { status: 201, body: recordJson(row) };
}

/** Catálogo de operaciones aplicables (para elegir action_type_id). */
export async function listActionTypes({
  principal: p,
}: ApiContext): Promise<ApiResult> {
  const { actions } = await equipmentService.catalog(p.ctx);
  return {
    body: {
      object: "list",
      data: actions.map((a) => ({
        id: a.id,
        object: "action_type",
        category: a.categoryCode,
        code: a.code,
        name: a.name,
        kind: a.kind,
        interval_months: a.intervalMonths,
        enabled: a.enabled,
        legal_reference: a.legalReference,
      })),
      next_cursor: null,
    },
  };
}

// ======================================================== órdenes de trabajo

async function workOrderJson(p: ApiPrincipal, id: string) {
  const o = await orders.getWorkOrder(p.ctx, id);
  if (!o) throw new ApiError(404, "not_found", "No existe");
  assertBranch(p, o.branchId);
  return {
    id: o.id,
    object: "work_order",
    branch_id: o.branchId,
    number: o.number,
    status: o.status,
    service_type: o.serviceType,
    customer_id: o.customerId,
    installation_id: o.installationId,
    technician_id: o.technicianId,
    scheduled_for: o.scheduledFor,
    scheduled_time: o.scheduledTime,
    description: o.description,
    completion_notes: o.completionNotes,
    items: o.itemList.map((i) => ({
      id: i.id,
      equipment_id: i.equipmentId,
      action_type_id: i.actionTypeId,
      status: i.status,
      result: i.result,
      observations: i.observations,
      action_id: i.recordId,
    })),
    started_at: iso(o.startedAt),
    completed_at: iso(o.completedAt),
    canceled_at: iso(o.canceledAt),
    created_at: iso(o.createdAt),
  };
}

export async function listWorkOrders({
  principal: p,
  url,
}: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const status = optEnum(url, "status", WORK_ORDER_STATUSES);
  const installationId = optUuid(url, "installation_id");
  const rows = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<{ id: string; created_at: Date }>`
        select w.id, w.created_at from work_orders w where w.organization_id = ${p.orgId} ${branchWhere("w", p)}
          ${status ? sql`and w.status = ${status}` : sql``} ${installationId ? sql`and w.installation_id = ${installationId}` : sql``} ${cursorWhere("w", cursor)}
         order by w.created_at desc, w.id desc limit ${limit + 1}`.execute(tx)
      ).rows,
  );
  const data = await Promise.all(
    rows.slice(0, limit).map((r) => workOrderJson(p, r.id)),
  );
  return {
    body: { object: "list", data, next_cursor: nextCursor(rows, limit) },
  };
}

export async function getWorkOrder(
  { principal: p }: ApiContext,
  id: string,
): Promise<ApiResult> {
  return { body: await workOrderJson(p, uuidParam(id)) };
}

export async function createWorkOrder({
  principal: p,
  body,
}: ApiContext): Promise<ApiResult> {
  const b = objectBody(body, [
    "installation_id",
    "service_type",
    "scheduled_for",
    "scheduled_time",
    "technician_id",
    "description",
    "items",
  ]);
  await rowBranch(
    p,
    "installations",
    uuidParam(String(b.installation_id ?? "")),
  );
  const items =
    b.items === undefined ? [] : Array.isArray(b.items) ? b.items : null;
  if (!items)
    throw new ApiError(
      400,
      "validation_error",
      "items tiene que ser una lista de { equipment_id, action_type_id }",
    );
  const pairs = items.map((i) => {
    const it = objectBody(i, ["equipment_id", "action_type_id"]);
    return `${String(it.equipment_id ?? "")}:${String(it.action_type_id ?? "")}`;
  });
  const { items: _i, ...rest } = b;
  const input = parseAs(createWorkOrderSchema, {
    ...formFrom(rest),
    items: pairs,
  });
  const id = await orders.createWorkOrder(p.ctx, input);
  syncWorkOrderLater(id);
  return { status: 201, body: await workOrderJson(p, id) };
}

export async function setWorkOrderStatus(
  { principal: p, body }: ApiContext,
  id: string,
): Promise<ApiResult> {
  const b = objectBody(body, ["status", "completion_notes"]);
  await rowBranch(p, "work_orders", uuidParam(id));
  const input = parseAs(workOrderStatusSchema, { ...formFrom(b), id });
  await orders.setWorkOrderStatus(
    p.ctx,
    id,
    input.status,
    input.completionNotes,
  );
  syncWorkOrderLater(id);
  return { body: await workOrderJson(p, id) };
}

// =============================================================== incidencias

const incidentJson = (
  x: incidentsService.IncidentRow & { branchId?: string },
) => ({
  id: x.id,
  object: "incident",
  installation_id: x.installationId,
  equipment_id: x.equipmentId,
  work_order_id: x.workOrderId,
  title: x.title,
  description: x.description,
  severity: x.severity,
  status: x.status,
  detected_on: x.detectedOn,
  resolved_on: x.resolvedOn,
  resolution: x.resolution,
});

async function incident(p: ApiPrincipal, id: string) {
  await rowBranch(p, "equipment_incidents", id);
  const x = await incidentsService.getIncident(p.ctx, id);
  if (!x) throw new ApiError(404, "not_found", "No existe");
  return x;
}

export async function listIncidents({
  principal: p,
  url,
}: ApiContext): Promise<ApiResult> {
  const { limit, cursor } = pageParams(url);
  const status = optEnum(url, "status", INCIDENT_STATUSES);
  const installationId = optUuid(url, "installation_id");
  const rows = await withRls(
    p.ctx.auth,
    async (tx) =>
      (
        await sql<{ id: string; created_at: Date }>`
        select x.id, x.created_at from equipment_incidents x where x.organization_id = ${p.orgId} ${branchWhere("x", p)}
          ${status ? sql`and x.status = ${status}` : sql``} ${installationId ? sql`and x.installation_id = ${installationId}` : sql``} ${cursorWhere("x", cursor)}
         order by x.created_at desc, x.id desc limit ${limit + 1}`.execute(tx)
      ).rows,
  );
  const data = await Promise.all(
    rows
      .slice(0, limit)
      .map(async (r) =>
        incidentJson((await incidentsService.getIncident(p.ctx, r.id))!),
      ),
  );
  return {
    body: { object: "list", data, next_cursor: nextCursor(rows, limit) },
  };
}

export async function getIncident(
  { principal: p }: ApiContext,
  id: string,
): Promise<ApiResult> {
  return { body: incidentJson(await incident(p, uuidParam(id))) };
}

export async function createIncident({
  principal: p,
  body,
}: ApiContext): Promise<ApiResult> {
  const b = objectBody(body, [
    "installation_id",
    "equipment_id",
    "work_order_id",
    "severity",
    "title",
    "description",
    "detected_on",
  ]);
  await rowBranch(
    p,
    "installations",
    uuidParam(String(b.installation_id ?? "")),
  );
  const input = parseAs(createIncidentSchema, {
    detectedOn: new Date().toISOString().slice(0, 10),
    ...formFrom(b),
  });
  const id = await incidentsService.createIncident(p.ctx, input);
  return {
    status: 201,
    body: incidentJson((await incidentsService.getIncident(p.ctx, id))!),
  };
}

export async function updateIncident(
  { principal: p, body }: ApiContext,
  id: string,
): Promise<ApiResult> {
  const b = objectBody(body, ["status", "severity", "resolution"]);
  const cur = await incident(p, uuidParam(id));
  const input = parseAs(updateIncidentSchema, {
    ...formFrom({
      status: cur.status,
      severity: cur.severity,
      resolution: cur.resolution,
      ...b,
    }),
    id: cur.id,
  });
  await incidentsService.updateIncident(p.ctx, input);
  return {
    body: incidentJson((await incidentsService.getIncident(p.ctx, cur.id))!),
  };
}

/** Valores admitidos (para la documentación OpenAPI). */
export const PCI_ENUMS = {
  CATEGORY_CODES,
  EQUIPMENT_STATUSES,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
  INCIDENT_STATUSES,
  RESULTS,
  SERVICE_TYPES,
  SEVERITIES,
  WORK_ORDER_STATUSES,
};
