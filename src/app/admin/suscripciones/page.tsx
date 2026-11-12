import type { Metadata } from "next";
import { AdminTable, pageParams } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/utils";
import { adminListSubscriptions } from "@/server/services/admin";

export const metadata: Metadata = { title: "Suscripciones" };

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams);
  const result = await adminListSubscriptions(page, pageSize);
  return (
    <>
      <PageHeader title="Suscripciones" description="Estado sincronizado desde los webhooks verificados de Stripe o asignado manualmente." />
      <AdminTable
        rows={result.items}
        rowKey={(subscription) => subscription.id}
        empty="No hay suscripciones."
        columns={[
          { header: "Espacio", cell: (subscription) => <span className="font-medium">{subscription.workspaces?.name ?? "—"}</span> },
          { header: "Plan", cell: (subscription) => <Badge tone={subscription.plans?.code === "free" ? "neutral" : "brand"}>{subscription.plans?.name ?? "—"}</Badge> },
          { header: "Estado", cell: (subscription) => <Badge tone={subscription.status === "active" ? "success" : "warning"}>{subscription.status}</Badge> },
          { header: "Origen", cell: (subscription) => <span className="text-muted">{{ none: "—", manual: "Manual", stripe: "Stripe" }[subscription.provider] ?? subscription.provider}</span> },
          { header: "Cliente / suscripción", cell: (subscription) => <span className="font-mono text-xs text-muted">{[subscription.provider_customer_id, subscription.provider_subscription_id].filter(Boolean).join(" · ") || "—"}</span> },
          { header: "Fin de periodo", cell: (subscription) => <span className="whitespace-nowrap text-muted">{subscription.current_period_end ? `${formatDate(subscription.current_period_end)}${subscription.cancel_at_period_end ? " (cancela)" : ""}` : "—"}</span> },
          { header: "Actualizada", cell: (subscription) => <span className="whitespace-nowrap text-muted">{formatDateTime(subscription.updated_at)}</span> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/suscripciones" params={{}} noun="suscripciones" />
    </>
  );
}
