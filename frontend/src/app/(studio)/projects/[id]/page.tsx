"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, Film, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";
import { GenerationCard } from "@/components/jobs";
import { AssetGrid } from "@/components/library";
import { Button, PageHeader, Section } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useGenerations } from "@/lib/hooks";
import type { Project } from "@/lib/types";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const p = useQuery<Project>({ queryKey: ["project", id], queryFn: () => api(`/api/projects/${id}`) });
  const gens = useGenerations({ project_id: id, limit: 12 });
  const remove = async () => {
    if (!confirm("¿Eliminar el proyecto? Sus archivos seguirán en tu biblioteca.")) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      router.push("/projects");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  if (!p.data) return <div className="skeleton h-64 rounded-2xl" />;
  return (
    <div>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"><ArrowLeft className="h-4 w-4" /> Proyectos</Link>
      <PageHeader eyebrow="Proyecto" title={p.data.name} actions={<Button variant="danger" size="sm" onClick={remove}><Trash2 className="h-3.5 w-3.5" /> Eliminar proyecto</Button>}>{p.data.description}</PageHeader>
      {(p.data.films?.length || p.data.timelines?.length) ? (
        <Section title="Producciones y montajes">
          <div className="flex flex-wrap gap-2">
            {p.data.films?.map((f) => <Link key={f.id} href={`/create/film/${f.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-panel-2"><Clapperboard className="h-4 w-4 text-accent" /> {f.title}</Link>)}
            {p.data.timelines?.map((t) => <Link key={t.id} href={`/studio/timeline/${t.id}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-panel-2"><Film className="h-4 w-4 text-accent" /> {t.name}</Link>)}
          </div>
        </Section>
      ) : null}
      <Section title="Archivos del proyecto"><AssetGrid filters={{ project_id: id }} projectId={id} /></Section>
      {!!gens.data?.items.length && (
        <Section title="Generaciones del proyecto">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{gens.data.items.map((g) => <GenerationCard key={g.id} g={g} />)}</div>
        </Section>
      )}
    </div>
  );
}
