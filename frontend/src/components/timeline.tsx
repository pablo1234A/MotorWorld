"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, Film, Pause, Play, Plus, Save, Subtitles, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errMsg, fmtDur } from "@/lib/api";
import { useJob } from "@/lib/hooks";
import type { Asset } from "@/lib/types";
import { JobProgress } from "./jobs";
import { AssetPicker, MediaView } from "./media";
import { Badge, Button, Card, cx, Input, Label, Notice, Select } from "./ui";

export type TClip = {
  id: string;
  asset_id?: string | null;
  start: number;
  end?: number | null;
  in: number;
  out?: number | null;
  speed: number;
  volume_db: number;
  still_duration: number;
  transition_in?: { type: string; duration: number } | null;
  effects: any[];
  fade_in: number;
  fade_out: number;
  text: string;
  label: string;
};
export type TTrack = { id: string; kind: "video" | "audio" | "subtitle"; name: string; muted: boolean; volume_db: number; clips: TClip[] };
export type TData = { fps: number; width: number; height: number; burn_subtitles: boolean; tracks: TTrack[] };
type TL = { id: string; name: string; data: TData; version: number; last_render_asset_id?: string | null };

const uid = () => Math.random().toString(36).slice(2, 9);
const TRANSITIONS = ["cut", "crossfade", "fade_black", "fade_white", "dissolve", "wipe_left", "wipe_right", "slide_left", "slide_up", "circle_open", "zoom"];
const EFFECTS = ["", "cinematic", "teal_orange", "noir", "warm", "cool", "vintage", "bleach_bypass", "day_for_night", "vivid"];

function useAssetMap(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery<Record<string, Asset>>({
    queryKey: ["asset-map", key],
    queryFn: async () => {
      const out: Record<string, Asset> = {};
      await Promise.all(key.map(async (id) => {
        try { out[id] = await api<Asset>(`/api/assets/${id}`); } catch { /* deleted */ }
      }));
      return out;
    },
    enabled: key.length > 0,
    staleTime: 60_000,
  });
}

export function clipDuration(c: TClip, a?: Asset): number {
  if (a?.kind === "image" || !a) return c.still_duration || 3;
  const out = c.out ?? a.duration ?? c.still_duration;
  return Math.max(0.1, (out - c.in) / (c.speed || 1));
}

/** Absolute positions (seconds) for each clip; main track is magnetic. */
function layout(data: TData, assets: Record<string, Asset>) {
  const pos: Record<string, { start: number; dur: number }> = {};
  let total = 0;
  data.tracks.forEach((t, ti) => {
    if (t.kind === "video" && ti === data.tracks.findIndex((x) => x.kind === "video")) {
      let cursor = 0;
      [...t.clips].sort((a, b) => a.start - b.start).forEach((c, i) => {
        const dur = clipDuration(c, assets[c.asset_id || ""]);
        const overlap = i > 0 && c.transition_in && c.transition_in.type !== "cut" ? c.transition_in.duration : 0;
        const start = Math.max(0, cursor - overlap);
        pos[c.id] = { start, dur };
        cursor = start + dur;
      });
      total = Math.max(total, cursor);
    } else {
      t.clips.forEach((c) => {
        const dur = t.kind === "subtitle" ? Math.max(0.2, (c.end ?? c.start + 2) - c.start) : clipDuration(c, assets[c.asset_id || ""]);
        pos[c.id] = { start: c.start, dur };
      });
    }
  });
  return { pos, total };
}

export function TimelineEditor({ timelineId }: { timelineId: string }) {
  const qc = useQueryClient();
  const tl = useQuery<TL>({ queryKey: ["timeline", timelineId], queryFn: () => api(`/api/timelines/${timelineId}`) });
  const [data, setData] = useState<TData | null>(null);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<{ track: string; clip: string } | null>(null);
  const [zoom, setZoom] = useState(60);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const preview = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (tl.data && !dirty) {
      setData(tl.data.data);
      setVersion(tl.data.version);
      setRenderId(tl.data.last_render_asset_id || null);
    }
  }, [tl.data, dirty]);

  const ids = useMemo(() => (data ? data.tracks.flatMap((t) => t.clips.map((c) => c.asset_id).filter(Boolean) as string[]) : []), [data]);
  const assets = useAssetMap(ids).data || {};
  const { pos, total } = useMemo(() => (data ? layout(data, assets) : { pos: {}, total: 0 }), [data, assets]);
  const timelineEnd = Math.max(total, ...Object.values(pos).map((p) => p.start + p.dur), 10);

  const mutate = useCallback((fn: (d: TData) => TData) => {
    setData((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const r = await api<TL>(`/api/timelines/${timelineId}`, { method: "PUT", json: { data, version } });
      setVersion(r.version);
      setDirty(false);
      qc.setQueryData(["timeline", timelineId], r);
      toast.success("Montaje guardado");
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const job = useJob(jobId, (g) => {
    setJobId(null);
    if (g.status === "completed") {
      setRenderId(g.output_asset_ids[0]);
      toast.success("Render terminado");
    } else if (g.status === "failed") toast.error(g.error || "El render falló");
  });
  const renderAsset = useQuery<Asset>({ queryKey: ["asset", renderId], queryFn: () => api(`/api/assets/${renderId}`), enabled: !!renderId });

  const render = async () => {
    if (dirty && !(await save())) return;
    try {
      const g = await api<{ id: string }>(`/api/timelines/${timelineId}/render`, { method: "POST" });
      setJobId(g.id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  // --- playback preview (main video track) ---
  const main = data?.tracks.find((t) => t.kind === "video");
  const activeClip = useMemo(() => {
    if (!main) return null;
    const list = [...main.clips].sort((a, b) => (pos[a.id]?.start ?? 0) - (pos[b.id]?.start ?? 0));
    return list.filter((c) => pos[c.id] && playhead >= pos[c.id].start && playhead < pos[c.id].start + pos[c.id].dur).pop() || null;
  }, [main, pos, playhead]);
  const activeAsset = activeClip?.asset_id ? assets[activeClip.asset_id] : undefined;
  const activeSub = data?.tracks.filter((t) => t.kind === "subtitle" && !t.muted).flatMap((t) => t.clips).find((c) => playhead >= c.start && playhead < (c.end ?? c.start + 2));

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setPlayhead((p) => {
        const n = p + (now - last) / 1000;
        if (n >= total) {
          setPlaying(false);
          return 0;
        }
        return n;
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  useEffect(() => {
    const v = preview.current;
    if (!v || !activeClip || activeAsset?.kind !== "video") return;
    const target = activeClip.in + (playhead - pos[activeClip.id].start) * activeClip.speed;
    if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    v.playbackRate = activeClip.speed;
    if (playing && v.paused) v.play().catch(() => null);
    if (!playing && !v.paused) v.pause();
  }, [playhead, activeClip, activeAsset, playing, pos]);

  if (!data) return <div className="skeleton h-96 rounded-2xl" />;

  const selected = sel ? data.tracks.find((t) => t.id === sel.track)?.clips.find((c) => c.id === sel.clip) : null;
  const selTrack = sel ? data.tracks.find((t) => t.id === sel.track) : null;
  const patchClip = (patch: Partial<TClip>) => sel && mutate((d) => {
    const t = d.tracks.find((x) => x.id === sel.track)!;
    t.clips = t.clips.map((c) => (c.id === sel.clip ? { ...c, ...patch } : c));
    return d;
  });

  const addAsset = (trackId: string, a: Asset) => mutate((d) => {
    const t = d.tracks.find((x) => x.id === trackId)!;
    const isMain = t === d.tracks.find((x) => x.kind === "video");
    const start = isMain ? (t.clips.length ? Math.max(...t.clips.map((c) => c.start)) + 1 : 0) : playhead;
    t.clips.push({ id: uid(), asset_id: a.id, start, in: 0, out: a.kind === "image" ? null : a.duration ?? null, speed: 1, volume_db: 0, still_duration: 3,
      transition_in: null, effects: [], fade_in: 0, fade_out: 0, text: "", label: a.name, end: null });
    return d;
  });

  const move = (dir: -1 | 1) => sel && mutate((d) => {
    const t = d.tracks.find((x) => x.id === sel.track)!;
    const list = [...t.clips].sort((a, b) => a.start - b.start);
    const i = list.findIndex((c) => c.id === sel.clip);
    const j = i + dir;
    if (j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, k) => (c.start = k));
    t.clips = list;
    return d;
  });

  const startDrag = (e: React.PointerEvent, track: TTrack, clip: TClip) => {
    const isMain = track === main;
    setSel({ track: track.id, clip: clip.id });
    if (isMain) return;
    const x0 = e.clientX;
    const s0 = clip.start;
    const e0 = clip.end;
    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / zoom;
      mutate((d) => {
        const t = d.tracks.find((x) => x.id === track.id)!;
        t.clips = t.clips.map((c) => (c.id === clip.id ? { ...c, start: Math.max(0, +(s0 + dt).toFixed(2)), end: e0 != null ? Math.max(0.2, +(e0 + dt).toFixed(2)) : c.end } : c));
        return d;
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="relative bg-black" style={{ aspectRatio: `${data.width}/${data.height}`, maxHeight: "52vh", margin: "0 auto" }}>
            {activeAsset?.kind === "video" ? (
              <video ref={preview} src={activeAsset.url} muted={false} playsInline className="absolute inset-0 h-full w-full object-contain" />
            ) : activeAsset?.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeAsset.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 grid place-items-center font-mono text-[12px] text-dim">{main?.clips.length ? "—" : "Añade clips a la pista principal"}</div>
            )}
            {activeSub && <p className="absolute inset-x-0 bottom-[8%] px-6 text-center text-[15px] font-semibold text-white [text-shadow:0_2px_4px_#000]">{activeSub.text}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
            <Button size="icon" variant="secondary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausa" : "Reproducir"}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <span className="font-mono text-[12px] text-muted">{fmtDur(playhead)} / {fmtDur(total)}</span>
            <span className="text-[11px] text-dim">Previsualización de la pista principal. El render final (FFmpeg) mezcla todas las pistas.</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={save} loading={saving} disabled={!dirty}><Save className="h-3.5 w-3.5" /> {dirty ? "Guardar" : "Guardado"}</Button>
              <Button size="sm" variant="primary" onClick={render} loading={!!jobId}><Film className="h-3.5 w-3.5" /> Renderizar</Button>
            </div>
          </div>
          {job.data && <div className="border-t border-line p-3"><JobProgress g={job.data} /></div>}
        </Card>

        <Card className="space-y-4 p-4">
          {selected && selTrack ? (
            <ClipInspector clip={selected} track={selTrack} asset={selected.asset_id ? assets[selected.asset_id] : undefined} isMain={selTrack === main}
              onPatch={patchClip} onMove={move}
              onDelete={() => { mutate((d) => { const t = d.tracks.find((x) => x.id === sel!.track)!; t.clips = t.clips.filter((c) => c.id !== sel!.clip); return d; }); setSel(null); }} />
          ) : (
            <div className="space-y-4">
              <Label>Proyecto de montaje</Label>
              <div className="grid grid-cols-3 gap-2">
                <div><span className="text-[11px] text-dim">Ancho</span><Input type="number" value={data.width} onChange={(e) => mutate((d) => ({ ...d, width: Number(e.target.value) }))} /></div>
                <div><span className="text-[11px] text-dim">Alto</span><Input type="number" value={data.height} onChange={(e) => mutate((d) => ({ ...d, height: Number(e.target.value) }))} /></div>
                <div><span className="text-[11px] text-dim">FPS</span><Input type="number" value={data.fps} onChange={(e) => mutate((d) => ({ ...d, fps: Number(e.target.value) }))} /></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[[1920, 1080, "16:9 HD"], [3840, 2160, "4K"], [1080, 1920, "9:16"], [1080, 1080, "1:1"]].map(([w, h, l]) => (
                  <button key={String(l)} onClick={() => mutate((d) => ({ ...d, width: w as number, height: h as number }))} className="rounded-full border border-line-2 px-2.5 py-1 font-mono text-[11px] text-muted hover:text-text">{l}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" className="accent-[#ff5a36]" checked={data.burn_subtitles} onChange={(e) => mutate((d) => ({ ...d, burn_subtitles: e.target.checked }))} /> Quemar subtítulos en el render</label>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <a className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text" href={`/api/timelines/${timelineId}/export.otio`}><Download className="h-3.5 w-3.5" /> OpenTimelineIO</a>
                <a className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text" href={`/api/timelines/${timelineId}/export.srt`}><Subtitles className="h-3.5 w-3.5" /> Subtítulos .srt</a>
              </div>
              <p className="text-[12px] text-dim">Selecciona un clip para editarlo. En la pista principal los clips van uno tras otro; en el resto puedes arrastrarlos en el tiempo.</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-3 py-2">
          <span className="font-mono text-[11px] text-dim">ZOOM</span>
          <input type="range" min={15} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-32" />
          <Button size="sm" variant="ghost" onClick={() => mutate((d) => { d.tracks.push({ id: uid(), kind: "audio", name: `Audio ${d.tracks.filter((t) => t.kind === "audio").length + 1}`, muted: false, volume_db: 0, clips: [] }); return d; })}><Plus className="h-3.5 w-3.5" /> Pista de audio</Button>
          <Button size="sm" variant="ghost" onClick={() => mutate((d) => { d.tracks.splice(d.tracks.filter((t) => t.kind === "video").length, 0, { id: uid(), kind: "video", name: "Superposición", muted: false, volume_db: 0, clips: [] }); return d; })}><Plus className="h-3.5 w-3.5" /> Pista de vídeo</Button>
        </div>
        <div className="overflow-x-auto">
          <div style={{ width: 150 + timelineEnd * zoom + 80 }} className="relative">
            <div className="sticky top-0 ml-[150px] h-6 border-b border-line" onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPlayhead(Math.max(0, (e.clientX - r.left) / zoom)); }}>
              {Array.from({ length: Math.ceil(timelineEnd) + 1 }).map((_, s) => (
                <span key={s} className="absolute top-0 h-full border-l border-line pl-1 font-mono text-[9px] text-dim" style={{ left: s * zoom }}>{s % (zoom < 40 ? 5 : 1) === 0 ? `${s}s` : ""}</span>
              ))}
            </div>
            {data.tracks.map((t) => (
              <div key={t.id} className="flex h-16 border-b border-line">
                <div className="sticky left-0 z-10 flex w-[150px] shrink-0 flex-col justify-center gap-1 border-r border-line bg-panel px-2.5">
                  <span className="truncate text-[12px] font-medium">{t.name}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={t.kind === "video" ? "accent" : t.kind === "audio" ? "info" : "neutral"}>{t.kind === "subtitle" ? "subs" : t.kind}</Badge>
                    <button onClick={() => mutate((d) => { const x = d.tracks.find((y) => y.id === t.id)!; x.muted = !x.muted; return d; })} className="text-dim hover:text-text" aria-label="Silenciar pista">{t.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button>
                    <button onClick={() => t.kind === "subtitle" ? mutate((d) => { d.tracks.find((y) => y.id === t.id)!.clips.push({ id: uid(), start: +playhead.toFixed(2), end: +(playhead + 2).toFixed(2), text: "Nuevo subtítulo", in: 0, speed: 1, volume_db: 0, still_duration: 2, effects: [], fade_in: 0, fade_out: 0, label: "", asset_id: null, out: null, transition_in: null }); return d; }) : setPicker(t.id)} className="text-dim hover:text-accent" aria-label="Añadir clip"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className={cx("relative flex-1", t.muted && "opacity-40")}>
                  {t.clips.map((c) => {
                    const p = pos[c.id];
                    if (!p) return null;
                    const a = c.asset_id ? assets[c.asset_id] : undefined;
                    const isSel = sel?.clip === c.id;
                    return (
                      <div key={c.id} onPointerDown={(e) => startDrag(e, t, c)}
                        className={cx("absolute top-1.5 bottom-1.5 cursor-grab overflow-hidden rounded-md border text-[10.5px] select-none",
                          t.kind === "video" ? "border-accent/40 bg-accent/15" : t.kind === "audio" ? "border-info/40 bg-info/15" : "border-amber/40 bg-amber/10",
                          isSel && "ring-2 ring-white/70")}
                        style={{ left: p.start * zoom, width: Math.max(8, p.dur * zoom) }} title={c.label || a?.name}>
                        {a?.thumbnail_url && t.kind === "video" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                        )}
                        {c.transition_in && c.transition_in.type !== "cut" && <span className="absolute inset-y-0 left-0 w-1 bg-white/60" />}
                        <span className="relative block truncate px-1.5 pt-1 font-medium text-white">{t.kind === "subtitle" ? c.text : c.label || a?.name || "clip"}</span>
                        <span className="relative block px-1.5 font-mono text-[9px] text-white/60">{p.dur.toFixed(1)}s{c.speed !== 1 ? ` ×${c.speed}` : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: 150 + playhead * zoom }} />
          </div>
        </div>
      </Card>

      {renderAsset.data && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <Label>Último render (FFmpeg)</Label>
            <a href={renderAsset.data.download_url} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-text"><Download className="h-3.5 w-3.5" /> Descargar MP4</a>
          </div>
          <div className="aspect-video overflow-hidden rounded-xl bg-black"><MediaView asset={renderAsset.data} /></div>
        </Card>
      )}
      {picker && (
        <AssetPicker open onClose={() => setPicker(null)} kind={data.tracks.find((t) => t.id === picker)?.kind === "audio" ? "audio" : undefined}
          onPick={(a) => { if (data.tracks.find((t) => t.id === picker)?.kind === "audio" && a.kind === "image") return toast.error("Elige un audio o vídeo"); addAsset(picker, a); }} title="Añadir a la pista" />
      )}
    </div>
  );
}

function ClipInspector({ clip, track, asset, isMain, onPatch, onDelete, onMove }: { clip: TClip; track: TTrack; asset?: Asset; isMain: boolean; onPatch: (p: Partial<TClip>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void }) {
  if (track.kind === "subtitle")
    return (
      <div className="space-y-3">
        <Label>Subtítulo</Label>
        <Input value={clip.text} onChange={(e) => onPatch({ text: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[11px] text-dim">Inicio (s)</span><Input type="number" step={0.1} value={clip.start} onChange={(e) => onPatch({ start: Number(e.target.value) })} /></div>
          <div><span className="text-[11px] text-dim">Fin (s)</span><Input type="number" step={0.1} value={clip.end ?? clip.start + 2} onChange={(e) => onPatch({ end: Number(e.target.value) })} /></div>
        </div>
        <Button variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
      </div>
    );
  const isImage = asset?.kind === "image";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Clip</Label>
        {isMain && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => onMove(-1)} aria-label="Mover antes"><ArrowLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onMove(1)} aria-label="Mover después"><ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      <p className="truncate text-[13px] font-medium">{asset?.name || clip.label}</p>
      {!asset && <Notice tone="err">El archivo de este clip ya no existe.</Notice>}
      {isImage ? (
        <div><span className="text-[11px] text-dim">Duración (s)</span><Input type="number" step={0.5} min={0.2} value={clip.still_duration} onChange={(e) => onPatch({ still_duration: Number(e.target.value) })} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-[11px] text-dim">Entrada (s)</span><Input type="number" step={0.1} min={0} value={clip.in} onChange={(e) => onPatch({ in: Number(e.target.value) })} /></div>
            <div><span className="text-[11px] text-dim">Salida (s)</span><Input type="number" step={0.1} max={asset?.duration ?? undefined} value={clip.out ?? asset?.duration ?? 0} onChange={(e) => onPatch({ out: Number(e.target.value) })} /></div>
          </div>
          <div><span className="text-[11px] text-dim">Velocidad ×{clip.speed}</span><input type="range" min={0.25} max={4} step={0.25} value={clip.speed} onChange={(e) => onPatch({ speed: Number(e.target.value) })} className="w-full" /></div>
          <div><span className="text-[11px] text-dim">Volumen {clip.volume_db} dB</span><input type="range" min={-40} max={12} step={1} value={clip.volume_db} onChange={(e) => onPatch({ volume_db: Number(e.target.value) })} className="w-full" /></div>
        </>
      )}
      {!isMain && track.kind !== "video" && (
        <div className="grid grid-cols-3 gap-2">
          <div><span className="text-[11px] text-dim">Inicio</span><Input type="number" step={0.1} value={clip.start} onChange={(e) => onPatch({ start: Number(e.target.value) })} /></div>
          <div><span className="text-[11px] text-dim">Fade in</span><Input type="number" step={0.1} min={0} value={clip.fade_in} onChange={(e) => onPatch({ fade_in: Number(e.target.value) })} /></div>
          <div><span className="text-[11px] text-dim">Fade out</span><Input type="number" step={0.1} min={0} value={clip.fade_out} onChange={(e) => onPatch({ fade_out: Number(e.target.value) })} /></div>
        </div>
      )}
      {!isMain && track.kind === "video" && <div><span className="text-[11px] text-dim">Inicio (s)</span><Input type="number" step={0.1} value={clip.start} onChange={(e) => onPatch({ start: Number(e.target.value) })} /></div>}
      {isMain && (
        <>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <span className="text-[11px] text-dim">Transición de entrada</span>
              <Select value={clip.transition_in?.type || "cut"} onChange={(e) => onPatch({ transition_in: e.target.value === "cut" ? null : { type: e.target.value, duration: clip.transition_in?.duration || 0.5 } })}>
                {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div><span className="text-[11px] text-dim">Dur. (s)</span><Input type="number" step={0.1} min={0.1} max={5} value={clip.transition_in?.duration || 0.5} disabled={!clip.transition_in} onChange={(e) => onPatch({ transition_in: { type: clip.transition_in!.type, duration: Number(e.target.value) } })} /></div>
          </div>
          <div>
            <span className="text-[11px] text-dim">Efecto de color</span>
            <Select value={clip.effects.find((e) => e.op === "color")?.preset || ""} onChange={(e) => onPatch({ effects: e.target.value ? [{ op: "color", preset: e.target.value }] : [] })}>
              {EFFECTS.map((p) => <option key={p} value={p}>{p || "ninguno"}</option>)}
            </Select>
          </div>
        </>
      )}
      <Button variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Quitar del montaje</Button>
    </div>
  );
}
