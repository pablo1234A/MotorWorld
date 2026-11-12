import type { Metadata } from "next";
import { AdminTable, pageParams } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { adminListUsage } from "@/server/services/admin";

export const metadata: Metadata = { title: "Consumo" };

const OPERATION: Record<string, string> = { generation: "Generación", refinement: "Ajuste", bulk_generation: "Generación masiva", refund: "Devolución" };

export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams);
  const result = await adminListUsage(page, pageSize);
  return (
    <>
      <PageHeader title="Consumo" description="Registro de operaciones contabilizadas. Las cantidades negativas son devoluciones por errores internos." />
      <AdminTable
        rows={result.items}
        rowKey={(record) => record.id}
        empty="Todavía no hay consumo registrado."
        columns={[
          { header: "Fecha", cell: (record) => <span className="whitespace-nowrap text-muted">{formatDateTime(record.created_at)}</span> },
          { header: "Espacio", cell: (record) => record.workspaces?.name ?? "—" },
          { header: "Usuario", cell: (record) => <span className="text-muted">{record.profiles?.email ?? "—"}</span> },
          { header: "Operación", cell: (record) => OPERATION[record.operation_type] ?? record.operation_type },
          { header: "Cantidad", className: "text-right tabular-nums", cell: (record) => <span className={record.quantity < 0 ? "text-success" : ""}>{record.quantity}</span> },
          { header: "Estado", cell: (record) => (record.status === "refunded" ? <Badge tone="warning">Devuelta</Badge> : <Badge>Contabilizada</Badge>) },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/consumo" params={{}} noun="registros" />
    </>
  );
}
