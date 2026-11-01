"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bug,
  CreditCard,
  FileStack,
  FileText,
  Files,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  Menu,
  MessageCircleQuestion,
  PenLine,
  Receipt,
  Repeat,
  Shield,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  exact?: boolean;
  /** Encabezado del grupo al que pertenece (se muestra al cambiar de grupo). */
  group?: string;
}

const ICONS = {
  dashboard: LayoutDashboard,
  generator: PenLine,
  documents: FileText,
  account: UserRound,
  billing: CreditCard,
  help: HelpCircle,
  admin: Shield,
  back: ArrowLeft,
  metrics: BarChart3,
  users: Users,
  subscriptions: Repeat,
  payments: Receipt,
  files: Files,
  templates: FileStack,
  plans: Tags,
  updates: Megaphone,
  notices: Bell,
  faq: MessageCircleQuestion,
  support: LifeBuoy,
  errors: Bug,
  audit: ListChecks,
} satisfies Record<string, LucideIcon>;

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item, idx) => {
        const Icon = ICONS[item.icon];
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const groupStart = item.group && item.group !== items[idx - 1]?.group;
        return (
          <li key={item.href}>
            {groupStart && <p className="mt-5 mb-1.5 px-3 text-xs font-medium text-subtle">{item.group}</p>}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] transition-colors",
                active ? "bg-white font-medium text-navy shadow-[var(--shadow-soft)] ring-1 ring-line" : "text-ink-soft hover:bg-white/60 hover:text-navy",
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", active ? "text-blue" : "text-subtle")} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppNav({ items, footer, homeHref }: { items: NavItem[]; footer: React.ReactNode; homeHref: string }) {
  const pathname = usePathname();
  // El menú se cierra solo al cambiar de ruta: el estado guarda la ruta en la que se abrió.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? pathname : null);

  return (
    <>
      {/* Escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sand/50 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="px-5 py-5">
          <Logo href={homeHref} />
        </div>
        <nav aria-label="Panel" className="flex-1 overflow-y-auto px-3 pb-4">
          <NavLinks items={items} />
        </nav>
        <div className="border-t border-line p-3">{footer}</div>
      </aside>

      {/* Móvil */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo href={homeHref} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy hover:bg-sand"
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="absolute inset-0 animate-fade-in bg-navy-950/30" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-fade-in flex-col bg-canvas shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo href={homeHref} />
              <button onClick={() => setOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-sand" aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Panel" className="flex-1 overflow-y-auto px-3">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-line p-3">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
