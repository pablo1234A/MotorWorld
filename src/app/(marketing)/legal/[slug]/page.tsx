import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui/primitives";
import { LEGAL_DOCUMENTS } from "@/content/legal";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const document = LEGAL_DOCUMENTS[(await params).slug];
  return { title: document?.title ?? "Legal", robots: { index: false } };
}

export default async function LegalPage({ params }: Props) {
  const document = LEGAL_DOCUMENTS[(await params).slug];
  if (!document) notFound();
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-4xl font-bold">{document.title}</h1>
      <p className="mt-2 text-sm text-faint">Última actualización: {document.updated}</p>
      <Notice tone="warning" className="mt-6" title="Borrador pendiente de revisión jurídica">
        Este documento es una plantilla de partida. Contiene marcadores entre corchetes que deben completarse y su contenido debe ser revisado por un profesional antes de la publicación comercial del servicio.
      </Notice>
      <div className="prose-legal mt-8">
        <p>{document.intro}</p>
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
            {section.list ? (
              <ul>
                {section.list.map((item) => (
                  <li key={item.slice(0, 40)}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
