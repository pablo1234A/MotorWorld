import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ProgressStep {
  label: string;
  done: boolean;
  href?: string;
}

/** Progreso del cliente en el proceso: vertical en móvil, horizontal en escritorio. */
export function ProgressSteps({ steps }: { steps: ProgressStep[] }) {
  const current = steps.findIndex((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <section aria-label="Tu progreso" className="rounded-[var(--radius-card)] bg-navy px-5 py-5 text-white sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-white">Tu progreso</h2>
        <p className="text-sm text-white/70 tabular-nums">
          {doneCount} de {steps.length}
        </p>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-5 sm:gap-0">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          const content = (
            <>
              <span
                className={cn(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  s.done ? "bg-white text-navy" : isCurrent ? "bg-blue-500 text-white ring-4 ring-white/15" : "bg-white/10 text-white/70",
                )}
              >
                {s.done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-sm leading-snug", s.done ? "text-white/80" : isCurrent ? "font-medium text-white" : "text-white/60")}>
                {s.label}
                <span className="sr-only">{s.done ? " (completado)" : isCurrent ? " (siguiente paso)" : ""}</span>
              </span>
            </>
          );
          return (
            <li key={s.label} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:pr-3">
              {i < steps.length - 1 && <span aria-hidden className="absolute top-3.5 left-7 hidden h-px w-[calc(100%-1.75rem)] bg-white/20 sm:block" />}
              {s.href && !s.done ? (
                <Link href={s.href} className="flex items-center gap-3 rounded-md hover:underline sm:flex-col sm:items-start">
                  {content}
                </Link>
              ) : (
                <div className="flex items-center gap-3 sm:flex-col sm:items-start">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
