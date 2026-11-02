"use client";

import { useOptions } from "@/lib/hooks";
import { cx, Label, Select } from "./ui";

const LABELS: Record<string, string> = {
  extreme_wide: "Gran plano general", wide: "Plano general", full: "Plano entero", medium: "Plano medio", medium_close: "Plano medio corto",
  close_up: "Primer plano", extreme_close_up: "Plano detalle", over_shoulder: "Sobre el hombro", pov: "Subjetivo (POV)", aerial: "Aéreo",
  shallow: "Reducida (bokeh)", deep: "Gran profundidad", golden_hour: "Hora dorada", blue_hour: "Hora azul", night_neon: "Noche neón",
  high_key: "Clave alta", low_key: "Clave baja", rembrandt: "Rembrandt", backlit: "Contraluz", overcast: "Nublado suave", practical: "Prácticas en cuadro",
  volumetric: "Volumétrica", slow_motion: "Cámara lenta", real_time: "Tiempo real", fast: "Rápida", timelapse: "Timelapse", epic: "Épico",
  tense: "Tenso", romantic: "Romántico", melancholic: "Melancólico", joyful: "Alegre", mysterious: "Misterioso", luxury: "Lujo", gritty: "Crudo",
  teal_orange: "Teal & orange", kodak_2383: "Kodak 2383", bleach_bypass: "Bleach bypass", noir: "Noir B/N", pastel: "Pastel", neon: "Neón",
  natural: "Natural", vintage: "Vintage", blockbuster: "Blockbuster", indie: "Indie", commercial: "Spot publicitario", documentary: "Documental",
  music_video: "Videoclip", car_commercial: "Anuncio de coches", sci_fi: "Ciencia ficción", period: "Época", rule_of_thirds: "Regla de tercios",
  centered: "Centrada", leading_lines: "Líneas guía", negative_space: "Espacio negativo", top_down: "Cenital", low_angle: "Contrapicado",
};

export function CameraMoves({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const opts = useOptions();
  return (
    <div>
      <Label hint="se aplica vía prompt">Movimiento de cámara</Label>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {opts.data?.camera_movements.map((m: any) => (
          <button key={m.id} type="button" onClick={() => onChange(value === m.id ? "" : m.id)}
            className={cx("rounded-lg border px-2 py-2 text-[11.5px] leading-tight transition", value === m.id ? "border-accent/60 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CinemaControls({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const opts = useOptions();
  const groups = opts.data?.cinema || {};
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(groups).map(([key, g]: [string, any]) => (
        <div key={key}>
          <Label>{g.label}</Label>
          <Select value={value[key] || ""} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
            <option value="">—</option>
            {g.options.map((o: string) => (
              <option key={o} value={o}>{LABELS[o] || o}</option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}
