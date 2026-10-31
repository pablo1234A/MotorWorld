"use client";
import { useState } from "react";
import { fmtDate } from "@/lib/format";

type Point = { day: string; sent: number; failed: number; clicked: number };

/** Gráfico de barras accesible (SVG/CSS) con datos reales del periodo. */
export function ActivityChart({ data, showClicks }: { data: Point[]; showClicks: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.sent, d.failed, showClicks ? d.clicked : 0)));
  const step = data.length > 45 ? 14 : data.length > 20 ? 7 : 3;
  const h = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
        <div className="flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-800" />Enviados</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-bad-600" />Fallidos</span>
          {showClicks ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-star-300" />Clics en el enlace</span> : null}
        </div>
        <span className="tabular-nums" aria-live="polite">{h ? `${fmtDate(h.day)} · ${h.sent} enviados · ${h.failed} fallidos${showClicks ? ` · ${h.clicked} clics` : ""}` : " "}</span>
      </div>
      <div className="relative h-44 sm:h-52" role="img" aria-label={`Envíos por día: ${data.reduce((a, d) => a + d.sent, 0)} enviados en total`}>
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-ink-100" />)}
        </div>
        <div className="absolute inset-0 flex items-end gap-[2px] sm:gap-1">
          {data.map((d, i) => (
            <button
              key={d.day}
              type="button"
              className="group flex h-full flex-1 items-end justify-center gap-px rounded-sm focus-visible:bg-ink-100"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${fmtDate(d.day)}: ${d.sent} enviados, ${d.failed} fallidos`}
            >
              <span className="w-full max-w-[14px] rounded-t-[3px] bg-ink-800 transition-opacity group-hover:opacity-80" style={{ height: `${(d.sent / max) * 100}%`, minHeight: d.sent ? 2 : 0 }} />
              {d.failed ? <span className="w-full max-w-[6px] rounded-t-[3px] bg-bad-600" style={{ height: `${(d.failed / max) * 100}%`, minHeight: 2 }} /> : null}
              {showClicks && d.clicked ? <span className="w-full max-w-[8px] rounded-t-[3px] bg-star-300" style={{ height: `${(d.clicked / max) * 100}%`, minHeight: 2 }} /> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-400">
        {data.filter((_, i) => i % step === 0).map((d) => <span key={d.day}>{new Date(d.day).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>)}
      </div>
    </div>
  );
}
