import type { Metadata } from "next";
import { AdminTable, pageParams } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { adminListAudit } from "@/server/services/admin";

export const metadata: Metadata = { title: "Auditoría" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams, 50);
  const result = await adminListAudit(page, pageSize);
  return (
    <>
      <PageHeader title="Registro de auditoría" description="Acciones relevantes de usuarios, administración y sistema." />
      <AdminTable
        rows={result.items}
        rowKey={(entry) => entry.id}
        empty="Todavía no hay registros."
        columns={[
          { header: "Fecha", cell: (entry) => <span className="whitespace-nowrap text-muted">{formatDateTime(entry.created_at)}</span> },
          { header: "Acción", cell: (entry) => <span className="font-mono text-[13px]">{entry.action}</span> },
          { header: "Actor", cell: (entry) => <span className="text-muted">{entry.profiles?.email ?? "Sistema"}</span> },
          { header: "Espacio", cell: (entry) => <span className="text-muted">{entry.workspaces?.name ?? "—"}</span> },
          { header: "Recurso", cell: (entry) => <span className="text-xs text-muted">{entry.resource_type}{entry.resource_id ? ` · ${entry.resource_id.slice(0, 12)}` : ""}</span> },
          { header: "Detalle", cell: (entry) => <code className="block max-w-72 truncate text-xs text-muted">{JSON.stringify(entry.metadata)}</code> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/auditoria" params={{}} noun="registros" />
    </>
  );
}
