import { FileStack } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportWizard, PlanRequired } from "@/components/app/import-wizard";
import { JobStatusBadge } from "@/components/app/job-status";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { canUseBulk } from "@/domain/plans";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { listJobs } from "@/server/services/jobs";
import { listTemplates } from "@/server/services/templates";
import { getUsage } from "@/server/services/usage";

export const metadata: Metadata = { title: "Anuncios masivos" };

export default async function BulkPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const context = await requireSession();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [usage, jobs, templates] = await Promise.all([getUsage(context.supabase, context.workspace.id), listJobs(context, page, 10), listTemplates(context)]);
  const enabled = canUseBulk(usage);

  return (
    <>
      <PageHeader
        title="Anuncios masivos"
        description={
          enabled
            ? `Importa tu inventario desde un CSV y genera todos los anuncios por lotes. Este mes puedes generar ${formatNumber(usage.bulkRemaining)} anuncios más en lote (máximo ${formatNumber(usage.features.maxBulkRows)} filas por archivo).`
            : "Importa tu inventario desde un CSV y genera todos los anuncios por lotes."
        }
      />

      {enabled ? <ImportWizard templates={templates.filter((template) => template.is_active).map((template) => ({ id: template.id, name: template.name, platform: template.platform }))} /> : <PlanRequired planName={usage.planName} />}

      <Card className="mt-6">
        <CardHeader title="Historial de trabajos" description="Cada importación confirmada crea un trabajo de generación." />
        {jobs.items.length === 0 ? (
          <EmptyState icon={FileStack} title="Aún no hay trabajos" description="Cuando confirmes una importación, aquí podrás seguir su progreso y descargar los resultados." className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {jobs.items.map((job) => (
              <li key={job.id}>
                <Link href={`/app/masivo/${job.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-paper">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{job.source_filename ?? "Importación"}</span>
                    <span className="block text-xs text-muted">{formatDateTime(job.created_at)}</span>
                  </span>
                  <span className="text-[13px] tabular-nums text-muted">
                    {formatNumber(job.successful_items)} correctos · {formatNumber(job.failed_items)} fallidos · {formatNumber(job.total_items)} en total
                  </span>
                  <JobStatusBadge status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination page={jobs.page} pageCount={jobs.pageCount} total={jobs.total} pageSize={jobs.pageSize} basePath="/app/masivo" params={{}} noun="trabajos" />
    </>
  );
}
