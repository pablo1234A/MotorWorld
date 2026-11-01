"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Lock, MessageSquareReply, RefreshCw, Star, Unplug } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/Display";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageLoader } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Stars } from "@/components/app/Stars";

type Summary = {
  status: string; locationTitle: string | null; needsLocation: boolean; lastSyncAt: string | null; lastError: string | null;
  averageRating: number | null; totalReviewCount: number | null; recentCount: number; recentAverage: number | null; attributedRecent: number; days: number;
};
type R = { id: string; reviewerName: string; starRating: number; comment: string | null; createTime: string; replyComment: string | null; replyTime: string | null; job: { id: string; toName: string; sentAt: string } | null };
type Data = { configured: boolean; summary: Summary | null; items: R[]; total: number; page: number; canReply: boolean };

function ReviewsPage() {
  const sp = useSearchParams();
  const toast = useToast();
  const [filter, setFilter] = useState<{ rating?: number; unreplied?: boolean }>({});
  const [page, setPage] = useState(1);
  const d = useApi<Data>(`/api/v1/reviews?page=${page}${filter.rating ? `&rating=${filter.rating}` : ""}${filter.unreplied ? "&unreplied=1" : ""}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [replying, setReplying] = useState<R | null>(null);
  const [reply, setReply] = useState("");
  const [locs, setLocs] = useState<{ account: string; location: string; title: string }[] | null>(null);

  if (d.loading && !d.data) return <PageLoader />;
  if (d.error) return <Alert tone="bad">{d.error.message}</Alert>;
  const x = d.data!;
  const s = x.summary;

  const connect = async () => {
    setBusy("connect");
    try { window.location.href = (await api<{ url: string }>("/api/v1/reviews/connect", { method: "POST", body: {} })).url; }
    catch (e) { toast("bad", (e as ApiError).message); setBusy(null); }
  };
  const sync = async () => {
    setBusy("sync");
    try { const r = await api<{ synced: number }>("/api/v1/reviews/sync", { method: "POST", body: {} }); toast("ok", `${r.synced} reseñas sincronizadas`); await d.reload(); }
    catch (e) { toast("bad", (e as ApiError).message); }
    setBusy(null);
  };
  const loadLocations = async () => {
    setBusy("locs");
    try { setLocs((await api<{ locations: { account: string; location: string; title: string }[] }>("/api/v1/reviews/locations")).locations); }
    catch (e) { toast("bad", (e as ApiError).message); }
    setBusy(null);
  };

  return (
    <>
      <PageHeader
        title="Reseñas"
        description="Las reseñas reales de tu ficha de Google, tu valoración media y respuestas desde el panel."
        actions={s ? <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={busy === "sync"} onClick={sync} disabled={s.needsLocation}>Sincronizar ahora</Button> : undefined}
      />
      {sp.get("connected") ? <Alert tone="ok" className="mb-4">Ficha de Google conectada.</Alert> : null}
      {sp.get("error") ? <Alert tone="bad" className="mb-4">{sp.get("error")}</Alert> : null}

      {!s ? (
        <Card>
          <EmptyState icon={<Star className="h-5 w-5" />} title="Conecta tu ficha de Google Business Profile" action={<Button loading={busy === "connect"} disabled={!x.configured} onClick={connect}>Conectar con Google</Button>}>
            Verás aquí cada reseña nueva, tu valoración media y cuántas llegan después de tus solicitudes. Solo pedimos permiso para gestionar tu ficha; nunca publicamos nada sin que lo escribas tú.
            {!x.configured ? <span className="mt-2 block text-warn-700">La conexión con Google no está configurada en el servidor.</span> : null}
          </EmptyState>
        </Card>
      ) : (
        <>
          {s.status === "NEEDS_REAUTH" ? <Alert tone="bad" className="mb-4" title="Hay que volver a autorizar Google" action={<Button size="sm" onClick={connect}>Reconectar</Button>}>{s.lastError}</Alert> : null}
          {s.needsLocation ? (
            <Card className="mb-4">
              <CardHeader title="Elige tu ficha" description="Tu cuenta de Google gestiona varias fichas. Elige la de este negocio." />
              {locs ? (
                <ul className="space-y-2">
                  {locs.map((l) => (
                    <li key={l.location} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-3">
                      <span className="text-sm font-medium">{l.title}</span>
                      <Button size="sm" onClick={async () => { await api("/api/v1/reviews/location", { body: { account: l.account, location: l.location } }); toast("ok", "Ficha seleccionada"); await d.reload(); }}>Usar esta</Button>
                    </li>
                  ))}
                  {!locs.length ? <p className="text-sm text-ink-500">No hemos encontrado fichas en esta cuenta de Google.</p> : null}
                </ul>
              ) : <Button variant="secondary" loading={busy === "locs"} onClick={loadLocations}>Ver mis fichas</Button>}
            </Card>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Valoración media en Google" value={s.averageRating ? s.averageRating.toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "—"} hint={s.averageRating ? <Stars n={Math.round(s.averageRating)} /> : "Pendiente de sincronizar"} />
            <Stat label="Reseñas totales" value={s.totalReviewCount ?? "—"} hint={s.locationTitle ?? undefined} />
            <Stat label={`Nuevas (${s.days} días)`} value={s.recentCount} hint={s.recentAverage ? `Media del periodo: ${s.recentAverage.toLocaleString("es-ES")} ★` : undefined} />
            <Stat label="Probablemente tras tu solicitud" value={s.attributedRecent} hint="Estimado por coincidencia de nombre" />
          </div>
          <p className="mt-2 text-xs text-ink-500">Última sincronización: {fmtDate(s.lastSyncAt, true)} · se actualiza automáticamente cada 6 horas.</p>

          <Card className="mt-4" padded={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-4">
              <button onClick={() => { setFilter({}); setPage(1); }} className={clsx("rounded-md px-3 py-1.5 text-sm", !filter.rating && !filter.unreplied ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-100")}>Todas</button>
              <button onClick={() => { setFilter({ unreplied: true }); setPage(1); }} className={clsx("rounded-md px-3 py-1.5 text-sm", filter.unreplied ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-100")}>Sin responder</button>
              {[5, 4, 3, 2, 1].map((n) => <button key={n} onClick={() => { setFilter({ rating: n }); setPage(1); }} className={clsx("rounded-md px-3 py-1.5 text-sm", filter.rating === n ? "bg-ink-800 text-white" : "text-ink-600 hover:bg-ink-100")}>{n} ★</button>)}
            </div>
            {x.items.length === 0 ? <EmptyState title="No hay reseñas en esta vista" /> : (
              <ul className="divide-y divide-ink-100">
                {x.items.map((r) => (
                  <li key={r.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{r.reviewerName}</p>
                        <div className="mt-0.5 flex items-center gap-2"><Stars n={r.starRating} /><span className="text-xs text-ink-500">{fmtDate(r.createTime)}</span></div>
                      </div>
                      {r.job ? <Badge tone="star" className="max-w-full">Posible respuesta a tu solicitud del {fmtDate(r.job.sentAt)}</Badge> : null}
                    </div>
                    {r.comment ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{r.comment}</p> : <p className="mt-3 text-sm italic text-ink-400">Sin comentario</p>}
                    {r.replyComment ? (
                      <div className="mt-3 rounded-lg bg-cream-200/70 p-3 text-sm"><p className="text-xs font-semibold text-ink-500">Tu respuesta · {fmtDate(r.replyTime)}</p><p className="mt-1 whitespace-pre-wrap">{r.replyComment}</p></div>
                    ) : null}
                    <div className="mt-3">
                      {x.canReply ? (
                        <Button size="sm" variant="ghost" icon={<MessageSquareReply className="h-4 w-4" />} onClick={() => { setReplying(r); setReply(r.replyComment ?? ""); }}>{r.replyComment ? "Editar respuesta" : "Responder"}</Button>
                      ) : <span className="inline-flex items-center gap-1 text-xs text-star-800"><Lock className="h-3 w-3" />Responder desde el panel está disponible a partir del plan Pro</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {x.total > 20 ? (
              <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-4 py-3 text-sm">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span className="tabular-nums text-ink-500">{page} / {Math.ceil(x.total / 20)}</span>
                <Button size="sm" variant="ghost" disabled={page >= Math.ceil(x.total / 20)} onClick={() => setPage(page + 1)}>Siguiente</Button>
              </div>
            ) : null}
          </Card>
          <p className="mt-4 text-xs text-ink-500">La atribución a una solicitud es una estimación (mismo nombre y reseña en los 30 días siguientes al envío); Google no indica quién llegó a través de tu enlace.</p>
          <div className="mt-6">
            <Button variant="ghost" size="sm" icon={<Unplug className="h-4 w-4" />} onClick={async () => { await api("/api/v1/reviews/connection", { method: "DELETE" }); toast("ok", "Ficha desconectada"); await d.reload(); }}>Desconectar ficha de Google</Button>
          </div>
        </>
      )}

      <Modal open={Boolean(replying)} onClose={() => setReplying(null)} title={`Responder a ${replying?.reviewerName ?? ""}`} footer={<Button loading={busy === "reply"} disabled={reply.trim().length < 2} onClick={async () => {
        setBusy("reply");
        try { await api(`/api/v1/reviews/${replying!.id}/reply`, { body: { comment: reply } }); toast("ok", "Respuesta publicada en Google"); setReplying(null); await d.reload(); }
        catch (e) { toast("bad", (e as ApiError).message); }
        setBusy(null);
      }}>Publicar respuesta</Button>}>
        {replying ? (
          <div className="space-y-3">
            <Stars n={replying.starRating} />
            {replying.comment ? <p className="rounded-lg bg-cream-200/70 p-3 text-sm">{replying.comment}</p> : null}
            <Textarea label="Tu respuesta (pública)" rows={5} value={reply} onChange={(e) => setReply(e.target.value)} help="Se publica en Google con el nombre de tu negocio. Agradece y, si algo salió mal, ofrece una solución." />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><ReviewsPage /></Suspense>;
}
