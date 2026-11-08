import "server-only";

import ExcelJS from "exceljs";
import { sql } from "kysely";

import type { OrgContext } from "@/server/auth/context";
import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import { removeObject } from "@/server/storage";

/**
 * Derechos de los interesados (SEGURIDAD §6). Todo con RLS y solo para
 * administradores; cada acción queda en data_subject_requests y en la
 * auditoría. Las exportaciones funcionan también en solo lectura (tras la
 * cancelación, durante los 60 días de conservación).
 */

type Ctx = Pick<OrgContext, "auth" | "membership">;

function assertAdmin(ctx: Ctx) {
  if (ctx.membership.role !== "admin") throw new DomainError("permission_denied");
}

async function logRequest(ctx: Ctx, customerId: string | null, type: "access" | "portability", note: string) {
  await withRls(ctx.auth, async (tx) => {
    await tx
      .insertInto("data_subject_requests")
      .values({ organization_id: ctx.membership.organizationId, customer_id: customerId, type, status: "completed", completed_at: new Date(), handled_by: ctx.auth.userId, notes: note })
      .execute();
    await sql`select app.write_audit(${ctx.membership.organizationId}::uuid, ${customerId ? "customer.exported" : "organization.exported"}, ${customerId ? "customer" : "organization"}, ${customerId ?? ctx.membership.organizationId}, '{}'::jsonb)`.execute(tx);
  });
}

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d as string | null));

/** Todos los datos de un cliente en JSON (acceso y portabilidad, art. 15 y 20). */
export async function exportCustomer(ctx: Ctx, customerId: string): Promise<Record<string, unknown> | null> {
  assertAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  const data = await withRls(ctx.auth, async (tx) => {
    const customer = await tx
      .selectFrom("customers")
      .select([
        "id", "first_name", "last_name", sql<string | null>`email::text`.as("email"), "phone", "source", "notes", "reminders_opt_out", "opted_out_at", "created_at", "updated_at",
        "customer_kind", "legal_name", "tax_id", "address_line1", "postal_code", "city", "province", "contact_name", "contact_role",
      ])
      .where("id", "=", customerId)
      .where("organization_id", "=", orgId)
      .executeTakeFirst();
    if (!customer) return null;
    const vehicles = await tx
      .selectFrom("vehicles")
      .select(["id", "plate", "make", "model", "vin", "status", "current_km", "last_service_date", "last_service_km", "next_service_date", "next_service_km", "created_at"])
      .where("customer_id", "=", customerId)
      .execute();
    const ids = vehicles.map((v) => v.id);
    const history = ids.length
      ? await tx.selectFrom("maintenance_records").select(["vehicle_id", "service_date", "km", "work_performed", "notes", "next_recommended_date", "next_recommended_km"]).where("vehicle_id", "in", ids).orderBy("service_date").execute()
      : [];
    const appointments = await tx
      .selectFrom("appointments")
      .select(["id", "status", "source", "requested_date", "confirmed_start", "confirmed_end", "customer_message", "created_at"])
      .where((eb) => eb.or([eb("customer_id", "=", customerId), ...(ids.length ? [eb("vehicle_id", "in", ids)] : [])]))
      .execute();
    const quotes = await tx.selectFrom("quotes").select(["number", "status", "issue_date", "valid_until", "total", "created_at"]).where("customer_id", "=", customerId).execute();
    const reminders = await tx.selectFrom("reminders").select(["type", "status", "due_date", "scheduled_for", "sent_at"]).where("customer_id", "=", customerId).execute();
    // PCI: instalaciones, equipos, actuaciones, órdenes e incidencias del cliente.
    const { rows: installations } = await sql<Record<string, unknown>>`
      select id, name, establishment_type, address_line1, postal_code, city, province, contact_name, contact_phone, contact_email::text, notes, status, created_at
        from installations where customer_id = ${customerId} and organization_id = ${orgId} order by created_at`.execute(tx);
    const { rows: equipment } = await sql<Record<string, unknown>>`
      select e.id, e.installation_id, e.code, e.category_code, e.location, e.manufacturer, e.model, e.serial_number, e.installed_on::text, e.status,
             e.last_action_on::text, e.next_action_on::text, x.agent, x.charge_value, x.charge_unit, x.stamped_on::text, x.put_in_service_on::text
        from equipment e join installations i on i.id = e.installation_id left join equipment_extinguishers x on x.equipment_id = e.id
       where i.customer_id = ${customerId} and e.organization_id = ${orgId} order by e.code`.execute(tx);
    const { rows: actions } = await sql<Record<string, unknown>>`
      select m.equipment_id, a.name as action, m.performed_on::text, m.result, m.observations, m.next_action_recommended_on::text, m.voided_at, m.void_reason
        from equipment_maintenance_records m join maintenance_action_types a on a.id = m.action_type_id
       where m.customer_id = ${customerId} and m.organization_id = ${orgId} order by m.performed_on`.execute(tx);
    const { rows: workOrders } = await sql<Record<string, unknown>>`
      select number, status, service_type, installation_id, scheduled_for::text, completed_at, completion_notes
        from work_orders where customer_id = ${customerId} and organization_id = ${orgId} order by created_at`.execute(tx);
    const { rows: incidents } = await sql<Record<string, unknown>>`
      select x.title, x.severity, x.status, x.detected_on::text, x.resolved_on::text, x.resolution, x.installation_id, x.equipment_id
        from equipment_incidents x join installations i on i.id = x.installation_id
       where i.customer_id = ${customerId} and x.organization_id = ${orgId} order by x.detected_on`.execute(tx);
    const emails = await tx
      .selectFrom("email_logs")
      .select(["kind", sql<string>`to_email::text`.as("to_email"), "subject", "status", "created_at"])
      .where("customer_id", "=", customerId)
      .orderBy("created_at")
      .execute();
    return {
      customer: { ...customer, opted_out_at: customer.opted_out_at?.toISOString() ?? null },
      vehicles: vehicles.map((v) => ({ ...v, last_service_date: day(v.last_service_date), next_service_date: day(v.next_service_date) })),
      maintenance_history: history.map((h) => ({ ...h, service_date: day(h.service_date), next_recommended_date: day(h.next_recommended_date) })),
      appointments: appointments.map((a) => ({ ...a, requested_date: day(a.requested_date) })),
      quotes: quotes.map((q) => ({ ...q, issue_date: day(q.issue_date), valid_until: day(q.valid_until) })),
      reminders: reminders.map((r) => ({ ...r, due_date: day(r.due_date) })),
      installations,
      equipment,
      maintenance_actions: actions,
      work_orders: workOrders,
      incidents,
      emails,
    };
  });
  if (!data) return null;
  await logRequest(ctx, customerId, "portability", "Exportación de los datos del cliente (JSON)");
  return { exported_at: new Date().toISOString(), controller: ctx.membership.organizationId, ...data };
}

/** Supresión inmediata (art. 17): sin papelera. Devuelve lo que se ha borrado. */
export async function eraseCustomer(ctx: Ctx, customerId: string): Promise<Record<string, number>> {
  assertAdmin(ctx);
  const result = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ r: Record<string, unknown> }>`select app.erase_customer(${customerId}::uuid) as r`.execute(tx);
    return rows[0].r;
  });
  for (const path of (result.pdf_paths as string[]) ?? []) {
    await removeObject("documents", path).catch((err) => logger.warn("erase_pdf_failed", { error: err }));
  }
  const { pdf_paths: _p, ...counts } = result;
  return counts as Record<string, number>;
}

/** Exportación de toda la empresa en un Excel (portabilidad del responsable; también en solo lectura). */
export async function exportWorkshop(ctx: Ctx): Promise<Buffer> {
  assertAdmin(ctx);
  const orgId = ctx.membership.organizationId;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RevisaYa";
  await withRls(ctx.auth, async (tx) => {
    const sheet = (name: string, columns: Array<[key: string, header: string, width?: number]>, rows: Record<string, unknown>[]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = columns.map(([key, header, width]) => ({ key, header, width: width ?? 18 }));
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : (v as string | number | null)])));
    };
    const { rows: branches } = await sql<Record<string, unknown>>`select id, name from branches where organization_id = ${orgId} order by is_primary desc, name`.execute(tx);
    const branchName = new Map(branches.map((b) => [b.id as string, b.name as string]));
    const { rows: customers } = await sql<Record<string, unknown>>`
      select id, branch_id, customer_kind, first_name, last_name, legal_name, tax_id, email::text, phone, address_line1, postal_code, city, province,
             contact_name, contact_role, source, notes, reminders_opt_out, created_at, deleted_at
        from customers where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Clientes",
      [
        ["id", "Id", 38], ["branch", "Delegación"], ["customer_kind", "Tipo"], ["first_name", "Nombre"], ["last_name", "Apellidos"], ["legal_name", "Razón social", 28], ["tax_id", "CIF/NIF"],
        ["email", "Correo", 28], ["phone", "Teléfono"], ["address_line1", "Dirección", 28], ["postal_code", "CP"], ["city", "Municipio"], ["province", "Provincia"],
        ["contact_name", "Contacto"], ["contact_role", "Cargo"], ["source", "Origen"], ["notes", "Notas", 30], ["reminders_opt_out", "Sin avisos"], ["created_at", "Alta", 22], ["deleted_at", "En la papelera desde", 22],
      ],
      customers.map((c) => ({ ...c, branch: branchName.get(c.branch_id as string), reminders_opt_out: c.reminders_opt_out ? "sí" : "no" })),
    );
    // PCI
    const { rows: installations } = await sql<Record<string, unknown>>`
      select id, customer_id, name, establishment_type, address_line1, postal_code, city, province, contact_name, contact_phone, contact_email::text, notes, status, created_at, deleted_at
        from installations where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Instalaciones",
      [["id", "Id", 38], ["customer_id", "Id del cliente", 38], ["name", "Nombre", 28], ["establishment_type", "Tipo"], ["address_line1", "Dirección", 28], ["postal_code", "CP"], ["city", "Municipio"], ["province", "Provincia"], ["contact_name", "Responsable"], ["contact_phone", "Teléfono"], ["contact_email", "Correo", 28], ["notes", "Observaciones", 30], ["status", "Estado"], ["created_at", "Alta", 22], ["deleted_at", "En la papelera desde", 22]],
      installations,
    );
    const { rows: equipment } = await sql<Record<string, unknown>>`
      select e.id, e.installation_id, e.code, e.category_code, t.name as type, e.location, e.manufacturer, e.model, e.serial_number, e.manufactured_on::text, e.installed_on::text,
             e.status, e.last_action_on::text, e.next_action_on::text, x.agent, x.charge_value, x.charge_unit, x.efficacy, x.stamped_on::text, x.put_in_service_on::text, x.retimbrados_before,
             e.created_at, e.deleted_at
        from equipment e left join equipment_types t on t.id = e.type_id left join equipment_extinguishers x on x.equipment_id = e.id
       where e.organization_id = ${orgId} order by e.code`.execute(tx);
    sheet(
      "Equipos",
      [["id", "Id", 38], ["installation_id", "Id de la instalación", 38], ["code", "Código"], ["category_code", "Categoría"], ["type", "Tipo", 22], ["location", "Ubicación", 28], ["manufacturer", "Fabricante"], ["model", "Modelo"], ["serial_number", "Nº serie"], ["manufactured_on", "Fabricación"], ["installed_on", "Instalación"], ["status", "Estado"], ["last_action_on", "Última actuación"], ["next_action_on", "Próxima actuación"], ["agent", "Agente"], ["charge_value", "Capacidad"], ["charge_unit", "Unidad"], ["efficacy", "Eficacia"], ["stamped_on", "Timbrado"], ["put_in_service_on", "Puesta en servicio"], ["retimbrados_before", "Retimbrados previos"], ["created_at", "Alta", 22], ["deleted_at", "En la papelera desde", 22]],
      equipment,
    );
    const { rows: actions } = await sql<Record<string, unknown>>`
      select m.id, m.equipment_id, e.code, a.name as action, m.performed_on::text, m.result, m.observations, m.next_action_recommended_on::text, t.full_name as technician,
             w.number as work_order, m.amended_at, m.amendment_reason, m.voided_at, m.void_reason,
             (select string_agg(x.description || ' x' || x.quantity, '; ') from equipment_record_materials x where x.record_id = m.id) as materials, m.created_at
        from equipment_maintenance_records m join equipment e on e.id = m.equipment_id join maintenance_action_types a on a.id = m.action_type_id
        left join technicians t on t.id = m.technician_id left join work_orders w on w.id = m.work_order_id
       where m.organization_id = ${orgId} order by m.performed_on`.execute(tx);
    sheet(
      "Actuaciones",
      [["id", "Id", 38], ["equipment_id", "Id del equipo", 38], ["code", "Equipo"], ["action", "Operación", 30], ["performed_on", "Fecha"], ["result", "Resultado"], ["observations", "Observaciones", 40], ["materials", "Materiales", 30], ["next_action_recommended_on", "Próxima recomendada"], ["technician", "Técnico"], ["work_order", "Orden"], ["amended_at", "Corregida", 22], ["amendment_reason", "Motivo de corrección", 30], ["voided_at", "Anulada", 22], ["void_reason", "Motivo de anulación", 30], ["created_at", "Registrada", 22]],
      actions,
    );
    const { rows: orders } = await sql<Record<string, unknown>>`
      select w.number, w.status, w.service_type, w.customer_id, w.installation_id, w.scheduled_for::text, to_char(w.scheduled_time, 'HH24:MI') as scheduled_time, t.full_name as technician,
             w.description, w.completion_notes, w.started_at, w.completed_at, w.canceled_at, w.created_at
        from work_orders w left join technicians t on t.id = w.technician_id where w.organization_id = ${orgId} order by w.created_at`.execute(tx);
    sheet(
      "Órdenes de trabajo",
      [["number", "Número"], ["status", "Estado"], ["service_type", "Servicio"], ["customer_id", "Id del cliente", 38], ["installation_id", "Id de la instalación", 38], ["scheduled_for", "Fecha"], ["scheduled_time", "Hora"], ["technician", "Técnico"], ["description", "Descripción", 40], ["completion_notes", "Notas de cierre", 40], ["started_at", "Iniciada", 22], ["completed_at", "Finalizada", 22], ["canceled_at", "Cancelada", 22], ["created_at", "Creada", 22]],
      orders,
    );
    const { rows: incidents } = await sql<Record<string, unknown>>`
      select x.id, x.installation_id, x.equipment_id, x.title, x.description, x.severity, x.status, x.detected_on::text, x.resolved_on::text, x.resolution, x.created_at
        from equipment_incidents x where x.organization_id = ${orgId} order by x.detected_on`.execute(tx);
    sheet(
      "Incidencias",
      [["id", "Id", 38], ["installation_id", "Id de la instalación", 38], ["equipment_id", "Id del equipo", 38], ["title", "Incidencia", 30], ["description", "Descripción", 40], ["severity", "Gravedad"], ["status", "Estado"], ["detected_on", "Detectada"], ["resolved_on", "Resuelta"], ["resolution", "Resolución", 40], ["created_at", "Registrada", 22]],
      incidents,
    );
    const { rows: technicians } = await sql<Record<string, unknown>>`
      select full_name, phone, email::text, qualification_notes, active, created_at from technicians where organization_id = ${orgId} order by full_name`.execute(tx);
    sheet(
      "Técnicos",
      [["full_name", "Nombre", 28], ["phone", "Teléfono"], ["email", "Correo", 28], ["qualification_notes", "Notas de cualificación", 40], ["active", "Activo"], ["created_at", "Alta", 22]],
      technicians.map((t) => ({ ...t, active: t.active ? "sí" : "no" })),
    );
    // Etapa anterior (vehículos)
    const { rows: vehicles } = await sql<Record<string, unknown>>`
      select id, customer_id, plate, make, model, vin, status, current_km, last_service_date::text, last_service_km, next_service_date::text, next_service_km, created_at, deleted_at
        from vehicles where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Vehículos",
      [["id", "Id", 38], ["customer_id", "Id del cliente", 38], ["plate", "Matrícula"], ["make", "Marca"], ["model", "Modelo"], ["vin", "Bastidor", 22], ["status", "Estado"], ["current_km", "Km actuales"], ["last_service_date", "Última revisión"], ["last_service_km", "Km última revisión"], ["next_service_date", "Próxima revisión"], ["next_service_km", "Km próxima revisión"], ["created_at", "Alta", 22], ["deleted_at", "En la papelera desde", 22]],
      vehicles,
    );
    const { rows: history } = await sql<Record<string, unknown>>`
      select r.vehicle_id, v.plate, r.service_date::text, r.km, r.work_performed, r.notes, r.next_recommended_date::text, r.next_recommended_km,
             (select string_agg(p.description || ' x' || p.quantity, '; ') from maintenance_parts p where p.record_id = r.id) as parts
        from maintenance_records r join vehicles v on v.id = r.vehicle_id where r.organization_id = ${orgId} order by r.service_date`.execute(tx);
    sheet(
      "Historial",
      [["vehicle_id", "Id del vehículo", 38], ["plate", "Matrícula"], ["service_date", "Fecha"], ["km", "Km"], ["work_performed", "Trabajos", 40], ["parts", "Piezas", 30], ["notes", "Notas", 30], ["next_recommended_date", "Próxima (fecha)"], ["next_recommended_km", "Próxima (km)"]],
      history,
    );
    const { rows: appts } = await sql<Record<string, unknown>>`
      select id, status, source, service_type, installation_id, requester_address, requester_name, requester_email::text, requester_phone, plate_entered, requested_date::text, confirmed_start, confirmed_end, customer_message, created_at
        from appointments where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Visitas",
      [["id", "Id", 38], ["status", "Estado"], ["source", "Origen"], ["requester_name", "Nombre"], ["requester_email", "Correo", 28], ["requester_phone", "Teléfono"], ["service_type", "Servicio"], ["installation_id", "Id de la instalación", 38], ["requester_address", "Dirección indicada", 28], ["plate_entered", "Matrícula"], ["requested_date", "Día pedido"], ["confirmed_start", "Inicio", 22], ["confirmed_end", "Fin", 22], ["customer_message", "Mensaje", 40], ["created_at", "Creada", 22]],
      appts,
    );
    const { rows: quotes } = await sql<Record<string, unknown>>`
      select number, status, customer_id, issue_date::text, valid_until::text, subtotal, tax_total, total, created_at from quotes where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Presupuestos",
      [["number", "Número"], ["status", "Estado"], ["customer_id", "Id del cliente", 38], ["issue_date", "Fecha"], ["valid_until", "Válido hasta"], ["subtotal", "Base"], ["tax_total", "IVA"], ["total", "Total"], ["created_at", "Creado", 22]],
      quotes,
    );
  });
  await logRequest(ctx, null, "portability", "Exportación de todos los datos de la empresa (Excel)");
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface DataRequestRow {
  type: string;
  status: string;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

export async function listDataRequests(ctx: Ctx): Promise<DataRequestRow[]> {
  assertAdmin(ctx);
  const rows = await withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("data_subject_requests")
      .select(["type", "status", "notes", "completed_at", "created_at"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .orderBy("created_at", "desc")
      .limit(50)
      .execute(),
  );
  return rows.map((r) => ({ type: r.type, status: r.status, notes: r.notes, completedAt: r.completed_at, createdAt: r.created_at }));
}
