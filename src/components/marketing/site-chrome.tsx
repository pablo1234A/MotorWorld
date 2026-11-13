import Link from "next/link";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

const NAV = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/precios", label: "Precios" },
  { href: "/contacto", label: "Contacto" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-9">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm font-medium text-ink-soft hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Entrar
          </ButtonLink>
          <ButtonLink href="/registro" size="sm">
            Crear cuenta gratis
          </ButtonLink>
        </div>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-line/60 px-5 py-2.5 md:hidden" aria-label="Principal móvil">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap text-[13px] font-medium text-ink-soft">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

const FOOTER = [
  { title: "Producto", links: [["Cómo funciona", "/como-funciona"], ["Precios", "/precios"], ["Crear cuenta", "/registro"], ["Entrar", "/login"]] },
  { title: "Ayuda", links: [["Contacto", "/contacto"], ["Plantilla CSV", "/api/imports/template"], ["Preguntas frecuentes", "/#faq"]] },
  { title: "Legal", links: [["Privacidad", "/legal/privacidad"], ["Condiciones de uso", "/legal/condiciones"], ["Cookies", "/legal/cookies"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            La herramienta para crear, organizar y adaptar los anuncios de todo tu catálogo, vendas lo que vendas.
          </p>
        </div>
        {FOOTER.map((group) => (
          <div key={group.title}>
            <h2 className="font-sans text-[13px] font-semibold uppercase tracking-wider text-faint">{group.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {group.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-ink-soft hover:text-brand-strong" prefetch={false}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[13px] text-muted">
          <p>© {new Date().getFullYear()} AnunciaPro. Todos los derechos reservados.</p>
          <p>AnunciaPro no está afiliado a los marketplaces mencionados; sus nombres pertenecen a sus respectivos titulares.</p>
        </div>
      </div>
    </footer>
  );
}
