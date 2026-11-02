"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { TimelineEditor } from "@/components/timeline";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export default function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tl = useQuery<any>({ queryKey: ["timeline-meta", id], queryFn: () => api(`/api/timelines/${id}`) });
  return (
    <div>
      <Link href="/studio?tab=montage" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><ArrowLeft className="h-4 w-4" /> Montajes</Link>
      <PageHeader eyebrow="Montaje" title={tl.data?.name || "Línea temporal"}>Edición multipista con previsualización. El vídeo final se renderiza con FFmpeg en el servidor.</PageHeader>
      <TimelineEditor timelineId={id} />
    </div>
  );
}
