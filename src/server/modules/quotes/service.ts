import "server-only";

import { sql } from "kysely";

import { addDays, todayIn } from "@/lib/dates";
import { escapeLike, type Page } from "@/lib/pagination";
import { planHasFeature } from "@/lib/plans";
import { lineAmounts, quoteTotals } from "@/lib/quotes/money";
import type { QuoteInput, QuoteLine } from "@/lib/validation/quotes";
import type { OrgContext } from "@/server/auth/context";
import { type Tx, withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import type { ServiceCtx } from "@/server/modules/branches/service";

/**
 * Presupuestos (permiso 'quotes.manage', RLS). Importes calculados con
 * decimal.js y VERIFICADOS por la base de datos al confirmar la transacción;
 * numeración P-AAAA-NNNN por sucursal sin duplicados en concurrencia. Solo los
 * borradores se pueden editar.
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
  const plan = ctx.subscription.planCode;
  if (!plan || !planHasFeature(plan, "quotes_pdf")) throw new DomainError("feature_unavailable", "quotes_pdf");
}

export interface QuoteRow {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  validUntil: string;
  total: string;
  customerId: string;
  customerName: string;
  plate: string | null;
}

export async function listQuotes(ctx: Ctx, f: { status?: string; q?: string; page: number; pageSize: number }): Promise<Page<QuoteRow>> {
  const like = f.q ? `%${escapeLike(f.q.trim().toLowerCase())}%` : null;
  return withRls(ctx.auth, async (tx) => {
    let query = tx
      .selectFrom("quotes as q")
      .innerJoin("customers as c", "c.id", "q.customer_id")
      .leftJoin("vehicles as v", "v.id", "q.vehicle_id")
      .where("q.organization_id", "=", ctx.membership.organizationId);
    if (f.status) query = query.where("q.status", "=", f.status);
    if (like) {
      query = query.where((eb) =>
        eb.or([
          eb(sql`lower(q.number)`, "like", like),
          eb(sql`lower(c.first_name || ' ' || c.last_name)`, "like", like),
          eb(sql`lower(coalesce(v.plate, ''))`, "like", like),
        ]),
      );
    }
    const rows = await query
      .select([
        "q.id",
        "q.number",
        "q.status",
        sql<string>`q.issue_date::text`.as("issueDate"),
        sql<string>`q.valid_until::text`.as("validUntil"),
        "q.total",
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        "v.plate",
        sql<string>`count(*) over ()`.as("count"),
      ])
      .orderBy("q.issue_date", "desc")
      .orderBy("q.sequence", "desc")
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize)
      .execute();
    return { rows: rows.map(({ count: _c, ...r }) => r), total: rows.length ? Number(rows[0].count) : 0, page: f.page, pageSize: f.pageSize };
  });
}

export interface QuoteDetail {
  id: string;
  number: string;
  status: string;
  branchId: string;
  issueDate: string;
  validUntil: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  pdfPath: string | null;
  sentAt: Date | null;
  decidedAt: Date | null;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  vehicle: { id: string; plate: string; name: string | null; km: number | null } | null;
  items: Array<{ position: number; description: string; quantity: string; unitPrice: string; taxRate: string; lineSubtotal: string; lineTax: string; lineTotal: string }>;
  snapshot: QuoteSnapshot | null;
}

export async function getQuote(ctx: Pick<Ctx, "auth" | "membership">, id: string): Promise<QuoteDetail | null> {
  return withRls(ctx.auth, async (tx) => {
    const q = await tx
      .selectFrom("quotes as q")
      .innerJoin("customers as c", "c.id", "q.customer_id")
      .leftJoin("vehicles as v", "v.id", "q.vehicle_id")
      .select([
        "q.id",
        "q.number",
        "q.status",
        "q.branch_id as branchId",
        sql<string>`q.issue_date::text`.as("issueDate"),
        sql<string>`q.valid_until::text`.as("validUntil"),
        "q.subtotal",
        "q.tax_total as taxTotal",
        "q.total",
        "q.notes",
        "q.pdf_path as pdfPath",
        "q.sent_at as sentAt",
        "q.decided_at as decidedAt",
        "q.snapshot",
        "c.id as customerId",
        sql<string>`trim(c.first_name || ' ' || c.last_name)`.as("customerName"),
        sql<string | null>`c.email::text`.as("customerEmail"),
        "c.phone as customerPhone",
        "v.id as vehicleId",
        "v.plate",
        sql<string | null>`nullif(trim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '')`.as("vehicleName"),
        "v.current_km as km",
      ])
      .where("q.organization_id", "=", ctx.membership.organizationId)
      .where("q.id", "=", id)
      .executeTakeFirst();
    if (!q) return null;
    const items = await tx
      .selectFrom("quote_items")
      .select([
        "position",
        "description",
        "quantity",
        "unit_price as unitPrice",
        "tax_rate as taxRate",
        "line_subtotal as lineSubtotal",
        "line_tax as lineTax",
        "line_total as lineTotal",
      ])
      .where("quote_id", "=", id)
      .orderBy("position")
      .execute();
    return {
      id: q.id,
      number: q.number,
      status: q.status,
      branchId: q.branchId,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      total: q.total,
      notes: q.notes,
      pdfPath: q.pdfPath,
      sentAt: q.sentAt,
      decidedAt: q.decidedAt,
      customer: { id: q.customerId, name: q.customerName, email: q.customerEmail, phone: q.customerPhone },
      vehicle: q.vehicleId ? { id: q.vehicleId, plate: q.plate!, name: q.vehicleName, km: q.km } : null,
      items,
      snapshot: (q.snapshot as unknown as QuoteSnapshot | null) ?? null,
    };
  });
}

async function insertItems(tx: Tx, orgId: string, branchId: string, quoteId: string, items: QuoteLine[]) {
  await tx
    .insertInto("quote_items")
    .values(
      items.map((it, i) => {
        const a = lineAmounts(it);
        return {
          organization_id: orgId,
          branch_id: branchId,
          quote_id: quoteId,
          position: i + 1,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          tax_rate: String(it.taxRate),
          line_subtotal: a.subtotal,
          line_tax: a.tax,
          line_total: a.total,
        };
      }),
    )
    .execute();
}

async function customerBranch(tx: Tx, ctx: Ctx, customerId: string, vehicleId: string | null): Promise<string> {
  const c = await tx
    .selectFrom("customers")
    .select("branch_id")
    .where("organization_id", "=", ctx.membership.organizationId)
    .where("id", "=", customerId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!c) throw new DomainError("not_found");
  if (vehicleId) {
    const v = await tx.selectFrom("vehicles").select("id").where("id", "=", vehicleId).where("customer_id", "=", customerId).where("deleted_at", "is", null).executeTakeFirst();
    if (!v) throw new DomainError("integrity_violation", "owner_other_branch");
  }
  return c.branch_id;
}

export async function createQuote(ctx: Ctx, input: QuoteInput): Promise<string> {
  assertWritable(ctx);
  const totals = quoteTotals(input.items);
  return withRls(ctx.auth, async (tx) => {
    const branchId = await customerBranch(tx, ctx, input.customerId, input.vehicleId);
    const row = await tx
      .insertInto("quotes")
      .values({
        organization_id: ctx.membership.organizationId,
        branch_id: branchId,
        customer_id: input.customerId,
        vehicle_id: input.vehicleId,
        issue_date: input.issueDate,
        valid_until: input.validUntil,
        status: "draft",
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        notes: input.notes,
        created_by: ctx.auth.userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await insertItems(tx, ctx.membership.organizationId, branchId, row.id, input.items);
    return row.id;
  });
}

export async function updateQuote(ctx: Ctx, id: string, input: QuoteInput): Promise<void> {
  assertWritable(ctx);
  const totals = quoteTotals(input.items);
  await withRls(ctx.auth, async (tx) => {
    const current = await tx
      .selectFrom("quotes")
      .select(["status", "branch_id"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw new DomainError("not_found");
    if (current.status !== "draft") throw new DomainError("validation_error", "quote_not_editable");
    const branchId = await customerBranch(tx, ctx, input.customerId, input.vehicleId);
    if (branchId !== current.branch_id) throw new DomainError("integrity_violation", "owner_other_branch");
    await tx.deleteFrom("quote_items").where("quote_id", "=", id).execute();
    await tx
      .updateTable("quotes")
      .set({
        customer_id: input.customerId,
        vehicle_id: input.vehicleId,
        issue_date: input.issueDate,
        valid_until: input.validUntil,
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        notes: input.notes,
      })
      .where("id", "=", id)
      .execute();
    await insertItems(tx, ctx.membership.organizationId, current.branch_id, id, input.items);
  });
}

export async function deleteDraft(ctx: Ctx, id: string): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    // RLS: solo administradores y solo borradores.
    const res = await tx.deleteFrom("quotes").where("organization_id", "=", ctx.membership.organizationId).where("id", "=", id).where("status", "=", "draft").executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw new DomainError("not_found");
  });
}

export async function setDecision(ctx: Ctx, id: string, status: "accepted" | "rejected"): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("quotes")
      .set({ status })
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .where("status", "=", "sent")
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}

/** Nuevo borrador con las mismas líneas (fechas de hoy). */
export async function duplicateQuote(ctx: Ctx, id: string): Promise<string> {
  const q = await getQuote(ctx, id);
  if (!q) throw new DomainError("not_found");
  const today = todayIn();
  return createQuote(ctx, {
    customerId: q.customer.id,
    vehicleId: q.vehicle?.id ?? null,
    issueDate: today,
    validUntil: addDays(today, 30),
    notes: q.notes,
    items: q.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, taxRate: Number(it.taxRate) })),
  });
}

// ---------------------------------------------------------------- emisión

/** Datos congelados al emitir: el PDF no cambia aunque luego cambien las fichas. */
export interface QuoteSnapshot {
  workshop: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    address: string | null;
    postalCity: string | null;
    phone: string | null;
    email: string | null;
    brandColor: string | null;
    logoPath: string | null;
    organizationId: string;
  };
  customer: { name: string; email: string | null; phone: string | null };
  vehicle: { plate: string; name: string | null; km: number | null } | null;
}

export async function buildSnapshot(ctx: Pick<Ctx, "auth" | "membership">, q: QuoteDetail): Promise<QuoteSnapshot> {
  const w = await withRls(ctx.auth, async (tx) => {
    const { rows } = await sql<QuoteSnapshot["workshop"]>`
      select o.id as "organizationId", o.trade_name as name, o.legal_name as "legalName", o.tax_id as "taxId",
             nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.address_line2, o.address_line2)), '') as address,
             nullif(concat_ws(' ', coalesce(b.postal_code, o.postal_code), coalesce(b.city, o.city),
                              case when coalesce(b.province, o.province) is not null then '(' || coalesce(b.province, o.province) || ')' end), '') as "postalCity",
             coalesce(b.phone, o.phone) as phone, coalesce(b.email::text, o.email::text) as email,
             o.brand_primary as "brandColor", o.logo_path as "logoPath"
        from organizations o join branches b on b.organization_id = o.id
       where o.id = ${ctx.membership.organizationId} and b.id = ${q.branchId}
    `.execute(tx);
    return rows[0];
  });
  return {
    workshop: w,
    customer: { name: q.customer.name, email: q.customer.email, phone: q.customer.phone },
    vehicle: q.vehicle ? { plate: q.vehicle.plate, name: q.vehicle.name, km: q.vehicle.km } : null,
  };
}

/** Borrador → emitido, con los datos congelados y la ruta del PDF guardado. */
export async function markIssued(ctx: Ctx, id: string, snapshot: QuoteSnapshot, pdfPath: string): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("quotes")
      .set({ status: "sent", snapshot: JSON.stringify(snapshot), pdf_path: pdfPath })
      .where("organization_id", "=", ctx.membership.organizationId)
      .where("id", "=", id)
      .where("status", "=", "draft")
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}
