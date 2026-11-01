import { PageHeader, Panel } from "@/components/ui/layout";
import { Badge } from "@/components/ui/feedback";
import { Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { fmtDate } from "@/components/app/status";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { updateSupportStatus } from "@/lib/actions/admin";

const TONE = { open: "info", in_progress: "warning", closed: "success" } as const;

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/soporte">) {
  await requireAdmin();
  const sp = await searchParams;
  const showClosed = sp.cerradas === "1";
  const db = await createSessionClient();
  let q = db.from("support_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (!showClosed) q = q.neq("status", "closed");
  const { data: requests } = await q;
  return (
    <>
      <PageHeader
        title="Soporte"
        description="Consultas recibidas desde el formulario de contacto y el panel. Responde por email al remitente."
        actions={
          <a href={showClosed ? "/admin/soporte" : "/admin/soporte?cerradas=1"} className="text-sm text-link">
            {showClosed ? "Ocultar resueltas" : "Mostrar resueltas"}
          </a>
        }
      />
      <div className="space-y-4">
        {(requests ?? []).length === 0 && <Panel><p className="text-sm text-muted">No hay consultas pendientes.</p></Panel>}
        {(requests ?? []).map((r) => (
          <Panel key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{r.subject}</p>
                <p className="text-sm text-muted">
                  {r.name} · <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`} className="text-link">{r.email}</a> · {fmtDate(r.created_at, true)}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge>{r.category}</Badge>
                <Badge tone={TONE[r.status as keyof typeof TONE]}>{r.status}</Badge>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{r.message}</p>
            <form action={updateSupportStatus.bind(null, r.id)} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[180px_1fr_auto] sm:items-start">
              <Select name="status" defaultValue={r.status} aria-label="Estado">
                <option value="open">Abierta</option>
                <option value="in_progress">En curso</option>
                <option value="closed">Resuelta</option>
              </Select>
              <Textarea name="admin_notes" defaultValue={r.admin_notes ?? ""} rows={2} placeholder="Notas internas" className="min-h-11" aria-label="Notas internas" />
              <SubmitButton variant="secondary">Guardar</SubmitButton>
            </form>
          </Panel>
        ))}
      </div>
    </>
  );
}
