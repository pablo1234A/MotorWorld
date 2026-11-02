"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brush, Columns2, Download, Eraser, Expand, ImageMinus, Maximize2, Palette, Redo2, ScanLine, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BeforeAfter, MaskCanvas, type MaskHandle } from "@/components/editor";
import { JobProgress } from "@/components/jobs";
import { AssetPicker, Dropzone } from "@/components/media";
import { PlanEditor, type PlanStep } from "@/components/plan";
import { Button, Card, cx, Label, Notice, PageHeader, Textarea } from "@/components/ui";
import { api, errMsg, uploadFile } from "@/lib/api";
import { useJob } from "@/lib/hooks";
import type { Asset } from "@/lib/types";

const QUICK = [
  { id: "remove_obj", label: "Eliminar objeto", icon: Eraser, instruction: "Elimina el objeto marcado y rellena el fondo de forma natural", mask: true },
  { id: "add_obj", label: "Añadir / sustituir", icon: Brush, instruction: "", mask: true, ask: "¿Qué quieres añadir o poner en la zona marcada?" },
  { id: "bg", label: "Cambiar fondo", icon: ScanLine, instruction: "Cambia el fondo por un estudio fotográfico con luz suave y conserva el sujeto exactamente igual" },
  { id: "rm_bg", label: "Eliminar fondo", icon: ImageMinus, instruction: "Quita el fondo" },
  { id: "light", label: "Mejorar iluminación", icon: Sparkles, instruction: "Mejora la iluminación con luz cinematográfica suave, conserva la composición y la identidad" },
  { id: "restore", label: "Restaurar foto", icon: Wand2, instruction: "Restaura esta fotografía antigua" },
  { id: "upscale", label: "Ampliar", icon: Maximize2, instruction: "Amplía la imagen a mayor resolución" },
  { id: "extend", label: "Extender", icon: Expand, instruction: "Extiende la imagen hacia los lados manteniendo el estilo" },
];

function Editor() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [current, setCurrent] = useState<Asset | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [pos, setPos] = useState(-1);
  const [instruction, setInstruction] = useState("");
  const [steps, setSteps] = useState<PlanStep[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [maskOn, setMaskOn] = useState(false);
  const [compare, setCompare] = useState(false);
  const [picker, setPicker] = useState(false);
  const [adjust, setAdjust] = useState({ brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1 });
  const mask = useRef<MaskHandle>(null);

  const lineage = useQuery<{ ancestors: Asset[]; descendants: Asset[]; root_id: string }>({
    queryKey: ["lineage", current?.id],
    queryFn: () => api(`/api/assets/${current!.id}/lineage`),
    enabled: !!current,
  });
  const root = lineage.data?.ancestors[0];

  const open = (a: Asset, push = true) => {
    setCurrent(a);
    setSteps(null);
    setCompare(false);
    if (push) {
      const next = [...stack.slice(0, pos + 1), a.id];
      setStack(next);
      setPos(next.length - 1);
    }
  };

  useEffect(() => {
    const id = sp.get("asset");
    if (id && !current) api<Asset>(`/api/assets/${id}`).then((a) => open(a)).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const job = useJob(jobId, async (g) => {
    setRunning(false);
    setJobId(null);
    if (g.status === "completed" && g.output_asset_ids.length) {
      const last = g.output_asset_ids[g.output_asset_ids.length - 1];
      const a = await api<Asset>(`/api/assets/${last}`);
      open(a);
      setCompare(true);
      toast.success("Edición terminada. El original se conserva en el historial.");
      qc.invalidateQueries({ queryKey: ["lineage"] });
    } else if (g.status === "failed") toast.error(g.error || "La edición falló");
  });

  const go = async (i: number) => {
    if (i < 0 || i >= stack.length) return;
    setPos(i);
    open(await api<Asset>(`/api/assets/${stack[i]}`), false);
  };

  const plan = async (text = instruction) => {
    if (!current || !text.trim()) return;
    setPlanning(true);
    try {
      const hasMask = maskOn && mask.current && !mask.current.isEmpty();
      const r = await api<{ steps: PlanStep[] }>("/api/edits/plan", { method: "POST", json: { asset_id: current.id, instruction: text, mask_asset_id: hasMask ? "pending" : null } });
      setSteps(r.steps);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPlanning(false);
    }
  };

  const run = async (custom?: PlanStep[]) => {
    const s = custom || steps;
    if (!current || !s?.length) return;
    setRunning(true);
    try {
      let maskId: string | null = null;
      if (s.some((x) => x.task === "inpaint")) {
        if (!mask.current || mask.current.isEmpty()) {
          setRunning(false);
          setMaskOn(true);
          return toast.error("Pinta sobre la imagen la zona a modificar");
        }
        const blob = await mask.current.toBlob();
        const m = await uploadFile(new File([blob!], "mask.png", { type: "image/png" }), { url: `/api/assets/${current.id}/mask` });
        maskId = m.id;
      }
      const g = await api<{ id: string }>("/api/edits/run", {
        method: "POST",
        json: { asset_id: current.id, instruction, mask_asset_id: maskId, steps: s.map((x) => ({ task: x.task, model_id: x.model_id, prompt: x.prompt, params: x.params, label: x.label, provider: x.provider })) },
      });
      setJobId(g.id);
    } catch (e) {
      setRunning(false);
      toast.error(errMsg(e));
    }
  };

  const quick = (q: (typeof QUICK)[number]) => {
    let text = q.instruction;
    if (q.ask) {
      const extra = prompt(q.ask);
      if (!extra) return;
      text = `Añade en la zona marcada: ${extra}`;
    }
    if (q.mask) setMaskOn(true);
    setInstruction(text);
    if (q.mask && (!mask.current || mask.current.isEmpty())) {
      toast("Pinta la zona sobre la imagen y pulsa «Planificar»");
      return;
    }
    plan(text);
  };

  const applyAdjust = () =>
    run([{ task: "local_image_op", kind: "local", label: "Ajustes de color", prompt: "", model_id: "local-image", available: true, params: { ops: [{ op: "adjust", ...adjust }] } }]);

  return (
    <div>
      <PageHeader eyebrow="Editar · Imagen" title={<>Editor de <em className="text-muted">imágenes</em></>}
        actions={current && (
          <>
            <Button variant="ghost" size="icon" onClick={() => go(pos - 1)} disabled={pos <= 0} aria-label="Deshacer"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => go(pos + 1)} disabled={pos >= stack.length - 1} aria-label="Rehacer"><Redo2 className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => setCompare((c) => !c)} disabled={!root || root.id === current.id}><Columns2 className="h-4 w-4" /> Antes / después</Button>
            <a href={current.download_url} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-2 px-4 text-sm hover:bg-panel-2"><Download className="h-4 w-4" /> Descargar</a>
          </>
        )}>
        Describe el cambio en lenguaje natural. El sistema elige la operación y el modelo adecuados; cada edición crea una versión nueva y nunca sobrescribe el original.
      </PageHeader>

      {!current ? (
        <div className="mx-auto max-w-2xl space-y-4">
          <Dropzone accept="image/*" onUploaded={(a) => open(a)} label="Sube la fotografía que quieres editar" />
          <div className="text-center"><Button variant="ghost" onClick={() => setPicker(true)}>o elige una de tu biblioteca</Button></div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <div className="space-y-4">
            <div className="checker relative overflow-hidden rounded-2xl border border-line" style={{ aspectRatio: `${current.width || 16} / ${current.height || 9}`, maxHeight: "72vh" }}>
              {compare && root && root.id !== current.id ? (
                <BeforeAfter before={root.url} after={current.url} />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.url} alt={current.name} className="absolute inset-0 h-full w-full object-contain" />
                  <MaskCanvas ref={mask} src={current.url} width={current.width || 1024} height={current.height || 1024} active={maskOn} />
                </>
              )}
              {job.data && <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 backdrop-blur"><JobProgress g={job.data} /></div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={maskOn ? "primary" : "outline"} size="sm" onClick={() => setMaskOn((m) => !m)}><Brush className="h-3.5 w-3.5" /> {maskOn ? "Máscara activa" : "Seleccionar zona"}</Button>
              <span className="font-mono text-[11px] text-dim">{current.width}×{current.height} · {current.name}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicker(true)}>Abrir otra imagen</Button>
            </div>
            {lineage.data && (
              <Card className="p-4">
                <Label>Historial de modificaciones</Label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[...lineage.data.ancestors.slice(0, 1), ...lineage.data.descendants].map((a, i) => (
                    <button key={a.id} onClick={() => open(a)} className={cx("relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border", a.id === current.id ? "border-accent" : "border-line hover:border-line-2")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumbnail_url || a.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-[9px] text-white">{i === 0 ? "ORIGINAL" : `v${i}`}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="space-y-4 p-5">
              <div>
                <Label>Instrucción</Label>
                <Textarea rows={4} value={instruction} onChange={(e) => { setInstruction(e.target.value); setSteps(null); }} data-testid="instruction"
                  placeholder="Convierte esta foto en una imagen publicitaria de lujo, cambia el fondo por un estudio cinematográfico y conserva el producto exactamente igual." />
              </div>
              <Button className="w-full" onClick={() => plan()} loading={planning} disabled={!instruction.trim() || running} data-testid="plan">
                <Sparkles className="h-4 w-4" /> Planificar edición
              </Button>
              {steps && <PlanEditor steps={steps} onChange={setSteps} onRun={() => run()} running={running} />}
            </Card>
            <Card className="p-5">
              <Label>Herramientas rápidas</Label>
              <div className="grid grid-cols-2 gap-2">
                {QUICK.map((q) => (
                  <button key={q.id} onClick={() => quick(q)} disabled={running} className="flex items-center gap-2 rounded-lg border border-line-2 px-3 py-2.5 text-left text-[12.5px] text-muted transition hover:bg-panel-2 hover:text-text disabled:opacity-40">
                    <q.icon className="h-3.5 w-3.5 shrink-0 text-accent" /> {q.label}
                  </button>
                ))}
              </div>
            </Card>
            <Card className="space-y-3 p-5">
              <Label hint="local · gratis · instantáneo">Retoque de color</Label>
              {(["brightness", "contrast", "saturation", "sharpness"] as const).map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-24 text-[12px] text-muted">{{ brightness: "Brillo", contrast: "Contraste", saturation: "Saturación", sharpness: "Nitidez" }[k]}</span>
                  <input type="range" min={0.3} max={2} step={0.05} value={adjust[k]} onChange={(e) => setAdjust({ ...adjust, [k]: Number(e.target.value) })} className="flex-1" />
                  <span className="w-9 text-right font-mono text-[11px] text-dim">{adjust[k].toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="w-24 text-[12px] text-muted">Temperatura</span>
                <input type="range" min={-1} max={1} step={0.05} value={adjust.warmth} onChange={(e) => setAdjust({ ...adjust, warmth: Number(e.target.value) })} className="flex-1" />
                <span className="w-9 text-right font-mono text-[11px] text-dim">{adjust.warmth.toFixed(2)}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={applyAdjust} disabled={running}><Palette className="h-3.5 w-3.5" /> Aplicar ajustes</Button>
            </Card>
            {steps?.some((s) => s.task === "inpaint") && !maskOn && <Notice tone="warn">Este plan usa inpainting: activa «Seleccionar zona» y pinta el área.</Notice>}
          </div>
        </div>
      )}
      <AssetPicker open={picker} onClose={() => setPicker(false)} onPick={(a) => open(a)} kind="image" title="Abrir imagen" />
    </div>
  );
}

export default function ImageEditorPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}
