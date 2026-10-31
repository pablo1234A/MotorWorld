"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { buttonClass } from "@/components/ui/button-class";

const links = [
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/#funcionalidades", label: "Funcionalidades" },
  { href: "/#precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label="Reseñalo, inicio" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={buttonClass("ghost", "md")}>
            Iniciar sesión
          </Link>
          <Link href="/registro" className={buttonClass("primary", "md")}>
            Crear cuenta
          </Link>
        </div>
        <button className="rounded-md p-2 text-ink-700 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="menu-movil" aria-label={open ? "Cerrar menú" : "Abrir menú"}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div id="menu-movil" className="border-t border-ink-200 bg-cream md:hidden">
          <nav className="container-page flex flex-col py-3" aria-label="Móvil">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-2 py-3 text-[15px] font-medium text-ink-700">
                {l.label}
              </a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 pb-2">
              <Link href="/login" className={buttonClass("secondary", "lg")}>
                Iniciar sesión
              </Link>
              <Link href="/registro" className={buttonClass("primary", "lg")}>
                Crear cuenta
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
