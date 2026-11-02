"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderInput, Heart, Pencil, Scissors, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api, errMsg, fmtBytes, fmtDate, fmtDur } from "@/lib/api";
import { useAssets } from "@/lib/hooks";
import type { Asset, Project } from "@/lib/types";
import { AssetThumb, Dropzone, MediaView } from "./media";
import { Badge, Button, cx, Empty, Input, Modal, Select, Spinner } from "./ui";

export function AssetGrid({ filters, allowUpload = true, projectId }: { filters: Record<string, any>; allowUpload?: boolean; projectId?: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const limit = 48;
  const { data, isLoading } = useAssets({ ...filters, kind: kind || undefined, q: q || undefined, limit, offset: page * limit });
  const [open, setOpen] = useState<Asset | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["assets"] });
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5">
          {[["", "Todo"], ["image", "Imágenes"], ["video", "Vídeos"], ["audio", "Audio"]].map(([k, l]) => (
            <button key={k} onClick={() => { setKind(k); setPage(0); }} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", kind === k ? "border-accent/60 bg-accent/10" : "border-line-2 text-muted hover:text-text")}>{l}</button>
          ))}
        </div>
        <Input className="sm:ml-auto sm:w-64" placeholder="Buscar por nombre…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>
      {allowUpload && <div className="mb-5"><Dropzone accept="image/*,video/*,audio/*" compact onUploaded={refresh} projectId={projectId} label="Subir imágenes, vídeos o audio" /></div>}
      {isLoading ? (
        <div className="py-10 text-center"><Spinner /></div>
      ) : !data?.items.length ? (
        <Empty title="No hay archivos">Los resultados de tus generaciones y los archivos que subas aparecerán aquí.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {data.items.map((a) => <AssetThumb key={a.id} asset={a} onClick={() => setOpen(a)} />)}
          </div>
          <div className="mt-5 flex items-center justify-center gap-3 font-mono text-[12px] text-muted">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button>
            {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} de {data.total}
            <Button size="sm" variant="ghost" disabled={(page + 1) * limit >= data.total} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        </>
      )}
      {open && <AssetDetail asset={open} onClose={() => setOpen(null)} onChange={(a) => { setOpen(a); refresh(); }} />}
    </div>
  );
}

function AssetDetail({ asset, onClose, onChange }: { asset: Asset; onClose: () => void; onChange: (a: Asset | null) => void }) {
  const projects = useQuery<{ items: Project[] }>({ queryKey: ["projects"], queryFn: () => api("/api/projects") });
  const [name, setName] = useState(asset.name);
  const patch = async (body: any) => {
    try {
      onChange(await api<Asset>(`/api/assets/${asset.id}`, { method: "PATCH", json: body }));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const remove = async () => {
    if (!confirm("¿Eliminar este archivo definitivamente?")) return;
    try {
      await api(`/api/assets/${asset.id}`, { method: "DELETE" });
      toast.success("Eliminado");
      onChange(null);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const meta = asset.meta || {};
  return (
    <Modal open onClose={onClose} title={asset.name || "Archivo"} wide>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className={cx("overflow-hidden rounded-xl bg-black", asset.kind === "audio" ? "h-48" : "aspect-video")}><MediaView asset={asset} /></div>
        <div className="space-y-4 text-[13px]">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            <Button size="icon" variant="outline" onClick={() => patch({ name })} aria-label="Renombrar"><Pencil className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={asset.is_favorite ? "primary" : "outline"} onClick={() => patch({ is_favorite: !asset.is_favorite })}><Heart className="h-3.5 w-3.5" /> {asset.is_favorite ? "Favorito" : "Añadir a favoritos"}</Button>
            <a href={asset.download_url} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-[13px] hover:bg-panel-2"><Download className="h-3.5 w-3.5" /> Descargar</a>
            {asset.kind === "image" && <Link href={`/edit/image?asset=${asset.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-[13px] hover:bg-panel-2"><Wand2 className="h-3.5 w-3.5" /> Editar</Link>}
            {asset.kind === "video" && <Link href={`/edit/video?asset=${asset.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-[13px] hover:bg-panel-2"><Scissors className="h-3.5 w-3.5" /> Editar</Link>}
          </div>
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-[11px] text-dim"><FolderInput className="h-3 w-3" /> Proyecto</span>
            <Select value={asset.project_id || ""} onChange={(e) => patch(e.target.value ? { project_id: e.target.value } : { clear_project: true })}>
              <option value="">Sin proyecto</option>
              {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 font-mono text-[11.5px]">
            <dt className="text-dim">Tipo</dt><dd>{asset.mime}</dd>
            <dt className="text-dim">Tamaño</dt><dd>{fmtBytes(asset.size_bytes)}</dd>
            {asset.width && (<><dt className="text-dim">Dimensiones</dt><dd>{asset.width}×{asset.height}</dd></>)}
            {asset.duration && (<><dt className="text-dim">Duración</dt><dd>{fmtDur(asset.duration)}{asset.fps ? ` · ${asset.fps} fps` : ""}</dd></>)}
            <dt className="text-dim">Origen</dt><dd><Badge>{asset.source}</Badge></dd>
            {meta.model_id && (<><dt className="text-dim">Modelo</dt><dd>{meta.model_id} vía {meta.provider}</dd></>)}
            {meta.seed != null && (<><dt className="text-dim">Semilla</dt><dd>{meta.seed}</dd></>)}
            {meta.stock && (<><dt className="text-dim">Atribución</dt><dd className="font-sans">{meta.stock.page_url ? <a href={meta.stock.page_url} target="_blank" rel="noreferrer" className="underline">{meta.stock.attribution}</a> : meta.stock.attribution}</dd></>)}
            <dt className="text-dim">Creado</dt><dd>{fmtDate(asset.created_at)}</dd>
          </dl>
          {meta.prompt && <p className="rounded-lg bg-panel-2 p-3 text-[12px] leading-relaxed text-muted">{meta.prompt}</p>}
          <Button variant="danger" size="sm" onClick={remove}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
        </div>
      </div>
    </Modal>
  );
}
