"use client";

import { Clapperboard, Plus, Sparkles, Trash2, Video } from "lucide-react";
import { useCallback, useState } from "react";
import { CameraMoves, CinemaControls } from "@/components/cinema";
import { GenerationCard } from "@/components/jobs";
import { InputSlot } from "@/components/media";
import { ModelPicker, ParamControls, priceLabel } from "@/components/models";
import { Button, Card, Empty, Label, Notice, PageHeader, Select, Tabs, Textarea, Toggle } from "@/components/ui";
import { useCreateGeneration, useGenerations } from "@/lib/hooks";
import type { Asset, Model } from "@/lib/types";

type Mode = "text_to_video" | "image_to_video" | "first_last_to_video" | "video_to_video" | "extend" | "multi_shot";
const MODES: { id: Mode; label: string }[] = [
  { id: "text_to_video", label: "Texto" },
  { id: "image_to_video", label: "Imagen" },
  { id: "first_last_to_video", label: "Inicio/Fin" },
  { id: "video_to_video", label: "Vídeo a vídeo" },
  { id: "extend", label: "Extender" },
  { id: "multi_shot", label: "Multi-shot" },
];

const TASK_FOR: Record<Mode, string> = {
  text_to_video: "text_to_video", image_to_video: "image_to_video", first_last_to_video: "first_last_to_video",
  video_to_video: "video_to_video", extend: "image_to_video", multi_shot: "image_to_video",
};

type Shot = { prompt: string; cinema: Record<string, string> };

export default function CreateVideoPage() {
  const [mode, setMode] = useState<Mode>("text_to_video");
  const [modelId, setModelId] = useState("");
  const [model, setModel] = useState<Model>();
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [cinema, setCinema] = useState<Record<string, string>>({});
  const [first, setFirst] = useState<Asset | null>(null);
  const [last, setLast] = useState<Asset | null>(null);
  const [video, setVideo] = useState<Asset | null>(null);
  const [realSlowmo, setRealSlowmo] = useState(false);
  const [shots, setShots] = useState<Shot[]>([{ prompt: "", cinema: {} }, { prompt: "", cinema: {} }]);
  const [continuity, setContinuity] = useState(true);
  const [transition, setTransition] = useState("crossfade");
  const feed = useGenerations({ task: "text_to_video,image_to_video,first_last_to_video,video_to_video,video_extend,multi_shot", limit: 24 });
  const create = useCreateGeneration();
  const task = TASK_FOR[mode];

  const onModel = useCallback((id: string, m: Model) => {
    setModelId(id);
    setModel(m);
    setParams({});
  }, []);

  const submit = () => {
    const post_ops = realSlowmo ? [{ op: "slow_motion", factor: 0.5 }] : undefined;
    if (mode === "extend") {
      return create.mutate({ task: "video_extend", model_id: "local-ffmpeg", prompt, negative_prompt: "", inputs: { video: video!.id },
        params: { i2v_model: modelId, i2v_params: params, join: true } });
    }
    if (mode === "multi_shot") {
      return create.mutate({ task: "multi_shot", model_id: "pipeline", prompt: shots.map((s) => s.prompt).join(" / "),
        inputs: first ? { image: first.id } : {}, params: { video_model: modelId, video_params: params, shots, continuity, transition } });
    }
    const inputs: Record<string, string> = {};
    if (first && mode !== "text_to_video" && mode !== "video_to_video") inputs.image = first.id;
    if (last && mode === "first_last_to_video") inputs.end_image = last.id;
    if (video && mode === "video_to_video") inputs.video = video.id;
    create.mutate({ task, model_id: modelId, prompt, negative_prompt: model?.supports_negative_prompt ? negative : "", params: { ...params, post_ops }, cinema, inputs });
  };

  const ready =
    model?.available &&
    (mode === "multi_shot" ? shots.every((s) => s.prompt.trim()) && (first || model.tasks.includes("text_to_video")) : mode === "image_to_video" || prompt.trim()) &&
    (mode !== "image_to_video" || first) &&
    (mode !== "first_last_to_video" || (first && last)) &&
    (mode !== "video_to_video" || video) &&
    (mode !== "extend" || video);

  return (
    <div>
      <PageHeader eyebrow="Crear · Vídeo" title={<>Crear <em className="text-muted">vídeos</em></>}>
        Texto a vídeo, animación de fotografías, transiciones entre fotogramas, extensión de escenas y secuencias multi-plano con dirección de cámara.
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[460px_1fr]">
        <Card className="h-fit space-y-5 p-5 xl:sticky xl:top-20">
          <Tabs value={mode} onChange={(m) => { setMode(m); setModelId(""); }} items={MODES} className="flex w-full flex-wrap" />
          <ModelPicker task={task} value={modelId} onChange={onModel} />
          {mode === "extend" && <Notice>Se extrae el último fotograma del vídeo, se genera la continuación con el modelo elegido y se une al original con FFmpeg.</Notice>}

          {(mode === "image_to_video" || mode === "first_last_to_video") && (
            <div className={mode === "first_last_to_video" ? "grid grid-cols-2 gap-3" : ""}>
              <InputSlot label={mode === "first_last_to_video" ? "Primer fotograma" : "Imagen a animar"} kind="image" asset={first} onChange={setFirst} />
              {mode === "first_last_to_video" && <InputSlot label="Último fotograma" kind="image" asset={last} onChange={setLast} />}
            </div>
          )}
          {(mode === "video_to_video" || mode === "extend") && <InputSlot label="Vídeo de origen" kind="video" asset={video} onChange={setVideo} />}

          {mode === "multi_shot" ? (
            <div className="space-y-3">
              <InputSlot label="Fotograma inicial (recomendado para consistencia)" kind="image" asset={first} onChange={setFirst} optional />
              {shots.map((s, i) => (
                <div key={i} className="rounded-xl border border-line bg-panel-2 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-accent">PLANO {String(i + 1).padStart(2, "0")}</span>
                    {shots.length > 1 && (
                      <button onClick={() => setShots(shots.filter((_, j) => j !== i))} className="text-dim hover:text-err" aria-label="Quitar plano">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <Textarea rows={2} value={s.prompt} placeholder="Qué ocurre en este plano" onChange={(e) => setShots(shots.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} />
                  <Select className="mt-2" value={s.cinema.camera_movement || ""} onChange={(e) => setShots(shots.map((x, j) => (j === i ? { ...x, cinema: { ...x.cinema, camera_movement: e.target.value } } : x)))}>
                    <option value="">Cámara: libre</option>
                    {["static", "dolly_in", "dolly_out", "tracking", "orbit", "pan_left", "pan_right", "tilt_up", "crane_up", "handheld", "fpv", "travelling"].map((c) => (
                      <option key={c} value={c}>{c.replace("_", " ")}</option>
                    ))}
                  </Select>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setShots([...shots, { prompt: "", cinema: {} }])} disabled={shots.length >= 8}>
                <Plus className="h-3.5 w-3.5" /> Añadir plano
              </Button>
              <Toggle checked={continuity} onChange={setContinuity} label="Continuidad: cada plano parte del último fotograma del anterior" />
              <div>
                <Label>Transición al montar</Label>
                <Select value={transition} onChange={(e) => setTransition(e.target.value)}>
                  <option value="cut">Corte</option>
                  <option value="crossfade">Fundido encadenado</option>
                  <option value="fade_black">Fundido a negro</option>
                  <option value="dissolve">Disolución</option>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label>{mode === "extend" ? "Qué ocurre a continuación" : "Prompt"}</Label>
                <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="prompt"
                  placeholder="Un coche deportivo atraviesa una carretera costera al amanecer, el sol se refleja en la carrocería, olas rompiendo…" />
              </div>
              {model?.supports_negative_prompt && mode !== "extend" && (
                <div>
                  <Label>Prompt negativo</Label>
                  <Textarea rows={2} value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="parpadeo, deformaciones, texto" />
                </div>
              )}
              {mode !== "extend" && (
                <>
                  <CameraMoves value={cinema.camera_movement} onChange={(v) => setCinema({ ...cinema, camera_movement: v })} />
                  <details className="group">
                    <summary className="cursor-pointer list-none text-[12px] font-medium tracking-wide text-muted uppercase hover:text-text">
                      Control cinematográfico <span className="text-dim group-open:hidden">▸</span>
                    </summary>
                    <div className="mt-3">
                      <CinemaControls value={cinema} onChange={setCinema} />
                      <p className="mt-2 text-[11.5px] text-dim">Estos ajustes se convierten en indicaciones de dirección dentro del prompt; la fidelidad depende del modelo.</p>
                    </div>
                  </details>
                  <Toggle checked={realSlowmo} onChange={setRealSlowmo} label="Cámara lenta real (FFmpeg, interpolación de fotogramas)" />
                </>
              )}
            </>
          )}
          <ParamControls model={model} values={params} onChange={setParams} />
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="font-mono text-[11px] text-muted">{model ? priceLabel(model, task) : ""}{mode === "multi_shot" ? ` × ${shots.length}` : ""}</span>
            <Button variant="primary" size="lg" disabled={!ready} loading={create.isPending} onClick={submit} data-testid="generate">
              {mode === "multi_shot" ? <Clapperboard className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {mode === "multi_shot" ? "Rodar secuencia" : "Generar vídeo"}
            </Button>
          </div>
        </Card>
        <div>
          {feed.data?.items.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {feed.data.items.map((g) => (
                <GenerationCard key={g.id} g={g} />
              ))}
            </div>
          ) : (
            <Empty icon={<Video className="h-8 w-8" />} title="Tus vídeos aparecerán aquí">
              Los vídeos tardan de 30 s a varios minutos según el modelo. Puedes seguir trabajando: la bandeja superior muestra el progreso real que informe el proveedor.
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
