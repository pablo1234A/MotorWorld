"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/button";
import { mainNav } from "@/config/site";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const pathname = usePathname();
  // El menú se cierra solo al cambiar de ruta: el estado guarda la ruta en la que se abrió.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? pathname : null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-[14.5px] text-ink-soft transition-colors hover:text-navy",
                pathname === item.href && "font-medium text-navy",
              )}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/acceder" className={buttonClass("ghost", "sm")}>
            Acceder
          </Link>
          <Link href="/registro" className={buttonClass("primary", "sm")}>
            Crear mis documentos
          </Link>
        </div>
        <button
          type="button"
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy hover:bg-sand md:hidden"
          aria-expanded={open}
          aria-controls="menu-movil"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div id="menu-movil" className="fixed inset-x-0 top-16 bottom-0 z-40 animate-fade-in overflow-y-auto bg-canvas px-4 pb-8 md:hidden">
          <nav aria-label="Principal móvil" className="flex flex-col divide-y divide-line border-b border-line">
            {mainNav.map((item) => (
              <Link key={item.href} href={item.href} className="py-4 text-lg text-navy-950">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 grid gap-3">
            <Link href="/registro" className={buttonClass("primary", "lg")}>
              Crear mis documentos
            </Link>
            <Link href="/acceder" className={buttonClass("secondary", "lg")}>
              Acceder
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
