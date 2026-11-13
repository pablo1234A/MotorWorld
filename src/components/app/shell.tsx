"use client";

import { Check, ChevronsUpDown, Keyboard, LogOut, Menu as MenuIcon, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Dialog, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlays";
import { ProgressBar } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn, formatNumber } from "@/lib/utils";
import { APP_NAV, SHORTCUTS } from "./nav";

export type ShellUser = { name: string; email: string; avatarUrl: string | null; isAdmin: boolean };
export type ShellWorkspace = { id: string; name: string; active: boolean };
export type ShellUsage = { planName: string; used: number; limit: number; percent: number };

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Aplicación">
      {APP_NAV.map((group, index) => (
        <div key={group.title ?? index}>
          {group.title ? <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{group.title}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-ink text-white shadow-card" : "text-ink-soft hover:bg-sunken",
                    )}
                  >
                    <item.icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-muted group-hover:text-ink")} aria-hidden />
                    {item.label}
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

function UsageCard({ usage }: { usage: ShellUsage }) {
  const tone = usage.percent >= 100 ? "danger" : usage.percent >= 80 ? "warning" : "brand";
  return (
    <Link href="/app/cuenta#plan" className="mx-3 mb-3 block rounded-xl border border-line bg-paper p-3.5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold">Plan {usage.planName}</span>
        <span className="tabular-nums text-muted">
          {formatNumber(usage.used)}/{formatNumber(usage.limit)}
        </span>
      </div>
      <ProgressBar value={usage.percent} tone={tone} label="Generaciones usadas este mes" className="mt-2.5" />
      <p className="mt-2 text-xs text-muted">Generaciones este mes</p>
    </Link>
  );
}

function initials(name: string, email: string) {
  const source = name.trim() || email;
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

/** Atajos de teclado globales. Se ignoran mientras se escribe en un campo. */
function useShortcuts(openHelp: () => void) {
  const router = useRouter();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (event.key === "?") return openHelp();
      if (key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-search-input]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }
      const combo = pending.current ? `${pending.current} ${key}` : key;
      const match = SHORTCUTS.find((shortcut) => shortcut.keys === combo && shortcut.href);
      if (match?.href) {
        event.preventDefault();
        pending.current = null;
        router.push(match.href);
        return;
      }
      if (key === "g") {
        pending.current = "g";
        clearTimeout(timer);
        timer = setTimeout(() => (pending.current = null), 900);
      } else pending.current = null;
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(timer);
    };
  }, [router, openHelp]);
}

function WorkspaceSwitcher({ workspaces }: { workspaces: ShellWorkspace[] }) {
  const active = workspaces.find((workspace) => workspace.active) ?? workspaces[0];
  if (!active) return null;
  // Con un único espacio se muestra su nombre, sin desplegable.
  if (workspaces.length < 2) return <p className="mx-3 mb-1 truncate px-3 text-[13px] font-medium text-muted">{active.name}</p>;
  async function switchTo(workspaceId: string) {
    try {
      await api("/api/workspace/switch", { body: { workspaceId } });
      window.location.assign("/app");
    } catch {
      toast.error("No se pudo cambiar de espacio de trabajo.");
    }
  }
  return (
    <Menu>
      <MenuTrigger className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2 text-left text-[13px] font-medium hover:bg-sunken" aria-label="Cambiar de espacio de trabajo">
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className="w-56">
        <MenuLabel>Espacios de trabajo</MenuLabel>
        {workspaces.map((workspace) => (
          <MenuItem key={workspace.id} onSelect={() => !workspace.active && switchTo(workspace.id)}>
            <span className="flex-1 truncate">{workspace.name}</span>
            {workspace.active ? <Check aria-hidden /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function AppShell({ user, usage, workspaces, children }: { user: ShellUser; usage: ShellUsage; workspaces: ShellWorkspace[]; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  useShortcuts(() => setHelp(true));

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      toast.error("No se pudo cerrar la sesión. Inténtalo de nuevo.");
    }
  }

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo href="/app" size="sm" />
      </div>
      <WorkspaceSwitcher workspaces={workspaces} />
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <UsageCard usage={usage} />
    </>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">{sidebar()}</aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="absolute inset-0 animate-fade bg-ink/35" aria-label="Cerrar menú" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade flex-col bg-surface shadow-raised">
            <button className="absolute right-3 top-4 rounded-lg p-2 text-muted hover:bg-sunken" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
              <X className="size-4" />
            </button>
            {sidebar(() => setDrawer(false))}
          </aside>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <button className="rounded-lg p-2 text-ink-soft hover:bg-sunken" onClick={() => setDrawer(true)} aria-label="Abrir menú">
            <MenuIcon className="size-5" />
          </button>
          <Logo href="/app" size="sm" />
        </div>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-1.5">
          <button onClick={() => setHelp(true)} className="hidden rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink sm:block" aria-label="Atajos de teclado">
            <Keyboard className="size-[18px]" />
          </button>
          <Menu>
            <MenuTrigger className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2.5 hover:bg-sunken" aria-label="Menú de usuario">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Storage privado
                <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{initials(user.name, user.email)}</span>
              )}
              <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{user.name || user.email}</span>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>{user.email}</MenuLabel>
              <MenuItem asChild>
                <Link href="/app/cuenta">Mi cuenta</Link>
              </MenuItem>
              <MenuItem asChild>
                <Link href="/app/configuracion">Configuración</Link>
              </MenuItem>
              {user.isAdmin ? (
                <MenuItem asChild>
                  <Link href="/admin">
                    <ShieldCheck /> Administración
                  </Link>
                </MenuItem>
              ) : null}
              <MenuSeparator />
              <MenuItem onSelect={logout}>
                <LogOut /> Cerrar sesión
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>

      <Dialog open={help} onOpenChange={setHelp} title="Atajos de teclado" size="sm">
        <ul className="divide-y divide-line">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center justify-between py-2.5 text-sm">
              {shortcut.label}
              <span className="flex gap-1">
                {shortcut.keys.split(" ").map((key) => (
                  <kbd key={key} className="rounded-md border border-line-strong bg-paper px-1.5 py-0.5 font-mono text-xs">
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
