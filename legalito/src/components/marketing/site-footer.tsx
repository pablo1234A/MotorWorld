import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { DISCLAIMER, legalNav, mainNav } from "@/config/site";
import { LANDINGS } from "@/content/landings";
import { GUIDES } from "@/content/guides";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:px-8">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Aviso legal, política de privacidad y política de cookies para tu web, adaptados a tu negocio.
          </p>
        </div>
        <FooterColumn title="Producto" links={mainNav} />
        <FooterColumn title="Soluciones" links={LANDINGS.map((l) => ({ href: `/${l.slug}`, label: l.navLabel }))} />
        <FooterColumn title="Guías" links={[...GUIDES.slice(0, 5).map((g) => ({ href: `/guias/${g.slug}`, label: g.navLabel })), { href: "/guias", label: "Todas las guías" }]} />
        <FooterColumn title="Legal" links={legalNav} />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs leading-relaxed text-subtle sm:px-6 lg:px-8">
          <p className="max-w-3xl">{DISCLAIMER}</p>
          <p>© Legalito</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-soft transition-colors hover:text-navy">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
