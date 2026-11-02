"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Film, Music, Plus, Search, Speech, Waves, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { toast } from "sonner";
import { GenerationCard } from "@/components/jobs";
import { InputSlot } from "@/components/media";
import { ModelPicker, ParamControls, priceLabel } from "@/components/models";
import { Button, Card, cx, Empty, Input, Label, Notice, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { api, errMsg, fmtDate } from "@/lib/api";
import { useCreateGeneration, useGenerations } from "@/lib/hooks";
import type { Asset, Model } from "@/lib/types";

type AudioMode = "text_to_speech" | "text_to_music" | "text_to_sfx" | "video_to_audio" | "mix" | "tools";

function AudioStudio() {
  const [mode, setMode] = useState<AudioMode>("text_to_speech");
  const [modelId, setModelId] = useState("");
  const [model, setModel] = useState<Model>();
  const [text, setText] = useState("");
  const [negative, setNegative] = useState("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [video, setVideo] = useState<Asset | null>(null);
  const [tracks, setTracks] = useState<{ asset: Asset | null; volume: number; delay: number }[]>([{ asset: null, volume: 0, delay: 0 }, { asset: null, volume: -12, delay: 0 }]);
  const [toolAsset, setToolAsset] = useState<Asset | null>(null);
  const [tools, setTools] = useState<Record<string, any>>({ normalize: true });
  const feed = useGenerations({ task: "text_to_speech,text_to_music,text_to_sfx,video_to_audio,local_audio_op", limit: 20 });
  const create = useCreateGeneration();
  const voices = useQuery<{ items: any[] }>({ queryKey: ["voices"], queryFn: () => api("/api/providers/elevenlabs/voices"), enabled: mode === "text_to_speech" && model?.id === "elevenlabs-tts" && model.available, retry: false });
  const onModel = useCallback((id: string, m: Model) => { setModelId(id); setModel(m); setParams({}); }, []);

  const submit = () => {
    if (mode === "mix") {
      const valid = tracks.filter((t) => t.asset);
      return create.mutate({ task: "local_audio_op", model_id: "local-ffmpeg", inputs: { audio: valid.map((t) => t.asset!.id) }, params: { mix: true, volumes: valid.map((t) => t.volume), delays: valid.map((t) => t.delay) } });
    }
    if (mode === "tools") {
      const ops: any[] = [];
      if (tools.denoise) ops.push({ op: "denoise" });
      if (tools.highpass) ops.push({ op: "highpass", hz: 90 });
      if (tools.volume) ops.push({ op: "volume", db: Number(tools.volume) });
      if (tools.fade) ops.push({ op: "fade", in: 0.5, out: 1 });
      if (tools.reverb) ops.push({ op: "reverb" });
      if (tools.normalize) ops.push({ op: "normalize" });
      return create.mutate({ task: "local_audio_op", model_id: "local-ffmpeg", inputs: { audio: toolAsset!.id }, params: { ops } });
    }
    create.mutate({ task: mode, model_id: modelId, prompt: text, negative_prompt: model?.supports_negative_prompt ? negative : "", params, inputs: mode === "video_to_audio" && video ? { video: video.id } : {} });
  };

  const ready = mode === "mix" ? tracks.filter((t) => t.asset).length >= 2 : mode === "tools" ? !!toolAsset : model?.available && text.trim() && (mode !== "video_to_audio" || video);

  return (
    <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
      <Card className="h-fit space-y-5 p-5">
        <div className="grid grid-cols-3 gap-1.5">
          {([["text_to_speech", "Voz", Speech], ["text_to_music", "Música", Music], ["text_to_sfx", "Efectos", Waves], ["video_to_audio", "Sonido de vídeo", Film], ["mix", "Mezcla", AudioLines], ["tools", "Edición", Wand2]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setMode(id); setModelId(""); }} className={cx("flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-[12px] transition", mode === id ? "border-accent/60 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {mode === "mix" ? (
          <div className="space-y-3">
            <Notice>Mezcla con FFmpeg: ajusta el volumen (dB) y el retardo de cada pista. Admite audio o vídeos (se usa su pista de sonido).</Notice>
            {tracks.map((t, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line bg-panel-2 p-3">
                <InputSlot label={`Pista ${i + 1}`} kind="audio" asset={t.asset} onChange={(a) => setTracks(tracks.map((x, j) => (j === i ? { ...x, asset: a } : x)))} />
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-[11px] text-dim">Volumen {t.volume} dB</span><input type="range" min={-40} max={12} value={t.volume} onChange={(e) => setTracks(tracks.map((x, j) => (j === i ? { ...x, volume: Number(e.target.value) } : x)))} className="w-full" /></div>
                  <div><span className="text-[11px] text-dim">Retardo (s)</span><Input type="number" min={0} step={0.1} value={t.delay} onChange={(e) => setTracks(tracks.map((x, j) => (j === i ? { ...x, delay: Number(e.target.value) } : x)))} className="h-8" /></div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setTracks([...tracks, { asset: null, volume: 0, delay: 0 }])}><Plus className="h-3.5 w-3.5" /> Pista</Button>
          </div>
        ) : mode === "tools" ? (
          <div className="space-y-3">
            <InputSlot label="Audio a procesar" kind="audio" asset={toolAsset} onChange={setToolAsset} />
            {[["denoise", "Eliminar ruido (FFT)"], ["highpass", "Quitar graves molestos (paso alto)"], ["fade", "Fundidos de entrada y salida"], ["reverb", "Reverberación ligera"], ["normalize", "Normalizar sonoridad (-16 LUFS)"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" className="accent-[#ff5a36]" checked={!!tools[k]} onChange={(e) => setTools({ ...tools, [k]: e.target.checked })} /> {l}</label>
            ))}
            <div><Label hint={`${tools.volume || 0} dB`}>Volumen</Label><input type="range" min={-20} max={20} value={tools.volume || 0} onChange={(e) => setTools({ ...tools, volume: Number(e.target.value) })} className="w-full" /></div>
          </div>
        ) : (
          <>
            <ModelPicker task={mode} value={modelId} onChange={onModel} />
            {mode === "video_to_audio" && <InputSlot label="Vídeo" kind="video" asset={video} onChange={setVideo} />}
            <div>
              <Label>{mode === "text_to_speech" ? "Texto a locutar" : "Descripción del sonido"}</Label>
              <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "text_to_speech" ? "Hay carreteras que no se recorren: se recuerdan." : mode === "text_to_music" ? "Banda sonora orquestal épica con percusión, 90 BPM, crescendo final" : "Motor V8 arrancando en un garaje con eco"} />
            </div>
            {mode === "text_to_speech" && voices.data?.items.length ? (
              <div>
                <Label>Voz (biblioteca de ElevenLabs)</Label>
                <Select value={params.voice_id || ""} onChange={(e) => setParams({ ...params, voice_id: e.target.value })}>
                  <option value="">Por defecto</option>
                  {voices.data.items.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.category}</option>)}
                </Select>
              </div>
            ) : null}
            {model?.supports_negative_prompt && <div><Label>Evitar</Label><Input value={negative} onChange={(e) => setNegative(e.target.value)} /></div>}
            <ParamControls model={model} values={params} onChange={setParams} hide={voices.data?.items.length ? ["voice_id"] : []} />
            {mode === "text_to_speech" && <p className="text-[11.5px] text-dim">Solo voces sintéticas de biblioteca o voces propias con consentimiento. No se clonan voces de personas reales sin autorización.</p>}
          </>
        )}
        <div className="flex items-center justify-between border-t border-line pt-4">
          <span className="font-mono text-[11px] text-muted">{mode === "mix" || mode === "tools" ? "Local · gratis" : model ? priceLabel(model, mode) : ""}</span>
          <Button variant="primary" size="lg" disabled={!ready} loading={create.isPending} onClick={submit}>Generar</Button>
        </div>
      </Card>
      <div>
        {feed.data?.items.length ? (
          <div className="grid gap-4 md:grid-cols-2">{feed.data.items.map((g) => <GenerationCard key={g.id} g={g} />)}</div>
        ) : (
          <Empty icon={<AudioLines className="h-8 w-8" />} title="Tus audios aparecerán aquí">Voces, música, efectos y mezclas se guardan en la biblioteca listos para el montaje.</Empty>
        )}
      </div>
    </div>
  );
}

function Montage() {
  const router = useRouter();
  const qc = useQueryClient();
  const list = useQuery<{ items: any[] }>({ queryKey: ["timelines"], queryFn: () => api("/api/timelines") });
  const [name, setName] = useState("");
  const create = async () => {
    try {
      const t = await api<any>("/api/timelines", { method: "POST", json: { name: name || "Nuevo montaje" } });
      qc.invalidateQueries({ queryKey: ["timelines"] });
      router.push(`/studio/timeline/${t.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1"><Label>Nuevo montaje multipista</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Spot 30 s · versión 1" /></div>
        <Button variant="primary" onClick={create}><Plus className="h-4 w-4" /> Crear línea temporal</Button>
      </Card>
      {list.data?.items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.items.map((t) => (
            <Link key={t.id} href={`/studio/timeline/${t.id}`} className="rounded-2xl border border-line bg-panel p-5 transition hover:border-line-2 hover:bg-panel-2">
              <Film className="h-5 w-5 text-accent" />
              <p className="mt-4 font-medium">{t.name}</p>
              <p className="mt-1 font-mono text-[11px] text-dim">v{t.version} · {fmtDate(t.updated_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Sin montajes" icon={<Film className="h-8 w-8" />}>Crea una línea temporal con pistas de vídeo, audio, música, efectos y subtítulos. El render final se hace con FFmpeg.</Empty>
      )}
    </div>
  );
}

function StockSearch() {
  const [provider, setProvider] = useState("pexels");
  const [media, setMedia] = useState("image");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const qc = useQueryClient();
  const search = async () => {
    setLoading(true);
    try {
      const r = await api<{ items: any[] }>(`/api/stock/search?provider=${provider}&media=${media}&q=${encodeURIComponent(q)}`);
      setItems(r.items);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  const imp = async (it: any) => {
    setImporting(it.id);
    try {
      await api("/api/stock/import", { method: "POST", json: { provider, item: it } });
      qc.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Importado a tu biblioteca (con atribución)");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImporting(null);
    }
  };
  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
        <div className="w-full md:w-40"><Label>Fuente</Label><Select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="pexels">Pexels</option><option value="pixabay">Pixabay</option><option value="unsplash">Unsplash</option></Select></div>
        <div className="w-full md:w-36"><Label>Tipo</Label><Select value={media} onChange={(e) => setMedia(e.target.value)}><option value="image">Fotos</option><option value="video" disabled={provider === "unsplash"}>Vídeos</option></Select></div>
        <div className="flex-1"><Label>Buscar</Label><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="carretera de montaña, atardecer" /></div>
        <Button onClick={search} loading={loading} disabled={!q.trim()}><Search className="h-4 w-4" /> Buscar</Button>
      </Card>
      <p className="text-[12px] text-dim">Recursos gratuitos con sus licencias (Pexels, Pixabay, Unsplash). Al importar se guarda la atribución del autor en el archivo.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-panel-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.thumb} alt={it.attribution} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 to-transparent p-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <p className="truncate text-[11px] text-white/80">{it.attribution}</p>
              <Button size="sm" className="mt-1.5" onClick={() => imp(it)} loading={importing === it.id}>Importar</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Studio() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") as "audio" | "montage" | "stock") || "audio";
  return (
    <div>
      <PageHeader eyebrow="Estudio creativo" title={<>Sonido, montaje <em className="text-muted">y recursos</em></>}>
        Genera voces, música y efectos, mezcla pistas, monta en una línea temporal multipista y busca material libre de derechos.
      </PageHeader>
      <Tabs value={tab} onChange={(t) => router.replace(`/studio?tab=${t}`)} items={[{ id: "audio", label: "Audio" }, { id: "montage", label: "Montaje" }, { id: "stock", label: "Recursos gratuitos" }]} className="mb-6" />
      {tab === "audio" && <AudioStudio />}
      {tab === "montage" && <Montage />}
      {tab === "stock" && <StockSearch />}
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense>
      <Studio />
    </Suspense>
  );
}
