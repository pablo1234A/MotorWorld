import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { FaqList, PlanCards, PlanComparison, SectionHeading } from "@/components/marketing/sections";
import { getPublicFaqs, getPublicPlans } from "@/lib/public-data";
import { DISCLAIMER } from "@/config/site";

export const metadata: Metadata = {
  title: "Precios",
  description: "Planes Básico (5,99 €/mes), Medium (9,99 €/mes) y Business (19,99 €/mes), o pago único de 39 €. Aviso legal, privacidad y cookies con nuevas versiones revisadas de las plantillas.",
  alternates: { canonical: "/precios" },
};

export default async function PricingPage() {
  const [plans, faqs] = await Promise.all([getPublicPlans(), getPublicFaqs()]);
  const billingFaqs = faqs.filter((f) => ["pagos", "suscripcion"].includes(f.category));
  return (
    <section className="pt-16 pb-24">
      <Container>
        <SectionHeading as="h1" center eyebrow="Precios" title="Planes claros, sin letra pequeña" lead="Tres planes mensuales según cuántos documentos generes, o un pago único si solo los necesitas una vez. Antes de pagar, rellenas el formulario y ves la vista previa." />
        <div className="mx-auto mt-14 max-w-6xl space-y-12">
          <PlanCards plans={plans} />
          <PlanComparison plans={plans} />
          <div>
            <h2 className="mb-5 text-xl font-semibold">Preguntas sobre pagos</h2>
            <FaqList faqs={billingFaqs} />
          </div>
          <p className="text-center text-sm text-muted">{DISCLAIMER}</p>
        </div>
      </Container>
    </section>
  );
}
