"use client";

import { Cpu, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useModels } from "@/lib/hooks";
import { Badge, Button, cx, Notice, Select, Textarea } from "./ui";

export type PlanStep = {
  task: string;
  kind: "local" | "generative";
  label: string;
  prompt: string;
  params: Record<string, any>;
  model_id: string | null;
  available: boolean;
  missing?: string;
  note?: string;
  refined?: boolean;
  provider?: string | null;
};

function StepModel({ step, onChange }: { step: PlanStep; onChange: (id: string) => void }) {
  const task = step.task === "video_extend" ? "image_to_video" : step.task;
  const { data } = useModels({ task });
  if (step.kind === "local") return <Badge>FFmpeg / Pillow</Badge>;
  const value = step.task === "video_extend" ? step.params.i2v_model || "" : step.model_id || "";
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-[12px]">
      {!value && <option value="">Sin modelo disponible</option>}
      {data?.items.map((m) => (
        <option key={m.id} value={m.id}>{m.name}{m.available ? "" : " (falta clave)"}</option>
      ))}
    </Select>
  );
}

export function PlanEditor({ steps, onChange, onRun, running }: { steps: PlanStep[]; onChange: (s: PlanStep[]) => void; onRun: () => void; running: boolean }) {
  const update = (i: number, patch: Partial<PlanStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const blocked = steps.some((s) => !s.available);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-xl border border-line bg-panel-2 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
              {s.kind === "local" ? <Cpu className="h-3.5 w-3.5 text-info" /> : <Sparkles className="h-3.5 w-3.5 text-accent" />}
              <span className="text-[13px] font-medium">{s.label}</span>
              <Badge tone={s.kind === "local" ? "info" : "accent"}>{s.kind === "local" ? "local" : "generativo"}</Badge>
              {s.refined && <Badge tone="ok">prompt optimizado</Badge>}
            </div>
            <button onClick={() => onChange(steps.filter((_, j) => j !== i))} className="text-dim hover:text-err" aria-label="Quitar paso">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <StepModel
            step={s}
            onChange={(id) =>
              s.task === "video_extend" ? update(i, { params: { ...s.params, i2v_model: id }, available: !!id }) : update(i, { model_id: id, available: !!id })
            }
          />
          {s.kind === "generative" && s.task !== "remove_background" && s.task !== "upscale_image" && s.task !== "upscale_video" && (
            <Textarea rows={2} className="mt-2 text-[13px]" value={s.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
          )}
          {s.kind === "local" && s.params.ops && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.params.ops.map((o: any, k: number) => (
                <code key={k} className="rounded bg-panel-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">{o.op}{o.preset ? `:${o.preset}` : ""}{o.factor ? `×${o.factor}` : ""}{o.aspect ? ` ${o.aspect}` : ""}</code>
              ))}
            </div>
          )}
          {s.note && <p className="mt-2 text-[11.5px] text-warn">{s.note}</p>}
          {!s.available && s.missing && <p className="mt-2 text-[11.5px] text-warn">{s.missing}</p>}
        </div>
      ))}
      {blocked && <Notice tone="warn">Algún paso no tiene un modelo disponible. Configura su proveedor o quita el paso.</Notice>}
      <Button variant="primary" className="w-full" disabled={!steps.length || blocked} loading={running} onClick={onRun} data-testid="run-plan">
        <Wand2 className="h-4 w-4" /> Ejecutar {steps.length} {steps.length === 1 ? "paso" : "pasos"}
      </Button>
    </div>
  );
}

export const kindTone = (k: string) => cx(k === "local" ? "text-info" : "text-accent");
