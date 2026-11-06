import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueQuoteForm, QuoteActions, QuoteEditor } from "@/components/quotes/quote-editor";
import { buttonClass } from "@/components/ui/button-styles";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDate, formatDateTime } from "@/lib/dates";
import { param } from "@/lib/pagination";
import { formatEuro, formatQuantity } from "@/lib/quotes/money";
import { QUOTE_STATUS_LABELS } from "@/lib/validation/quotes";
import { can, isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { NOTIFY_MESSAGES } from "@/server/modules/appointments/notify";
import { getProfile } from "@/server/modules/organizations/profile";
import { customerWithVehicles } from "@/server/modules/quotes/lookup";
import { getQuote } from "@/server/modules/quotes/service";

export const metadata: Metadata = { title: "Presupuesto · RevisaYa" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuotePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireOrgPage(`/app/presupuestos/${id}`);
  if (!can(ctx, "quotes.manage")) return <Alert tone="error" title="Sin permiso">No tienes permiso para gestionar presupuestos.</Alert>;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await getQuote(ctx, id);
  if (!q) notFound();
  const writable = ctx.subscription.active;
  const draft = q.status === "draft";
  const [customer, profile] = await Promise.all([draft ? customerWithVehicles(ctx, q.customer.id) : null, getProfile(ctx)]);
  const hasEmail = Boolean(q.snapshot?.customer.email ?? q.customer.email);
  const aviso = param(sp.aviso, 30);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/app/presupuestos" className="text-sm text-[var(--accent)]">
            ← Presupuestos
          </Link>
          <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight">{q.number}</h1>
          <p className="text-sm text-[var(--muted)]">
            {QUOTE_STATUS_LABELS[q.status]} · {q.customer.name}
            {q.sentAt ? ` · emitido el ${formatDateTime(q.sentAt)}` : ""}
          </p>
        </div>
        <a href={`/api/app/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
          {draft ? "Vista previa del PDF" : "Descargar PDF"}
        </a>
      </div>
      {param(sp.guardado) ? <Alert tone="success">Borrador creado.</Alert> : null}
      {param(sp.duplicado) ? <Alert tone="success">Presupuesto duplicado: este es un borrador nuevo.</Alert> : null}
      {param(sp.emitido) ? (
        <Alert tone="success">
          Presupuesto emitido.
          {aviso && Object.hasOwn(NOTIFY_MESSAGES, aviso) ? ` ${NOTIFY_MESSAGES[aviso as keyof typeof NOTIFY_MESSAGES]}` : ""}
        </Alert>
      ) : null}

      {draft && writable && customer ? (
        <>
          <QuoteEditor
            id={q.id}
            customer={customer}
            vehicles={customer.vehicles}
            initial={{
              vehicleId: q.vehicle?.id ?? null,
              issueDate: q.issueDate,
              validUntil: q.validUntil,
              notes: q.notes,
              items: q.items.map((i) => ({ description: i.description, quantity: formatQuantity(i.quantity).replace(/\./g, ""), unitPrice: i.unitPrice, taxRate: Number(i.taxRate) })),
            }}
          />
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Emitir</h2>
            <IssueQuoteForm id={q.id} hasEmail={hasEmail} taxDataMissing={!profile.taxId || !profile.legalName} />
          </Card>
        </>
      ) : (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <span>Fecha: {formatDate(q.issueDate)}</span>
            <span>Válido hasta: {formatDate(q.validUntil)}</span>
            {q.vehicle ? <span>Vehículo: {[q.vehicle.plate, q.vehicle.name].filter(Boolean).join(" · ")}</span> : null}
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Concepto</th>
                  <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                  <th className="py-2 pr-3 text-right font-medium">Precio</th>
                  <th className="py-2 pr-3 text-right font-medium">IVA</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {q.items.map((i) => (
                  <tr key={i.position}>
                    <td className="py-2 pr-3">{i.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatQuantity(i.quantity)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatEuro(i.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{Number(i.taxRate)} %</td>
                    <td className="py-2 text-right tabular-nums">{formatEuro(i.lineSubtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt>Base imponible</dt>
              <dd className="tabular-nums">{formatEuro(q.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IVA</dt>
              <dd className="tabular-nums">{formatEuro(q.taxTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatEuro(q.total)}</dd>
            </div>
          </dl>
          {q.notes ? <p className="whitespace-pre-line rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm">{q.notes}</p> : null}
        </Card>
      )}
      {writable ? <QuoteActions id={q.id} status={q.status} hasEmail={hasEmail} canDelete={isAdmin(ctx)} /> : null}
    </div>
  );
}
