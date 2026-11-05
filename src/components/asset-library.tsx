"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, FileVideo, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, cn, EmptyState } from "./ui";

export interface Asset {
  id: string;
  url: string;
  filename: string;
  mime: string;
  size: number;
  kind: string;
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ assets: Asset[] }>("/api/assets");
      setAssets(r.assets);
    } catch (e) {
      toast.error((e as Error).message);
      setAssets([]);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { assets, refresh, setAssets };
}

export async function uploadFiles(files: FileList | File[], projectId?: string): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.set("file", file);
    if (projectId) fd.set("projectId", projectId);
    try {
      const r = await api<{ asset: Asset }>("/api/uploads", { method: "POST", body: fd });
      out.push(r.asset);
    } catch (e) {
      toast.error(`${file.name}: ${(e as Error).message}`);
    }
  }
  if (out.length) toast.success(out.length === 1 ? "Archivo subido" : `${out.length} archivos subidos`);
  return out;
}

export function Dropzone({ onFiles, compact, projectId }: { onFiles: (a: Asset[]) => void; compact?: boolean; projectId?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    onFiles(await uploadFiles(files, projectId));
    setBusy(false);
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors", compact ? "px-3 py-4" : "px-6 py-10", over ? "border-accent bg-accent-soft" : "border-line")}
    >
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,font/woff,font/woff2,.woff,.woff2" className="sr-only" onChange={(e) => handle(e.target.files)} />
      <Upload className="mb-2 size-5 text-muted" />
      <p className="text-[13px]">{busy ? "Subiendo…" : "Arrastra archivos aquí"}</p>
      <p className="mt-0.5 text-[11px] text-faint">PNG, JPG, WebP, AVIF, GIF, MP4, WebM, WOFF · máx. 8 MB</p>
      <Button size="sm" className="mt-3" loading={busy} onClick={() => input.current?.click()}>
        Elegir archivos
      </Button>
    </div>
  );
}

export function AssetGrid({ assets, onPick, onDelete }: { assets: Asset[]; onPick?: (a: Asset) => void; onDelete?: (a: Asset) => void }) {
  if (!assets.length) return <EmptyState title="La biblioteca está vacía">Sube imágenes, vídeos o fuentes para usarlos en tus webs.</EmptyState>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((a) => (
        <li key={a.id} className="group relative overflow-hidden rounded-lg border border-line bg-panel">
          <button type="button" onClick={() => onPick?.(a)} className={cn("block w-full", onPick ? "cursor-pointer" : "cursor-default")} aria-label={onPick ? `Usar ${a.filename}` : a.filename}>
            <div className="grid aspect-[4/3] place-items-center bg-elev">
              {a.kind === "image" ? <img src={a.url} alt="" className="size-full object-cover" loading="lazy" /> : a.kind === "video" ? <FileVideo className="size-6 text-muted" /> : <Type className="size-6 text-muted" />}
            </div>
            <div className="px-2.5 py-2 text-left">
              <p className="truncate text-xs">{a.filename}</p>
              <p className="text-[11px] text-faint">{(a.size / 1024).toFixed(0)} KB</p>
            </div>
          </button>
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button size="icon-sm" aria-label="Copiar URL" onClick={() => navigator.clipboard.writeText(location.origin + a.url).then(() => toast.success("URL copiada"))}>
              <Copy className="size-3.5" />
            </Button>
            {onDelete ? (
              <Button size="icon-sm" variant="danger" aria-label="Eliminar" onClick={() => onDelete(a)}>
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AssetLibrary() {
  const { assets, setAssets } = useAssets();
  async function remove(a: Asset) {
    if (!confirm(`¿Eliminar ${a.filename}? Las webs que lo usen dejarán de mostrarlo.`)) return;
    try {
      await api(`/api/assets/${a.id}`, { method: "DELETE" });
      setAssets((list) => (list ?? []).filter((x) => x.id !== a.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="space-y-6">
      <Dropzone onFiles={(added) => setAssets((list) => [...added, ...(list ?? [])])} />
      {assets === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-lg" />
          ))}
        </div>
      ) : (
        <AssetGrid assets={assets} onDelete={remove} />
      )}
    </div>
  );
}
