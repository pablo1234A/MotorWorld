import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { PaymentBadge, SubscriptionBadge, fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/billing/entitlements";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const [{ data: payments }, { data: orgs }, { data: troubled }, { data: events }] = await Promise.all([
    db.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("organizations").select("id, legal_name"),
    db.from("subscriptions").select("id, organization_id, status, latest_invoice_id, updated_at").in("status", ["past_due", "unpaid", "incomplete"]),
    db.from("stripe_events").select("*").eq("status", "failed").order("received_at", { ascending: false }).limit(50),
  ]);
  const orgName = (id: string | null) => orgs?.find((o) => o.id === id)?.legal_name ?? "—";
  const incidents = (payments ?? []).filter((p) => ["failed", "refunded", "partially_refunded", "disputed"].includes(p.status));

  return (
    <>
      <PageHeader title="Pagos e incidencias" description="Compras, renovaciones, impagos, reembolsos y disputas." />
      <div className="space-y-6">
        <Panel title={`Incidencias de pago (${incidents.length + (troubled?.length ?? 0) + (events?.length ?? 0)})`}>
          {incidents.length + (troubled?.length ?? 0) + (events?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted">No hay incidencias abiertas.</p>
          ) : (
            <div className="space-y-6">
              {(troubled ?? []).length > 0 && (
                <DataTable headers={["Cliente", "Suscripción", "Última factura", "Actualizado"]}>
                  {troubled!.map((s) => (
                    <tr key={s.id}>
                      <td>{orgName(s.organization_id)}</td>
                      <td><SubscriptionBadge status={s.status} /></td>
                      <td className="font-mono text-xs text-muted">{s.latest_invoice_id ?? "—"}</td>
                      <td className="text-muted">{fmtDate(s.updated_at, true)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
              {incidents.length > 0 && (
                <DataTable headers={["Cliente", "Estado", "Importe", "Reembolsado", "Intentos", "Fecha"]}>
                  {incidents.map((p) => (
                    <tr key={p.id}>
                      <td>{orgName(p.organization_id)}</td>
                      <td><PaymentBadge status={p.status} /></td>
                      <td className="tabular-nums">{formatPrice(p.amount_cents, p.currency)}</td>
                      <td className="tabular-nums">{p.amount_refunded_cents ? formatPrice(p.amount_refunded_cents, p.currency) : "—"}</td>
                      <td>{p.attempt_count ?? "—"}</td>
                      <td className="text-muted">{fmtDate(p.updated_at, true)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
              {(events ?? []).length > 0 && (
                <DataTable headers={["Evento Stripe fallido", "Tipo", "Intentos", "Error"]}>
                  {events!.map((e) => (
                    <tr key={e.id}>
                      <td className="font-mono text-xs">{e.id}</td>
                      <td>{e.type}</td>
                      <td>{e.attempts}</td>
                      <td className="max-w-xs truncate text-xs text-danger" title={e.error ?? ""}>{e.error}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>
          )}
        </Panel>
        <Panel title="Todos los pagos">
          <DataTable headers={["Fecha", "Cliente", "Tipo", "Importe", "Estado"]}>
            {(payments ?? []).map((p) => (
              <tr key={p.id}>
                <td className="text-muted">{fmtDate(p.paid_at ?? p.created_at, true)}</td>
                <td>{orgName(p.organization_id)}</td>
                <td>{p.kind === "subscription" ? <Badge tone="info">Suscripción</Badge> : <Badge>Pago único</Badge>}</td>
                <td className="tabular-nums">{formatPrice(p.amount_cents, p.currency)}</td>
                <td><PaymentBadge status={p.status} /></td>
              </tr>
            ))}
          </DataTable>
          {(payments ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Todavía no hay pagos.</p>}
        </Panel>
      </div>
    </>
  );
}
