"use client";
import { useState } from "react";
import { Lock, Megaphone, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEntitlements } from "@/lib/useEntitlements";
import { fmtDate } from "@/lib/format";
import { REQUEST_STATUS } from "@/lib/status";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type Camp = { id: string; name: string; status: string; totalTargets: number; launchedAt: string | null; createdAt: string; template: { name: string }; stats: Record<string, number> };
type Cust = { id: string; name: string; email: string; lastRequestStatus: string; unsubscribedAt: string | null; emailStatus: string };

export default function CampaignsPage() {
  const ent = useEntitlements();
  const enabled = Boolean(ent.data?.features.campaigns);
  const list = useApi<{ campaigns: Camp[] }>(enabled ? "/api/v1/campaigns" : null);
  const [open, setOpen] = useState(false);
  if (ent.loading && !ent.data) return <PageLoader />;
  if (!enabled)
    return (
      <>
        <PageHeader title="Campañas" description="Envía solicitudes de reseña a un grupo de clientes a la vez." />
        <Card><EmptyState icon={<Lock className="h-5 w-5" />} title="Disponible a partir del plan Pro" action={<ButtonLink href="/app/facturacion">Ver planes</ButtonLink>}>Selecciona clientes existentes y lánzales una solicitud con una plantilla específica, respetando siempre tu límite mensual.</EmptyState></Card>
      </>
    );
  return (
    <>
      <PageHeader title="Campañas" description="Envía solicitudes a un grupo de clientes con una plantilla concreta. Cuentan para tu límite mensual." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nueva campaña</Button>} />
      {list.loading && !list.data ? <PageLoader /> : !list.data?.campaigns.length ? (
        <Card><EmptyState icon={<Megaphone className="h-5 w-5" />} title="Aún no has lanzado campañas" action={<Button onClick={() => setOpen(true)}>Crear campaña</Button>}>Útil para pedir opinión a clientes que ya tenías antes de usar Reseñalo.</EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {list.data.campaigns.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-ink-500">Plantilla «{c.template.name}» · {c.totalTargets} clientes · {fmtDate(c.launchedAt ?? c.createdAt, true)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="ok">{(c.stats.SENT ?? 0) + (c.stats.DELIVERED ?? 0)} enviados</Badge>
                  <Badge tone="info">{(c.stats.SCHEDULED ?? 0) + (c.stats.QUEUED ?? 0) + (c.stats.SENDING ?? 0) + (c.stats.ON_HOLD ?? 0)} pendientes</Badge>
                  {(c.stats.FAILED ?? 0) + (c.stats.BOUNCED ?? 0) ? <Badge tone="bad">{(c.stats.FAILED ?? 0) + (c.stats.BOUNCED ?? 0)} fallidos</Badge> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <NewCampaign open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void list.reload(); }} />
    </>
  );
}

function NewCampaign({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const tpls = useApi<{ templates: { id: string; name: string; isDefault: boolean }[] }>(open ? "/api/v1/templates" : null);
  const [search, setSearch] = useState("");
  const custs = useApi<{ items: Cust[]; total: number }>(open ? `/api/v1/customers?pageSize=100&search=${encodeURIComponent(search)}` : null);
  const usage = useApi<{ usage: { available: number } | null }>(open ? "/api/v1/billing" : null);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; rejected: number } | null>(null);
  const eligible = (c: Cust) => !c.unsubscribedAt && c.emailStatus === "VALID";
  const available = usage.data?.usage?.available ?? 0;
  const tplId = tpl || tpls.data?.templates.find((t) => t.isDefault)?.id || "";
  return (
    <Modal open={open} onClose={() => { setResult(null); setSel(new Set()); onClose(); }} title="Nueva campaña" wide footer={result ? <Button onClick={() => { setResult(null); setSel(new Set()); onDone(); }}>Cerrar</Button> : (
      <Button loading={busy} disabled={!name || !tplId || sel.size === 0} onClick={async () => {
        setBusy(true);
        try { const r = await api<{ summary: { created: number; skipped: number; rejected: number } }>("/api/v1/campaigns", { body: { name, templateId: tplId, customerIds: [...sel] } }); setResult(r.summary); toast("ok", "Campaña lanzada"); }
        catch (e) { toast("bad", (e as ApiError).message); }
        setBusy(false);
      }}>Lanzar a {sel.size} cliente{sel.size === 1 ? "" : "s"}</Button>
    )}>
      {result ? (
        <Alert tone="ok" title="Campaña lanzada">{result.created} solicitudes en cola · {result.skipped} omitidas (bajas, duplicados o envíos recientes) · {result.rejected} rechazadas (límite del plan).</Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre de la campaña" value={name} onChange={(e) => setName(e.target.value)} placeholder="Clientes de 2025" />
            <Select label="Plantilla" value={tplId} onChange={(e) => setTpl(e.target.value)}>
              {tpls.data?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          {sel.size > available ? <Alert tone="warn">Has seleccionado {sel.size} clientes y te quedan {available} correos este periodo. Los que superen el límite se rechazarán sin enviarse.</Alert> : <p className="text-xs text-ink-500">Te quedan {available} correos este periodo. Se omitirán bajas y clientes con una solicitud reciente.</p>}
          <input className="input" placeholder="Buscar clientes" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-200">
            <label className="flex items-center gap-3 border-b border-ink-100 bg-cream-50 px-3 py-2 text-sm font-medium">
              <input type="checkbox" className="accent-ink-800" onChange={(e) => setSel(e.target.checked ? new Set(custs.data?.items.filter(eligible).map((c) => c.id)) : new Set())} />
              Seleccionar todos los visibles
            </label>
            {custs.data?.items.map((c) => (
              <label key={c.id} className="flex items-center gap-3 border-b border-ink-100 px-3 py-2 text-sm last:border-0">
                <input type="checkbox" className="accent-ink-800" disabled={!eligible(c)} checked={sel.has(c.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(c.id); else n.delete(c.id); setSel(n); }} />
                <span className="min-w-0 flex-1"><span className="block truncate">{c.name}</span><span className="block truncate text-xs text-ink-500">{c.email}</span></span>
                <Badge tone={REQUEST_STATUS[c.lastRequestStatus]?.tone}>{c.unsubscribedAt ? "Baja" : REQUEST_STATUS[c.lastRequestStatus]?.label}</Badge>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
