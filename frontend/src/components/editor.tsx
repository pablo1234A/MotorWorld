"use client";

import { Brush, Eraser, RotateCcw } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cx } from "./ui";

export type MaskHandle = { toBlob: () => Promise<Blob | null>; clear: () => void; isEmpty: () => boolean };

/** Paint a mask over an image (white = area to regenerate). */
export const MaskCanvas = forwardRef<MaskHandle, { src: string; width: number; height: number; active: boolean }>(function MaskCanvas({ src, width, height, active }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"brush" | "erase">("brush");
  const [size, setSize] = useState(48);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const painted = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = width;
    c.height = height;
    c.getContext("2d")!.clearRect(0, 0, width, height);
    painted.current = false;
  }, [width, height, src]);

  const pos = (e: React.PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const stroke = (p: { x: number; y: number }) => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.globalCompositeOperation = mode === "brush" ? "source-over" : "destination-out";
    ctx.strokeStyle = "rgba(255,90,54,1)";
    ctx.fillStyle = "rgba(255,90,54,1)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const scale = canvas.current!.width / canvas.current!.getBoundingClientRect().width;
    ctx.lineWidth = size * scale;
    ctx.beginPath();
    if (last.current) {
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.arc(p.x, p.y, (size * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    last.current = p;
    if (mode === "brush") painted.current = true;
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      canvas.current?.getContext("2d")!.clearRect(0, 0, width, height);
      painted.current = false;
    },
    isEmpty: () => !painted.current,
    toBlob: async () => {
      const c = canvas.current;
      if (!c) return null;
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.globalCompositeOperation = "source-over";
      // paint the alpha of the user strokes as white
      const tmp = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < tmp.data.length; i += 4) {
        const v = tmp.data[i + 3] > 20 ? 255 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return new Promise((res) => out.toBlob((b) => res(b), "image/png"));
    },
  }));

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvas}
        className={cx("absolute inset-0 h-full w-full touch-none opacity-55", active ? "cursor-crosshair" : "pointer-events-none")}
        onPointerDown={(e) => {
          if (!active) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = null;
          stroke(pos(e));
        }}
        onPointerMove={(e) => drawing.current && stroke(pos(e))}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      {active && (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-line-2 bg-panel/90 px-2 py-1.5 backdrop-blur">
          <button onClick={() => setMode("brush")} className={cx("rounded-lg p-1.5", mode === "brush" ? "bg-accent text-white" : "text-muted")} aria-label="Pincel"><Brush className="h-4 w-4" /></button>
          <button onClick={() => setMode("erase")} className={cx("rounded-lg p-1.5", mode === "erase" ? "bg-accent text-white" : "text-muted")} aria-label="Borrador"><Eraser className="h-4 w-4" /></button>
          <input type="range" min={8} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" aria-label="Tamaño del pincel" />
          <button onClick={() => { canvas.current?.getContext("2d")!.clearRect(0, 0, width, height); painted.current = false; }} className="rounded-lg p-1.5 text-muted hover:text-text" aria-label="Borrar máscara">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
});

export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [x, setX] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = useCallback((clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setX(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);
  return (
    <div ref={box} className="relative h-full w-full touch-none select-none" onPointerMove={(e) => e.buttons && move(e.clientX)} onPointerDown={(e) => move(e.clientX)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt="Después" className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Antes" className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${x}%` }}>
        <div className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/70 bg-black/60 font-mono text-[10px] text-white">⇆</div>
      </div>
      <span className="absolute top-3 left-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">ANTES</span>
      <span className="absolute top-3 right-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">DESPUÉS</span>
    </div>
  );
}
