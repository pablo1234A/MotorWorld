"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Cpu, KeyRound, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtUsd } from "@/lib/api";
import { useModels } from "@/lib/hooks";
import type { Model, ParamSpec } from "@/lib/types";
import { Badge, Button, cx, Input, Label, Notice, Select, Toggle } from "./ui";

const TIER: Record<string, string> = { top: "Máxima calidad", high: "Alta calidad", standard: "Estándar", draft: "Borrador" };

export function priceLabel(m: Model, task: string) {
  const r = m.routes.find((r) => r.endpoints[task] && m.route_status.find((s) => s.provider === r.provider)?.configured) || m.routes.find((r) => r.endpoints[task]);
  if (!r?.price) return "—";
  if (r.price.usd === 0) return "Gratis";
  if (r.price.usd == null) return "Ver proveedor";
  const unit = { image: "/img", second: "/s", megapixel: "/MP", run: "/uso", video: "/vídeo", "1k_chars": "/1k car." }[r.price.unit] || "";
  return `${fmtUsd(r.price.usd)}${unit}`;
}

export function ProviderPills({ m }: { m: Model }) {
  return (
    <div className="flex flex-wrap gap-1">
      {m.route_status.map((r) => (
        <span key={r.provider} className={cx("rounded px-1.5 py-0.5 font-mono text-[10px]", r.configured ? "bg-ok/10 text-ok" : "bg-panel-3 text-dim")} title={r.configured ? "Configurado" : "Necesita configuración"}>
          {r.provider}
        </span>
      ))}
    </div>
  );
}

export function ModelPicker({ task, value, onChange, category }: { task: string; value: string; onChange: (id: string, m: Model) => void; category?: string }) {
  const { data, isLoading } = useModels({ task });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const models = useMemo(() => {
    const list = (data?.items || []).filter((m) => !category || m.category === category || m.tasks.includes(task));
    return [...list].sort((a, b) => Number(b.available) - Number(a.available));
  }, [data, category, task]);
  const current = models.find((m) => m.id === value);

  useEffect(() => {
    if (!value && models.length) {
      const first = models.find((m) => m.available) || models[0];
      onChange(first.id, first);
    } else if (value && models.length && !current) {
      const first = models.find((m) => m.available) || models[0];
      onChange(first.id, first);
    }
  }, [value, models, current, onChange]);

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Label>Modelo</Label>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line-2 bg-panel-2 px-3.5 py-2.5 text-left transition hover:border-[#45454f]" data-testid="model-picker">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            {isLoading ? "Cargando modelos…" : current?.name || "Elige un modelo"}
            {current && !current.available && <Lock className="h-3.5 w-3.5 text-warn" />}
          </span>
          {current && <span className="block truncate text-[12px] text-muted">{current.family} · {TIER[current.quality_tier]} · {priceLabel(current, task)}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="animate-fade-up absolute z-30 mt-2 max-h-[420px] w-full min-w-[300px] overflow-y-auto rounded-xl border border-line-2 bg-panel p-1.5 shadow-2xl">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id, m);
                setOpen(false);
              }}
              className={cx("w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-panel-2", m.id === value && "bg-panel-3")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-medium">{m.name}</span>
                <span className="font-mono text-[10.5px] text-muted">{priceLabel(m, task)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {m.available ? <Badge tone="ok">listo</Badge> : <Badge tone="warn">falta clave</Badge>}
                {m.open_weights && <Badge tone="info">pesos abiertos</Badge>}
                {m.has_local_route && <Badge>local</Badge>}
                <Badge>{TIER[m.quality_tier]}</Badge>
              </div>
            </button>
          ))}
          {!models.length && <p className="p-3 text-sm text-muted">No hay modelos para esta operación.</p>}
        </div>
      )}
      {current && !current.available && <MissingProviderNotice m={current} />}
    </div>
  );
}

export function MissingProviderNotice({ m }: { m: Model }) {
  const names = m.route_status.map((r) => r.provider).join(", ");
  return (
    <div className="mt-2">
      <Notice tone="warn">
        <span className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {m.name} necesita un proveedor configurado ({names}). Añade la API key en{" "}
            <Link href="/settings?tab=keys" className="underline underline-offset-2">Configuración → Claves API</Link> o pide al administrador que la defina en el servidor.
          </span>
        </span>
      </Notice>
    </div>
  );
}

export function ParamControls({ model, values, onChange, hide = [] }: { model?: Model; values: Record<string, any>; onChange: (v: Record<string, any>) => void; hide?: string[] }) {
  const [adv, setAdv] = useState(false);
  if (!model) return null;
  const params = model.params.filter((p) => !hide.includes(p.name));
  const basic = params.filter((p) => !p.advanced);
  const advanced = params.filter((p) => p.advanced);
  const set = (k: string, v: any) => onChange({ ...values, [k]: v });
  return (
    <div className="space-y-4">
      {basic.map((p) => (
        <Param key={p.name} p={p} value={values[p.name]} onChange={(v) => set(p.name, v)} />
      ))}
      {advanced.length > 0 && (
        <div>
          <button type="button" onClick={() => setAdv((a) => !a)} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-text">
            <Cpu className="h-3.5 w-3.5" /> Controles avanzados <ChevronDown className={cx("h-3.5 w-3.5 transition", adv && "rotate-180")} />
          </button>
          {adv && (
            <div className="mt-3 space-y-4 border-l border-line pl-3">
              {advanced.map((p) => (
                <Param key={p.name} p={p} value={values[p.name]} onChange={(v) => set(p.name, v)} />
              ))}
            </div>
          )}
        </div>
      )}
      {model.limitations && (
        <p className="flex gap-1.5 text-[12px] leading-relaxed text-dim">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {model.limitations}
        </p>
      )}
    </div>
  );
}

function Param({ p, value, onChange }: { p: ParamSpec; value: any; onChange: (v: any) => void }) {
  const v = value ?? p.default;
  if (p.type === "enum")
    return (
      <div>
        <Label hint={p.help}>{p.label}</Label>
        {(p.options?.length || 0) <= 6 ? (
          <div className="flex flex-wrap gap-1.5">
            {p.options!.map((o) => (
              <button key={String(o)} type="button" onClick={() => onChange(o)} className={cx("rounded-lg border px-2.5 py-1.5 font-mono text-[12px] transition", String(v) === String(o) ? "border-accent/60 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}>
                {o === "match_input_image" ? "como la imagen" : String(o)}
              </button>
            ))}
          </div>
        ) : (
          <Select value={String(v)} onChange={(e) => onChange(p.options!.find((o) => String(o) === e.target.value))}>
            {p.options!.map((o) => (
              <option key={String(o)} value={String(o)}>
                {o === "match_input_image" ? "como la imagen" : String(o)}
              </option>
            ))}
          </Select>
        )}
      </div>
    );
  if (p.type === "bool") return <Toggle checked={!!v} onChange={onChange} label={p.label} />;
  if (p.type === "seed")
    return (
      <div>
        <Label hint="vacío = aleatoria">{p.label}</Label>
        <div className="flex gap-2">
          <Input type="number" min={0} value={value ?? ""} placeholder="Aleatoria" onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
          <Button type="button" variant="outline" onClick={() => onChange(Math.floor(Math.random() * 2_000_000_000))} title="Generar semilla">🎲</Button>
        </div>
      </div>
    );
  if (p.type === "string")
    return (
      <div>
        <Label hint={p.help}>{p.label}</Label>
        <Input value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  return (
    <div>
      <Label hint={<span className="text-muted">{typeof v === "number" ? (p.type === "float" ? v.toFixed(2) : v) : v}</span>}>{p.label}</Label>
      <input type="range" min={p.min ?? 0} max={p.max ?? 100} step={p.step ?? (p.type === "int" ? 1 : 0.05)} value={v ?? p.min ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      {p.help && <p className="mt-1 text-[11.5px] text-dim">{p.help}</p>}
    </div>
  );
}

export function TierIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Lock className="h-4 w-4 text-warn" />;
}
