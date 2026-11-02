"use client";

import {
  Boxes, Clapperboard, Film, FolderKanban, Heart, History, HelpCircle, Home, ImagePlus, Library, LogOut, Menu, Settings, Sparkles,
  Video, Wand2, X, AudioLines, Scissors, Loader2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useActiveJobs, useMe } from "@/lib/hooks";
import { cx } from "./ui";

const NAV: { group: string; items: { href: string; label: string; icon: any }[] }[] = [
  { group: "", items: [{ href: "/", label: "Inicio", icon: Home }] },
  {
    group: "Crear",
    items: [
      { href: "/create/image", label: "Crear imágenes", icon: ImagePlus },
      { href: "/create/video", label: "Crear vídeos", icon: Video },
      { href: "/create/film", label: "Crear películas", icon: Clapperboard },
    ],
  },
  {
    group: "Editar",
    items: [
      { href: "/edit/image", label: "Editor de imágenes", icon: Wand2 },
      { href: "/edit/video", label: "Editor de vídeos", icon: Scissors },
      { href: "/studio", label: "Estudio creativo", icon: AudioLines },
    ],
  },
  {
    group: "Organizar",
    items: [
      { href: "/models", label: "Modelos de IA", icon: Boxes },
      { href: "/library", label: "Biblioteca", icon: Library },
      { href: "/projects", label: "Proyectos", icon: FolderKanban },
      { href: "/history", label: "Historial", icon: History },
      { href: "/favorites", label: "Favoritos", icon: Heart },
    ],
  },
  {
    group: "",
    items: [
      { href: "/settings", label: "Configuración", icon: Settings },
      { href: "/help", label: "Centro de ayuda", icon: HelpCircle },
    ],
  },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] border border-line-2 bg-panel-2">
        <span className="h-3 w-3 rounded-full border-[2.5px] border-accent" />
        <span className="absolute h-1 w-1 rounded-full bg-accent" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[14px] font-semibold tracking-tight">MotorWorld</span>
          <span className="display block text-[13px] text-muted italic">Studio</span>
        </span>
      )}
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <div className="px-2">
        <Logo />
      </div>
      {NAV.map((g, i) => (
        <div key={i} className={cx(i === NAV.length - 1 && "mt-auto")}>
          {g.group && <p className="mb-1.5 px-3 font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = isActive(path, it.href);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    className={cx(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                      active ? "bg-panel-3 text-text" : "text-muted hover:bg-panel-2 hover:text-text",
                    )}
                  >
                    {active && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" />}
                    <Icon className={cx("h-[17px] w-[17px]", active ? "text-accent" : "")} strokeWidth={1.7} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function JobTray() {
  const { data } = useActiveJobs();
  const [open, setOpen] = useState(false);
  const n = data?.total ?? 0;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx("flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] transition", n ? "border-accent/40 bg-accent/10 text-text" : "border-line-2 text-muted hover:text-text")}
        aria-label="Trabajos en curso"
      >
        {n ? <span className="h-2 w-2 animate-rec rounded-full bg-accent" /> : <Sparkles className="h-4 w-4" />}
        <span className="font-mono">{n ? `${n} en curso` : "Sin trabajos"}</span>
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-40 mt-2 w-[340px] rounded-xl border border-line-2 bg-panel p-2 shadow-2xl">
          {n === 0 && <p className="px-3 py-4 text-sm text-muted">No hay trabajos en curso.</p>}
          {data?.items.map((g) => (
            <Link key={g.id} href={`/history?focus=${g.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 hover:bg-panel-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{g.model_name}</span>
                <span className="font-mono text-[11px] text-muted">{g.status === "queued" ? "en espera" : g.progress != null ? `${Math.round(g.progress * 100)}%` : "procesando"}</span>
              </div>
              <p className="truncate text-[12px] text-dim">{g.status_message || g.prompt}</p>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded bg-line">
                {g.progress != null ? (
                  <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(g.progress * 100)}%` }} />
                ) : (
                  <div className="skeleton h-full w-full" />
                )}
              </div>
            </Link>
          ))}
          <Link href="/history" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-center text-[12px] text-muted hover:bg-panel-2 hover:text-text">
            Ver historial completo
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (me.isError) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [me.isError, router, path]);

  if (me.isLoading || me.isError) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-line bg-[#0b0b0d] lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <aside className="animate-fade-up absolute inset-y-0 left-0 w-[264px] border-r border-line bg-[#0b0b0d]" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-4 right-3 p-2 text-muted" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 text-muted hover:text-text lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo compact />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <JobTray />
          <div className="hidden items-center gap-2 border-l border-line pl-3 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-panel-3 text-[12px] font-semibold uppercase">{me.data?.display_name?.[0] || "?"}</span>
            <span className="max-w-[140px] truncate text-[13px] text-muted">{me.data?.display_name}</span>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-muted hover:text-text" title="Cerrar sesión" aria-label="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-4 pb-8 text-[12px] text-dim sm:px-6 lg:px-10">
        <span>© MotorWorld Studio</span>
        <Link href="/legal/privacy" className="hover:text-muted">Privacidad</Link>
        <Link href="/legal/terms" className="hover:text-muted">Condiciones de uso</Link>
        <Link href="/help" className="hover:text-muted">Ayuda</Link>
        <span className="ml-auto inline-flex items-center gap-1.5"><Film className="h-3 w-3" /> Los resultados dependen de los modelos y proveedores configurados.</span>
      </footer>
    </div>
  );
}
