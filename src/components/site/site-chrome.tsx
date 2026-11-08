import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { BRAND } from "@/config/brand";

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {BRAND.name}
        </Link>
        <nav aria-label="Web" className="order-3 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
          {[
            ["/#funciones", "Funciones"],
            ["/#precios", "Precios"],
            ["/#preguntas", "Preguntas"],
            ["/ayuda", "Guía de inicio"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)]">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/acceso" className={buttonClass("ghost", "px-3")}>
            Entrar
          </Link>
          <Link href="/registro" className={buttonClass("primary", "px-3")}>
            Probar 7 días
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--foreground)]">{BRAND.name}</p>
          <p className="max-w-xs">{BRAND.tagline}.</p>
        </div>
        <nav aria-label="Legal" className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <Link href="/legal/aviso-legal" className="hover:text-[var(--foreground)]">
            Aviso legal
          </Link>
          <Link href="/legal/privacidad" className="hover:text-[var(--foreground)]">
            Privacidad
          </Link>
          <Link href="/legal/terminos" className="hover:text-[var(--foreground)]">
            Términos
          </Link>
          <Link href="/legal/cookies" className="hover:text-[var(--foreground)]">
            Cookies
          </Link>
          <Link href="/legal/encargo-tratamiento" className="hover:text-[var(--foreground)]">
            Encargo del tratamiento
          </Link>
          <Link href="/ayuda" className="hover:text-[var(--foreground)]">
            Guía de inicio
          </Link>
        </nav>
      </div>
    </footer>
  );
}
