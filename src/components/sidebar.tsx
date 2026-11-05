"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { FolderOpen, Home, Image as ImageIcon, LogOut, Menu as MenuIcon, Plug, Plus, Settings, X } from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "./logo";
import { Button, cn } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/projects", label: "Proyectos", icon: FolderOpen },
  { href: "/assets", label: "Recursos", icon: ImageIcon },
  { href: "/integrations", label: "Integraciones", icon: Plug },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ user, recent }: { user: { name: string; email: string }; recent: Array<{ id: string; name: string; color: string }> }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="px-3 pb-2">
        <Link href="/new" onClick={() => setOpen(false)} className="press flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-[13px] font-medium text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset] hover:bg-accent-hover">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </div>
      <nav className="px-2 py-2" aria-label="Principal">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/dashboard" && path.startsWith(href));
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("press flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]", active ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg")}>
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 scroll-thin">
        <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Recientes</p>
        {recent.length === 0 ? <p className="px-2.5 text-xs text-faint">Aún no hay proyectos.</p> : null}
        {recent.map((p) => (
          <Link key={p.id} href={`/editor/${p.id}`} className="press flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-hover hover:text-fg">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </Link>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elev text-xs font-semibold">{user.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-faint">{user.email}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-panel lg:block">{content}</aside>
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-panel/90 px-3 backdrop-blur lg:hidden">
        <Link href="/dashboard">
          <Logo />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => setOpen(true)}>
          <MenuIcon className="size-5" />
        </Button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="animate-pop absolute inset-y-0 left-0 w-72 border-r border-line bg-panel">{content}</aside>
        </div>
      ) : null}
    </>
  );
}
