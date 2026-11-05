import Link from "next/link";
import { ArrowRight, FolderOpen, Globe, Inbox, Layers } from "lucide-react";
import { count, eq, and } from "drizzle-orm";
import { aiEnabled } from "@/ai/claude";
import { ProjectCard } from "@/components/project-card";
import { toSummary } from "@/lib/summary";
import { QuickCreate } from "@/components/quick-create";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";
import { getDb, schema } from "@/server/db";
import { listProjects } from "@/server/projects";

export const metadata = { title: "Inicio" };

export default async function Dashboard() {
  const user = (await getCurrentUser())!;
  const projects = await listProjects(user.id);
  const db = await getDb();
  const unread = await db
    .select({ n: count() })
    .from(schema.formSubmissions)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.formSubmissions.projectId))
    .where(and(eq(schema.projects.userId, user.id), eq(schema.formSubmissions.read, false)));
  const published = projects.filter((p) => p.publishedAt).length;
  const pages = projects.reduce((a, p) => a + p.doc.pages.length, 0);
  const hour = new Date().getHours();
  const greet = hour < 13 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-8">
        <p className="text-[13px] text-muted">
          {greet}, {user.name.split(" ")[0]}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-balance">¿Qué web construimos hoy?</h1>
      </header>
      <QuickCreate engine={aiEnabled() ? "claude" : "local"} />

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {[
          { label: "Proyectos", value: projects.length, icon: FolderOpen },
          { label: "Publicados", value: published, icon: Globe },
          { label: "Páginas", value: pages, icon: Layers },
          { label: "Mensajes sin leer", value: unread[0]?.n ?? 0, icon: Inbox },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-panel px-4 py-3.5">
            <dt className="flex items-center gap-1.5 text-[11px] text-faint">
              <Icon className="size-3.5" /> {label}
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[15px] font-semibold">Proyectos recientes</h2>
          {projects.length > 6 ? (
            <Link href="/projects" className="flex items-center gap-1 text-[13px] text-muted hover:text-fg">
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={<FolderOpen className="size-5" />} title="Todavía no hay proyectos">
            Describe tu primera web arriba o usa el asistente paso a paso.{" "}
            <Link href="/new" className="text-fg underline underline-offset-4">
              Abrir asistente
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((p) => (
              <ProjectCard key={p.id} p={toSummary(p)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
