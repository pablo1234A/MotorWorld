import type { Metadata } from "next";
import { WorkspacePlanAction } from "@/components/admin/actions";
import { AdminTable, pageParams } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatNumber } from "@/lib/utils";
import { adminListPlans, adminListWorkspaces } from "@/server/services/admin";

export const metadata: Metadata = { title: "Espacios de trabajo" };

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams);
  const [result, plans] = await Promise.all([adminListWorkspaces(page, pageSize), adminListPlans()]);
  const planOptions = plans.map((plan) => ({ code: plan.code, name: plan.name }));
  return (
    <>
      <PageHeader title="Espacios de trabajo" description="Cada cuenta dispone de un espacio aislado. Desde aquí se puede asignar un plan manualmente (sin cobro)." />
      <AdminTable
        rows={result.items}
        rowKey={(workspace) => workspace.id}
        empty="No hay espacios de trabajo."
        columns={[
          {
            header: "Espacio",
            cell: (workspace) => (
              <>
                <p className="font-medium">{workspace.name}</p>
                <p className="text-xs text-muted">{workspace.ownerEmail}</p>
              </>
            ),
          },
          { header: "Plan", cell: (workspace) => <Badge tone={workspace.planCode === "free" ? "neutral" : "brand"}>{workspace.planName}</Badge> },
          { header: "Origen", cell: (workspace) => <span className="text-muted">{{ none: "—", manual: "Manual", stripe: "Stripe" }[workspace.provider] ?? workspace.provider}</span> },
          { header: "Productos", className: "text-right tabular-nums", cell: (workspace) => formatNumber(workspace.products) },
          { header: "Anuncios", className: "text-right tabular-nums", cell: (workspace) => formatNumber(workspace.listings) },
          { header: "Creado", cell: (workspace) => <span className="whitespace-nowrap text-muted">{formatDate(workspace.createdAt)}</span> },
          { header: "Acciones", cell: (workspace) => <WorkspacePlanAction workspaceId={workspace.id} workspaceName={workspace.name} currentPlan={workspace.planCode} plans={planOptions} stripeManaged={workspace.provider === "stripe" && ["active", "trialing", "past_due"].includes(workspace.status)} /> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/espacios" params={{}} noun="espacios" />
    </>
  );
}
