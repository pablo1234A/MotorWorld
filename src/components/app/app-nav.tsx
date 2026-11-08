"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = readonly [href: string, label: string];
export type NavGroup = { title: string | null; items: readonly NavItem[] };

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

function Links({ groups, pathname, onMobile }: { groups: readonly NavGroup[]; pathname: string; onMobile?: boolean }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.title ?? "main"} className="flex flex-col gap-0.5">
          {g.title ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{g.title}</p> : null}
          {g.items.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)] ${onMobile ? "py-2.5" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

/** Navegación del panel: barra lateral en escritorio y menú desplegable en el móvil. */
export function AppNav({ groups }: { groups: readonly NavGroup[] }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);
  return (
    <>
      <nav aria-label="Principal" className="sticky top-0 hidden max-h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] px-3 py-4 lg:flex">
        <Links groups={groups} pathname={pathname} />
      </nav>
      <details ref={menu} className="relative lg:hidden">
        <summary className="cursor-pointer list-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium">Menú</summary>
        <nav aria-label="Principal" className="absolute right-0 z-30 mt-2 flex max-h-[75vh] w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
          <Links groups={groups} pathname={pathname} onMobile />
        </nav>
      </details>
    </>
  );
}
