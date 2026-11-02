"use client";

import { AlertCircle, Ban, Bookmark, Copy, Heart, Loader2, MoreHorizontal, RotateCcw, Trash2, Clock3 } from "lucide-react";
import { useState } from "react";
import { fmtDate, fmtUsd } from "@/lib/api";
import { useJobActions } from "@/lib/hooks";
import type { Generation } from "@/lib/types";
import { DownloadLink, MediaView } from "./media";
import { Badge, Button, cx } from "./ui";

export const STATUS_LABEL: Record<string, string> = {
  queued: "En espera",
  processing: "Procesando",
  completed: "Completado",
  failed: "Error",
  cancelled: "Cancelado",
};

export function StatusBadge({ g }: { g: Generation }) {
  const tone = g.status === "completed" ? "ok" : g.status === "failed" ? "err" : g.status === "cancelled" ? "neutral" : "accent";
  return (
    <Badge tone={tone as any}>
      {(g.status === "processing" || g.status === "queued") && <span className="h-1.5 w-1.5 animate-rec rounded-full bg-accent" />}
      {STATUS_LABEL[g.status]}
      {g.status === "processing" && g.progress != null && ` ${Math.round(g.progress * 100)}%`}
    </Badge>
  );
}

export function JobProgress({ g }: { g: Generation }) {
  if (g.status !== "processing" && g.status !== "queued") return null;
  return (
    <div className="space-y-1.5">
      <div className="h-1 overflow-hidden rounded-full bg-line">
        {g.progress != null ? <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(2, g.progress * 100)}%` }} /> : <div className="skeleton h-full w-full" />}
      </div>
      <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        {g.status_message || (g.status === "queued" ? "En cola" : "Procesando")}
        {g.progress == null && g.status === "processing" && <span className="text-dim">· el proveedor no informa del porcentaje</span>}
      </p>
    </div>
  );
}

export function GenerationCard({ g, compact, onUse }: { g: Generation; compact?: boolean; onUse?: (assetId: string) => void }) {
  const a = useJobActions();
  const [menu, setMenu] = useState(false);
  const active = g.status === "queued" || g.status === "processing";
  const outputs = g.outputs || [];
  return (
    <div id={`gen-${g.id}`} className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-panel">
      {outputs.length > 0 ? (
        <div className={cx("grid gap-px bg-line", outputs.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {outputs.slice(0, 4).map((o) => (
            <div key={o.id} className={cx("group relative bg-black", o.kind === "audio" ? "h-36" : "aspect-video")}>
              <MediaView asset={o} />
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button onClick={() => a.favorite(o.id, !o.is_favorite)} className="grid h-8 w-8 place-items-center rounded-lg bg-black/70 backdrop-blur" aria-label="Favorito">
                  <Heart className={cx("h-4 w-4", o.is_favorite ? "fill-accent text-accent" : "text-white")} />
                </button>
                {onUse && (
                  <button onClick={() => onUse(o.id)} className="rounded-lg bg-black/70 px-2 text-[12px] text-white backdrop-blur">Usar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={cx("grid place-items-center bg-panel-2", compact ? "h-28" : "aspect-video")}>
          {active ? (
            <div className="flex flex-col items-center gap-2 text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <span className="font-mono text-[12px]">{g.status === "queued" ? "En cola…" : g.progress != null ? `${Math.round(g.progress * 100)}%` : "Generando…"}</span>
            </div>
          ) : g.status === "failed" ? (
            <AlertCircle className="h-6 w-6 text-err" />
          ) : g.status === "cancelled" ? (
            <Ban className="h-6 w-6 text-dim" />
          ) : (
            <Clock3 className="h-6 w-6 text-dim" />
          )}
        </div>
      )}
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge g={g} />
            <span className="truncate text-[12.5px] font-medium">{g.model_name}</span>
          </div>
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setMenu((m) => !m)} aria-label="Acciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menu && (
              <div className="animate-fade-up absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line-2 bg-panel p-1 shadow-2xl" onMouseLeave={() => setMenu(false)}>
                {active && <MenuItem icon={Ban} onClick={() => a.cancel(g.id)}>Cancelar</MenuItem>}
                {(g.status === "failed" || g.status === "cancelled") && <MenuItem icon={RotateCcw} onClick={() => a.retry(g.id)}>Reintentar</MenuItem>}
                {!g.is_child && <MenuItem icon={Copy} onClick={() => a.duplicate(g.id)}>Duplicar</MenuItem>}
                <MenuItem icon={Bookmark} onClick={() => a.save(g.id, !g.is_saved)}>{g.is_saved ? "Quitar de guardados" : "Guardar"}</MenuItem>
                {!active && <MenuItem icon={Trash2} danger onClick={() => confirm("¿Eliminar esta generación y sus resultados?") && a.remove(g.id, true)}>Eliminar</MenuItem>}
              </div>
            )}
          </div>
        </div>
        {!compact && g.prompt && <p className="line-clamp-2 text-[13px] leading-snug text-muted">{g.params?.user_prompt || g.prompt}</p>}
        <JobProgress g={g} />
        {g.status === "failed" && g.error && <p className="rounded-lg bg-err/[0.07] px-2.5 py-2 text-[12px] leading-snug text-[#ffb3bb]">{g.error}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-dim">
          {g.provider && <span>vía {g.provider}</span>}
          <span title={g.cost_note}>{fmtUsd(g.estimated_cost_usd)}</span>
          <span>{fmtDate(g.created_at)}</span>
          {g.attempt_log?.some((x) => !x.ok) && g.status === "completed" && <span className="text-warn">fallback usado</span>}
          {outputs[0] && <DownloadLink asset={outputs[0]} className="ml-auto" />}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: any; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-panel-2", danger ? "text-err" : "text-text")}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
