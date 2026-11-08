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
      .select(["id", "first_name", "last_name", sql<string | null>`email::text`.as("email"), "phone", "source", "notes", "reminders_opt_out", "opted_out_at", "created_at", "updated_at"])
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

/** Exportación de todo el taller en un Excel (portabilidad del responsable; también en solo lectura). */
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
      select id, branch_id, first_name, last_name, email::text, phone, source, notes, reminders_opt_out, created_at, deleted_at
        from customers where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Clientes",
      [["id", "Id", 38], ["branch", "Taller"], ["first_name", "Nombre"], ["last_name", "Apellidos"], ["email", "Correo", 28], ["phone", "Teléfono"], ["source", "Origen"], ["notes", "Notas", 30], ["reminders_opt_out", "Sin avisos"], ["created_at", "Alta", 22], ["deleted_at", "En la papelera desde", 22]],
      customers.map((c) => ({ ...c, branch: branchName.get(c.branch_id as string), reminders_opt_out: c.reminders_opt_out ? "sí" : "no" })),
    );
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
      select id, status, source, requester_name, requester_email::text, requester_phone, plate_entered, requested_date::text, confirmed_start, confirmed_end, customer_message, created_at
        from appointments where organization_id = ${orgId} order by created_at`.execute(tx);
    sheet(
      "Citas",
      [["id", "Id", 38], ["status", "Estado"], ["source", "Origen"], ["requester_name", "Nombre"], ["requester_email", "Correo", 28], ["requester_phone", "Teléfono"], ["plate_entered", "Matrícula"], ["requested_date", "Día pedido"], ["confirmed_start", "Inicio", 22], ["confirmed_end", "Fin", 22], ["customer_message", "Mensaje", 40], ["created_at", "Creada", 22]],
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
  await logRequest(ctx, null, "portability", "Exportación de todos los datos del taller (Excel)");
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
