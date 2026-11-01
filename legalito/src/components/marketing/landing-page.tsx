import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { CtaBand, Eyebrow, JsonLd } from "@/components/marketing/sections";
import { LANDINGS, type Landing } from "@/content/landings";
import { DISCLAIMER, site } from "@/config/site";

export function landingMetadata(slug: string): Metadata {
  const l = LANDINGS.find((x) => x.slug === slug)!;
  return {
    title: l.metaTitle,
    description: l.metaDescription,
    alternates: { canonical: `/${l.slug}` },
    openGraph: { title: l.metaTitle, description: l.metaDescription, url: `${site.url}/${l.slug}` },
  };
}

export function LandingPage({ slug }: { slug: string }) {
  const l: Landing = LANDINGS.find((x) => x.slug === slug)!;
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
                { "@type": "ListItem", position: 2, name: l.navLabel, item: `${site.url}/${l.slug}` },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: l.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ],
        }}
      />
      <section className="pt-16 pb-16">
        <Container className="max-w-3xl">
          <Eyebrow>{l.eyebrow}</Eyebrow>
          <h1 className="mt-4 text-[34px] leading-tight font-semibold sm:text-[44px]">{l.title}</h1>
          <p className="mt-5 text-[18px] leading-relaxed text-muted">{l.lead}</p>
          <Link href="/registro" className={`${buttonClass("primary", "lg")} mt-8`}>
            Crear mis documentos <ArrowRight className="h-4 w-4" />
          </Link>
        </Container>
      </section>
      <section className="border-t border-line bg-white py-16">
        <Container className="max-w-3xl space-y-12">
          {l.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-[22px] font-semibold">{s.heading}</h2>
              <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-ink-soft">
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
              {s.bullets && (
                <ul className="mt-4 space-y-2 text-[16px] text-ink-soft">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div>
            <h2 className="text-[22px] font-semibold">Preguntas frecuentes</h2>
            <dl className="mt-5 space-y-6">
              {l.faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold text-navy-950">{f.q}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-sm text-subtle">{DISCLAIMER}</p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
