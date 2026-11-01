import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { FaqList, PlanCards, PlanComparison, SectionHeading } from "@/components/marketing/sections";
import { getPublicFaqs, getPublicPlans } from "@/lib/public-data";
import { DISCLAIMER } from "@/config/site";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { formatPrice } from "@/lib/billing/entitlements";

export const metadata: Metadata = {
  title: "Precios",
  description: "Planes Básico (5,99 €/mes), Medium (9,99 €/mes) y Business (19,99 €/mes), o pago único de 39 €. Aviso legal, privacidad y cookies con nuevas versiones revisadas de las plantillas.",
  alternates: { canonical: "/precios" },
};

export default async function PricingPage() {
  const [plans, faqs] = await Promise.all([getPublicPlans(), getPublicFaqs()]);
  const billingFaqs = faqs.filter((f) => ["pagos", "suscripcion"].includes(f.category));
  const agency = plans.find((p) => p.allowsClients);
  return (
    <section className="pt-16 pb-24">
      <Container>
        <SectionHeading as="h1" center eyebrow="Precios" title="Planes claros, sin letra pequeña" lead="Tres planes mensuales según cuántos documentos generes, o un pago único si solo los necesitas una vez. Antes de pagar, rellenas el formulario y ves la vista previa." />
        <div className="mx-auto mt-14 max-w-6xl space-y-12">
          <PlanCards plans={plans} />
          <PlanComparison plans={plans} />
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  ¿Agencia web o gestoría? Plan {agency?.name ?? "Agencia"}
                  {agency && <span className="ml-1.5 font-normal text-muted">· {formatPrice(agency.priceCents, agency.currency)} / mes</span>}
                </h2>
                <p className="mt-1 max-w-xl text-[15px] text-muted">
                  Clientes y documentos ilimitados con una sola suscripción. Cada cliente tiene su propio formulario, sus documentos y su banner de cookies, sin la marca de Legalito.
                </p>
              </div>
            </div>
            <Link href="/agencias-y-gestorias" className={buttonClass("secondary", "md", "shrink-0")}>
              Ver el plan Agencia
            </Link>
          </div>
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
