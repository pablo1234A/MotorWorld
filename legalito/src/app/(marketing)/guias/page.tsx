import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { CtaBand, JsonLd, SectionHeading } from "@/components/marketing/sections";
import { GUIDES, formatGuideDate } from "@/content/guides";
import { site } from "@/config/site";

const title = "Guías sobre aviso legal, privacidad y cookies";
const description =
  "Guías prácticas y actualizadas sobre los textos legales de una web en España: aviso legal, política de privacidad, cookies, tiendas online y RGPD para autónomos.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/guias" },
  openGraph: { title, description, url: `${site.url}/guias` },
};

export default function GuidesIndex() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Inicio", item: site.url },
                { "@type": "ListItem", position: 2, name: "Guías", item: `${site.url}/guias` },
              ],
            },
            {
              "@type": "CollectionPage",
              name: title,
              description,
              url: `${site.url}/guias`,
              hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: `${site.url}/guias/${g.slug}` })),
            },
          ],
        }}
      />
      <section className="pt-16 pb-12">
        <Container>
          <SectionHeading
            as="h1"
            eyebrow="Guías"
            title={title}
            lead="Explicaciones claras de lo que pide la normativa española a una página web, con ejemplos y errores frecuentes. Contenido divulgativo: no sustituye al asesoramiento profesional."
          />
        </Container>
      </section>
      <section className="border-t border-line bg-white py-14">
        <Container>
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guias/${g.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-white p-6 transition-[border-color,box-shadow] hover:border-navy/30 hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="text-xs font-medium text-blue">Actualizada el {formatGuideDate(g.updated)}</span>
                  <h2 className="mt-2 text-[18px] leading-snug font-semibold text-navy-950">{g.title}</h2>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{g.description}</p>
                  <span className="mt-auto flex items-center justify-between pt-5 text-xs text-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" aria-hidden /> {g.readingMinutes} min de lectura
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-navy">
                      Leer guía <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
