import { Badge, type Tone } from "@/components/ui/primitives";

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente", tone: "neutral" },
  processing: { label: "Procesando", tone: "info" },
  completed: { label: "Completado", tone: "success" },
  partially_completed: { label: "Parcialmente completado", tone: "warning" },
  failed: { label: "Fallido", tone: "danger" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const info = JOB_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={info.tone}>{info.label}</Badge>;
}
