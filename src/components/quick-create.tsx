"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BRIEF_EXAMPLES } from "@/lib/catalog";
import { Button, cn } from "./ui";

const STEPS = ["Analizando el brief", "Planificando páginas", "Eligiendo dirección de arte", "Escribiendo contenido", "Revisando calidad"];

export function useGenerate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  async function generate(body: Record<string, unknown>) {
    setBusy(true);
    setStep(0);
    timer.current = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 1400);
    try {
      const r = await api<{ project: { id: string }; engine: string; qa: { score: number } }>("/api/projects", { method: "POST", json: body });
      toast.success(r.engine === "claude" ? "Sitio generado con Claude Opus 5.5" : "Sitio generado con el motor local", { description: `Puntuación QA: ${r.qa.score}/100` });
      router.push(`/editor/${r.project.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    } finally {
      if (timer.current) clearInterval(timer.current);
    }
  }
  return { busy, step, stepLabel: STEPS[step], generate };
}

export function QuickCreate({ engine }: { engine: "claude" | "local" }) {
  const [brief, setBrief] = useState("");
  const { busy, stepLabel, generate } = useGenerate();
  const ref = useRef<HTMLTextAreaElement>(null);
  const valid = brief.trim().length >= 12;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) generate({ brief });
        }}
        className={cn("rounded-2xl border bg-panel p-2 transition-colors focus-within:border-accent/60", busy ? "border-accent/40" : "border-line")}
      >
        <label htmlFor="brief" className="sr-only">
          Describe la web que quieres
        </label>
        <textarea
          id="brief"
          ref={ref}
          value={brief}
          disabled={busy}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          placeholder="Describe tu negocio y la web que necesitas. Por ejemplo: «Restaurante de cocina de temporada en Valencia con reservas online y carta»"
          className="block min-h-24 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-fg placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <span className="flex items-center gap-1.5 text-[11px] text-faint">
            <Sparkles className="size-3.5" />
            {engine === "claude" ? "Claude Opus 5.5" : "Motor local (configura ANTHROPIC_API_KEY para usar Claude)"}
          </span>
          <Button type="submit" variant="primary" size="md" disabled={!valid} loading={busy} aria-label="Generar sitio">
            {busy ? stepLabel : "Generar"}
            {!busy ? <ArrowUp className="size-4" /> : null}
          </Button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {BRIEF_EXAMPLES.slice(0, 4).map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy}
            onClick={() => {
              setBrief(ex);
              ref.current?.focus();
            }}
            className="press max-w-full truncate rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-line-strong hover:text-fg"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
