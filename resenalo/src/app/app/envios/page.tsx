"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { History, RotateCcw, Search, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { JOB_STATUS, LOG_EVENT_LABEL, SOURCE_LABEL } from "@/lib/status";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

type Item = { id: string; toName: string; toEmail: string; subject: string; status: string; reasonText: string | null; scheduledFor: string; sentAt: string | null; createdAt: string; attempts: number; lastError: string | null; clickCount: number; rule: { name: string } | null; campaign: { name: string } | null; event: { source: string; serviceName: string | null } | null };
type Detail = Item & { bodyHtml: string; bodyText: string; providerMessageId: string | null; logs: { id: string; event: string; message: string | null; createdAt: string }[] };

const GROUPS = [
  ["", "Todos"], ["pending", "Pendientes"], ["sent", "Enviados"], ["failed", "Fallidos"], ["blocked", "Bloqueados y cancelados"],
] as const;

function Envios() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [group, setGroup] = useState(sp.get("grupo") ?? "");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(sp.get("id"));
  const list = useApi<{ items: Item[]; total: number; pageSize: number }>(`/api/v1/emails?group=${group}&search=${encodeURIComponent(q)}&page=${page}&pageSize=25`);
  const detail = useApi<{ job: Detail }>(openId ? `/api/v1/emails/${openId}` : null);
  const [tab, setTab] = useState<"log" | "mail">("log");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const act = async (kind: "cancel" | "retry") => {
    if (!openId) return;
    setBusy(true);
    try {
      await api(`/api/v1/emails/${openId}/${kind}`, { method: "POST", body: {} });
      toast("ok", kind === "cancel" ? "Envío cancelado" : "Reintento en cola");
      await Promise.all([detail.reload(), list.reload()]);
    } catch (e) {
      toast("bad", (e as ApiError).message);
    }
    setBusy(false);
  };
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const j = detail.data?.job;

  return (
    <>
      <PageHeader title="Historial de envíos" description="Cada solicitud generada, su estado y el registro detallado de lo ocurrido." />
      <Alert tone="info" className="mb-4">«Enviado» significa que Gmail u Outlook <strong>aceptó</strong> el mensaje. Estos proveedores no informan de la entrega en el buzón ni de si el cliente publica la reseña; sí registramos los clics en el enlace.</Alert>
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist">
            {GROUPS.map(([g, l]) => (
              <button key={g} role="tab" aria-selected={group === g} onClick={() => { setGroup(g); setPage(1); }} className={clsx("shrink-0 rounded-md px-3 py-1.5 text-sm", group === g ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-100")}>{l}</button>
            ))}
          </div>
          <label className="relative lg:w-72">
            <span className="sr-only">Buscar destinatario</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Buscar destinatario" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        {list.loading && !list.data ? <PageLoader /> : list.data?.items.length === 0 ? (
          <EmptyState icon={<History className="h-5 w-5" />} title="No hay envíos en esta vista">Cuando registres clientes, aquí verás cada solicitud y su estado.</EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {list.data?.items.map((it) => (
                <li key={it.id}>
                  <button className="flex w-full flex-col gap-2 px-4 py-3.5 text-left hover:bg-cream-50 sm:flex-row sm:items-center sm:justify-between" onClick={() => { setTab("log"); setOpenId(it.id); }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{it.toName || it.toEmail} <span className="font-normal text-ink-500">· {it.toEmail}</span></p>
                      <p className="truncate text-xs text-ink-500">
                        {it.sentAt ? `Enviado ${fmtDate(it.sentAt, true)}` : it.status === "SCHEDULED" ? `Programado para ${fmtDate(it.scheduledFor, true)}` : `Creado ${fmtDate(it.createdAt, true)}`}
                        {" · "}{it.campaign ? `Campaña «${it.campaign.name}»` : it.rule?.name ?? SOURCE_LABEL[it.event?.source ?? ""] ?? ""}
                        {it.clickCount ? ` · ${it.clickCount} clic${it.clickCount > 1 ? "s" : ""}` : ""}
                      </p>
                      {it.reasonText && !["SENT", "DELIVERED"].includes(it.status) ? <p className="mt-0.5 truncate text-xs text-ink-600">{it.reasonText}</p> : null}
                    </div>
                    <Badge tone={JOB_STATUS[it.status]?.tone}>{JOB_STATUS[it.status]?.label}</Badge>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm text-ink-500">
              <span>{list.data?.total} envío{list.data?.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span className="tabular-nums">{page} / {pages}</span>
                <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={Boolean(openId)} onClose={() => { setOpenId(null); router.replace("/app/envios"); }} title="Detalle del envío" wide
        footer={j ? <>
          {["SCHEDULED", "QUEUED", "ON_HOLD", "BLOCKED"].includes(j.status) ? <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} loading={busy} onClick={() => act("cancel")}>Cancelar envío</Button> : null}
          {["FAILED", "BLOCKED", "BOUNCED"].includes(j.status) ? <Button icon={<RotateCcw className="h-4 w-4" />} loading={busy} onClick={() => act("retry")}>Reintentar</Button> : null}
        </> : undefined}>
        {!j ? <PageLoader /> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{j.subject}</p>
                <p className="text-sm text-ink-500">Para {j.toName} &lt;{j.toEmail}&gt;</p>
              </div>
              <Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label}</Badge>
            </div>
            {j.reasonText && !["SENT", "DELIVERED"].includes(j.status) ? <Alert tone={["FAILED", "BOUNCED"].includes(j.status) ? "bad" : "warn"}>{j.reasonText}{j.lastError ? <span className="mt-1 block text-xs">{j.lastError}</span> : null}</Alert> : null}
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Programado", fmtDate(j.scheduledFor, true)], ["Enviado", fmtDate(j.sentAt, true)], ["Intentos", String(j.attempts)], ["Clics", String(j.clickCount)]].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-ink-100 p-3"><dt className="text-xs text-ink-500">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
            {j.providerMessageId ? <p className="text-xs text-ink-500">ID del mensaje en el proveedor: <code>{j.providerMessageId}</code></p> : null}
            <div className="flex gap-1 border-b border-ink-100">
              {(["log", "mail"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-ink-800 font-semibold" : "border-transparent text-ink-500")}>{t === "log" ? "Registro" : "Correo generado"}</button>)}
            </div>
            {tab === "log" ? (
              <ol className="relative space-y-4 border-l border-ink-200 pl-5">
                {j.logs.map((l) => (
                  <li key={l.id}>
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink-400" />
                    <p className="text-sm font-medium">{LOG_EVENT_LABEL[l.event] ?? l.event} <span className="font-normal text-ink-500">· {fmtDate(l.createdAt, true)}</span></p>
                    {l.message ? <p className="text-sm text-ink-600">{l.message}</p> : null}
                  </li>
                ))}
              </ol>
            ) : j.bodyHtml ? (
              <iframe title="Correo generado" sandbox="" srcDoc={j.bodyHtml} className="h-[480px] w-full rounded-lg border border-ink-200 bg-white" />
            ) : <p className="text-sm text-ink-500">El contenido se eliminó por la política de retención.</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Envios />
    </Suspense>
  );
}
