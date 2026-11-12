import type { Metadata } from "next";
import { AdminTable, pageParams } from "@/components/admin/table";
import { JobStatusBadge } from "@/components/app/job-status";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { adminListErrors, adminListJobs } from "@/server/services/admin";

export const metadata: Metadata = { title: "Trabajos y errores" };

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams);
  const [jobs, errors] = await Promise.all([adminListJobs(page, pageSize), adminListErrors()]);
  return (
    <>
      <PageHeader title="Trabajos masivos" description="Todos los trabajos de generación por lotes de la plataforma." />
      <AdminTable
        rows={jobs.items}
        rowKey={(job) => job.id}
        empty="Todavía no se ha lanzado ningún trabajo."
        columns={[
          {
            header: "Trabajo",
            cell: (job) => (
              <>
                <p className="font-medium">{job.source_filename ?? "Importación"}</p>
                <p className="font-mono text-xs text-faint">{job.id.slice(0, 8)}</p>
              </>
            ),
          },
          { header: "Espacio", cell: (job) => <span className="text-muted">{job.workspaces?.name ?? "—"}</span> },
          { header: "Estado", cell: (job) => <JobStatusBadge status={job.status} /> },
          { header: "Total", className: "text-right tabular-nums", cell: (job) => formatNumber(job.total_items) },
          { header: "Correctos", className: "text-right tabular-nums", cell: (job) => formatNumber(job.successful_items) },
          { header: "Fallidos", className: "text-right tabular-nums", cell: (job) => formatNumber(job.failed_items) },
          { header: "Reintentos", className: "text-right tabular-nums", cell: (job) => job.retry_count },
          { header: "Creado", cell: (job) => <span className="whitespace-nowrap text-muted">{formatDateTime(job.created_at)}</span> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(jobs.total / pageSize)} total={jobs.total} pageSize={pageSize} basePath="/admin/trabajos" params={{}} noun="trabajos" />

      <h2 className="mb-3 mt-10 text-xl font-semibold">Errores recientes</h2>
      <h3 className="mb-2 font-sans text-sm font-semibold tracking-normal text-muted">Elementos fallidos en trabajos (últimos 50)</h3>
      <AdminTable
        rows={errors.jobItems}
        rowKey={(item) => item.id}
        empty="No hay elementos fallidos."
        columns={[
          { header: "Trabajo", cell: (item) => <span className="font-mono text-xs">{item.job_id.slice(0, 8)}</span> },
          { header: "Fila", className: "tabular-nums", cell: (item) => item.row_number },
          { header: "Error", cell: (item) => item.error_message ?? "—" },
          { header: "Tipo", cell: (item) => (item.system_error ? <Badge tone="danger">Sistema</Badge> : <Badge>Datos</Badge>) },
          { header: "Fecha", cell: (item) => <span className="whitespace-nowrap text-muted">{formatDateTime(item.updated_at)}</span> },
        ]}
      />
      <h3 className="mb-2 mt-6 font-sans text-sm font-semibold tracking-normal text-muted">Webhooks de Stripe fallidos (últimos 50)</h3>
      <AdminTable
        rows={errors.stripeEvents}
        rowKey={(event) => event.id}
        empty="No hay webhooks fallidos."
        columns={[
          { header: "Evento", cell: (event) => <span className="font-mono text-xs">{event.id}</span> },
          { header: "Tipo", cell: (event) => event.type },
          { header: "Error", cell: (event) => event.error_message ?? "—" },
          { header: "Recibido", cell: (event) => <span className="whitespace-nowrap text-muted">{formatDateTime(event.received_at)}</span> },
        ]}
      />
    </>
  );
}
