import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { PageHeader, Panel, Stat } from "@/components/ui/layout";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createSessionClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/billing/entitlements";
import { cn } from "@/lib/cn";

interface Metrics {
  total_users: number;
  new_users: number;
  page_views: number;
  pricing_views: number;
  forms_started: number;
  forms_completed: number;
  checkouts_started: number;
  one_time_purchases: number;
  new_subscriptions: number;
  active_subscriptions: number;
  past_due_subscriptions: number;
  scheduled_cancellations: number;
  mrr_cents: number;
  cancellations: number;
  revenue_cents: number;
  refunds_cents: number;
  paying_customers: number;
  failed_payments: number;
  errors: number;
  documents_generated: number;
  retention_30d: number | null;
}

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)} %` : "—");

export default async function AdminMetricsPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const db = await createSessionClient();
  const { data, error } = await db.rpc("admin_metrics", { p_days: days });
  const m = data as Metrics | null;

  // Plantillas sin aprobar: bloquean la venta en producción.
  const { data: templates } = await createAdminClient().from("templates").select("name, published_version_id");
  const pending = (templates ?? []).filter((t) => !t.published_version_id);

  return (
    <>
      <PageHeader
        title="Métricas"
        description="Datos reales registrados por la aplicación. No incluyen estimaciones ni proyecciones."
        actions={
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin?dias=${d}`} className={cn("rounded-md px-3 py-1.5 text-sm", d === days ? "bg-navy text-white" : "text-muted hover:text-navy")}>
                {d} días
              </Link>
            ))}
          </div>
        }
      />
      {pending.length > 0 && (
        <Alert tone="warning" title="Plantillas sin versión publicada" className="mb-6">
          {pending.map((t) => t.name).join(", ")}. En producción no se puede vender hasta publicar versiones aprobadas jurídicamente.{" "}
          <Link href="/admin/plantillas">Gestionar plantillas</Link>
        </Alert>
      )}
      {error || !m ? (
        <Alert tone="danger">No se pudieron cargar las métricas: {error?.message}</Alert>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Ingresos</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="MRR" value={formatPrice(m.mrr_cents)} hint="Suscripciones activas" />
              <Stat label={`Ingresos ${days} d`} value={formatPrice(m.revenue_cents)} hint="Neto de reembolsos" />
              <Stat label="Ingreso medio por cliente" value={m.paying_customers ? formatPrice(Math.round(m.revenue_cents / Math.max(m.paying_customers, 1))) : "—"} hint="Periodo / clientes de pago" />
              <Stat label="Reembolsos" value={formatPrice(m.refunds_cents)} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Embudo de conversión ({days} días)</h2>
            <Panel>
              <ol className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Visitas", m.page_views],
                  ["Registros", m.new_users],
                  ["Vieron precios", m.pricing_views],
                  ["Empezaron formulario", m.forms_started],
                  ["Terminaron formulario", m.forms_completed],
                  ["Compras", m.one_time_purchases + m.new_subscriptions],
                ].map(([label, value], i, arr) => (
                  <li key={label as string}>
                    <p className="text-xs text-subtle">{label}</p>
                    <p className="text-2xl font-semibold tabular-nums text-navy-950">{value}</p>
                    {i > 0 && <p className="text-xs text-muted">{pct(value as number, arr[i - 1][1] as number)} del paso anterior</p>}
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs text-subtle">Conversión registro → compra: {pct(m.one_time_purchases + m.new_subscriptions, m.new_users)} · Checkouts iniciados: {m.checkouts_started}</p>
            </Panel>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Clientes y retención</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Usuarios totales" value={m.total_users} />
              <Stat label="Suscripciones activas" value={m.active_subscriptions} hint={`${m.past_due_subscriptions} con pago pendiente`} />
              <Stat label={`Cancelaciones ${days} d`} value={m.cancellations} hint={`${m.scheduled_cancellations} programadas`} />
              <Stat label="Retención 30 días" value={m.retention_30d === null ? "—" : `${m.retention_30d} %`} hint="Suscripciones con más de 30 días" />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">Operación</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Documentos generados" value={m.documents_generated} />
              <Stat label="Pagos fallidos" value={m.failed_payments} />
              <Stat label="Errores registrados" value={m.errors} />
              <Stat label="Clientes de pago (total)" value={m.paying_customers} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
