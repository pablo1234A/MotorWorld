"use client";

import { Cpu, Download, Plus, Sparkles, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { JobProgress } from "@/components/jobs";
import { AssetPicker, Dropzone } from "@/components/media";
import { PlanEditor, type PlanStep } from "@/components/plan";
import { Badge, Button, Card, cx, Input, Label, Notice, PageHeader, Select, Tabs, Textarea, Toggle } from "@/components/ui";
import { api, errMsg, fmtDur } from "@/lib/api";
import { useJob } from "@/lib/hooks";
import type { Asset } from "@/lib/types";

const PRESETS = ["cinematic", "teal_orange", "noir", "warm", "cool", "vintage", "bleach_bypass", "day_for_night", "vivid"];

function VideoEditor() {
  const sp = useSearchParams();
  const [video, setVideo] = useState<Asset | null>(null);
  const [history, setHistory] = useState<Asset[]>([]);
  const [tab, setTab] = useState<"prompt" | "tools" | "subs">("prompt");
  const [instruction, setInstruction] = useState("");
  const [steps, setSteps] = useState<PlanStep[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  // manual tools
  const [trim, setTrim] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [segmentOnly, setSegmentOnly] = useState(false);
  const [ops, setOps] = useState<Record<string, any>>({});
  const [cues, setCues] = useState<{ start: number; end: number; text: string }[]>([]);
  const [overlay, setOverlay] = useState({ text: "", position: "bottom" });

  const open = (a: Asset) => {
    setVideo(a);
    setHistory((h) => (h.some((x) => x.id === a.id) ? h : [...h, a]));
    setTrim({ start: 0, end: Number((a.duration || 0).toFixed(2)) });
    setSteps(null);
  };

  useEffect(() => {
    const id = sp.get("asset");
    if (id && !video) api<Asset>(`/api/assets/${id}`).then(open).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const job = useJob(jobId, async (g) => {
    setJobId(null);
    if (g.status === "completed") {
      const vids: Asset[] = [];
      for (const id of g.output_asset_ids) vids.push(await api<Asset>(`/api/assets/${id}`));
      const lastVideo = [...vids].reverse().find((v) => v.kind === "video");
      if (lastVideo) open(lastVideo);
      vids.filter((v) => v.kind !== "video").forEach((v) => toast.success(`Resultado adicional: ${v.kind === "audio" ? "audio" : "imagen"} guardado en la biblioteca`));
      toast.success("Edición completada");
    } else if (g.status === "failed") toast.error(g.error || "La edición falló");
  });

  const runSteps = async (s: PlanStep[]) => {
    if (!video) return;
    try {
      const g = await api<{ id: string }>("/api/edits/run", {
        method: "POST",
        json: { asset_id: video.id, instruction, steps: s.map((x) => ({ task: x.task, model_id: x.model_id || "local-ffmpeg", prompt: x.prompt, params: x.params, label: x.label })) },
      });
      setJobId(g.id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const plan = async () => {
    if (!video) return;
    setPlanning(true);
    try {
      const r = await api<{ steps: PlanStep[] }>("/api/edits/plan", { method: "POST", json: { asset_id: video.id, instruction } });
      setSteps(r.steps);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPlanning(false);
    }
  };

  const manualOps = () => {
    const list: any[] = [];
    const fullTrim = trim.start <= 0.01 && Math.abs(trim.end - (video?.duration || 0)) < 0.05;
    if (!segmentOnly && !fullTrim) list.push({ op: "trim", start: trim.start, end: trim.end });
    if (ops.speed && ops.speed !== 1) list.push(ops.speed < 1 && ops.smooth ? { op: "slow_motion", factor: ops.speed } : { op: "speed", factor: ops.speed });
    if (ops.stabilize) list.push({ op: "stabilize" });
    if (ops.interpolate) list.push({ op: "interpolate", fps: 60 });
    if (ops.preset) list.push({ op: "color", preset: ops.preset });
    if (ops.brightness || ops.contrast || ops.saturation)
      list.push({ op: "color", brightness: ops.brightness ?? 0, contrast: ops.contrast ?? 1, saturation: ops.saturation ?? 1 });
    if (ops.reframe) list.push({ op: "reframe", aspect: ops.reframe, mode: "smart" });
    if (ops.scale) list.push({ op: "scale", height: Number(ops.scale) });
    if (ops.letterbox) list.push({ op: "letterbox" });
    if (ops.grain) list.push({ op: "grain", amount: 10 });
    if (ops.vignette) list.push({ op: "vignette" });
    if (ops.denoise) list.push({ op: "denoise" });
    if (ops.sharpen) list.push({ op: "sharpen", amount: 1 });
    if (ops.fade) list.push({ op: "fade", in: 0.6, out: 0.6 });
    if (ops.reverse) list.push({ op: "reverse" });
    if (ops.audio_denoise) list.push({ op: "audio_denoise" });
    if (ops.normalize) list.push({ op: "normalize_audio" });
    if (ops.mute) list.push({ op: "mute" });
    if (overlay.text.trim()) list.push({ op: "text", text: overlay.text, position: overlay.position });
    if (segmentOnly) return [{ op: "segment", start: trim.start, end: trim.end, ops: list }];
    return list;
  };

  const runManual = () => {
    const list = manualOps();
    if (!list.length || (list[0].op === "segment" && !list[0].ops.length)) return toast.error("Elige al menos una operación");
    runSteps([{ task: "local_video_op", kind: "local", label: "Herramientas", prompt: "", params: { ops: list }, model_id: "local-ffmpeg", available: true }]);
  };

  const runSubs = () => {
    const valid = cues.filter((c) => c.text.trim() && c.end > c.start);
    if (!valid.length) return toast.error("Añade al menos un subtítulo con texto");
    runSteps([{ task: "local_video_op", kind: "local", label: "Subtítulos", prompt: "", params: { ops: [{ op: "subtitles", cues: valid }] }, model_id: "local-ffmpeg", available: true }]);
  };

  const t = () => Number((player.current?.currentTime || 0).toFixed(2));
  const set = (k: string, v: any) => setOps({ ...ops, [k]: v });
  const busy = !!jobId;

  return (
    <div>
      <PageHeader eyebrow="Editar · Vídeo" title={<>Editor de <em className="text-muted">vídeos</em></>}
        actions={video && <a href={video.download_url} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-2 px-4 text-sm hover:bg-panel-2"><Download className="h-4 w-4" /> Descargar</a>}>
        Las operaciones <Badge tone="info">local</Badge> se ejecutan con FFmpeg (exactas, gratuitas). Las <Badge tone="accent">generativas</Badge> usan modelos de IA de vídeo a vídeo.
      </PageHeader>
      {!video ? (
        <div className="mx-auto max-w-2xl space-y-4">
          <Dropzone accept="video/*" onUploaded={open} label="Sube el vídeo que quieres editar" />
          <div className="text-center"><Button variant="ghost" onClick={() => setPicker(true)}>o elige uno de tu biblioteca</Button></div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
              <video ref={player} key={video.id} src={video.url} controls playsInline className="max-h-[66vh] w-full" />
              {job.data && <div className="absolute inset-x-0 top-0 bg-black/70 p-3 backdrop-blur"><JobProgress g={job.data} /></div>}
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-dim">
              <span>{video.width}×{video.height}</span><span>{video.fps} fps</span><span>{fmtDur(video.duration)}</span><span>{video.has_audio ? "con audio" : "sin audio"}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicker(true)}>Abrir otro vídeo</Button>
            </div>
            {history.length > 1 && (
              <Card className="p-4">
                <Label>Versiones de esta sesión</Label>
                <div className="flex gap-2 overflow-x-auto">
                  {history.map((h, i) => (
                    <button key={h.id} onClick={() => setVideo(h)} className={cx("relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border", h.id === video.id ? "border-accent" : "border-line")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {h.thumbnail_url && <img src={h.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                      <span className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-[9px] text-white">{i === 0 ? "ORIGINAL" : `v${i}`}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <Tabs value={tab} onChange={setTab} items={[{ id: "prompt", label: "Con instrucciones" }, { id: "tools", label: "Herramientas" }, { id: "subs", label: "Subtítulos" }]} className="w-full justify-between" />
            {tab === "prompt" && (
              <Card className="space-y-4 p-5">
                <div>
                  <Label>Instrucción</Label>
                  <Textarea rows={4} value={instruction} onChange={(e) => { setInstruction(e.target.value); setSteps(null); }} data-testid="instruction"
                    placeholder="Conviértelo en un anuncio cinematográfico de coches, ambiente de noche lluviosa, mejora la iluminación y formato vertical para reels" />
                </div>
                <Button className="w-full" onClick={plan} loading={planning} disabled={!instruction.trim() || busy} data-testid="plan"><Sparkles className="h-4 w-4" /> Analizar y planificar</Button>
                {steps && <PlanEditor steps={steps} onChange={setSteps} onRun={() => runSteps(steps)} running={busy} />}
              </Card>
            )}
            {tab === "tools" && (
              <Card className="space-y-4 p-5">
                <div>
                  <Label hint="usa la posición del reproductor">Tramo</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" step={0.1} min={0} value={trim.start} onChange={(e) => setTrim({ ...trim, start: Number(e.target.value) })} />
                    <Button size="sm" variant="outline" onClick={() => setTrim({ ...trim, start: t() })}>⇤</Button>
                    <Input type="number" step={0.1} min={0} value={trim.end} onChange={(e) => setTrim({ ...trim, end: Number(e.target.value) })} />
                    <Button size="sm" variant="outline" onClick={() => setTrim({ ...trim, end: t() })}>⇥</Button>
                  </div>
                  <div className="mt-2"><Toggle checked={segmentOnly} onChange={setSegmentOnly} label="Aplicar efectos solo a este tramo (edición por segmentos)" /></div>
                </div>
                <div>
                  <Label hint={`×${ops.speed ?? 1}`}>Velocidad</Label>
                  <input type="range" min={0.25} max={4} step={0.25} value={ops.speed ?? 1} onChange={(e) => set("speed", Number(e.target.value))} className="w-full" />
                  {(ops.speed ?? 1) < 1 && <div className="mt-2"><Toggle checked={!!ops.smooth} onChange={(v) => set("smooth", v)} label="Cámara lenta suave (interpolación)" /></div>}
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button key={p} onClick={() => set("preset", ops.preset === p ? undefined : p)} className={cx("rounded-full border px-2.5 py-1 font-mono text-[11px]", ops.preset === p ? "border-accent/60 bg-accent/10" : "border-line-2 text-muted")}>{p}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Reencuadre inteligente</Label>
                    <Select value={ops.reframe || ""} onChange={(e) => set("reframe", e.target.value || undefined)}>
                      <option value="">Original</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="16:9">16:9</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Reescalar (sin IA)</Label>
                    <Select value={ops.scale || ""} onChange={(e) => set("scale", e.target.value || undefined)}>
                      <option value="">Original</option><option value="720">720p</option><option value="1080">1080p</option><option value="2160">2160p (4K)</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {[["stabilize", "Estabilizar"], ["interpolate", "Interpolar a 60 fps"], ["letterbox", "Cinemascope"], ["grain", "Grano"], ["vignette", "Viñeta"], ["denoise", "Reducir ruido"], ["sharpen", "Enfocar"], ["fade", "Fundidos"], ["reverse", "Invertir"], ["audio_denoise", "Limpiar audio"], ["normalize", "Normalizar audio"], ["mute", "Quitar audio"]].map(([k, l]) => (
                    <Toggle key={k} checked={!!ops[k]} onChange={(v) => set(k, v)} label={<span className="text-[12.5px]">{l}</span>} />
                  ))}
                </div>
                <div>
                  <Label>Texto sobreimpreso</Label>
                  <div className="flex gap-2">
                    <Input value={overlay.text} onChange={(e) => setOverlay({ ...overlay, text: e.target.value })} placeholder="Título o claim" />
                    <Select value={overlay.position} onChange={(e) => setOverlay({ ...overlay, position: e.target.value })} className="w-32"><option value="top">Arriba</option><option value="center">Centro</option><option value="bottom">Abajo</option></Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" onClick={runManual} loading={busy}><Cpu className="h-4 w-4" /> Procesar con FFmpeg</Button>
                  <Button variant="outline" onClick={() => runSteps([{ task: "local_video_op", kind: "local", label: "Fotograma", prompt: "", params: { ops: [{ op: "extract_frame", at: t() }] }, model_id: "local-ffmpeg", available: true }])} disabled={busy} title="Guardar el fotograma actual como imagen">📷</Button>
                </div>
              </Card>
            )}
            {tab === "subs" && (
              <Card className="space-y-3 p-5">
                <Notice>Los subtítulos se queman en el vídeo con libass. Para un archivo .srt independiente usa el montaje del Estudio creativo.</Notice>
                {cues.map((c, i) => (
                  <div key={i} className="rounded-lg border border-line bg-panel-2 p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <Input type="number" step={0.1} value={c.start} onChange={(e) => setCues(cues.map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)))} className="h-8" />
                      <span className="text-dim">→</span>
                      <Input type="number" step={0.1} value={c.end} onChange={(e) => setCues(cues.map((x, j) => (j === i ? { ...x, end: Number(e.target.value) } : x)))} className="h-8" />
                      <button onClick={() => setCues(cues.filter((_, j) => j !== i))} className="text-dim hover:text-err" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <Input value={c.text} onChange={(e) => setCues(cues.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Texto del subtítulo" className="h-8" />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => { const s = t(); setCues([...cues, { start: s, end: Number((s + 2).toFixed(2)), text: "" }]); }}><Plus className="h-3.5 w-3.5" /> Añadir en la posición actual</Button>
                <Button variant="primary" className="w-full" onClick={runSubs} loading={busy}>Quemar subtítulos</Button>
              </Card>
            )}
          </div>
        </div>
      )}
      <AssetPicker open={picker} onClose={() => setPicker(false)} onPick={open} kind="video" title="Abrir vídeo" />
    </div>
  );
}

export default function VideoEditorPage() {
  return (
    <Suspense>
      <VideoEditor />
    </Suspense>
  );
}
