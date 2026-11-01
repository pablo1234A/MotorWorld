import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/feedback";
import { LEGAL_PAGES } from "@/content/legal-pages";
import { company } from "@/config/site";

export function generateStaticParams() {
  return LEGAL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  return { title: page.title, description: page.description, alternates: { canonical: `/legal/${slug}` } };
}

export default async function LegalPage({ params }: PageProps<"/legal/[slug]">) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <section className="pt-14 pb-24">
      <Container className="max-w-3xl">
        {!company.legalPagesReviewed && (
          <Alert tone="warning" title="Borrador pendiente de revisión jurídica" className="mb-8">
            Este texto es un borrador preparado para su revisión profesional antes del lanzamiento comercial.
          </Alert>
        )}
        <article className="legal-prose">
          <h1>{page.title}</h1>
          {page.sections.map((s, i) => (
            <section key={s.heading}>
              <h2>
                {i + 1}. {s.heading}
              </h2>
              {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
              {s.bullets && (
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p className="mt-10 text-sm text-subtle">Última actualización: {page.updated}</p>
        </article>
      </Container>
    </section>
  );
}
