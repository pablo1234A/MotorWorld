"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Check, Download, ExternalLink, FileJson, Info, RotateCcw, Rocket, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { artMedia, motifFor } from "@/engine/art";
import { autofix } from "@/engine/autofix";
import type { Media } from "@/engine/schema";
import { hashString } from "@/engine/util";
import { validateDocument, type QaIssue } from "@/engine/validate";
import { api, ApiError, relativeTime } from "@/lib/api";
import { AssetGrid, Dropzone, useAssets } from "../asset-library";
import { Badge, Button, cn, Dialog, Field, Input, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "../ui";
import { useEditor } from "./store";

const SEV_ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };
const SEV_TONE = { error: "text-danger", warning: "text-warn", info: "text-muted" };
const CAT_LABEL: Record<string, string> = { links: "Enlaces", accessibility: "Accesibilidad", seo: "SEO", forms: "Formularios", design: "Diseño", content: "Contenido", performance: "Rendimiento" };

export function QaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const doc = useEditor((s) => s.doc);
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const setPage = useEditor((s) => s.setPage);
  const report = useMemo(() => (open ? validateDocument(doc) : null), [doc, open]);
  if (!report) return null;
  const fixable = report.issues.filter((i) => i.fixable).length;
  const goto = (i: QaIssue) => {
    if (i.pageId) setPage(i.pageId);
    if (i.sectionId) setTimeout(() => select(i.sectionId!), 0);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Control de calidad"
      description="Enlaces, accesibilidad, SEO, formularios, diseño y contenido. Se revisa también después de cada cambio de la IA."
      size="lg"
      footer={
        <Button
          variant="primary"
          disabled={!fixable}
          onClick={() => {
            const r = autofix(doc);
            commit(r.doc);
            toast.success(r.fixed.length ? `${r.fixed.length} correcciones aplicadas` : "Nada que corregir automáticamente", { description: r.fixed.slice(0, 3).join(" · ") });
          }}
        >
          <Wand2 className="size-4" /> Corregir automáticamente ({fixable})
        </Button>
      }
    >
      <div className="mb-5 flex items-center gap-4">
        <div className={cn("grid size-16 place-items-center rounded-2xl border text-xl font-semibold tabular-nums", report.score >= 90 ? "border-ok/40 text-ok" : report.score >= 70 ? "border-warn/40 text-warn" : "border-danger/40 text-danger")}>{report.score}</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(report.summary)
            .filter(([, n]) => n)
            .map(([k, n]) => (
              <Badge key={k}>
                {CAT_LABEL[k]} · {n}
              </Badge>
            ))}
          {!report.issues.length ? <Badge tone="ok">Sin incidencias</Badge> : null}
        </div>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {report.issues.map((i) => {
          const Icon = SEV_ICON[i.severity];
          return (
            <li key={i.id} className="flex items-start gap-2.5 px-3 py-2.5 text-[13px]">
              <Icon className={cn("mt-0.5 size-4 shrink-0", SEV_TONE[i.severity])} />
              <span className="flex-1">{i.message}</span>
              {i.fixable ? <Badge tone="accent">Autocorregible</Badge> : null}
              {i.sectionId || i.pageId ? (
                <Button size="xs" variant="ghost" onClick={() => goto(i)}>
                  Ir
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

interface Version {
  id: string;
  label: string;
  source: string;
  createdAt: string;
}

export function HistoryDialog({ open, onOpenChange, onSaveNow }: { open: boolean; onOpenChange: (o: boolean) => void; onSaveNow: () => Promise<void> }) {
  const projectId = useEditor((s) => s.projectId);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setVersions(null);
    api<{ versions: Version[] }>(`/api/projects/${projectId}/versions`).then((r) => setVersions(r.versions), (e) => toast.error(e.message));
  }, [open, projectId]);

  async function restore(v: Version) {
    setBusy(v.id);
    try {
      await onSaveNow();
      const r = await api<{ revision: number; doc: Parameters<ReturnType<typeof useEditor.getState>["init"]>[0]["doc"] }>(`/api/projects/${projectId}/versions/${v.id}`, { method: "POST", json: {} });
      const st = useEditor.getState();
      st.commit(r.doc);
      st.markSaved(r.revision, JSON.stringify(r.doc), true);
      toast.success(`Restaurada: ${v.label}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function snapshot() {
    const label = prompt("Nombre de la versión", `Versión ${new Date().toLocaleString("es-ES")}`);
    if (!label) return;
    const st = useEditor.getState();
    try {
      const r = await api<{ revision: number }>(`/api/projects/${projectId}`, { method: "PUT", json: { doc: st.doc, baseRevision: st.revision, version: { label, source: "manual" } } });
      st.markSaved(r.revision, JSON.stringify(st.doc), true);
      toast.success("Versión guardada");
      const list = await api<{ versions: Version[] }>(`/api/projects/${projectId}/versions`);
      setVersions(list.versions);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const SOURCE: Record<string, string> = { generate: "Generada", manual: "Manual", auto: "Automática", ai: "IA", publish: "Publicación", restore: "Restauración" };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Historial de versiones" description="Deshacer/rehacer cubre la sesión actual; las versiones quedan guardadas en el servidor." size="md" footer={<Button onClick={snapshot}>Guardar versión ahora</Button>}>
      {versions === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-11 rounded-lg" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{v.label}</p>
                <p className="text-[11px] text-faint">{relativeTime(v.createdAt)}</p>
              </div>
              <Badge tone={v.source === "publish" ? "ok" : v.source === "ai" ? "accent" : "neutral"}>{SOURCE[v.source] ?? v.source}</Badge>
              <Button size="xs" onClick={() => restore(v)} loading={busy === v.id}>
                <RotateCcw className="size-3" /> Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

interface PublishInfo {
  slug: string;
  url: string;
  publishedAt: string | null;
  upToDate: boolean;
  vercel: boolean;
  deployments: Array<{ id: string; provider: string; status: string; url: string | null; createdAt: string }>;
}

export function PublishDialog({ open, onOpenChange, onSaveNow }: { open: boolean; onOpenChange: (o: boolean) => void; onSaveNow: () => Promise<void> }) {
  const projectId = useEditor((s) => s.projectId);
  const doc = useEditor((s) => s.doc);
  const [info, setInfo] = useState<PublishInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [slug, setSlug] = useState("");
  const qa = useMemo(() => (open ? validateDocument(doc) : null), [doc, open]);
  const samples = doc.pages.flatMap((p) => p.sections.filter((s) => s.sample).map((s) => `${p.name}: ${s.type}`));
  const errors = qa?.issues.filter((i) => i.severity === "error") ?? [];

  async function load() {
    const r = await api<PublishInfo>(`/api/projects/${projectId}/publish`);
    setInfo(r);
    setSlug(r.slug);
  }
  useEffect(() => {
    if (open) load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function publish() {
    setBusy("publish");
    try {
      await onSaveNow();
      const r = await api<{ url: string }>(`/api/projects/${projectId}/publish${samples.length ? "?ack=samples" : ""}`, { method: "POST", json: {} });
      toast.success("Sitio publicado", { description: r.url, action: { label: "Abrir", onClick: () => window.open(r.url, "_blank", "noopener") } });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) toast.error(e.message, { description: "Abre Control de calidad para ver y corregir los errores." });
      else toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveSlug() {
    setBusy("slug");
    try {
      const r = await api<{ slug: string }>(`/api/projects/${projectId}`, { method: "PATCH", json: { slug } });
      useEditor.getState().setSlug(r.slug);
      toast.success("Dirección actualizada");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function vercel() {
    setBusy("vercel");
    try {
      await onSaveNow();
      const r = await api<{ url: string }>(`/api/projects/${projectId}/deploy`, { method: "POST", json: {} });
      toast.success("Despliegue enviado a Vercel", { description: r.url });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    if (!confirm("¿Retirar el sitio de Internet? Podrás volver a publicarlo cuando quieras.")) return;
    setBusy("unpublish");
    try {
      await api(`/api/projects/${projectId}/publish`, { method: "DELETE" });
      toast.success("Sitio despublicado");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const blocked = errors.length > 0 || (samples.length > 0 && !ack);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Publicar"
      description="Publica en el alojamiento integrado, despliega en Vercel o descarga el código."
      size="md"
      footer={
        <>
          {info?.publishedAt ? (
            <Button variant="ghost" onClick={unpublish} loading={busy === "unpublish"}>
              Despublicar
            </Button>
          ) : null}
          <Button variant="primary" onClick={publish} disabled={blocked} loading={busy === "publish"}>
            <Rocket className="size-4" /> {info?.publishedAt ? "Publicar cambios" : "Publicar sitio"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {info?.publishedAt ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px]">
                <span className="size-2 rounded-full bg-ok" /> Publicado {relativeTime(info.publishedAt)}
                {info.upToDate ? <Badge tone="ok">Al día</Badge> : <Badge tone="warn">Hay cambios sin publicar</Badge>}
              </p>
              <a href={info.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted hover:text-fg">
                {info.url} <ExternalLink className="size-3 shrink-0" />
              </a>
            </div>
          </div>
        ) : null}
        <Field label="Dirección">
          <div className="flex gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-lg border border-line bg-bg focus-within:border-accent">
              <span className="pl-2.5 font-mono text-[11px] text-faint">{typeof window !== "undefined" ? `${location.host}/s/` : "/s/"}</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className="h-8 min-w-0 flex-1 bg-transparent pr-2.5 font-mono text-[12px] focus:outline-none" aria-label="Slug" />
            </div>
            <Button onClick={saveSlug} disabled={!info || slug === info.slug || slug.length < 3} loading={busy === "slug"}>
              Guardar
            </Button>
          </div>
        </Field>
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted">Revisión previa</p>
          <p className="flex items-center gap-2 text-[13px]">
            {errors.length ? <AlertCircle className="size-4 text-danger" /> : <Check className="size-4 text-ok" />}
            {errors.length ? `${errors.length} error(es) de QA bloquean la publicación` : "Sin errores de QA"}
            {qa ? <span className="ml-auto text-xs text-faint">Puntuación {qa.score}/100</span> : null}
          </p>
          {samples.length ? (
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-[12px] text-warn">
              <p className="font-medium">{samples.length} sección(es) con contenido de ejemplo</p>
              <p className="mt-1 text-warn/80">Opiniones, cifras, precios o datos de contacto generados sin datos reales. Publicarlos como reales puede engañar a tus visitantes.</p>
              <label className="mt-2 flex items-center gap-2 text-fg">
                <Switch checked={ack} onCheckedChange={setAck} label="Confirmo" /> He revisado y sustituido o acepto este contenido
              </label>
            </div>
          ) : null}
        </div>
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-medium text-muted">Otros destinos</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={vercel} disabled={!info?.vercel} loading={busy === "vercel"} title={info?.vercel ? undefined : "Configura VERCEL_TOKEN en el servidor"}>
              Desplegar en Vercel
            </Button>
            <a href={`/api/projects/${projectId}/export`} className="press inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-elev px-3 text-[13px] hover:bg-hover" onClick={() => onSaveNow()}>
              <Download className="size-4" /> ZIP (Cloudflare, Netlify, Render…)
            </a>
          </div>
          {!info?.vercel ? <p className="mt-2 text-[11px] text-faint">Vercel necesita VERCEL_TOKEN en el servidor (ver Integraciones).</p> : null}
          {info?.deployments.filter((d) => d.provider === "vercel").length ? (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {info.deployments
                .filter((d) => d.provider === "vercel")
                .slice(0, 3)
                .map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <span className="truncate">{d.url ?? "—"}</span>
                    <span>{d.status}</span>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function ExportDialog({ open, onOpenChange, onSaveNow }: { open: boolean; onOpenChange: (o: boolean) => void; onSaveNow: () => Promise<void> }) {
  const projectId = useEditor((s) => s.projectId);
  const [busy, setBusy] = useState<string | null>(null);
  async function download(format: "zip" | "json") {
    setBusy(format);
    try {
      await onSaveNow();
      const a = document.createElement("a");
      a.href = `/api/projects/${projectId}/export?format=${format}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => setBusy(null), 800);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Exportar" description="El código es tuyo: sin dependencias, sin CDNs de terceros, listo para cualquier hosting." size="md">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => download("zip")} className="press rounded-xl border border-line bg-bg p-4 text-left hover:border-line-strong">
          <Download className="size-5 text-accent" />
          <p className="mt-3 text-[13px] font-medium">Sitio estático (.zip)</p>
          <p className="mt-1 text-xs text-muted">HTML por página, CSS y JS compartidos, imágenes, sitemap, robots y README de despliegue.</p>
          {busy === "zip" ? <p className="mt-2 text-xs text-accent">Preparando…</p> : null}
        </button>
        <button type="button" onClick={() => download("json")} className="press rounded-xl border border-line bg-bg p-4 text-left hover:border-line-strong">
          <FileJson className="size-5 text-accent" />
          <p className="mt-3 text-[13px] font-medium">Documento del proyecto (.json)</p>
          <p className="mt-1 text-xs text-muted">Estructura completa del sitio para copias de seguridad o para reimportarla.</p>
          {busy === "json" ? <p className="mt-2 text-xs text-accent">Preparando…</p> : null}
        </button>
      </div>
    </Dialog>
  );
}

interface Submission {
  id: string;
  formId: string;
  page: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
}

export function SubmissionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useEditor((s) => s.projectId);
  const [items, setItems] = useState<Submission[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setItems(null);
    api<{ submissions: Submission[] }>(`/api/projects/${projectId}/submissions`).then(
      (r) => {
        setItems(r.submissions);
        const unread = r.submissions.filter((s) => !s.read).map((s) => s.id);
        if (unread.length) api(`/api/projects/${projectId}/submissions`, { method: "PATCH", json: { ids: unread, read: true } }).catch(() => undefined);
      },
      (e) => toast.error(e.message),
    );
  }, [open, projectId]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Formularios recibidos"
      description="Envíos de los formularios de tu sitio publicado o exportado."
      size="lg"
      footer={
        <a href={`/api/projects/${projectId}/submissions?format=csv`} className="press inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-elev px-3 text-[13px] hover:bg-hover">
          <Download className="size-4" /> Descargar CSV
        </a>
      }
    >
      {items === null ? (
        <div className="skeleton h-24 rounded-lg" />
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted">Aún no hay envíos. Aparecerán aquí en cuanto alguien use un formulario del sitio publicado.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-bg p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
                <span>
                  {new Date(s.createdAt).toLocaleString("es-ES")} · {s.page}
                </span>
                {!s.read ? <Badge tone="accent">Nuevo</Badge> : null}
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[140px_1fr]">
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="break-words whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

interface StockImage {
  id: string;
  src: string;
  thumb: string;
  alt: string;
  credit: { name: string; url: string; provider: "unsplash" | "pexels" };
  downloadLocation?: string;
}

export function MediaPicker({ target, onClose }: { target: { sectionId: string; field: string; itemId?: string } | null; onClose: () => void }) {
  const projectId = useEditor((s) => s.projectId);
  const { assets, setAssets } = useAssets();
  const [q, setQ] = useState("");
  const [stock, setStock] = useState<{ results: StockImage[]; provider: string } | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [url, setUrl] = useState("");

  const current = useMemo(() => {
    if (!target) return null;
    const st = useEditor.getState();
    const s = st.doc.pages.find((p) => p.id === st.pageId)?.sections.find((x) => x.id === target.sectionId);
    if (!s) return null;
    const media = target.itemId ? s.content.items?.find((i) => i.id === target.itemId)?.image : s.content.image;
    return { s, media };
  }, [target]);

  useEffect(() => {
    if (target) {
      setQ(current?.media?.query ?? current?.s.content.heading?.slice(0, 40) ?? "");
      setStock(null);
      setStockError(null);
    }
  }, [target, current]);

  function apply(media: Media) {
    if (!target || !current) return;
    const st = useEditor.getState();
    const s = current.s;
    const alt = media.alt || current.media?.alt || s.content.heading || "Imagen";
    const m = { ...media, alt };
    if (target.itemId) st.apply([{ op: "update_section", pageId: st.pageId, sectionId: s.id, patch: { content: { items: (s.content.items ?? []).map((i) => (i.id === target.itemId ? { ...i, image: m } : i)) } } }]);
    else st.apply([{ op: "update_section", pageId: st.pageId, sectionId: s.id, patch: { content: { image: m } } }]);
    onClose();
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setStockError(null);
    try {
      setStock(await api(`/api/images/search?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setStockError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  const theme = useEditor((s) => s.doc.theme);
  const generated = useMemo(() => Array.from({ length: 6 }, (_, i) => artMedia(theme, hashString(q || "art") + i * 131, current?.s.content.heading ?? "Arte", q, motifFor(theme, i))), [theme, q, current]);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()} title="Elegir imagen" size="xl">
      <Tabs defaultValue="library">
        <TabsList className="mb-4 px-0">
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
          <TabsTrigger value="stock">Fotos de stock</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="generated">Arte generativo</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="space-y-4">
          <Dropzone compact projectId={projectId} onFiles={(a) => {
            setAssets((l) => [...a, ...(l ?? [])]);
            if (a[0]) apply({ kind: a[0].kind === "video" ? "video" : "image", src: a[0].url, alt: "", credit: { name: "", url: "", provider: "upload" } });
          }} />
          {assets ? <AssetGrid assets={assets.filter((a) => a.kind !== "font")} onPick={(a) => apply({ kind: a.kind === "video" ? "video" : "image", src: a.url, alt: "", credit: { name: "", url: "", provider: "upload" } })} /> : <div className="skeleton h-32 rounded-lg" />}
        </TabsContent>
        <TabsContent value="stock">
          <form onSubmit={search} className="mb-4 flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca en inglés para más resultados: restaurant interior" />
            <Button type="submit" loading={searching}>
              <Search className="size-4" /> Buscar
            </Button>
          </form>
          {stockError ? <p className="rounded-lg border border-line bg-bg p-4 text-[13px] text-muted">{stockError}</p> : null}
          {stock ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stock.results.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    className="press block w-full overflow-hidden rounded-lg border border-line"
                    onClick={() => {
                      if (img.downloadLocation) api("/api/images/search", { method: "POST", json: { downloadLocation: img.downloadLocation } }).catch(() => undefined);
                      apply({ kind: "image", src: img.src, alt: img.alt, query: q, credit: img.credit });
                    }}
                  >
                    <img src={img.thumb} alt={img.alt} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </button>
                  <p className="mt-1 truncate text-[11px] text-faint">
                    {img.credit.name} · {img.credit.provider}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </TabsContent>
        <TabsContent value="url">
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <Button disabled={!/^https:\/\//.test(url)} onClick={() => apply({ kind: /\.(mp4|webm)(\?|$)/i.test(url) ? "video" : "image", src: url, alt: "" })}>
              Usar
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-faint">Asegúrate de tener derechos de uso sobre la imagen.</p>
        </TabsContent>
        <TabsContent value="generated">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {generated.map((m, i) => (
              <li key={i}>
                <button type="button" className="press block w-full overflow-hidden rounded-lg border border-line" onClick={() => apply(m)}>
                  <img src={m.src} alt="" className="aspect-[4/3] w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">Composiciones abstractas con los colores de tu tema. Útiles como marcador mientras consigues fotos reales.</p>
        </TabsContent>
      </Tabs>
    </Dialog>
  );
}
