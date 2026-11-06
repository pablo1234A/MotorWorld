/**
 * World Builder AI — single-file edition. The same engine, renderer and editor components as
 * the server app, wired to a local API (IndexedDB). Built by scripts/build-standalone.mjs into
 * standalone/world-builder-ai.html.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Database, Download, FolderOpen, HardDrive, Plug, Trash2, Upload } from "lucide-react";
import { Editor } from "@/components/editor/editor";
import { AssetLibrary } from "@/components/asset-library";
import { NewProjectWizard } from "@/components/new-project-wizard";
import { ProjectCard, type ProjectSummary } from "@/components/project-card";
import { ProjectGallery } from "@/components/project-gallery";
import { QuickCreate } from "@/components/quick-create";
import { Sidebar } from "@/components/sidebar";
import { Button, EmptyState } from "@/components/ui";
import type { SiteDocument } from "@/engine/schema";
import { api, clearAll, exportBackup, handleApiLink, importFile, storageInfo } from "./local-api";
import { useRouter, usePathname, useRefreshTick } from "./shims/next-navigation";

function useProjects() {
  const tick = useRefreshTick();
  const path = usePathname();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  useEffect(() => {
    api<{ projects: ProjectSummary[] }>("/api/projects").then((r) => setProjects(r.projects));
  }, [tick, path]);
  return projects;
}

function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const r = await importFile(f);
            if (r.kind === "project") {
              toast.success("Proyecto importado");
              router.push(`/editor/${r.id}`);
            } else {
              toast.success(`Copia restaurada: ${r.projects} proyecto(s)`);
              router.refresh();
            }
          } catch (err) {
            toast.error(`No se pudo importar: ${(err as Error).message}`);
          }
        }}
      />
      <Button size="sm" onClick={() => input.current?.click()}>
        <Upload className="size-3.5" /> Importar .json
      </Button>
    </>
  );
}

function Page({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

function Dashboard() {
  const projects = useProjects();
  return (
    <div className="mx-auto max-w-6xl px-5 pt-20 pb-16 lg:px-10 lg:pt-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">World Builder AI · edición de un solo archivo</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">¿Qué web construimos hoy?</h1>
        </div>
        <ImportButton />
      </header>
      <QuickCreate engine="local" />
      <section className="mt-12">
        <h2 className="mb-4 text-[15px] font-semibold">Tus proyectos</h2>
        {projects === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton aspect-[16/12] rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState icon={<FolderOpen className="size-5" />} title="Todavía no hay proyectos">
            Describe tu primera web arriba o abre el asistente con «Nuevo proyecto». Todo se guarda en este navegador.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Projects() {
  const projects = useProjects();
  return (
    <Page title="Proyectos" description="Guardados en este navegador. Haz copias con «Datos y copia de seguridad»." actions={<ImportButton />}>
      {projects === null ? <div className="skeleton h-40 rounded-xl" /> : projects.length ? <ProjectGallery projects={projects} /> : <EmptyState title="Sin proyectos todavía" />}
    </Page>
  );
}

function Integrations() {
  const rows: Array<[string, string, string]> = [
    ["Generación y edición por chat", "Motor local (incluido)", "Con el servidor y ANTHROPIC_API_KEY se usa Claude Opus 5.5 para instrucciones libres."],
    ["Formularios", "Endpoint configurable", "En Sitio › Webhook de formularios pon un endpoint HTTPS que acepte JSON (Formspree, Make, n8n o tu servidor de World Builder AI)."],
    ["Pagos", "Stripe Payment Links", "Pega el enlace de pago en cada producto. Checkout con carrito múltiple requiere el servidor."],
    ["Imágenes", "Subida, URL y arte generativo", "Unsplash/Pexels requieren el servidor (la clave no puede ir en un archivo público)."],
    ["Publicación", "ZIP estático", "Súbelo a Netlify Drop, Vercel o Cloudflare Pages. El alojamiento integrado requiere el servidor."],
    ["Animaciones y 3D", "GSAP y Three.js vía jsDelivr", "Se cargan solo en las páginas que los usan; sin conexión se muestra el fondo alternativo."],
  ];
  return (
    <Page title="Integraciones" description="Qué funciona dentro de este archivo y qué necesita el servidor de World Builder AI.">
      <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
        {rows.map(([a, b, c]) => (
          <li key={a} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[200px_220px_1fr]">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <Plug className="size-3.5 text-accent" /> {a}
            </span>
            <span className="text-[13px] text-fg">{b}</span>
            <span className="text-[13px] text-muted">{c}</span>
          </li>
        ))}
      </ul>
    </Page>
  );
}

function Settings() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null);
  const router = useRouter();
  useEffect(() => {
    storageInfo().then(setInfo);
  }, []);
  const mb = (n: number | null) => (n === null ? "—" : `${(n / 1024 / 1024).toFixed(1)} MB`);
  return (
    <Page title="Datos y copia de seguridad" description="Todo se guarda localmente en este navegador. Nada sale de tu equipo salvo lo que exportes.">
      <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
        {[
          ["Almacenamiento", info?.backend ?? "…", Database],
          ["Proyectos", String(info?.projects ?? "…"), FolderOpen],
          ["Espacio usado / disponible", info ? `${mb(info.usage)} / ${mb(info.quota)}` : "…", HardDrive],
        ].map(([k, v, Icon]) => (
          <div key={k as string} className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_1fr]">
            <dt className="flex items-center gap-2 text-[13px] text-muted">
              <Icon className="size-3.5" /> {k as string}
            </dt>
            <dd className="text-[13px]">{v as string}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={exportBackup}>
          <Download className="size-4" /> Descargar copia de seguridad
        </Button>
        <ImportButton />
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm("¿Borrar todos los proyectos y recursos de este navegador? No se puede deshacer.")) return;
            await clearAll();
            toast.success("Datos borrados");
            router.push("/dashboard");
            router.refresh();
          }}
        >
          <Trash2 className="size-4" /> Borrar todos los datos
        </Button>
      </div>
      <p className="mt-4 text-xs text-faint">Si borras los datos del navegador perderás los proyectos: descarga una copia de seguridad de vez en cuando.</p>
    </Page>
  );
}

function EditorRoute({ id }: { id: string }) {
  const [project, setProject] = useState<{ id: string; slug: string; name: string; revision: number; doc: SiteDocument; publishedAt: string | null } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setProject(null);
    api<{ project: typeof project }>(`/api/projects/${id}`).then((r) => setProject(r.project), () => setMissing(true));
  }, [id]);
  if (missing) {
    location.hash = "/dashboard";
    return null;
  }
  if (!project) return <div className="grid h-dvh place-items-center text-[13px] text-muted">Abriendo el editor…</div>;
  return <Editor key={id} project={project} />;
}

function App() {
  const path = usePathname();
  const projects = useProjects();
  useEffect(() => {
    // The UI renders some actions as plain links to API routes (exports, CSV): serve them locally.
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      const href = a?.getAttribute("href") ?? "";
      if (href.startsWith("/api/")) {
        e.preventDefault();
        handleApiLink(href).catch((err) => toast.error((err as Error).message));
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    const titles: Record<string, string> = { "/new": "Nuevo proyecto", "/projects": "Proyectos", "/assets": "Recursos", "/integrations": "Integraciones", "/settings": "Datos" };
    document.title = `${titles[path] ?? (path.startsWith("/editor/") ? "Editor" : "Inicio")} · World Builder AI`;
  }, [path]);

  if (path.startsWith("/editor/")) return <EditorRoute id={decodeURIComponent(path.slice(8))} />;
  const content =
    path === "/new" ? <NewProjectWizard engine="local" /> :
    path === "/projects" ? <Projects /> :
    path === "/assets" ? <Page title="Biblioteca de recursos" description="Imágenes, vídeos y fuentes guardados en este navegador. Las fotos grandes se reducen a 1920 px para ocupar menos."><AssetLibrary /></Page> :
    path === "/integrations" ? <Integrations /> :
    path === "/settings" ? <Settings /> :
    <Dashboard />;
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={{ name: "Mi estudio", email: "Guardado en este navegador" }} recent={(projects ?? []).slice(0, 6).map((p) => ({ id: p.id, name: p.name, color: p.theme.colors.primary }))} />
      <main className="min-w-0 flex-1">{content}</main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: "#18181c", border: "1px solid #26262c", color: "#ededf0", fontSize: 13 } }} />
  </>,
);
