import "server-only";

import { sql } from "kysely";

import { addDays, isValidIsoDate, todayIn } from "@/lib/dates";
import { PAGE_SIZE, type Page } from "@/lib/pagination";
import { INCIDENT_STATUS_LABELS, RESULT_LABELS, SEVERITY_LABELS } from "@/lib/pci/labels";
import { planHasFeature } from "@/lib/plans";
import type { SubscriptionState } from "@/server/auth/context";
import { type AuthContext, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";

/**
 * Informes (plan Max, PDF: «clientes que no han vuelto, revisiones pendientes
 * y correos enviados») y contadores básicos para todos los planes (P16).
 * El control de acceso lo hacen las funciones SQL (app.report_*): taller del
 * usuario, funcionalidad 'reports' y sucursales con el permiso 'reports.read'.
 */

type Ctx = { auth: AuthContext; membership: { organizationId: string }; subscription: SubscriptionState };

export interface ReportRange {
  from: string;
  to: string;
  branchId: string | null;
}

export const MAX_RANGE_DAYS = 731;

/** Lee el periodo de la URL; por defecto, los últimos 90 días. */
export function parseRange(input: { desde?: string; hasta?: string; sucursal?: string }, today = todayIn()): ReportRange {
  const to = input.hasta && isValidIsoDate(input.hasta) ? input.hasta : today;
  let from = input.desde && isValidIsoDate(input.desde) ? input.desde : addDays(to, -89);
  if (from > to) from = to;
  if (addDays(from, MAX_RANGE_DAYS) < to) from = addDays(to, -MAX_RANGE_DAYS);
  const branchId = input.sucursal && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.sucursal) ? input.sucursal : null;
  return { from, to, branchId };
}

export function reportsAvailable(ctx: Ctx): boolean {
  return Boolean(ctx.subscription.active && ctx.subscription.planCode && planHasFeature(ctx.subscription.planCode, "reports"));
}

export interface MonthPoint {
  month: string;
  reminders: number;
  returned: number;
  appointments: number;
  emails: number;
}

export interface ReportSummary {
  remindersSent: number;
  remindersBounced: number;
  vehiclesReminded: number;
  vehiclesReturned: number;
  appointmentsRequested: number;
  appointmentsFromReminders: number;
  appointmentsConfirmed: number;
  appointmentsCompleted: number;
  emailsByKind: Record<string, number>;
  emailsTotal: number;
  emailsDelivered: number;
  emailsBounced: number;
  emailsComplained: number;
  emailsFailed: number;
  months: MonthPoint[];
}

export async function getSummary(ctx: Ctx, r: ReportRange): Promise<ReportSummary> {
  const orgId = ctx.membership.organizationId;
  const raw = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ s: Record<string, unknown> }>`select app.report_summary(${orgId}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid) as s`.execute(tx);
    return rows[0].s;
  });
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    remindersSent: n("reminders_sent"),
    remindersBounced: n("reminders_bounced"),
    vehiclesReminded: n("vehicles_reminded"),
    vehiclesReturned: n("vehicles_returned"),
    appointmentsRequested: n("appointments_requested"),
    appointmentsFromReminders: n("appointments_from_reminders"),
    appointmentsConfirmed: n("appointments_confirmed"),
    appointmentsCompleted: n("appointments_completed"),
    emailsByKind: Object.fromEntries(Object.entries((raw.emails as Record<string, number>) ?? {}).map(([k, v]) => [k, Number(v)])),
    emailsTotal: n("emails_total"),
    emailsDelivered: n("emails_delivered"),
    emailsBounced: n("emails_bounced"),
    emailsComplained: n("emails_complained"),
    emailsFailed: n("emails_failed"),
    months: ((raw.months as MonthPoint[]) ?? []).map((m) => ({
      month: m.month,
      reminders: Number(m.reminders),
      returned: Number(m.returned),
      appointments: Number(m.appointments),
      emails: Number(m.emails),
    })),
  };
}

export interface NotReturnedRow {
  vehicleId: string;
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  plate: string;
  vehicle: string | null;
  nextServiceDate: string | null;
  lastReminderOn: string;
  daysSince: number;
}

export interface PendingServiceRow {
  vehicleId: string;
  customerId: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  plate: string;
  vehicle: string | null;
  nextServiceDate: string;
  overdue: boolean;
  lastReminderOn: string | null;
}

export interface EmailRow {
  sentAt: Date;
  kind: string;
  toEmail: string;
  subject: string;
  status: string;
  plate: string | null;
}

type Paging = { page: number; pageSize?: number };

const dateText = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d as string | null));

function paged<T>(rows: (T & { total: string | number })[], page: number, pageSize: number): Page<T> {
  const total = rows.length ? Number(rows[0].total) : 0;
  return { rows: rows.map(({ total: _t, ...rest }) => rest as unknown as T), total, page, pageSize };
}

export async function notReturned(ctx: Ctx, r: ReportRange, p: Paging): Promise<Page<NotReturnedRow>> {
  const size = p.pageSize ?? PAGE_SIZE;
  const rows = await withRls(ctx.auth, async (tx) =>
    (
      await sql<Record<string, unknown> & { total: string }>`
        select * from app.report_not_returned(${ctx.membership.organizationId}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid, ${size}, ${(p.page - 1) * size})
      `.execute(tx)
    ).rows,
  );
  return paged(
    rows.map((x) => ({
      vehicleId: x.vehicle_id as string,
      customerId: x.customer_id as string,
      customerName: x.customer_name as string,
      email: x.email as string | null,
      phone: x.phone as string | null,
      plate: x.plate as string,
      vehicle: x.vehicle as string | null,
      nextServiceDate: dateText(x.next_service_date),
      lastReminderOn: dateText(x.last_reminder_on)!,
      daysSince: Number(x.days_since),
      total: x.total,
    })),
    p.page,
    size,
  );
}

export async function pendingServices(ctx: Ctx, until: string, branchId: string | null, p: Paging): Promise<Page<PendingServiceRow>> {
  const size = p.pageSize ?? PAGE_SIZE;
  const rows = await withRls(ctx.auth, async (tx) =>
    (
      await sql<Record<string, unknown> & { total: string }>`
        select * from app.report_pending_services(${ctx.membership.organizationId}::uuid, ${until}::date, ${branchId}::uuid, ${size}, ${(p.page - 1) * size})
      `.execute(tx)
    ).rows,
  );
  return paged(
    rows.map((x) => ({
      vehicleId: x.vehicle_id as string,
      customerId: x.customer_id as string,
      customerName: x.customer_name as string,
      email: x.email as string | null,
      phone: x.phone as string | null,
      plate: x.plate as string,
      vehicle: x.vehicle as string | null,
      nextServiceDate: dateText(x.next_service_date)!,
      overdue: Boolean(x.overdue),
      lastReminderOn: dateText(x.last_reminder_on),
      total: x.total,
    })),
    p.page,
    size,
  );
}

export async function emailsSent(ctx: Ctx, r: ReportRange, p: Paging): Promise<Page<EmailRow>> {
  const size = p.pageSize ?? PAGE_SIZE;
  const rows = await withRls(ctx.auth, async (tx) =>
    (
      await sql<Record<string, unknown> & { total: string }>`
        select * from app.report_emails(${ctx.membership.organizationId}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid, ${size}, ${(p.page - 1) * size})
      `.execute(tx)
    ).rows,
  );
  return paged(
    rows.map((x) => ({
      sentAt: x.sent_at as Date,
      kind: x.kind as string,
      toEmail: x.to_email as string,
      subject: x.subject as string,
      status: x.status as string,
      plate: x.plate as string | null,
      total: x.total,
    })),
    p.page,
    size,
  );
}

export interface DashboardActivity {
  remindersSent30d: number;
  appointments30d: number;
  returned30d: number;
}

/** Contadores básicos del inicio (todos los planes, P16). */
export async function dashboardActivity(ctx: Pick<Ctx, "auth" | "membership">): Promise<DashboardActivity> {
  const raw = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ s: Record<string, number> }>`select app.dashboard_activity(${ctx.membership.organizationId}::uuid) as s`.execute(tx);
    return rows[0].s;
  });
  return { remindersSent30d: Number(raw.reminders_sent_30d), appointments30d: Number(raw.appointments_30d), returned30d: Number(raw.returned_30d) };
}

export const REPORT_KINDS = ["no-han-vuelto", "revisiones-pendientes", "correos"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** Filas para exportar a CSV (máx. 5000, el límite de las funciones SQL). */
export async function exportRows(ctx: Ctx, kind: ReportKind, r: ReportRange, until: string): Promise<unknown[][]> {
  const all = { page: 1, pageSize: 5000 };
  if (kind === "no-han-vuelto") {
    const page = await notReturned(ctx, r, all);
    return [
      ["Cliente", "Correo", "Teléfono", "Matrícula", "Vehículo", "Último aviso", "Días desde el aviso", "Próxima revisión"],
      ...page.rows.map((x) => [x.customerName, x.email, x.phone, x.plate, x.vehicle, x.lastReminderOn, x.daysSince, x.nextServiceDate]),
    ];
  }
  if (kind === "revisiones-pendientes") {
    const page = await pendingServices(ctx, until, r.branchId, all);
    return [
      ["Cliente", "Correo", "Teléfono", "Matrícula", "Vehículo", "Próxima revisión", "Vencida", "Último aviso"],
      ...page.rows.map((x) => [x.customerName, x.email, x.phone, x.plate, x.vehicle, x.nextServiceDate, x.overdue ? "sí" : "no", x.lastReminderOn]),
    ];
  }
  if (kind === "correos") {
    const page = await emailsSent(ctx, r, all);
    return [
      ["Fecha", "Tipo", "Destinatario", "Asunto", "Estado", "Matrícula"],
      ...page.rows.map((x) => [x.sentAt.toISOString(), EMAIL_KIND_LABELS[x.kind] ?? x.kind, x.toEmail, x.subject, EMAIL_STATUS_LABELS[x.status] ?? x.status, x.plate]),
    ];
  }
  throw new DomainError("not_found");
}

export const EMAIL_KIND_LABELS: Record<string, string> = {
  reminder: "Aviso de mantenimiento",
  booking_received: "Solicitud de visita recibida",
  booking_request: "Aviso de solicitud a la empresa",
  booking_confirmed: "Visita confirmada",
  booking_rejected: "Visita rechazada",
  booking_rescheduled: "Visita cambiada",
  booking_canceled: "Visita cancelada",
  quote: "Presupuesto",
  service_completed: "Servicio realizado",
  incident_detected: "Incidencia detectada",
  report_sent: "Envío de informe",
  test: "Correo de prueba",
};
export const EMAIL_STATUS_LABELS: Record<string, string> = {
  accepted: "Enviado",
  delivered: "Entregado",
  delivery_delayed: "Retrasado",
  bounced: "Rebotado",
  complained: "Marcado como spam",
  failed: "Fallido",
};

// =============================================================== informes PCI

export interface PciSummary {
  equipmentTotal: number;
  byCategory: Array<{ code: string; name: string; count: number }>;
  records: number;
  recordsNonCompliant: number;
  byAction: Array<{ name: string; count: number }>;
  overdue: number;
  due30d: number;
  incidentsOpened: number;
  incidentsOpen: number;
  workOrdersCompleted: number;
  technicians: Array<{ name: string; records: number; workOrders: number }>;
}

export async function getPciSummary(ctx: Ctx, r: ReportRange): Promise<PciSummary> {
  const raw = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<{ s: Record<string, unknown> }>`select app.pci_report_summary(${ctx.membership.organizationId}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid) as s`.execute(tx);
    return rows[0].s;
  });
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    equipmentTotal: n("equipment_total"),
    byCategory: ((raw.by_category as PciSummary["byCategory"]) ?? []).map((c) => ({ ...c, count: Number(c.count) })),
    records: n("records"),
    recordsNonCompliant: n("records_non_compliant"),
    byAction: ((raw.by_action as PciSummary["byAction"]) ?? []).map((c) => ({ ...c, count: Number(c.count) })),
    overdue: n("overdue"),
    due30d: n("due_30d"),
    incidentsOpened: n("incidents_opened"),
    incidentsOpen: n("incidents_open"),
    workOrdersCompleted: n("work_orders_completed"),
    technicians: ((raw.technicians as Array<{ name: string; records: number; work_orders: number }>) ?? []).map((t) => ({ name: t.name, records: Number(t.records), workOrders: Number(t.work_orders) })),
  };
}

export const PCI_REPORT_KINDS = ["vencimientos", "mantenimientos", "instalaciones", "incidencias"] as const;
export type PciReportKind = (typeof PCI_REPORT_KINDS)[number];

type Row = Record<string, unknown> & { total: string };
/** Columnas de recuento (PostgreSQL devuelve bigint como texto). */
const COUNT_KEYS = new Set(["equipment", "extinguishers", "overdue", "due", "open_incidents"]);
const dt = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

/** Listado de un informe PCI (paginado; con pageSize 5000 para el CSV). */
export async function pciReportRows(ctx: Ctx, kind: PciReportKind, r: ReportRange, until: string, p: Paging): Promise<Page<Record<string, unknown>>> {
  const size = p.pageSize ?? PAGE_SIZE;
  const off = (p.page - 1) * size;
  const org = ctx.membership.organizationId;
  const rows = await withRls(ctx.auth, async (tx) => {
    const q =
      kind === "vencimientos"
        ? sql<Row>`select * from app.pci_report_due(${org}::uuid, ${until}::date, ${r.branchId}::uuid, ${size}, ${off})`
        : kind === "mantenimientos"
          ? sql<Row>`select * from app.pci_report_records(${org}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid, ${size}, ${off})`
          : kind === "instalaciones"
            ? sql<Row>`select * from app.pci_report_installations(${org}::uuid, ${until}::date, ${r.branchId}::uuid, ${size}, ${off})`
            : sql<Row>`select * from app.pci_report_incidents(${org}::uuid, ${r.from}::date, ${r.to}::date, ${r.branchId}::uuid, ${size}, ${off})`;
    return (await q.execute(tx)).rows;
  });
  return {
    rows: rows.map(({ total: _t, ...rest }) => Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v instanceof Date ? dt(v) : COUNT_KEYS.has(k) ? Number(v) : v]))),
    total: rows.length ? Number(rows[0].total) : 0,
    page: p.page,
    pageSize: size,
  };
}

export const PCI_REPORT_COLUMNS: Record<PciReportKind, Array<[string, string]>> = {
  vencimientos: [["code", "Equipo"], ["category", "Categoría"], ["location", "Ubicación"], ["installation", "Instalación"], ["customer", "Cliente"], ["action", "Operación"], ["next_due_on", "Fecha prevista"], ["overdue", "Vencida"]],
  mantenimientos: [["performed_on", "Fecha"], ["code", "Equipo"], ["category", "Categoría"], ["installation", "Instalación"], ["customer", "Cliente"], ["action", "Operación"], ["result", "Resultado"], ["technician", "Técnico"], ["work_order", "Orden"]],
  instalaciones: [["installation", "Instalación"], ["customer", "Cliente"], ["city", "Municipio"], ["equipment", "Equipos"], ["extinguishers", "Extintores"], ["overdue", "Vencidos"], ["due", "Próximos"], ["next_due_on", "Próxima actuación"], ["open_incidents", "Incidencias abiertas"]],
  incidencias: [["detected_on", "Fecha"], ["severity", "Gravedad"], ["status", "Estado"], ["title", "Incidencia"], ["installation", "Instalación"], ["equipment", "Equipo"], ["resolved_on", "Resuelta"]],
};

export async function pciExportRows(ctx: Ctx, kind: PciReportKind, r: ReportRange, until: string): Promise<unknown[][]> {
  const page = await pciReportRows(ctx, kind, r, until, { page: 1, pageSize: 5000 });
  const headers = PCI_REPORT_COLUMNS[kind];
  return [headers.map(([, h]) => h), ...page.rows.map((row) => headers.map(([k]) => pciCellLabel(k, row[k])))];
}

/** Valor legible de una celda de informe PCI (CSV y pantalla). */
export function pciCellLabel(k: string, v: unknown): unknown {
  return typeof v === "boolean" ? (v ? "sí" : "no")
    : k === "result" ? (RESULT_LABELS[v as keyof typeof RESULT_LABELS] ?? v)
    : k === "severity" ? (SEVERITY_LABELS[v as keyof typeof SEVERITY_LABELS] ?? v)
    : k === "status" ? (INCIDENT_STATUS_LABELS[v as keyof typeof INCIDENT_STATUS_LABELS] ?? v)
    : v;
}
