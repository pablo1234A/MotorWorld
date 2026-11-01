import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ExternalLink } from "lucide-react";
import { Alert, EmptyState, Badge } from "@/components/ui/feedback";
import { Button, LinkButton } from "@/components/ui/button";
import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { PaymentBadge, SubscriptionBadge, fmtDate } from "@/components/app/status";
import { requireOrganization } from "@/lib/auth";
import { getMyEntitlements } from "@/lib/data/panel";
import { createSessionClient } from "@/lib/supabase/server";
import { openBillingPortal } from "@/lib/actions/billing";
import { formatPrice } from "@/lib/billing/entitlements";
import type { PaymentRow, ProductRow } from "@/lib/db/types";

export const metadata: Metadata = { title: "Mi suscripción" };

export default async function BillingPage({ searchParams }: PageProps<"/panel/suscripcion">) {
  const { org } = await requireOrganization();
  const db = await createSessionClient();
  const [ent, { data: payments }, { data: products }, sp] = await Promise.all([
    getMyEntitlements(),
    db.from("payments").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(50),
    db.from("products").select("id, name"),
    searchParams,
  ]);
  const productName = (id: string | null) => (products as Pick<ProductRow, "id" | "name">[] | null)?.find((p) => p.id === id)?.name ?? "—";
  const sub = ent.subscription;
  const canPortal = Boolean(org.stripe_customer_id);

  return (
    <>
      <PageHeader title="Mi suscripción" description="Consulta tu plan, tus pagos y gestiona tu método de pago o la cancelación." />

      <div className="mb-6 space-y-3">
        {sp.portal === "no-disponible" && <Alert tone="info">Todavía no tienes datos de facturación en Stripe. Aparecerán tras tu primera compra.</Alert>}
        {sp.portal === "error" && <Alert tone="danger">No hemos podido abrir el portal de facturación. Inténtalo de nuevo en unos minutos.</Alert>}
        {ent.paymentIssue && (
          <Alert tone="danger" title="Pago pendiente">
            No hemos podido cobrar la última renovación. Stripe lo reintentará automáticamente; actualiza tu método de pago para evitar la cancelación.
          </Alert>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Plan actual">
          {sub ? (
            <dl className="space-y-3 text-sm">
              <Row label="Plan">{productName(sub.product_id)}</Row>
              <Row label="Estado"><SubscriptionBadge status={sub.status} /></Row>
              {sub.amount_cents !== null && <Row label="Precio">{formatPrice(sub.amount_cents, sub.currency ?? "eur")} / {sub.billing_interval === "year" ? "año" : "mes"}</Row>}
              {sub.status !== "canceled" && <Row label={sub.cancel_at_period_end || sub.cancel_at ? "Finaliza el" : "Próxima renovación"}>{fmtDate(sub.cancel_at ?? sub.current_period_end)}</Row>}
              {sub.status === "canceled" && <Row label="Finalizó el">{fmtDate(sub.ended_at ?? sub.canceled_at)}</Row>}
              {(sub.cancel_at_period_end || sub.cancel_at) && sub.status !== "canceled" && (
                <p className="rounded-lg bg-sand px-3 py-2 text-muted">Has cancelado la suscripción. Mantienes el acceso hasta el final del periodo pagado.</p>
              )}
            </dl>
          ) : ent.activePurchases.length > 0 ? (
            <div className="space-y-3 text-sm">
              {ent.activePurchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium text-ink">{productName(p.product_id)}</span>
                    <span className="text-muted">Comprado el {fmtDate(p.created_at)}</span>
                  </span>
                  <Badge tone="success">
                    {p.generations_limit === null ? "Generaciones ilimitadas" : `${p.generations_limit - p.generations_used} de ${p.generations_limit} generaciones`}
                  </Badge>
                </div>
              ))}
              <p className="pt-2 text-muted">
                ¿Quieres recibir las nuevas versiones de las plantillas? <Link href="/panel/precompra?plan=subscription_monthly" className="font-medium text-blue hover:underline">Pásate a la suscripción</Link>.
              </p>
            </div>
          ) : (
            <EmptyState icon={<CreditCard className="h-5 w-5" />} title="Sin plan activo" description="Completa el formulario y elige pago único o suscripción." action={<LinkButton href="/panel/generador">Empezar</LinkButton>} />
          )}
        </Panel>

        <Panel title="Gestionar" description="Método de pago, facturas, cambio de plan y cancelación en el portal seguro de Stripe.">
          {canPortal ? (
            <form action={openBillingPortal}>
              <Button type="submit" variant="secondary">
                Abrir portal de facturación <ExternalLink className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted">Disponible después de tu primera compra.</p>
          )}
          <p className="mt-4 text-xs text-subtle">Al cancelar conservas la descarga de los documentos ya generados.</p>
        </Panel>
      </div>

      <Panel className="mt-6" title="Historial de pagos">
        {(payments ?? []).length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay pagos.</p>
        ) : (
          <DataTable headers={["Fecha", "Concepto", "Importe", "Estado", "Factura"]}>
            {(payments as PaymentRow[]).map((p) => (
              <tr key={p.id}>
                <td className="text-muted">{fmtDate(p.paid_at ?? p.created_at)}</td>
                <td className="text-ink">{productName(p.product_id)}</td>
                <td className="tabular-nums">
                  {formatPrice(p.amount_cents, p.currency)}
                  {p.amount_refunded_cents > 0 && <span className="block text-xs text-muted">Reembolsado {formatPrice(p.amount_refunded_cents, p.currency)}</span>}
                </td>
                <td><PaymentBadge status={p.status} /></td>
                <td>
                  {p.hosted_invoice_url ? (
                    <a href={p.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue hover:underline">Ver</a>
                  ) : (
                    <span className="text-muted">En el portal</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
