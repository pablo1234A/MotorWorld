import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { SubscriptionBadge, fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/billing/entitlements";

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const [{ data: subs }, { data: orgs }] = await Promise.all([
    db.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("organizations").select("id, legal_name"),
  ]);
  return (
    <>
      <PageHeader title="Suscripciones" description="Estado sincronizado desde Stripe mediante webhooks." />
      <Panel>
        <DataTable headers={["Cliente", "Estado", "Importe", "Periodo hasta", "Cancelación", "Stripe"]}>
          {(subs ?? []).map((s) => (
            <tr key={s.id}>
              <td className="text-ink">{orgs?.find((o) => o.id === s.organization_id)?.legal_name ?? "—"}</td>
              <td><SubscriptionBadge status={s.status} /></td>
              <td className="tabular-nums">{s.amount_cents !== null ? formatPrice(s.amount_cents, s.currency ?? "eur") : "—"}</td>
              <td className="text-muted">{fmtDate(s.current_period_end)}</td>
              <td className="text-muted">{s.cancel_at_period_end || s.cancel_at ? `Programada (${fmtDate(s.cancel_at ?? s.current_period_end)})` : s.canceled_at ? fmtDate(s.canceled_at) : "—"}</td>
              <td className="font-mono text-xs text-muted">{s.stripe_subscription_id}</td>
            </tr>
          ))}
        </DataTable>
        {(subs ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Todavía no hay suscripciones.</p>}
      </Panel>
    </>
  );
}
