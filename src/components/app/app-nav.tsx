"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = readonly [href: string, label: string];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación del panel: fila horizontal en escritorio y menú desplegable en el móvil. */
export function AppNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  // Al navegar desde el menú móvil, se cierra.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);
  const link = (href: string, label: string, extra: string) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(pathname, href) ? "page" : undefined}
      className={`rounded-lg px-3 py-2 hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)] ${extra}`}
    >
      {label}
    </Link>
  );
  return (
    <>
      <nav aria-label="Principal" className="hidden flex-1 flex-wrap items-center gap-1 text-sm md:flex">
        {items.map(([href, label]) => link(href, label, ""))}
      </nav>
      <details ref={menu} className="relative md:hidden">
        <summary className="cursor-pointer list-none rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium">Menú</summary>
        <nav aria-label="Principal" className="absolute right-0 z-20 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-sm shadow-lg">
          {items.map(([href, label]) => link(href, label, "block"))}
        </nav>
      </details>
    </>
  );
}
