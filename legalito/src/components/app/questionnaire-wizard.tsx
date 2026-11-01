"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CloudOff, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, inputClass } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import {
  STEPS,
  activeAdvisories,
  progress,
  questionLabel,
  validateAnswers,
  visibleQuestions,
  type Answers,
  type Question,
  type StepId,
} from "@/lib/documents/questionnaire";
import { completeForm, saveDraft } from "@/lib/actions/forms";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function QuestionnaireWizard({ responseId, initialAnswers, initialStep }: { responseId: string; initialAnswers: Answers; initialStep: string | null }) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [finishing, startFinishing] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const steps = useMemo(() => STEPS.filter((s) => visibleQuestions(answers, s.id).length > 0), [answers]);
  const [stepId, setStepId] = useState<StepId>(() => (STEPS.find((s) => s.id === initialStep)?.id ?? "negocio") as StepId);
  const index = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const step = steps[index] ?? steps[0];
  const questions = visibleQuestions(answers, step.id);
  const pct = progress(answers).percent;
  const advisories = activeAdvisories(answers);
  const isLast = index === steps.length - 1;

  const persist = useCallback(
    async (data: Answers, current: string) => {
      setSaveState("saving");
      const r = await saveDraft(responseId, data, current);
      setSaveState(r.ok ? "saved" : "error");
      return r.ok;
    },
    [responseId],
  );

  // Autoguardado con espera de 1 s tras el último cambio.
  const update = (id: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      latest.current = next;
      return next;
    });
    setErrors((e) => {
      if (!e[id]) return e;
      const rest = { ...e };
      delete rest[id];
      return rest;
    });
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(latest.current, step.id), 1000);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "pending" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const goTo = (target: StepId) => {
    setStepId(target);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => headingRef.current?.focus(), 50);
  };

  const next = async () => {
    const { errors: stepErrors } = validateAnswers(answers, { step: step.id });
    const visibleIds = new Set(questions.map((q) => q.id));
    const relevant = Object.fromEntries(Object.entries(stepErrors).filter(([k]) => visibleIds.has(k)));
    if (Object.keys(relevant).length > 0) {
      setErrors(relevant);
      setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(), 30);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const nextStep = steps[index + 1];
    void persist(answers, nextStep?.id ?? step.id);
    if (nextStep) goTo(nextStep.id);
  };

  const finish = () => {
    setFormError(null);
    if (timer.current) clearTimeout(timer.current);
    startFinishing(async () => {
      const r = await completeForm(responseId, answers);
      // Si la acción no redirige es que hay errores que mostrar.
      if (r?.errors) {
        const firstStep = STEPS.find((s) => visibleQuestions(answers, s.id).some((q) => r.errors![q.id]));
        if (firstStep) {
          goTo(firstStep.id);
          setTimeout(() => setErrors(r.errors!), 60);
        }
      }
      if (r?.error) setFormError(r.error);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      {/* Índice de pasos */}
      <nav aria-label="Pasos del formulario" className="hidden lg:block">
        <ol className="sticky top-8 space-y-1">
          {steps.map((s, i) => {
            const done = i < index;
            const current = i === index;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => (i <= index ? goTo(s.id) : undefined)}
                  disabled={i > index}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    current ? "bg-white font-medium text-navy shadow-[var(--shadow-soft)] ring-1 ring-line" : done ? "text-ink-soft hover:bg-white/60" : "text-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      done ? "bg-success text-white" : current ? "bg-navy text-white" : "border border-line-strong bg-white",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        {/* Progreso */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink-soft">
              Paso {index + 1} de {steps.length}
              <span className="text-subtle lg:hidden"> · {step.title}</span>
            </span>
            <SaveIndicator state={saveState} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del formulario">
            <div className="h-full rounded-full bg-blue transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
        </div>

        <section key={step.id} className="animate-rise rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-soft)] sm:p-8" aria-labelledby="paso-titulo">
          <h2 id="paso-titulo" ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none sm:text-[22px]">
            {step.title}
          </h2>
          <p className="mt-1.5 text-[15px] text-muted">{step.description}</p>

          <div className="mt-7 space-y-7">
            {questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                label={questionLabel(q, answers)}
                value={answers[q.id]}
                error={errors[q.id]}
                onChange={(v) => update(q.id, v)}
                advisories={advisories.filter((a) => a.questionId === q.id)}
              />
            ))}
          </div>

          {formError && (
            <p role="alert" className="mt-6 rounded-lg border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="mt-9 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => index > 0 && goTo(steps[index - 1].id)} disabled={index === 0} className={index === 0 ? "invisible" : ""}>
              <ArrowLeft className="h-4 w-4" /> Anterior
            </Button>
            {isLast ? (
              <Button onClick={() => validateLastAndFinish()} disabled={finishing}>
                {finishing ? <Spinner className="h-4 w-4" /> : null}
                {finishing ? "Comprobando…" : "Revisar mis respuestas"}
                {!finishing && <ArrowRight className="h-4 w-4" />}
              </Button>
            ) : (
              <Button onClick={() => void next()}>
                Siguiente <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </section>
        <div className="mt-4 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-xs text-subtle">Tus respuestas se guardan automáticamente. Puedes salir y continuar más tarde.</p>
          <button
            type="button"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              if (timer.current) clearTimeout(timer.current);
              await persist(latest.current, step.id);
              router.push("/panel");
            }}
            className="text-sm text-link disabled:opacity-60"
          >
            {leaving ? "Guardando…" : "Guardar y salir"}
          </button>
        </div>
      </div>
    </div>
  );

  function validateLastAndFinish() {
    const { errors: stepErrors } = validateAnswers(answers, { step: step.id });
    const ids = new Set(questions.map((q) => q.id));
    const relevant = Object.fromEntries(Object.entries(stepErrors).filter(([k]) => ids.has(k)));
    if (Object.keys(relevant).length) {
      setErrors(relevant);
      return;
    }
    finish();
  }
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, React.ReactNode> = {
    idle: null,
    pending: <span className="text-subtle">Cambios sin guardar</span>,
    saving: (
      <span className="inline-flex items-center gap-1.5 text-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
      </span>
    ),
    saved: (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Check className="h-3.5 w-3.5" /> Guardado
      </span>
    ),
    error: (
      <span className="inline-flex items-center gap-1.5 text-danger">
        <CloudOff className="h-3.5 w-3.5" /> No se pudo guardar
      </span>
    ),
  };
  return (
    <span aria-live="polite" className="text-xs">
      {map[state]}
    </span>
  );
}

function QuestionField({
  question: q,
  label,
  value,
  error,
  onChange,
  advisories,
}: {
  question: Question;
  label: string;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  advisories: { tone: "info" | "warning"; text: string }[];
}) {
  const id = `q-${q.id}`;
  const describedBy = [q.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": Boolean(error), "aria-describedby": describedBy, "aria-required": q.required };
  const isGroup = ["radio", "boolean", "multiselect", "repeater"].includes(q.type);

  const control = (() => {
    switch (q.type) {
      case "textarea":
        return <Textarea {...common} value={(value as string) ?? ""} maxLength={q.maxLength} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />;
      case "select":
        return (
          <Select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="" disabled>
              Selecciona una opción
            </option>
            {q.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      case "radio":
        return <ChoiceCards name={id} options={q.options!} selected={value === undefined ? [] : [String(value)]} onToggle={(v) => onChange(v)} invalid={!!error} describedBy={describedBy} />;
      case "boolean":
        return (
          <ChoiceCards
            name={id}
            columns={2}
            options={[
              { value: "true", label: "Sí" },
              { value: "false", label: "No" },
            ]}
            selected={value === true ? ["true"] : value === false ? ["false"] : []}
            onToggle={(v) => onChange(v === "true")}
            invalid={!!error}
            describedBy={describedBy}
          />
        );
      case "multiselect": {
        const current = Array.isArray(value) ? (value as string[]) : [];
        return (
          <ChoiceCards
            name={id}
            multiple
            options={q.options!}
            selected={current}
            invalid={!!error}
            describedBy={describedBy}
            onToggle={(v) => {
              if (current.includes(v)) return onChange(current.filter((x) => x !== v));
              if (v === q.exclusiveOption) return onChange([v]);
              onChange([...current.filter((x) => x !== q.exclusiveOption), v]);
            }}
          />
        );
      }
      case "repeater":
        return <Repeater question={q} value={Array.isArray(value) ? (value as Record<string, string>[]) : []} onChange={onChange} />;
      default: {
        const type = q.type === "email" ? "email" : q.type === "url" ? "url" : q.type === "tel" ? "tel" : "text";
        return (
          <Input
            {...common}
            type={type}
            inputMode={q.type === "postal_code" ? "numeric" : q.type === "tel" ? "tel" : q.type === "email" ? "email" : undefined}
            autoComplete={q.autocomplete ?? "off"}
            value={(value as string) ?? ""}
            maxLength={q.type === "postal_code" ? 5 : (q.maxLength ?? 300)}
            placeholder={q.placeholder}
            className={q.type === "tax_id" || q.type === "postal_code" ? "max-w-xs uppercase" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
    }
  })();

  const LabelTag = isGroup ? "p" : "label";
  return (
    <div className="space-y-2" role={isGroup ? "group" : undefined} aria-labelledby={isGroup ? `${id}-label` : undefined}>
      <LabelTag id={`${id}-label`} {...(!isGroup ? { htmlFor: id } : {})} className="block text-[15px] font-medium text-ink">
        {label}
        {!q.required && <span className="ml-1.5 text-xs font-normal text-subtle">(opcional)</span>}
      </LabelTag>
      {q.help && (
        <p id={`${id}-help`} className="-mt-1 text-[13.5px] leading-snug text-muted">
          {q.help}
        </p>
      )}
      {control}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      {advisories.map((a) => (
        <div key={a.text} className={cn("flex gap-2.5 rounded-lg px-3.5 py-3 text-[13.5px] leading-snug", a.tone === "warning" ? "bg-warning-bg text-warning" : "bg-blue-50 text-navy")}>
          {a.tone === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
}

function ChoiceCards({
  name,
  options,
  selected,
  onToggle,
  multiple,
  columns,
  invalid,
  describedBy,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  multiple?: boolean;
  columns?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className={cn("grid gap-2.5", columns === 2 ? "grid-cols-2 sm:max-w-sm" : "sm:grid-cols-2")}>
      {options.map((o, i) => {
        const checked = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-3.5 py-3 transition-[border-color,box-shadow,background-color] duration-150",
              checked ? "border-blue bg-blue-50/60 ring-1 ring-blue" : "border-line-strong hover:border-navy/30",
              invalid && !checked && "border-danger/50",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onToggle(o.value)}
              className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-navy"
              aria-invalid={invalid && i === 0 ? true : undefined}
              aria-describedby={describedBy}
            />
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium text-ink">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[13px] text-muted">{o.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function Repeater({ question: q, value, onChange }: { question: Question; value: Record<string, string>[]; onChange: (v: unknown) => void }) {
  const fields = q.fields ?? [];
  const setField = (i: number, f: string, v: string) => onChange(value.map((item, j) => (j === i ? { ...item, [f]: v } : item)));
  return (
    <div className="space-y-3">
      {value.map((item, i) => (
        <div key={i} className="rounded-xl border border-line bg-canvas p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.id} className="block text-[13px] font-medium text-ink-soft">
                {f.label}
                <input
                  className={cn(inputClass, "mt-1")}
                  value={item[f.id] ?? ""}
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  onChange={(e) => setField(i, f.id, e.target.value)}
                />
              </label>
            ))}
          </div>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-danger hover:underline">
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </button>
        </div>
      ))}
      {(!q.maxItems || value.length < q.maxItems) && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, Object.fromEntries(fields.map((f) => [f.id, ""]))])}>
          <Plus className="h-4 w-4" /> Añadir
        </Button>
      )}
    </div>
  );
}
