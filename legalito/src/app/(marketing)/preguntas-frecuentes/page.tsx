import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { CtaBand, FaqList, JsonLd, SectionHeading } from "@/components/marketing/sections";
import { getPublicFaqs } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Qué documentos genera Legalito, cómo se adaptan, cómo se descargan, qué incluye la suscripción, cómo cancelar y si sustituye a un abogado.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

const CATEGORY_LABEL: Record<string, string> = {
  general: "General",
  documentos: "Documentos",
  suscripcion: "Suscripción",
  pagos: "Pagos",
};

export default async function FaqPage() {
  const faqs = await getPublicFaqs();
  const categories = Array.from(new Set(faqs.map((f) => f.category)));
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
        }}
      />
      <section className="pt-16 pb-12">
        <Container className="max-w-3xl">
          <SectionHeading as="h1" eyebrow="Ayuda" title="Preguntas frecuentes" lead="Si no encuentras lo que buscas, escríbenos desde la página de contacto." />
          <div className="mt-12 space-y-12">
            {categories.map((c) => (
              <div key={c}>
                <h2 className="mb-4 text-lg font-semibold">{CATEGORY_LABEL[c] ?? c}</h2>
                <FaqList faqs={faqs.filter((f) => f.category === c)} />
              </div>
            ))}
          </div>
          <p className="mt-12 text-[15px] text-muted">
            ¿Otra duda? <Link href="/contacto" className="font-medium text-blue underline underline-offset-2">Contacta con nosotros</Link>.
          </p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
