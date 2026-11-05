import type { ProjectSummary } from "@/components/project-card";
import type { SiteDocument } from "@/engine/schema";

type Row = { id: string; name: string; slug: string; kind: string; engine: string; updatedAt: Date; publishedAt: Date | null; doc: SiteDocument };

export function toSummary(r: Row): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    kind: r.kind,
    engine: r.engine,
    updatedAt: r.updatedAt.toISOString(),
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    pages: r.doc.pages.length,
    theme: { style: r.doc.theme.style, mode: r.doc.theme.mode, colors: r.doc.theme.colors, fonts: r.doc.theme.fonts },
  };
}

