import { Badge } from "@/components/ui/feedback";

const MAP = {
  draft: { l: "Borrador", t: "neutral" },
  in_review: { l: "En revisión", t: "info" },
  approved: { l: "Aprobada", t: "success" },
  published: { l: "Publicada", t: "success" },
  retired: { l: "Retirada", t: "neutral" },
} as const;

export function TemplateStatusBadge({ status, demo }: { status: string; demo?: boolean }) {
  const s = MAP[status as keyof typeof MAP] ?? { l: status, t: "neutral" as const };
  return (
    <span className="inline-flex gap-1.5">
      <Badge tone={s.t}>{s.l}</Badge>
      {demo && <Badge tone="warning">Demo</Badge>}
    </span>
  );
}
