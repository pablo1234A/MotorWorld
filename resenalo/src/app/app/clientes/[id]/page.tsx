"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Send, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useEntitlements } from "@/lib/useEntitlements";
import { fmtDate } from "@/lib/format";
import { JOB_STATUS, SOURCE_LABEL } from "@/lib/status";
import { Alert, Badge, Card, CardHeader, EmptyState } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { CustomerForm } from "@/components/app/CustomerForm";

type Detail = {
  id: string; name: string; email: string; phone: string | null; serviceName: string | null; completedAt: string | null; notes: string | null; tags: string[];
  source: string; emailStatus: string; unsubscribedAt: string | null; createdAt: string;
  jobs: { id: string; status: string; statusReason: string | null; subject: string; scheduledFor: string; sentAt: string | null; createdAt: string; clickCount: number; lastError: string | null }[];
};

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const ent = useEntitlements();
  const d = useApi<{ customer: Detail }>(`/api/v1/customers/${id}`);
  const [edit, setEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  const c = d.data!.customer;
  const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

  return (
    <>
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900"><ArrowLeft className="h-4 w-4" />Clientes</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{c.name}</h1>
          <p className="mt-1 text-sm text-ink-500">{c.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Send className="h-4 w-4" />}
            loading={busy}
            disabled={Boolean(c.unsubscribedAt) || c.emailStatus !== "VALID"}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ status: string; message: string }>(`/api/v1/customers/${id}/request`, { body: { sendNow: true } });
                toast(r.status === "CREATED" ? "ok" : "bad", r.message);
                await d.reload();
              } catch (e) {
                toast("bad", (e as ApiError).message);
              }
              setBusy(false);
            }}
          >
            Solicitar reseña ahora
          </Button>
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Editar</Button>
          <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)} aria-label="Eliminar cliente" />
        </div>
      </div>
      {c.unsubscribedAt ? <Alert tone="info" className="mb-4">Este cliente se dio de baja de las solicitudes el {fmtDate(c.unsubscribedAt)}. No se le enviarán más correos.</Alert> : null}
      {c.emailStatus !== "VALID" ? <Alert tone="warn" className="mb-4">El proveedor rechazó esta dirección. Corrige el email para volver a enviarle solicitudes.</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Datos" />
          <dl className="space-y-3 text-sm">
            {[
              ["Servicio", c.serviceName ?? "—"], ["Finalización", fmtDate(c.completedAt, true)], ["Teléfono", c.phone ?? "—"], ["Origen", SOURCE_LABEL[c.source] ?? c.source], ["Alta", fmtDate(c.createdAt)],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
          {c.tags.length ? <div className="mt-4 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div> : null}
          {c.notes ? <p className="mt-4 whitespace-pre-wrap rounded-lg bg-cream-200/70 p-3 text-sm text-ink-700">{c.notes}</p> : null}
        </Card>
        <Card className="lg:col-span-2" padded={false}>
          <div className="px-5 pt-5 sm:px-6"><h2 className="text-base font-semibold">Historial de solicitudes</h2></div>
          {c.jobs.length === 0 ? <EmptyState title="Sin solicitudes todavía">Pulsa «Solicitar reseña ahora» o espera a la automatización.</EmptyState> : (
            <ul className="mt-3 divide-y divide-ink-100">
              {c.jobs.map((j) => (
                <li key={j.id} className="flex items-start justify-between gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0">
                    <Link href={`/app/envios?id=${j.id}`} className="truncate text-sm font-medium hover:underline">{j.subject}</Link>
                    <p className="text-xs text-ink-500">
                      {j.sentAt ? `Enviado el ${fmtDate(j.sentAt, true)}` : `Creado el ${fmtDate(j.createdAt, true)} · programado ${fmtDate(j.scheduledFor, true)}`}
                      {j.clickCount ? ` · ${j.clickCount} clic${j.clickCount > 1 ? "s" : ""} en el enlace` : ""}
                    </p>
                    {j.lastError && j.status !== "SENT" ? <p className="mt-1 text-xs text-bad-600">{j.lastError}</p> : null}
                  </div>
                  <Badge tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Editar cliente" wide>
        <CustomerForm
          id={c.id}
          tagsEnabled={Boolean(ent.data?.features.customerTags)}
          initial={{ name: c.name, email: c.email, phone: c.phone ?? "", serviceName: c.serviceName ?? "", completedAt: local(c.completedAt), notes: c.notes ?? "", tags: c.tags.join(", ") }}
          onDone={(r) => { toast("ok", r.message ?? "Guardado"); setEdit(false); void d.reload(); }}
        />
      </Modal>
      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Eliminar cliente"
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancelar</Button>
          <Button variant="danger" onClick={async () => {
            try { await api(`/api/v1/customers/${id}`, { method: "DELETE" }); toast("ok", "Cliente eliminado"); router.push("/app/clientes"); } catch (e) { toast("bad", (e as ApiError).message); }
          }}>Eliminar definitivamente</Button>
        </>}
      >
        <p className="text-sm text-ink-600">Se eliminarán sus datos y su historial de envíos. Esta acción no se puede deshacer.</p>
      </Modal>
    </>
  );
}
