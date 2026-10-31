import { z } from "zod";
import { CustomerEmailStatus, CustomerSource, EventSource, RequestStatus, type Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AppError, notFound } from "../http/errors";
import { isValidEmail, normalizeEmailAddress } from "@/lib/email";
import { parseCsv, parseFlexibleDate } from "@/lib/csv";
import { audit } from "./audit";
import { createReviewRequest, type CreateRequestResult } from "./automation/requests";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(isValidEmail, "Correo electrónico no válido"),
  phone: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  serviceName: z.string().trim().max(160).optional().nullable().transform((v) => v || null),
  completedAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  externalId: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export async function listCustomers(
  businessId: string,
  q: { search?: string; status?: RequestStatus; tag?: string; page?: number; pageSize?: number },
) {
  const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const where: Prisma.CustomerWhereInput = {
    businessId,
    ...(q.status ? { lastRequestStatus: q.status } : {}),
    ...(q.tag ? { tags: { has: q.tag } } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" } },
            { email: { contains: q.search.toLowerCase() } },
            { serviceName: { contains: q.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.customer.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getCustomer(businessId: string, id: string) {
  const c = await prisma.customer.findFirst({
    where: { id, businessId },
    include: {
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, status: true, statusReason: true, subject: true, scheduledFor: true, sentAt: true, createdAt: true, clickCount: true, lastError: true },
      },
    },
  });
  if (!c) throw notFound("Cliente");
  return c;
}

export async function createCustomer(businessId: string, userId: string, input: CustomerInput, opts: { requestReview?: boolean; sendNow?: boolean; tagsAllowed: boolean }, req?: Request) {
  const email = normalizeEmailAddress(input.email);
  const dup = await prisma.customer.findUnique({ where: { businessId_email: { businessId, email } } });
  if (dup) throw new AppError("CONFLICT", "Ya tienes un cliente con ese correo electrónico.", { details: { existingId: dup.id } });
  const customer = await prisma.customer.create({
    data: { ...input, tags: opts.tagsAllowed ? (input.tags ?? []) : [], email, businessId, source: CustomerSource.MANUAL },
  });
  await audit({ action: "customer.created", userId, businessId, targetId: customer.id, req });
  let request: CreateRequestResult | null = null;
  if (opts.requestReview) {
    request = await createReviewRequest(businessId, {
      customerId: customer.id,
      source: EventSource.MANUAL,
      serviceName: customer.serviceName,
      completedAt: customer.completedAt,
      sendNow: opts.sendNow,
    });
  }
  return { customer, request };
}

export async function updateCustomer(businessId: string, userId: string, id: string, input: Partial<CustomerInput>, tagsAllowed: boolean, req?: Request) {
  const c = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!c) throw notFound("Cliente");
  const data: Prisma.CustomerUpdateInput = { ...input, ...(tagsAllowed ? {} : { tags: undefined }) };
  if (input.email) {
    const email = normalizeEmailAddress(input.email);
    if (email !== c.email) {
      const dup = await prisma.customer.findUnique({ where: { businessId_email: { businessId, email } } });
      if (dup) throw new AppError("CONFLICT", "Ya tienes otro cliente con ese correo.");
      data.email = email;
      data.emailStatus = CustomerEmailStatus.VALID; // nueva dirección → se vuelve a permitir
    }
  }
  const updated = await prisma.customer.update({ where: { id: c.id }, data });
  await audit({ action: "customer.updated", userId, businessId, targetId: id, req });
  return updated;
}

export async function deleteCustomer(businessId: string, userId: string, id: string, req?: Request) {
  const res = await prisma.customer.deleteMany({ where: { id, businessId } });
  if (!res.count) throw notFound("Cliente");
  await audit({ action: "customer.deleted", userId, businessId, targetId: id, req });
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["nombre", "name", "cliente", "nombre cliente", "nombre_cliente", "full name"],
  email: ["email", "correo", "e-mail", "correo electronico", "correo electrónico", "mail"],
  serviceName: ["servicio", "producto", "service", "product", "nombre_servicio", "servicio/producto"],
  completedAt: ["fecha", "fecha finalizacion", "fecha finalización", "fecha_finalizacion", "completed_at", "date", "finalizado"],
  phone: ["telefono", "teléfono", "phone", "movil", "móvil"],
  notes: ["notas", "notes", "observaciones"],
  tags: ["etiquetas", "tags"],
  externalId: ["id", "external_id", "id externo", "referencia"],
};

function mapHeaders(header: string[]) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(norm) && idx[key] === undefined) idx[key] = i;
  });
  return idx;
}

export type ImportReport = {
  totalRows: number;
  created: number;
  updated: number;
  duplicatesInFile: number;
  invalid: { row: number; reason: string }[];
  requests?: { created: number; skipped: number; rejected: number; reasons: Record<string, number> };
};

export const MAX_IMPORT_ROWS = 2000;

/** Importación CSV con validación por fila, detección de duplicados y, opcionalmente, generación de solicitudes. */
export async function importCustomersCsv(
  businessId: string,
  userId: string,
  csv: string,
  opts: { createRequests: boolean; tagsAllowed: boolean },
  req?: Request,
): Promise<ImportReport> {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new AppError("VALIDATION", "El archivo está vacío o solo contiene la cabecera.");
  const idx = mapHeaders(rows[0]);
  if (idx.email === undefined || idx.name === undefined)
    throw new AppError("VALIDATION", "El CSV debe tener al menos las columnas «nombre» y «email».");
  const data = rows.slice(1);
  if (data.length > MAX_IMPORT_ROWS) throw new AppError("VALIDATION", `Máximo ${MAX_IMPORT_ROWS} filas por importación.`);

  const report: ImportReport = { totalRows: data.length, created: 0, updated: 0, duplicatesInFile: 0, invalid: [] };
  const seen = new Set<string>();
  const toRequest: { id: string; serviceName: string | null; completedAt: Date | null; externalId: string | null }[] = [];
  const cell = (r: string[], k: string) => (idx[k] !== undefined ? (r[idx[k]] ?? "").trim() : "");

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowNo = i + 2;
    const email = normalizeEmailAddress(cell(r, "email"));
    const name = cell(r, "name");
    if (!name) {
      report.invalid.push({ row: rowNo, reason: "Falta el nombre" });
      continue;
    }
    if (!isValidEmail(email)) {
      report.invalid.push({ row: rowNo, reason: `Email no válido: «${email.slice(0, 60)}»` });
      continue;
    }
    if (seen.has(email)) {
      report.duplicatesInFile++;
      continue;
    }
    seen.add(email);
    const rawDate = cell(r, "completedAt");
    const completedAt = rawDate ? parseFlexibleDate(rawDate) : null;
    if (rawDate && !completedAt) {
      report.invalid.push({ row: rowNo, reason: `Fecha no reconocida: «${rawDate.slice(0, 30)}» (usa AAAA-MM-DD o DD/MM/AAAA)` });
      continue;
    }
    const serviceName = cell(r, "serviceName").slice(0, 160) || null;
    const tags = opts.tagsAllowed ? cell(r, "tags").split(/[|,]/).map((t) => t.trim()).filter(Boolean).slice(0, 10) : [];
    const externalId = cell(r, "externalId").slice(0, 120) || null;
    const base = {
      name: name.slice(0, 120),
      phone: cell(r, "phone").slice(0, 30) || null,
      notes: cell(r, "notes").slice(0, 2000) || null,
      serviceName,
      completedAt,
    };
    const existing = await prisma.customer.findUnique({ where: { businessId_email: { businessId, email } } });
    let id: string;
    if (existing) {
      const upd = await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: base.name,
          ...(serviceName ? { serviceName } : {}),
          ...(completedAt ? { completedAt } : {}),
          ...(tags.length ? { tags } : {}),
        },
      });
      id = upd.id;
      report.updated++;
    } else {
      const c = await prisma.customer.create({ data: { ...base, email, tags, businessId, source: CustomerSource.CSV, externalId } });
      id = c.id;
      report.created++;
    }
    toRequest.push({ id, serviceName, completedAt, externalId });
  }

  if (opts.createRequests) {
    const summary = { created: 0, skipped: 0, rejected: 0, reasons: {} as Record<string, number> };
    for (const t of toRequest) {
      const res = await createReviewRequest(businessId, {
        customerId: t.id,
        source: EventSource.CSV,
        serviceName: t.serviceName,
        completedAt: t.completedAt,
        externalId: t.externalId ? `csv:${t.externalId}` : null,
      });
      if (res.status === "CREATED") summary.created++;
      else if (res.status === "REJECTED") summary.rejected++;
      else summary.skipped++;
      if (res.reason) summary.reasons[res.reason] = (summary.reasons[res.reason] ?? 0) + 1;
    }
    report.requests = summary;
  }
  await audit({ action: "customer.csv_import", userId, businessId, meta: { ...report, invalid: report.invalid.length } as unknown as Prisma.InputJsonValue, req });
  return report;
}

/** Baja voluntaria del destinatario (enlace del pie del correo). */
export async function unsubscribeByToken(publicToken: string) {
  const job = await prisma.emailJob.findUnique({ where: { publicToken }, include: { customer: true, business: true } });
  if (!job) return null;
  if (!job.customer.unsubscribedAt) {
    await prisma.customer.update({ where: { id: job.customerId }, data: { unsubscribedAt: new Date() } });
    await prisma.emailLog.create({ data: { emailJobId: job.id, businessId: job.businessId, event: "UNSUBSCRIBED", message: "El destinatario se dio de baja." } });
    // Cancela cualquier envío pendiente a este cliente.
    await prisma.emailJob.updateMany({
      where: { customerId: job.customerId, status: { in: ["SCHEDULED", "QUEUED", "ON_HOLD"] } },
      data: { status: "BLOCKED", statusReason: "UNSUBSCRIBED" },
    });
  }
  return { businessName: job.business.name };
}
