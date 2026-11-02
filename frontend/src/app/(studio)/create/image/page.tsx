"use client";

import { ImagePlus, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { GenerationCard } from "@/components/jobs";
import { InputSlot } from "@/components/media";
import { ModelPicker, ParamControls, priceLabel } from "@/components/models";
import { Button, Card, cx, Empty, Label, PageHeader, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useCreateGeneration, useGenerations, useOptions } from "@/lib/hooks";
import type { Asset, Model } from "@/lib/types";

type Mode = "text_to_image" | "image_to_image" | "variations" | "upscale_image";
const MODE_TASK: Record<Mode, string> = { text_to_image: "text_to_image", image_to_image: "image_to_image", variations: "image_to_image", upscale_image: "upscale_image" };

export default function CreateImagePage() {
  const [mode, setMode] = useState<Mode>("text_to_image");
  const task = MODE_TASK[mode];
  const [modelId, setModelId] = useState("");
  const [model, setModel] = useState<Model>();
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [style, setStyle] = useState("none");
  const [composition, setComposition] = useState("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [ref, setRef] = useState<Asset | null>(null);
  const opts = useOptions();
  const feed = useGenerations({ task: "text_to_image,image_to_image,upscale_image", limit: 24 });
  const create = useCreateGeneration();

  const onModel = useCallback((id: string, m: Model) => {
    setModelId(id);
    setModel(m);
    setParams({});
  }, []);

  const needsImage = mode !== "text_to_image";
  const canSubmit = model?.available && (mode === "upscale_image" || prompt.trim().length > 0 || mode === "variations") && (!needsImage || ref);

  const submit = () => {
    const p = { ...params };
    if (mode === "variations") {
      p.strength = p.strength ?? 0.45;
      if (model?.params.some((x) => x.name === "num_outputs")) p.num_outputs = p.num_outputs ?? 4;
    }
    create.mutate({
      task,
      model_id: modelId,
      prompt: mode === "variations" && !prompt.trim() ? (ref?.meta?.prompt || "variation of the reference image, same subject and composition") : prompt,
      negative_prompt: model?.supports_negative_prompt ? negative : "",
      params: p,
      style: mode === "upscale_image" ? undefined : style,
      composition: composition || undefined,
      inputs: needsImage && ref ? { image: ref.id } : {},
    });
  };

  const useAsRef = async (assetId: string) => {
    const a = await api<Asset>(`/api/assets/${assetId}`);
    setRef(a);
    setMode("variations");
  };

  const estimate = useMemo(() => (model ? priceLabel(model, task) : ""), [model, task]);

  return (
    <div>
      <PageHeader eyebrow="Crear · Imagen" title={<>Crear <em className="text-muted">imágenes</em></>}>
        Fotografía, publicidad, producto, arquitectura o ilustración con el modelo que prefieras. Los controles cambian según lo que admite cada modelo.
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit space-y-5 p-5 xl:sticky xl:top-20">
          <Tabs
            value={mode}
            onChange={(m) => {
              setMode(m);
              setModelId("");
            }}
            items={[
              { id: "text_to_image", label: "Texto" },
              { id: "image_to_image", label: "Imagen" },
              { id: "variations", label: "Variaciones" },
              { id: "upscale_image", label: "Ampliar" },
            ]}
            className="w-full justify-between"
          />
          <ModelPicker task={task} value={modelId} onChange={onModel} />
          {needsImage && <InputSlot label={mode === "upscale_image" ? "Imagen a ampliar" : "Imagen de referencia"} kind="image" asset={ref} onChange={setRef} />}
          {mode !== "upscale_image" && (
            <>
              <div>
                <Label hint={`${prompt.length}/8000`}>Prompt</Label>
                <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={8000} data-testid="prompt"
                  placeholder={mode === "variations" ? "Opcional: describe qué variar" : "Un deportivo clásico rojo aparcado frente a una gasolinera del desierto al anochecer, luces de neón, asfalto mojado…"} />
              </div>
              {model?.supports_negative_prompt && (
                <div>
                  <Label>Prompt negativo</Label>
                  <Textarea rows={2} value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="borroso, deformado, texto, marca de agua" />
                </div>
              )}
              <div>
                <Label>Estilo</Label>
                <div className="flex flex-wrap gap-1.5">
                  {opts.data?.image_styles.map((s: any) => (
                    <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={cx("rounded-full border px-3 py-1 text-[12.5px] transition", style === s.id ? "border-accent/60 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label hint="se añade al prompt">Composición</Label>
                <div className="flex flex-wrap gap-1.5">
                  {["", ...(opts.data?.compositions.map((c: any) => c.id) || [])].map((c: string) => (
                    <button key={c || "none"} type="button" onClick={() => setComposition(c)} className={cx("rounded-full border px-3 py-1 text-[12px] transition", composition === c ? "border-accent/60 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}>
                      {c ? c.replaceAll("_", " ") : "libre"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <ParamControls model={model} values={params} onChange={setParams} hide={mode === "text_to_image" ? ["strength", "image_prompt_strength"] : []} />
          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="font-mono text-[11px] text-muted" title="Estimación según la tarifa pública del proveedor">{estimate}</span>
            <Button variant="primary" size="lg" disabled={!canSubmit} loading={create.isPending} onClick={submit} data-testid="generate">
              <Sparkles className="h-4 w-4" /> Generar
            </Button>
          </div>
        </Card>

        <div>
          {feed.data?.items.length ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {feed.data.items.map((g) => (
                <GenerationCard key={g.id} g={g} onUse={useAsRef} />
              ))}
            </div>
          ) : (
            <Empty icon={<ImagePlus className="h-8 w-8" />} title="Tus imágenes aparecerán aquí">
              Cada resultado se guarda en tu biblioteca con el modelo, proveedor, prompt y semilla utilizados, para que puedas reproducirlo.
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
