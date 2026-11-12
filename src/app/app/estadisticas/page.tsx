import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { ActivityChart, BarList } from "@/components/app/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { platformName } from "@/domain/marketplaces/profiles";
import { usagePercent } from "@/domain/plans";
import { LISTING_STATUS_LABELS, type ListingStatus } from "@/domain/product";
import { formatDate, formatNumber } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { getDashboardStats } from "@/server/services/stats";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Estadísticas" };

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-tight">{formatNumber(value)}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function StatsPage() {
  const context = await requireSession();
  const [stats, usage] = await Promise.all([getDashboardStats(context), getUsage(context.supabase, context.workspace.id)]);
  const empty = stats.productsTotal + stats.productsArchived + stats.listingsTotal === 0;
  const jobsFinished = stats.jobs.completed + stats.jobs.partially_completed + stats.jobs.failed;

  return (
    <>
      <PageHeader title="Estadísticas" description="Datos reales de tu espacio de trabajo, calculados en el momento de abrir la página." />
      {empty ? (
        <Card>
          <EmptyState icon={BarChart3} title="Aún no hay datos que mostrar" description="Las estadísticas se calculan a partir de tus productos, anuncios e importaciones. Crea tu primer anuncio para empezar." action={<ButtonLink href="/app/crear">Crear anuncio</ButtonLink>} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Total de productos" value={stats.productsTotal + stats.productsArchived} hint={`${formatNumber(stats.productsTotal)} activos · ${formatNumber(stats.productsArchived)} archivados`} />
            <Figure label="Total de anuncios" value={stats.listingsTotal} hint={Object.entries(stats.listingsByStatus).map(([status, total]) => `${formatNumber(total)} ${LISTING_STATUS_LABELS[status as ListingStatus]?.toLowerCase() ?? status}`).join(" · ")} />
            <Figure label="Generaciones del periodo" value={usage.used} hint={`de ${formatNumber(usage.monthlyListingLimit)} · plan ${usage.planName}`} />
            <Figure label="Consumo restante" value={usage.remaining} hint={`Se renueva el ${formatDate(usage.periodEnd)}`} />
          </div>

          <Card className="mt-6">
            <CardHeader title="Evolución de la actividad" description="Productos y anuncios creados cada día durante los últimos 30 días (UTC)." />
            <div className="p-5">
              <ActivityChart data={stats.activityByDay} />
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Anuncios por categoría" />
              <div className="p-5">
                <BarList items={stats.listingsByCategory.map((row) => ({ label: row.category, total: row.total }))} emptyLabel="Todavía no hay anuncios." />
              </div>
            </Card>
            <Card>
              <CardHeader title="Anuncios por plataforma" />
              <div className="p-5">
                <BarList items={stats.listingsByPlatform.map((row) => ({ label: platformName(row.platform), total: row.total }))} emptyLabel="Todavía no hay anuncios." />
              </div>
            </Card>
            <Card>
              <CardHeader title="Trabajos masivos" description={`${formatNumber(jobsFinished)} terminados · ${formatNumber(stats.jobs.active)} en curso`} />
              <div className="space-y-4 p-5">
                {jobsFinished + stats.jobs.active === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">No has lanzado ninguna generación masiva.</p>
                ) : (
                  (
                    [
                      ["Completados", stats.jobs.completed, "success"],
                      ["Parcialmente completados", stats.jobs.partially_completed, "warning"],
                      ["Fallidos", stats.jobs.failed, "danger"],
                    ] as const
                  ).map(([label, value, tone]) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm">
                        <span>{label}</span>
                        <span className="tabular-nums text-muted">{formatNumber(value)}</span>
                      </div>
                      <ProgressBar value={jobsFinished ? (value / jobsFinished) * 100 : 0} tone={tone} label={label} className="mt-1.5 h-1.5" />
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-6 p-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Uso del plan {usage.planName} en el periodo actual</span>
              <span className="tabular-nums text-muted">
                {formatNumber(usage.used)} / {formatNumber(usage.monthlyListingLimit)}
              </span>
            </div>
            <ProgressBar value={usagePercent(usage)} label="Uso del plan" className="mt-2.5" />
            <p className="mt-2 text-xs text-muted">
              Periodo: {formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)}
              {usage.monthlyBulkLimit > 0 ? ` · Generación masiva: ${formatNumber(usage.bulkUsed)} de ${formatNumber(usage.monthlyBulkLimit)}` : ""}
            </p>
          </Card>
        </>
      )}
    </>
  );
}
