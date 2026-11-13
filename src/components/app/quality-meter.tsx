"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { scoreListing, type QualityFacts } from "@/domain/quality";
import { cn } from "@/lib/utils";

const LEVEL = {
  excelente: { label: "Excelente", bar: "bg-success", text: "text-success" },
  bueno: { label: "Bueno", bar: "bg-success", text: "text-success" },
  mejorable: { label: "Mejorable", bar: "bg-warning", text: "text-warning" },
  incompleto: { label: "Incompleto", bar: "bg-danger", text: "text-danger" },
} as const;

type Props = {
  content: { title: string; description: string; keywords: string[] };
  facts: QualityFacts;
  limits: { titleMaxLength: number; descriptionMaxLength: number };
  productHref: string;
};

/** Puntuación en vivo del anuncio: se recalcula mientras el usuario edita. */
export function QualityMeter({ content, facts, limits, productHref }: Props) {
  const report = useMemo(() => scoreListing(content, facts, limits), [content, facts, limits]);
  const level = LEVEL[report.level];
  const pending = report.checks.filter((check) => !check.passed);
  const passed = report.checks.length - pending.length;

  return (
    <section aria-label="Calidad del anuncio" className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-semibold tabular-nums leading-none" data-testid="quality-score">
            {report.score}
          </span>
          <span className="text-sm text-muted">/ 100</span>
        </div>
        <div className="min-w-48 flex-1">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">
              Calidad del anuncio · <span className={level.text}>{level.label}</span>
            </span>
            <span className="tabular-nums text-muted">
              {passed} de {report.checks.length} puntos
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={report.score} aria-valuemin={0} aria-valuemax={100} aria-label="Puntuación de calidad">
            <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", level.bar)} style={{ width: `${report.score}%` }} />
          </div>
        </div>
      </div>
      {pending.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {pending.slice(0, 5).map((check) => (
            <li key={check.id} className="flex items-start gap-3 px-5 py-2.5 text-[13px]">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span className="flex-1 leading-relaxed text-ink-soft">
                <span className="font-medium text-ink">{check.label}.</span> {check.hint}
              </span>
              {check.fixable === "product" ? (
                <Link href={productHref} className="shrink-0 font-medium text-brand-strong hover:underline">
                  Editar producto
                </Link>
              ) : (
                <span className="shrink-0 text-faint">+{check.weight}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-success">
          <Check className="size-4" aria-hidden /> Este anuncio cumple todos los puntos del medidor.
        </p>
      )}
    </section>
  );
}
