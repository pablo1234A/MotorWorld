import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Clock } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { CtaBand, JsonLd } from "@/components/marketing/sections";
import { GUIDES, formatGuideDate, getGuide } from "@/content/guides";
import { DISCLAIMER, site } from "@/config/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guias/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return {};
  return {
    title: g.metaTitle,
    description: g.description,
    alternates: { canonical: `/guias/${g.slug}` },
    openGraph: {
      type: "article",
      title: g.metaTitle,
      description: g.description,
      url: `${site.url}/guias/${g.slug}`,
      publishedTime: g.published,
      modifiedTime: g.updated,
    },
  };
}

export default async function GuidePage({ params }: PageProps<"/guias/[slug]">) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const url = `${site.url}/guias/${g.slug}`;
  const related = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${url}#article`,
              headline: g.title,
              description: g.description,
              inLanguage: "es-ES",
              datePublished: g.published,
              dateModified: g.updated,
              mainEntityOfPage: url,
              image: `${site.url}/opengraph-image`,
              author: { "@type": "Organization", name: site.name, url: site.url },
              publisher: { "@id": `${site.url}/#organization` },
              about: g.keyword,
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Inicio", item: site.url },
                { "@type": "ListItem", position: 2, name: "Guías", item: `${site.url}/guias` },
                { "@type": "ListItem", position: 3, name: g.title, item: url },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ],
        }}
      />
      <article>
        <header className="pt-10 pb-12">
          <Container className="max-w-3xl">
            <nav aria-label="Ruta de navegación">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <li className="inline-flex items-center gap-1.5">
                  <Link href="/" className="hover:text-navy">Inicio</Link>
                  <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-hidden />
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Link href="/guias" className="hover:text-navy">Guías</Link>
                  <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-hidden />
                </li>
                <li aria-current="page" className="text-ink-soft">{g.navLabel}</li>
              </ol>
            </nav>
            <h1 className="mt-6 text-[32px] leading-tight font-semibold text-balance sm:text-[42px]">{g.title}</h1>
            <p className="mt-5 text-[18px] leading-relaxed text-muted">{g.lead}</p>
            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-subtle">
              <span>
                Actualizada el <time dateTime={g.updated}>{formatGuideDate(g.updated)}</time>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden /> {g.readingMinutes} min de lectura
              </span>
              <span>Equipo de {site.name}</span>
            </p>
          </Container>
        </header>

        <div className="border-t border-line bg-white py-14">
          <Container className="max-w-3xl">
            <nav aria-labelledby="indice" className="rounded-xl border border-line bg-sand/50 px-5 py-4">
              <h2 id="indice" className="font-semibold text-navy">En esta guía</h2>
              <ol className="mt-2 grid list-decimal gap-x-8 gap-y-1 pl-5 text-sm sm:grid-cols-2">
                {g.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-ink-soft hover:text-navy">{s.heading}</a>
                  </li>
                ))}
                <li>
                  <a href="#preguntas" className="text-ink-soft hover:text-navy">Preguntas frecuentes</a>
                </li>
              </ol>
            </nav>

            <div className="mt-12 space-y-12">
              {g.sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-[24px] leading-snug font-semibold">{s.heading}</h2>
                  <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-ink-soft">
                    {s.paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                  {s.bullets && (
                    <ul className="mt-4 space-y-2 text-[16px] leading-relaxed text-ink-soft">
                      {s.bullets.map((b) => (
                        <li key={b} className="flex gap-3">
                          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.table && (
                    <div className="mt-5 overflow-x-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label={s.heading}>
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            {s.table.columns.map((c) => (
                              <th key={c} scope="col" className="bg-sand px-3 py-2 text-left font-semibold text-navy">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.table.rows.map((r) => (
                            <tr key={r.join("|")}>
                              {r.map((cell, i) => (
                                <td key={i} className="border-t border-line px-3 py-2 align-top text-ink-soft">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}

              <aside className="rounded-2xl border border-navy/15 bg-blue-50 p-6 sm:p-7">
                <p className="text-[18px] font-semibold text-navy-950">Prepara tus textos legales en unos minutos</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                  Responde un formulario sobre tu negocio y obtén el aviso legal, la política de privacidad y la de cookies con los apartados que te corresponden. Revisa la vista previa antes de pagar.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Link href="/registro" className={buttonClass("primary", "md")}>
                    Crear mis documentos <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={g.relatedLanding.href} className={buttonClass("secondary", "md")}>
                    {g.relatedLanding.label}
                  </Link>
                </div>
              </aside>

              <section id="preguntas" className="scroll-mt-24">
                <h2 className="text-[24px] font-semibold">Preguntas frecuentes</h2>
                <dl className="mt-5 space-y-6">
                  {g.faq.map((f) => (
                    <div key={f.q}>
                      <dt className="font-semibold text-navy-950">{f.q}</dt>
                      <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <p className="text-sm leading-relaxed text-subtle">
                Esta guía es informativa y general; no constituye asesoramiento jurídico. {DISCLAIMER}
              </p>
            </div>
          </Container>
        </div>
      </article>

      <section className="py-16">
        <Container>
          <h2 className="text-[22px] font-semibold">Otras guías</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/guias/${r.slug}`} className="flex h-full flex-col rounded-xl border border-line bg-white p-5 transition-colors hover:border-navy/30">
                  <span className="font-semibold leading-snug text-navy-950">{r.title}</span>
                  <span className="mt-auto pt-3 text-xs text-subtle">{r.readingMinutes} min de lectura</span>
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
