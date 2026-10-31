"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Search, Send, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEntitlements } from "@/lib/useEntitlements";
import { fmtDate } from "@/lib/format";
import { REQUEST_STATUS } from "@/lib/status";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { CustomerForm } from "@/components/app/CustomerForm";
import { CsvImport } from "@/components/app/CsvImport";

type C = { id: string; name: string; email: string; serviceName: string | null; completedAt: string | null; lastRequestStatus: string; lastRequestAt: string | null; unsubscribedAt: string | null; emailStatus: string; tags: string[] };

function Clients() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const ent = useEntitlements();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"new" | "import" | null>(sp.get("nuevo") ? "new" : sp.get("importar") ? "import" : null);
  const [sending, setSending] = useState<string | null>(null);
  const path = `/api/v1/customers?page=${page}&pageSize=25&search=${encodeURIComponent(q)}&status=${status}`;
  const list = useApi<{ items: C[]; total: number; page: number; pageSize: number }>(path);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const close = () => {
    setModal(null);
    router.replace("/app/clientes");
  };
  const requestReview = async (c: C) => {
    setSending(c.id);
    try {
      const r = await api<{ status: string; message: string }>(`/api/v1/customers/${c.id}/request`, { body: { sendNow: true } });
      toast(r.status === "CREATED" ? "ok" : "bad", r.message);
      await list.reload();
    } catch (e) {
      toast("bad", (e as ApiError).message);
    }
    setSending(null);
  };
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const tagsEnabled = Boolean(ent.data?.features.customerTags);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Las personas a las que Reseñalo pedirá su opinión."
        actions={
          <>
            {tagsEnabled ? (
              <a href="/api/v1/customers/export" download className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-700 hover:bg-ink-100"><Download className="h-4 w-4" />Exportar</a>
            ) : null}
            <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setModal("import")}>Importar CSV</Button>
            <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setModal("new")}>Añadir cliente</Button>
          </>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder="Buscar por nombre, email o servicio" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Select aria-label="Filtrar por estado" wrapperClassName="sm:w-52" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        {list.loading && !list.data ? <PageLoader /> : list.data && list.data.items.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title={q || status ? "No hay resultados" : "Aún no tienes clientes"} action={!q && !status ? <Button onClick={() => setModal("new")}>Añadir cliente</Button> : undefined}>
            {q || status ? "Prueba con otra búsqueda o filtro." : "Añádelos uno a uno, importa un CSV o conéctalos por API desde tu CRM."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <tr className="border-b border-ink-100"><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Servicio</th><th className="px-4 py-3">Finalización</th><th className="px-4 py-3">Solicitud</th><th className="px-4 py-3 text-right">Acción</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {list.data?.items.map((c) => (
                    <tr key={c.id} className="hover:bg-cream-50">
                      <td className="px-4 py-3"><Link href={`/app/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link><p className="text-xs text-ink-500">{c.email}</p></td>
                      <td className="px-4 py-3 text-ink-600">{c.serviceName ?? "—"}{c.tags.length ? <div className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null}</td>
                      <td className="px-4 py-3 text-ink-600">{fmtDate(c.completedAt)}</td>
                      <td className="px-4 py-3"><StatusCell c={c} /></td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={sending === c.id} disabled={Boolean(c.unsubscribedAt) || c.emailStatus !== "VALID"} onClick={() => requestReview(c)}>Solicitar ahora</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-ink-100 md:hidden">
              {list.data?.items.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/app/clientes/${c.id}`} className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="truncate text-xs text-ink-500">{c.email}</p></Link>
                    <StatusCell c={c} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="truncate text-xs text-ink-500">{c.serviceName ?? "Sin servicio"} · {fmtDate(c.completedAt)}</p>
                    <Button size="sm" variant="secondary" loading={sending === c.id} disabled={Boolean(c.unsubscribedAt) || c.emailStatus !== "VALID"} onClick={() => requestReview(c)}>Solicitar</Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm text-ink-500">
              <span>{list.data?.total} cliente{list.data?.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span className="tabular-nums">{page} / {pages}</span>
                <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={modal === "new"} onClose={close} title="Añadir cliente" wide>
        <CustomerForm tagsEnabled={tagsEnabled} onDone={(r) => { toast("ok", r.message ?? "Hecho"); close(); void list.reload(); }} />
      </Modal>
      <Modal open={modal === "import"} onClose={() => { close(); void list.reload(); }} title="Importar clientes desde CSV" wide>
        <CsvImport onDone={() => { close(); void list.reload(); }} />
      </Modal>
    </>
  );
}

function StatusCell({ c }: { c: C }) {
  if (c.unsubscribedAt) return <Badge tone="neutral">Dado de baja</Badge>;
  if (c.emailStatus !== "VALID") return <Badge tone="bad">Email rechazado</Badge>;
  const s = REQUEST_STATUS[c.lastRequestStatus];
  return <Badge tone={s?.tone}>{s?.label}</Badge>;
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Clients />
    </Suspense>
  );
}
