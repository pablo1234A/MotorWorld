import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { ProjectGallery } from "@/components/project-gallery";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";
import { listProjects } from "@/server/projects";
import { toSummary } from "@/lib/summary";

export const metadata = { title: "Proyectos" };

export default async function ProjectsPage() {
  const user = (await getCurrentUser())!;
  const projects = (await listProjects(user.id)).map(toSummary);
  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-[13px] text-muted">Todas tus webs, publicadas y en borrador.</p>
        </div>
        <Link href="/new" className="press inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </header>
      {projects.length ? (
        <ProjectGallery projects={projects} />
      ) : (
        <EmptyState icon={<FolderOpen className="size-5" />} title="Sin proyectos todavía" action={<Link href="/new" className="text-[13px] text-fg underline underline-offset-4">Crear el primero</Link>} />
      )}
    </div>
  );
}
