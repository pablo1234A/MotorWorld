import { ChevronDown } from "lucide-react";
import { PUBLISH_GUIDES } from "@/content/publishing-guide";

/** Guía de publicación por plataforma (divulgación progresiva, sin JavaScript). */
export function PublishGuideList() {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
      {PUBLISH_GUIDES.map((g) => (
        <details key={g.id} className="group [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-sand/40">
            {g.platform}
            <ChevronDown className="h-4 w-4 text-subtle transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <ol className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-muted">
            {g.steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[11px] font-semibold text-blue tabular-nums">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
