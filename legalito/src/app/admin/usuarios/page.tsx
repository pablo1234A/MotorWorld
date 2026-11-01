import { Input } from "@/components/ui/field";
import { DataTable, PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { maskEmail, maskTaxId } from "@/lib/mask";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const db = await createSessionClient();
  let query = db.from("profiles").select("id, email, full_name, created_at, marketing_consent").order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("email", `%${q.replace(/[%_]/g, "")}%`);
  const { data: profiles } = await query;
  const ids = (profiles ?? []).map((p) => p.id);
  const [{ data: orgs }, { data: subs }, { data: purchases }] = await Promise.all([
    db.from("organizations").select("id, owner_id, legal_name, nif, business_type").in("owner_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("subscriptions").select("organization_id, status"),
    db.from("purchases").select("organization_id, status"),
  ]);

  return (
    <>
      <PageHeader title="Clientes" description="Datos mínimos para la gestión. Los emails y NIF se muestran parcialmente." />
      <form className="mb-4 max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Buscar por email" aria-label="Buscar por email" />
      </form>
      <Panel>
        <DataTable headers={["Cliente", "Negocio", "NIF", "Plan", "Alta", "Comunicaciones"]}>
          {(profiles ?? []).map((p) => {
            const org = orgs?.find((o) => o.owner_id === p.id);
            const sub = subs?.find((s) => s.organization_id === org?.id);
            const pur = purchases?.find((x) => x.organization_id === org?.id && x.status === "active");
            return (
              <tr key={p.id}>
                <td>
                  <span className="block font-medium text-ink">{p.full_name ?? "—"}</span>
                  <span className="text-xs text-muted">{maskEmail(p.email)}</span>
                </td>
                <td className="text-muted">
                  {org?.legal_name ?? "—"}
                  {org?.business_type && <span className="block text-xs">{org.business_type}</span>}
                </td>
                <td className="font-mono text-xs text-muted">{maskTaxId(org?.nif)}</td>
                <td>{sub ? <Badge tone="info">Suscripción · {sub.status}</Badge> : pur ? <Badge tone="success">Pago único</Badge> : <Badge>Sin plan</Badge>}</td>
                <td className="text-muted">{fmtDate(p.created_at)}</td>
                <td className="text-muted">{p.marketing_consent ? "Acepta comerciales" : "Solo servicio"}</td>
              </tr>
            );
          })}
        </DataTable>
        {(profiles ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted">Sin resultados.</p>}
      </Panel>
    </>
  );
}
