"use client";

import { AudioLines, Check, Download, FileVideo, Heart, ImageIcon, Loader2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { errMsg, fmtBytes, fmtDur, uploadFile } from "@/lib/api";
import { useAssets } from "@/lib/hooks";
import type { Asset } from "@/lib/types";
import { Button, cx, Empty, Modal, Spinner, Tabs } from "./ui";

export function MediaView({ asset, className, controls = true, fit = "contain" }: { asset: Asset; className?: string; controls?: boolean; fit?: "contain" | "cover" }) {
  if (asset.kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.url} alt={asset.name} className={cx("h-full w-full", fit === "contain" ? "object-contain" : "object-cover", className)} />;
  if (asset.kind === "video")
    return (
      <video
        src={asset.url}
        poster={asset.thumbnail_url || undefined}
        controls={controls}
        playsInline
        preload="metadata"
        className={cx("h-full w-full bg-black", fit === "contain" ? "object-contain" : "object-cover", className)}
      />
    );
  if (asset.kind === "audio")
    return (
      <div className={cx("flex h-full w-full flex-col justify-center gap-3 bg-panel-2 p-4", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {asset.thumbnail_url && <img src={asset.thumbnail_url} alt="" className="h-16 w-full object-fill opacity-90" />}
        <audio src={asset.url} controls={controls} className="w-full" preload="metadata" />
      </div>
    );
  return <div className="grid h-full place-items-center text-muted">Archivo</div>;
}

export function AssetThumb({ asset, selected, onClick, showMeta = true }: { asset: Asset; selected?: boolean; onClick?: () => void; showMeta?: boolean }) {
  const Icon = asset.kind === "video" ? FileVideo : asset.kind === "audio" ? AudioLines : ImageIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group relative aspect-square overflow-hidden rounded-xl border bg-panel-2 text-left transition",
        selected ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-2",
      )}
    >
      {asset.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumbnail_url} alt={asset.name} loading="lazy" className={cx("h-full w-full", asset.kind === "audio" ? "object-fill p-3" : "object-cover")} />
      ) : (
        <div className="grid h-full place-items-center text-dim">
          <Icon className="h-6 w-6" />
        </div>
      )}
      {showMeta && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 pt-6 pb-1.5">
          <span className="flex items-center gap-1 font-mono text-[10px] text-white/80">
            <Icon className="h-3 w-3" />
            {asset.duration ? fmtDur(asset.duration) : asset.width ? `${asset.width}×${asset.height}` : ""}
          </span>
          {asset.is_favorite && <Heart className="h-3 w-3 fill-accent text-accent" />}
        </div>
      )}
      {selected && (
        <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-accent">
          <Check className="h-3 w-3 text-white" />
        </span>
      )}
    </button>
  );
}

export function Dropzone({ accept, onUploaded, compact, label, projectId }: { accept: string; onUploaded: (a: Asset) => void; compact?: boolean; label?: string; projectId?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const handle = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      for (const f of Array.from(files)) {
        setProgress(0);
        try {
          const a = await uploadFile(f, { onProgress: setProgress, projectId });
          onUploaded(a);
          toast.success(`${f.name} subido`);
        } catch (e) {
          toast.error(errMsg(e));
        } finally {
          setProgress(null);
        }
      }
    },
    [onUploaded, projectId],
  );

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
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition",
        over ? "border-accent bg-accent/5" : "border-line-2 hover:border-[#4a4a55] hover:bg-panel-2",
        compact ? "gap-1 px-4 py-5" : "gap-2 px-6 py-10",
      )}
    >
      <input ref={input} type="file" accept={accept} multiple={!compact} hidden onChange={(e) => handle(e.target.files)} data-testid="file-input" />
      {progress != null ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <span className="font-mono text-xs text-muted">{Math.round(progress * 100)}%</span>
        </>
      ) : (
        <>
          <Upload className="h-5 w-5 text-muted" />
          <span className="text-sm">{label || "Arrastra un archivo o haz clic para subirlo"}</span>
          {!compact && <span className="text-xs text-dim">Se valida el formato real del archivo. El original nunca se modifica.</span>}
        </>
      )}
    </div>
  );
}

export function AssetPicker({ open, onClose, onPick, kind, title }: { open: boolean; onClose: () => void; onPick: (a: Asset) => void; kind?: "image" | "video" | "audio"; title?: string }) {
  const [tab, setTab] = useState<"library" | "upload">("library");
  const { data, isLoading, refetch } = useAssets({ kind, limit: 60 });
  const accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "image/*,video/*,audio/*";
  return (
    <Modal open={open} onClose={onClose} title={title || "Elegir archivo"} wide>
      <Tabs value={tab} onChange={setTab} items={[{ id: "library", label: "Biblioteca" }, { id: "upload", label: "Subir" }]} className="mb-4" />
      {tab === "upload" ? (
        <Dropzone
          accept={accept}
          onUploaded={(a) => {
            refetch();
            onPick(a);
            onClose();
          }}
        />
      ) : isLoading ? (
        <div className="py-10 text-center">
          <Spinner />
        </div>
      ) : !data?.items.length ? (
        <Empty title="Tu biblioteca está vacía" action={<Button onClick={() => setTab("upload")}>Subir un archivo</Button>} />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {data.items.map((a) => (
            <AssetThumb
              key={a.id}
              asset={a}
              onClick={() => {
                onPick(a);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

export function InputSlot({ label, asset, kind, onChange, optional }: { label: string; asset: Asset | null; kind: "image" | "video" | "audio"; onChange: (a: Asset | null) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</span>
        {optional && <span className="font-mono text-[10px] text-dim">opcional</span>}
      </div>
      {asset ? (
        <div className="group relative aspect-video overflow-hidden rounded-xl border border-line-2 bg-panel-2">
          <MediaView asset={asset} controls={false} />
          <div className="absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 via-transparent p-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <Button size="sm" onClick={() => setOpen(true)}>Cambiar</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Quitar</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-2 text-sm text-muted transition hover:border-[#4a4a55] hover:bg-panel-2 hover:text-text">
          <Upload className="h-4 w-4" />
          Elegir o subir
        </button>
      )}
      <AssetPicker open={open} onClose={() => setOpen(false)} onPick={onChange} kind={kind} title={label} />
    </div>
  );
}

export function DownloadLink({ asset, className }: { asset: Asset; className?: string }) {
  return (
    <a href={asset.download_url} className={cx("inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text", className)} download>
      <Download className="h-3.5 w-3.5" /> {fmtBytes(asset.size_bytes)}
    </a>
  );
}
