"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Moon, Sparkles, Sun, Wand2 } from "lucide-react";
import { analyzeBrief } from "@/engine/brief";
import { KB } from "@/engine/kb";
import type { ProjectKind, StyleId } from "@/engine/schema";
import { buildTheme, STYLES } from "@/engine/styles";
import { BRIEF_EXAMPLES, KIND_OPTIONS } from "@/lib/catalog";
import { useGenerate } from "./quick-create";
import { Badge, Button, cn, Field, Input, Segmented, Textarea } from "./ui";

const STEP_TITLES = ["Describe tu web", "Tipo de proyecto", "Estilo visual", "Páginas y detalles"];

function StylePreview({ style, kind, mode, selected }: { style: StyleId; kind: ProjectKind; mode: "light" | "dark"; selected: boolean }) {
  const t = useMemo(() => buildTheme({ style, kind, seed: 7, mode }), [style, kind, mode]);
  const def = STYLES[style];
  const serif = /Serif|Garamond|Playfair|Bodoni|Fraunces|Newsreader|Gloock|Young/i.test(t.fonts.display);
  return (
    <div className={cn("overflow-hidden rounded-xl border transition-colors", selected ? "border-accent ring-2 ring-accent/30" : "border-line group-hover:border-line-strong")}>
      <div className="relative aspect-[16/9] p-4" style={{ background: t.colors.bg, color: t.colors.text }}>
        <p className="text-[9px] tracking-[.18em] uppercase" style={{ color: t.colors.muted }}>
          {def.label}
        </p>
        <p className="mt-1.5 text-[21px] leading-none" style={{ fontFamily: serif ? "Georgia, serif" : "inherit", fontWeight: serif ? 400 : 650, textTransform: t.headingCase === "upper" ? "uppercase" : "none", letterSpacing: serif ? "-0.01em" : "-0.03em" }}>
          Aa Bb
        </p>
        <div className="absolute right-4 bottom-4 left-4 flex items-center gap-1.5">
          <span className="h-4 rounded-full px-2.5" style={{ background: t.colors.primary, borderRadius: Math.min(999, t.radius * 3) }} />
          <span className="h-4 w-8 border" style={{ borderColor: t.colors.border, borderRadius: Math.min(999, t.radius * 3) }} />
          <span className="ml-auto flex gap-1">
            {[t.colors.primary, t.colors.accent, t.colors.surface, t.colors.text].map((c, i) => (
              <span key={i} className="size-3 rounded-full border border-black/10" style={{ background: c }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NewProjectWizard({ engine }: { engine: "claude" | "local" }) {
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<ProjectKind | null>(null);
  const [style, setStyle] = useState<StyleId | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [name, setName] = useState("");
  const [pages, setPages] = useState<string[] | null>(null);
  const { busy, stepLabel, generate } = useGenerate();

  const analysis = useMemo(() => (brief.trim().length > 6 ? analyzeBrief(brief) : null), [brief]);
  const effectiveKind = kind ?? analysis?.kind ?? "landing";
  const suggestedPages = KB[effectiveKind].pages.map((p) => p.name);
  const chosenPages = pages ?? suggestedPages;
  const canNext = step === 0 ? brief.trim().length >= 12 : true;

  function next() {
    if (step === 0 && analysis) {
      if (!kind) setKind(analysis.kind);
      if (!style && analysis.styleHint) setStyle(analysis.styleHint);
      if (analysis.wants.dark !== null) setMode(analysis.wants.dark ? "dark" : "light");
      if (!name && analysis.name) setName(analysis.name);
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function submit() {
    generate({ brief, kind: effectiveKind, style: style ?? undefined, mode, name: name.trim() || undefined, pages: chosenPages });
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pt-20 pb-24 lg:px-10 lg:pt-12">
      <nav aria-label="Progreso" className="mb-8 flex items-center gap-2">
        {STEP_TITLES.map((t, i) => (
          <button key={t} type="button" disabled={i > step || busy} onClick={() => setStep(i)} className={cn("press flex items-center gap-2 rounded-full border px-3 py-1 text-xs", i === step ? "border-accent/50 bg-accent-soft text-fg" : i < step ? "border-line text-muted hover:text-fg" : "border-line text-faint")}>
            <span className={cn("grid size-4 place-items-center rounded-full text-[10px]", i < step ? "bg-ok text-black" : i === step ? "bg-accent text-white" : "bg-elev")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
            <span className="hidden sm:inline">{t}</span>
          </button>
        ))}
      </nav>

      <h1 className="text-[24px] font-semibold tracking-tight">{STEP_TITLES[step]}</h1>

      {step === 0 ? (
        <div className="mt-6">
          <p className="mb-4 text-[13px] text-muted">Cuanto más concreto, mejor: qué vendes u ofreces, a quién, dónde, y qué debe poder hacer la gente en tu web.</p>
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} placeholder="Ej.: Concesionario de coches eléctricos de ocasión en Valencia llamado «Volta». Queremos mostrar el inventario, ofrecer financiación y que la gente reserve pruebas de conducción." className="min-h-40 text-[15px]" autoFocus />
          <div className="mt-3 flex flex-wrap gap-2">
            {BRIEF_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setBrief(ex)} className="press max-w-full truncate rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-line-strong hover:text-fg">
                {ex}
              </button>
            ))}
          </div>
          {analysis ? (
            <div className="mt-6 rounded-xl border border-line bg-panel p-4 text-[13px]">
              <p className="mb-2 flex items-center gap-1.5 font-medium">
                <Wand2 className="size-3.5 text-accent" /> Lo que he entendido
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{KIND_OPTIONS.find((k) => k.id === analysis.kind)?.label}</Badge>
                {analysis.name ? <Badge>Nombre: {analysis.name}</Badge> : null}
                {analysis.city ? <Badge>{analysis.city}</Badge> : null}
                {analysis.offerings.map((o) => (
                  <Badge key={o}>{o}</Badge>
                ))}
                {analysis.wants.store ? <Badge>Carrito y pagos</Badge> : null}
                {analysis.wants.booking ? <Badge>Reservas</Badge> : null}
                {analysis.wants.pricing ? <Badge>Precios</Badge> : null}
                {analysis.wants.threeD ? <Badge>3D</Badge> : null}
                {analysis.styleHint ? <Badge>Estilo {STYLES[analysis.styleHint].label}</Badge> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Tipo de proyecto">
          {KIND_OPTIONS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={effectiveKind === k.id} onClick={() => setKind(k.id)} className={cn("press rounded-xl border p-3.5 text-left", effectiveKind === k.id ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-strong")}>
              <p className="flex items-center justify-between text-[13px] font-medium">
                {k.label}
                {effectiveKind === k.id ? <Check className="size-4 text-accent" /> : null}
              </p>
              <p className="mt-1 text-xs text-muted">{k.description}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">Elige una dirección de arte o deja que la IA decida según tu sector.</p>
            <Segmented label="Modo" value={mode} onChange={setMode} className="w-48" options={[{ value: "light", label: <><Sun className="size-3.5" /> Claro</> }, { value: "dark", label: <><Moon className="size-3.5" /> Oscuro</> }]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Estilo visual">
            <button type="button" role="radio" aria-checked={style === null} onClick={() => setStyle(null)} className={cn("press group flex aspect-[16/9] flex-col items-center justify-center rounded-xl border text-center", style === null ? "border-accent bg-accent-soft ring-2 ring-accent/30" : "border-dashed border-line hover:border-line-strong")}>
              <Sparkles className="mb-2 size-5 text-accent" />
              <span className="text-[13px] font-medium">Que decida la IA</span>
              <span className="mt-0.5 text-xs text-muted">Según tu sector y tu brief</span>
            </button>
            {Object.values(STYLES).map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} onClick={() => setStyle(s.id)} className="press group text-left">
                <StylePreview style={s.id} kind={effectiveKind} mode={mode} selected={style === s.id} />
                <p className="mt-2 text-[13px] font-medium">{s.label}</p>
                <p className="text-xs text-muted">{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Nombre del negocio" hint="Opcional">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={analysis?.name ?? "Lo deduciremos del brief"} className="h-10" />
            </Field>
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted">Páginas además de Inicio</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...suggestedPages, "Sobre nosotros", "Contacto", "Blog", "Precios", "Servicios"])).map((p) => {
                  const on = chosenPages.includes(p);
                  return (
                    <button key={p} type="button" aria-pressed={on} onClick={() => setPages(on ? chosenPages.filter((x) => x !== p) : [...chosenPages, p])} className={cn("press flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", on ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-muted hover:text-fg")}>
                      {on ? <Check className="size-3" /> : null}
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-panel p-4 text-[13px]">
            <p className="font-medium">Resumen</p>
            <ul className="mt-3 space-y-2 text-muted">
              <li>Tipo: <span className="text-fg">{KIND_OPTIONS.find((k) => k.id === effectiveKind)?.label}</span></li>
              <li>Estilo: <span className="text-fg">{style ? STYLES[style].label : "Elegido por la IA"}</span> · {mode === "dark" ? "oscuro" : "claro"}</li>
              <li>Páginas: <span className="text-fg">Inicio{chosenPages.length ? `, ${chosenPages.join(", ")}` : ""}</span></li>
              <li>Motor: <span className="text-fg">{engine === "claude" ? "Claude Opus 5.5" : "Motor local determinista"}</span></li>
            </ul>
            <p className="mt-4 text-xs text-faint">Después podrás cambiarlo todo en el editor visual o pidiéndoselo al chat.</p>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3 lg:px-10">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
            <ArrowLeft className="size-4" /> Atrás
          </Button>
          {step < 3 ? (
            <Button variant="primary" onClick={next} disabled={!canNext}>
              Siguiente <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} loading={busy}>
              {busy ? stepLabel : "Generar sitio"}
              {!busy ? <Sparkles className="size-4" /> : null}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
