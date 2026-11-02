"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, Film as FilmIcon, ImagePlus, Mic, Music, Plus, RefreshCw, Save, Sparkles, Trash2, User, Video, Wand2, Waves } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import { JobProgress } from "@/components/jobs";
import { InputSlot } from "@/components/media";
import { TimelineEditor } from "@/components/timeline";
import { Badge, Button, Card, cx, Empty, Input, Label, Notice, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useJob, useModels } from "@/lib/hooks";
import type { Asset } from "@/lib/types";

type Script = any;
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const SHOT_TYPES = ["extreme_wide", "wide", "full", "medium", "medium_close", "close_up", "extreme_close_up", "over_shoulder", "pov", "aerial"];
const MOVES = ["static", "dolly_in", "dolly_out", "tracking", "orbit", "pan_left", "pan_right", "tilt_up", "tilt_down", "zoom_in", "zoom_out", "crane_up", "crane_down", "handheld", "fpv", "travelling"];
const LENSES = ["14mm", "24mm", "35mm", "50mm", "85mm", "135mm", "anamorphic", "macro"];

function Thumb({ id, className }: { id?: string | null; className?: string }) {
  const q = useQuery<Asset>({ queryKey: ["asset", id], queryFn: () => api(`/api/assets/${id}`), enabled: !!id, staleTime: 60_000 });
  if (!id) return <div className={cx("grid place-items-center bg-panel-3 text-dim", className)}><ImagePlus className="h-5 w-5" /></div>;
  if (!q.data) return <div className={cx("skeleton", className)} />;
  if (q.data.kind === "video") return <video src={q.data.url} poster={q.data.thumbnail_url || undefined} className={cx("bg-black object-cover", className)} controls playsInline preload="metadata" />;
  if (q.data.kind === "audio") return <audio src={q.data.url} controls className="h-8 w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={q.data.url} alt="" className={cx("object-cover", className)} />;
}

function ModelSelect({ task, value, onChange, label }: { task: string; value: string; onChange: (v: string) => void; label: string }) {
  const { data } = useModels({ task });
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {data?.items.map((m) => <option key={m.id} value={m.id}>{m.name}{m.available ? "" : " — falta clave"}</option>)}
      </Select>
    </div>
  );
}

export default function FilmStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const film = useQuery<any>({ queryKey: ["film", id], queryFn: () => api(`/api/films/${id}`) });
  const [script, setScript] = useState<Script | null>(null);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"story" | "characters" | "locations" | "storyboard" | "production" | "montage">("story");
  const [dev, setDev] = useState({ idea: "", language: "es", target_duration_s: 60, genre: "", tone: "", max_scenes: 5 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (film.data && !dirty) {
      setScript(film.data.script);
      setTitle(film.data.title);
      setVersion(film.data.version);
      setDev((d) => ({ ...d, idea: d.idea || film.data.idea || "" }));
    }
  }, [film.data, dirty]);

  const job = useJob(jobId, (g) => {
    setJobId(null);
    if (g.status === "completed") toast.success("Trabajo de producción terminado");
    else if (g.status === "failed") toast.error(g.error || "El trabajo falló");
    if (g.error && g.status === "completed") toast.warning(g.error);
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["film", id] });
  });

  const edit = (fn: (s: Script) => void) => {
    setScript((s: Script) => {
      const c = structuredClone(s);
      fn(c);
      return c;
    });
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const r = await api<any>(`/api/films/${id}`, { method: "PUT", json: { title, script, version } });
      setVersion(r.version);
      setScript(r.script);
      setDirty(false);
      qc.setQueryData(["film", id], r);
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runJob = async (path: string, body: any) => {
    if (dirty && !(await save())) return;
    try {
      const g = await api<{ id: string }>(path, { method: "POST", json: body });
      setJobId(g.id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const produce = (step: string, target_ids: string[] = [], overwrite = false) => runJob(`/api/films/${id}/produce`, { step, target_ids, overwrite });

  if (!script) return <div className="skeleton h-96 rounded-2xl" />;
  const busy = !!jobId;
  const shots = script.scenes.flatMap((sc: any) => sc.shots);
  const stats = { keyframes: shots.filter((s: any) => s.keyframe_asset_id).length, clips: shots.filter((s: any) => s.clip_asset_id).length,
    lines: shots.flatMap((s: any) => s.dialogue).length, voiced: shots.flatMap((s: any) => s.dialogue).filter((d: any) => d.audio_asset_id).length };

  return (
    <div>
      <Link href="/create/film" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><ArrowLeft className="h-4 w-4" /> Producciones</Link>
      <PageHeader eyebrow={`Producción · ${script.style.aspect_ratio}`}
        title={<input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="display w-full bg-transparent outline-none" aria-label="Título" />}
        actions={<Button variant={dirty ? "primary" : "outline"} onClick={save} loading={saving} disabled={!dirty}><Save className="h-4 w-4" /> {dirty ? "Guardar cambios" : "Guardado"}</Button>}>
        {script.logline || "Desarrolla la idea con IA o escribe el guion a mano."}
      </PageHeader>
      {job.data && <Card className="mb-5 p-4"><JobProgress g={job.data} /></Card>}
      <Tabs value={tab} onChange={setTab} className="mb-6 flex flex-wrap" items={[
        { id: "story", label: "1 · Guion" }, { id: "characters", label: `2 · Personajes (${script.characters.length})` }, { id: "locations", label: `3 · Localizaciones (${script.locations.length})` },
        { id: "storyboard", label: `4 · Storyboard (${shots.length})` }, { id: "production", label: "5 · Producción" }, { id: "montage", label: "6 · Montaje" },
      ]} />

      {tab === "story" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="space-y-4 p-5">
            <Label>Idea de la película</Label>
            <Textarea rows={7} value={dev.idea} onChange={(e) => setDev({ ...dev, idea: e.target.value })} placeholder="Una piloto de rallies veterana vuelve al circuito donde perdió a su copiloto para correr una última carrera al amanecer…" data-testid="film-idea" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><Label>Idioma</Label><Select value={dev.language} onChange={(e) => setDev({ ...dev, language: e.target.value })}><option value="es">Español</option><option value="en">Inglés</option><option value="fr">Francés</option><option value="pt">Portugués</option></Select></div>
              <div><Label>Duración (s)</Label><Input type="number" min={10} max={1800} value={dev.target_duration_s} onChange={(e) => setDev({ ...dev, target_duration_s: Number(e.target.value) })} /></div>
              <div><Label>Escenas máx.</Label><Input type="number" min={1} max={30} value={dev.max_scenes} onChange={(e) => setDev({ ...dev, max_scenes: Number(e.target.value) })} /></div>
              <div><Label>Género</Label><Input value={dev.genre} onChange={(e) => setDev({ ...dev, genre: e.target.value })} placeholder="drama" /></div>
            </div>
            <div><Label>Tono</Label><Input value={dev.tone} onChange={(e) => setDev({ ...dev, tone: e.target.value })} placeholder="épico, contenido, nostálgico" /></div>
            <Button variant="primary" className="w-full" disabled={dev.idea.trim().length < 10 || busy} loading={busy} onClick={() => {
              if (script.scenes.length && !confirm("Esto reemplazará el guion actual (los archivos generados se conservan en la biblioteca). ¿Continuar?")) return;
              runJob(`/api/films/${id}/develop`, dev);
            }}><Sparkles className="h-4 w-4" /> Desarrollar argumento, escenas y diálogos con IA</Button>
            <p className="text-[12px] text-dim">Usa Claude (Anthropic) o un LLM compatible con OpenAI configurado en el servidor (Ollama local es gratuito). Si no hay ninguno, puedes escribir el guion manualmente en las pestañas siguientes.</p>
          </Card>
          <Card className="space-y-4 p-5">
            <div><Label>Logline</Label><Input value={script.logline} onChange={(e) => edit((s) => (s.logline = e.target.value))} /></div>
            <div><Label>Sinopsis</Label><Textarea rows={8} value={script.synopsis} onChange={(e) => edit((s) => (s.synopsis = e.target.value))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Género</Label><Input value={script.genre} onChange={(e) => edit((s) => (s.genre = e.target.value))} /></div>
              <div><Label>Tono</Label><Input value={script.tone} onChange={(e) => edit((s) => (s.tone = e.target.value))} /></div>
            </div>
          </Card>
        </div>
      )}

      {tab === "characters" && (
        <div className="space-y-4">
          <Notice>La consistencia se apoya en: descripción visual fija (se añade a cada prompt), imagen de referencia (los fotogramas con este personaje se generan con un modelo que acepta referencias), y semilla opcional. Ningún modelo garantiza una consistencia perfecta.</Notice>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => edit((s) => s.characters.push({ id: uid("char"), name: "Nuevo personaje", role: "", description: "", age: "", face: "", hair: "", wardrobe: "", accessories: "", colors: "", voice_description: "", voice_id: "", seed: null, lora_url: "", ref_asset_ids: [] }))}><Plus className="h-4 w-4" /> Añadir personaje</Button>
            <Button variant="primary" disabled={!script.characters.length || busy} onClick={() => produce("character_refs")}><User className="h-4 w-4" /> Generar referencias que falten</Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {script.characters.map((c: any, i: number) => (
              <Card key={c.id} className="grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <Thumb id={c.ref_asset_ids[0]} className="aspect-[3/4] w-full rounded-xl" />
                  <InputSlot label="Subir referencia" kind="image" asset={null} onChange={(a) => a && edit((s) => s.characters[i].ref_asset_ids.unshift(a.id))} optional />
                  <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => produce("character_refs", [c.id], true)}><RefreshCw className="h-3.5 w-3.5" /> Regenerar</Button>
                  {c.ref_asset_ids.length > 1 && <p className="text-center font-mono text-[10px] text-dim">{c.ref_asset_ids.length} referencias</p>}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {[["name", "Nombre"], ["role", "Rol"], ["age", "Edad visual"], ["hair", "Cabello"], ["face", "Rostro y rasgos"], ["wardrobe", "Vestuario"], ["accessories", "Accesorios"], ["colors", "Colores"]].map(([k, l]) => (
                    <div key={k}><span className="text-[11px] text-dim">{l}</span><Input className="h-8 text-[13px]" value={c[k] || ""} onChange={(e) => edit((s) => (s.characters[i][k] = e.target.value))} /></div>
                  ))}
                  <div className="col-span-2"><span className="text-[11px] text-dim">Descripción</span><Textarea rows={2} className="text-[13px]" value={c.description} onChange={(e) => edit((s) => (s.characters[i].description = e.target.value))} /></div>
                  <div><span className="text-[11px] text-dim">ID de voz (ElevenLabs)</span><Input className="h-8 text-[13px]" value={c.voice_id || ""} onChange={(e) => edit((s) => (s.characters[i].voice_id = e.target.value))} placeholder="voz de biblioteca" /></div>
                  <div><span className="text-[11px] text-dim">Semilla fija</span><Input className="h-8 text-[13px]" type="number" value={c.seed ?? ""} onChange={(e) => edit((s) => (s.characters[i].seed = e.target.value === "" ? null : Number(e.target.value)))} /></div>
                  <div className="col-span-2 flex justify-between">
                    <span className="font-mono text-[10px] text-dim">{c.id}</span>
                    <button onClick={() => confirm(`¿Eliminar a ${c.name}?`) && edit((s) => s.characters.splice(i, 1))} className="text-[12px] text-dim hover:text-err">Eliminar</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {!script.characters.length && <Empty title="Sin personajes" icon={<User className="h-8 w-8" />}>Desarrolla el guion con IA o añádelos manualmente.</Empty>}
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-4">
          <Button onClick={() => edit((s) => s.locations.push({ id: uid("loc"), name: "Nueva localización", description: "", time_of_day: "", lighting: "", ref_asset_ids: [] }))}><Plus className="h-4 w-4" /> Añadir localización</Button>
          <div className="grid gap-4 lg:grid-cols-2">
            {script.locations.map((l: any, i: number) => (
              <Card key={l.id} className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Thumb id={l.ref_asset_ids[0]} className="aspect-video w-full rounded-xl" />
                  <InputSlot label="Referencia" kind="image" asset={null} onChange={(a) => a && edit((s) => s.locations[i].ref_asset_ids.unshift(a.id))} optional />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="col-span-2"><span className="text-[11px] text-dim">Nombre</span><Input className="h-8" value={l.name} onChange={(e) => edit((s) => (s.locations[i].name = e.target.value))} /></div>
                  <div className="col-span-2"><span className="text-[11px] text-dim">Descripción visual</span><Textarea rows={3} className="text-[13px]" value={l.description} onChange={(e) => edit((s) => (s.locations[i].description = e.target.value))} /></div>
                  <div><span className="text-[11px] text-dim">Momento del día</span><Input className="h-8" value={l.time_of_day} onChange={(e) => edit((s) => (s.locations[i].time_of_day = e.target.value))} /></div>
                  <div><span className="text-[11px] text-dim">Iluminación</span><Input className="h-8" value={l.lighting} onChange={(e) => edit((s) => (s.locations[i].lighting = e.target.value))} /></div>
                  <button onClick={() => edit((s) => s.locations.splice(i, 1))} className="col-span-2 text-right text-[12px] text-dim hover:text-err">Eliminar</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === "storyboard" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => edit((s) => s.scenes.push({ id: uid("scene"), number: s.scenes.length + 1, title: "Nueva escena", summary: "", location_id: "", mood: "", shots: [] }))}><Plus className="h-4 w-4" /> Añadir escena</Button>
            <Button variant="primary" disabled={!shots.length || busy} onClick={() => produce("keyframes")}><ImagePlus className="h-4 w-4" /> Generar fotogramas que falten</Button>
            <Button variant="outline" disabled={!stats.keyframes || busy} onClick={() => produce("clips")}><Video className="h-4 w-4" /> Animar planos con fotograma</Button>
          </div>
          {script.scenes.map((sc: any, si: number) => (
            <Card key={sc.id} className="p-4">
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <span className="font-mono text-[12px] text-accent">ESC {String(sc.number).padStart(2, "0")}</span>
                <Input className="h-8 max-w-sm flex-1 font-medium" value={sc.title} onChange={(e) => edit((s) => (s.scenes[si].title = e.target.value))} />
                <Select className="h-8 w-48 text-[13px]" value={sc.location_id} onChange={(e) => edit((s) => (s.scenes[si].location_id = e.target.value))}>
                  <option value="">Sin localización</option>
                  {script.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const ins = prompt("¿Cómo quieres reescribir esta escena?"); if (ins) runJob(`/api/films/${id}/rewrite-scene`, { scene_id: sc.id, instruction: ins }); }}><Wand2 className="h-3.5 w-3.5" /> Reescribir con IA</Button>
                  <Button size="sm" variant="ghost" onClick={() => edit((s) => s.scenes[si].shots.push({ id: uid("shot"), number: s.scenes[si].shots.length + 1, description: "", shot_type: "medium", camera_movement: "static", lens: "35mm", duration: 5, characters: [], dialogue: [], image_prompt: "", video_prompt: "", sfx_prompt: "", keyframe_asset_id: null, clip_asset_id: null, sfx_asset_id: null, notes: "" }))}><Plus className="h-3.5 w-3.5" /> Plano</Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm("¿Eliminar la escena?") && edit((s) => s.scenes.splice(si, 1))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <Textarea rows={2} className="mb-4 text-[13px]" value={sc.summary} onChange={(e) => edit((s) => (s.scenes[si].summary = e.target.value))} placeholder="Resumen de la escena" />
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {sc.shots.map((sh: any, hi: number) => {
                  const up = (k: string, v: any) => edit((s) => (s.scenes[si].shots[hi][k] = v));
                  return (
                    <div key={sh.id} className="overflow-hidden rounded-xl border border-line bg-panel-2">
                      <div className="relative">
                        <Thumb id={sh.clip_asset_id || sh.keyframe_asset_id} className="aspect-video w-full" />
                        <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">P{sh.number} · {sh.duration}s</span>
                        <div className="absolute top-2 right-2 flex gap-1">
                          {sh.keyframe_asset_id && <Badge tone="ok">fotograma</Badge>}
                          {sh.clip_asset_id && <Badge tone="accent">clip</Badge>}
                        </div>
                      </div>
                      <div className="space-y-2 p-3">
                        <Textarea rows={2} className="text-[13px]" value={sh.description} onChange={(e) => up("description", e.target.value)} placeholder="Qué se ve en el plano" />
                        <div className="grid grid-cols-3 gap-1.5">
                          <Select className="h-8 text-[11.5px]" value={sh.shot_type} onChange={(e) => up("shot_type", e.target.value)}>{SHOT_TYPES.map((x) => <option key={x}>{x}</option>)}</Select>
                          <Select className="h-8 text-[11.5px]" value={sh.camera_movement} onChange={(e) => up("camera_movement", e.target.value)}>{MOVES.map((x) => <option key={x}>{x}</option>)}</Select>
                          <Select className="h-8 text-[11.5px]" value={sh.lens} onChange={(e) => up("lens", e.target.value)}>{LENSES.map((x) => <option key={x}>{x}</option>)}</Select>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {script.characters.map((c: any) => (
                            <button key={c.id} onClick={() => up("characters", sh.characters.includes(c.id) ? sh.characters.filter((x: string) => x !== c.id) : [...sh.characters, c.id])}
                              className={cx("rounded-full border px-2 py-0.5 text-[11px]", sh.characters.includes(c.id) ? "border-accent/60 bg-accent/10" : "border-line-2 text-dim")}>{c.name}</button>
                          ))}
                        </div>
                        <details>
                          <summary className="cursor-pointer text-[11.5px] text-muted">Prompts, diálogo y sonido</summary>
                          <div className="mt-2 space-y-2">
                            <div><span className="text-[11px] text-dim">Prompt del fotograma (EN)</span><Textarea rows={2} className="text-[12px]" value={sh.image_prompt} onChange={(e) => up("image_prompt", e.target.value)} /></div>
                            <div><span className="text-[11px] text-dim">Prompt de movimiento (EN)</span><Textarea rows={2} className="text-[12px]" value={sh.video_prompt} onChange={(e) => up("video_prompt", e.target.value)} /></div>
                            <div><span className="text-[11px] text-dim">Efectos de sonido</span><Input className="h-8 text-[12px]" value={sh.sfx_prompt} onChange={(e) => up("sfx_prompt", e.target.value)} /></div>
                            <div><span className="text-[11px] text-dim">Duración (s)</span><Input className="h-8" type="number" min={2} max={10} value={sh.duration} onChange={(e) => up("duration", Number(e.target.value))} /></div>
                            {sh.dialogue.map((d: any, di: number) => (
                              <div key={di} className="flex gap-1.5">
                                <Select className="h-8 w-28 text-[11.5px]" value={d.character_id} onChange={(e) => edit((s) => (s.scenes[si].shots[hi].dialogue[di].character_id = e.target.value))}>
                                  <option value="">Narrador</option>
                                  {script.characters.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </Select>
                                <Input className="h-8 flex-1 text-[12px]" value={d.line} onChange={(e) => edit((s) => { s.scenes[si].shots[hi].dialogue[di].line = e.target.value; s.scenes[si].shots[hi].dialogue[di].audio_asset_id = null; })} />
                                <button onClick={() => edit((s) => s.scenes[si].shots[hi].dialogue.splice(di, 1))} className="text-dim hover:text-err" aria-label="Quitar línea"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            ))}
                            <button onClick={() => edit((s) => s.scenes[si].shots[hi].dialogue.push({ character_id: "", line: "", audio_asset_id: null }))} className="text-[11.5px] text-muted hover:text-text">+ línea de diálogo</button>
                          </div>
                        </details>
                        <div className="flex gap-1.5 pt-1">
                          <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => produce("keyframes", [sh.id], true)}><ImagePlus className="h-3.5 w-3.5" /> Fotograma</Button>
                          <Button size="sm" variant="outline" className="flex-1" disabled={busy || !sh.keyframe_asset_id} onClick={() => produce("clips", [sh.id], true)}><Video className="h-3.5 w-3.5" /> Clip</Button>
                          <Button size="sm" variant="ghost" onClick={() => edit((s) => s.scenes[si].shots.splice(hi, 1))} aria-label="Eliminar plano"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!script.scenes.length && <Empty title="El storyboard está vacío" icon={<Clapperboard className="h-8 w-8" />}>Desarrolla el guion con IA o añade escenas y planos.</Empty>}
        </div>
      )}

      {tab === "production" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="space-y-4 p-5">
            <Label>Estética y motores</Label>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-[11px] text-dim">Estilo visual</span><Input value={script.style.visual_style} onChange={(e) => edit((s) => (s.style.visual_style = e.target.value))} /></div>
              <div><span className="text-[11px] text-dim">Iluminación</span><Input value={script.style.lighting} onChange={(e) => edit((s) => (s.style.lighting = e.target.value))} /></div>
              <div><span className="text-[11px] text-dim">Color grading</span><Input value={script.style.color_grade} onChange={(e) => edit((s) => (s.style.color_grade = e.target.value))} /></div>
              <div><span className="text-[11px] text-dim">Estética</span><Input value={script.style.aesthetic} onChange={(e) => edit((s) => (s.style.aesthetic = e.target.value))} /></div>
            </div>
            <ModelSelect task="text_to_image" label="Modelo de fotogramas" value={script.style.image_model} onChange={(v) => edit((s) => (s.style.image_model = v))} />
            <ModelSelect task="image_edit" label="Modelo con referencias de personaje" value={script.style.reference_model} onChange={(v) => edit((s) => (s.style.reference_model = v))} />
            <ModelSelect task="image_to_video" label="Modelo de vídeo" value={script.style.video_model} onChange={(v) => edit((s) => (s.style.video_model = v))} />
            <ModelSelect task="text_to_speech" label="Voces" value={script.style.tts_model} onChange={(v) => edit((s) => (s.style.tts_model = v))} />
            <div><span className="text-[11px] text-dim">Música (descripción)</span><Input value={script.music.prompt} onChange={(e) => edit((s) => (s.music.prompt = e.target.value))} /></div>
          </Card>
          <Card className="space-y-3 p-5">
            <Label>Producción por lotes</Label>
            <p className="text-[12.5px] text-muted">Cada lote es un único trabajo que genera los elementos uno a uno (visible en el historial, cancelable). Solo se generan los que faltan.</p>
            {[
              { step: "character_refs", icon: User, label: "Referencias de personajes", info: `${script.characters.filter((c: any) => c.ref_asset_ids.length).length}/${script.characters.length}` },
              { step: "keyframes", icon: ImagePlus, label: "Fotogramas clave (storyboard)", info: `${stats.keyframes}/${shots.length}` },
              { step: "clips", icon: Video, label: "Clips de vídeo", info: `${stats.clips}/${shots.length}` },
              { step: "dialogue", icon: Mic, label: "Voces de los diálogos", info: `${stats.voiced}/${stats.lines}` },
              { step: "sfx", icon: Waves, label: "Efectos de sonido", info: `${shots.filter((s: any) => s.sfx_asset_id).length}/${shots.filter((s: any) => s.sfx_prompt).length}` },
              { step: "music", icon: Music, label: "Banda sonora", info: script.music.asset_id ? "lista" : "pendiente" },
            ].map((x) => (
              <div key={x.step} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
                <x.icon className="h-4 w-4 text-accent" />
                <span className="flex-1 text-[13.5px]">{x.label}</span>
                <span className="font-mono text-[11px] text-muted">{x.info}</span>
                <Button size="sm" disabled={busy} onClick={() => produce(x.step)}>Generar</Button>
              </div>
            ))}
            {script.music.asset_id && <Thumb id={script.music.asset_id} />}
            <Button variant="primary" className="w-full" disabled={busy} onClick={async () => {
              if (dirty && !(await save())) return;
              try { await api(`/api/films/${id}/assemble`, { method: "POST" }); toast.success("Montaje creado a partir de los planos"); qc.invalidateQueries({ queryKey: ["film", id] }); setTab("montage"); } catch (e) { toast.error(errMsg(e)); }
            }}><FilmIcon className="h-4 w-4" /> Montar película en la línea temporal</Button>
          </Card>
        </div>
      )}

      {tab === "montage" && (
        film.data?.timeline_id ? <TimelineEditor timelineId={film.data.timeline_id} /> : (
          <Empty title="Todavía no hay montaje" icon={<FilmIcon className="h-8 w-8" />} action={<Button onClick={() => setTab("production")}>Ir a producción</Button>}>
            Genera fotogramas o clips y pulsa «Montar película». Se colocarán los planos, diálogos, subtítulos, efectos y música en pistas separadas.
          </Empty>
        )
      )}
    </div>
  );
}
