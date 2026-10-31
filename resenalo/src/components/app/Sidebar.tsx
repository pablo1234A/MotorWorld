"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  BarChart3, CreditCard, FileText, History, Home, LogOut, Mail, Megaphone, Menu, PlugZap, Settings, ShieldCheck, Users, Workflow, X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { api } from "@/lib/api";

type NavItem = { href: string; label: string; icon: typeof Home; exact?: boolean };
const NAV: NavItem[] = [
  { href: "/app", label: "Inicio", icon: Home, exact: true },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/automatizaciones", label: "Automatizaciones", icon: Workflow },
  { href: "/app/plantillas", label: "Plantillas de correo", icon: FileText },
  { href: "/app/campanas", label: "Campañas", icon: Megaphone },
  { href: "/app/envios", label: "Historial de envíos", icon: History },
  { href: "/app/estadisticas", label: "Estadísticas", icon: BarChart3 },
];
const NAV2: NavItem[] = [
  { href: "/app/conexion-correo", label: "Conexión de correo", icon: Mail },
  { href: "/app/integraciones", label: "API e integraciones", icon: PlugZap },
  { href: "/app/negocio", label: "Configuración del negocio", icon: Settings },
  { href: "/app/facturacion", label: "Suscripción y facturación", icon: CreditCard },
  { href: "/app/perfil", label: "Perfil y seguridad", icon: ShieldCheck },
];

export function Sidebar({ user, business, plan }: { user: { name: string; email: string }; business: { name: string }; plan: string | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Panel">
      {[NAV, NAV2].map((group, gi) => (
        <ul key={gi} className="space-y-0.5">
          {group.map((n) => {
            const active = isActive(n.href, n.exact);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] transition-colors",
                    active ? "bg-white font-semibold text-ink-900 shadow-card ring-1 ring-ink-200" : "text-ink-600 hover:bg-white/70 hover:text-ink-900",
                  )}
                >
                  <n.icon className={clsx("h-4 w-4 shrink-0", active ? "text-ink-800" : "text-ink-400")} aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-ink-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">
          {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{business.name}</p>
          <p className="truncate text-xs text-ink-500">{plan ? `Plan ${plan}` : "Sin plan activo"}</p>
        </div>
        <button
          className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          onClick={async () => {
            await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-ink-200 bg-cream-200/50 lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/app"><Logo /></Link>
        </div>
        {nav}
        {footer}
      </aside>
      {/* Móvil / tablet */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-cream/95 px-4 backdrop-blur lg:hidden">
        <Link href="/app"><Logo size="sm" /></Link>
        <button className="rounded-md p-2" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col bg-cream shadow-pop">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo size="sm" />
              <button className="rounded-md p-2" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      ) : null}
    </>
  );
}
