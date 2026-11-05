"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { KIND_LABEL } from "@/lib/catalog";
import { ProjectCard, type ProjectSummary } from "./project-card";
import { Input, Segmented } from "./ui";

export function ProjectGallery({ projects }: { projects: ProjectSummary[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (status === "published" && !p.publishedAt) return false;
      if (status === "draft" && p.publishedAt) return false;
      return !term || p.name.toLowerCase().includes(term) || (KIND_LABEL[p.kind] ?? "").toLowerCase().includes(term);
    });
  }, [projects, q, status]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o tipo" className="pl-8" aria-label="Buscar proyectos" />
        </div>
        <Segmented
          label="Estado"
          value={status}
          onChange={setStatus}
          className="w-64"
          options={[
            { value: "all", label: `Todos (${projects.length})` },
            { value: "published", label: "Publicados" },
            { value: "draft", label: "Borradores" },
          ]}
        />
      </div>
      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-[13px] text-muted">Ningún proyecto coincide con la búsqueda.</p>
      )}
    </>
  );
}
