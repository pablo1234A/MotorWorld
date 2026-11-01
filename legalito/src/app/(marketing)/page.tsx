import Link from "next/link";
import { ArrowRight, Briefcase, Building2, Laptop, ShoppingBag, Store, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import {
  CtaBand,
  DOCUMENTS,
  DocumentVisual,
  Eyebrow,
  FaqList,
  JsonLd,
  PlanCards,
  PlanComparison,
  SectionHeading,
  StepsList,
} from "@/components/marketing/sections";
import { getPublicFaqs, getPublicPlans } from "@/lib/public-data";
import { DISCLAIMER, site } from "@/config/site";
import { cn } from "@/lib/cn";

const BUSINESSES = [
  { icon: UserRound, name: "Autónomos", body: "Web para presentar tus servicios y recibir contactos." },
  { icon: Laptop, name: "Freelancers", body: "Portfolio, formulario de presupuesto y newsletter." },
  { icon: Briefcase, name: "Profesionales", body: "Incluye los datos colegiales si tu profesión es regulada." },
  { icon: Building2, name: "Pequeñas empresas", body: "Con datos registrales de la sociedad." },
  { icon: Store, name: "Negocios locales", body: "Reservas, citas, mapas y redes sociales." },
  { icon: ShoppingBag, name: "Tiendas online", body: "Pedidos, pagos, envíos y píxeles publicitarios." },
];

export default async function HomePage() {
  const [plans, faqs] = await Promise.all([getPublicPlans(), getPublicFaqs()]);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Legalito",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: site.url,
          description: site.description,
          inLanguage: "es-ES",
          offers: plans.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: (p.priceCents / 100).toFixed(2),
            priceCurrency: p.currency.toUpperCase(),
          })),
        }}
      />

      {/* Hero */}
      <section className="overflow-hidden pt-14 pb-24 sm:pt-20 lg:pt-24">
        <Container className="grid items-center gap-16 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="animate-rise">
            <Eyebrow>Para autónomos, profesionales y pequeños negocios en España</Eyebrow>
            <h1 className="mt-5 text-[38px] leading-[1.08] font-semibold sm:text-[50px] lg:text-[56px]">
              Los textos legales de tu web, adaptados a tu negocio.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-muted">
              Responde unas preguntas sencillas y obtén tu aviso legal, tu política de privacidad y tu política de cookies, construidos con
              plantillas estructuradas que incluyen solo lo que corresponde a tu actividad.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/registro" className={buttonClass("primary", "lg")}>
                Crear mis documentos <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/como-funciona" className={buttonClass("secondary", "lg")}>
                Ver cómo funciona
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li>Vista previa antes de pagar</li>
              <li>PDF y HTML</li>
              <li>Sin conocimientos jurídicos</li>
            </ul>
          </div>
          <DocumentVisual />
        </Container>
      </section>

      {/* Problema y propuesta de valor */}
      <section className="border-y border-line bg-white py-20">
        <Container className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <SectionHeading
            eyebrow="El problema"
            title="Copiar los textos de otra web sale caro"
            lead="Muchos negocios publican textos legales copiados que hablan de actividades que no realizan, omiten datos obligatorios o no mencionan las herramientas que de verdad usan."
          />
          <div className="space-y-8">
            {[
              { t: "Solo lo que te corresponde", b: "Las preguntas cambian según tu negocio. Una tienda online responde cosas distintas que un profesional con una web informativa." },
              { t: "Plantillas con versión y revisión", b: "Cada documento indica la versión de plantilla utilizada. Las nuevas versiones solo se publican tras una revisión documentada." },
              { t: "Honestidad sobre lo que falta", b: "Si además necesitas un banner de consentimiento o unas condiciones de venta, te lo decimos claramente." },
            ].map((x) => (
              <div key={x.t} className="border-l-2 border-blue/30 pl-5">
                <h3 className="text-[17px] font-semibold">{x.t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{x.b}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Cómo funciona */}
      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="Cómo funciona" title="De cero a tus documentos en unos minutos" lead="Puedes dejar el formulario a medias y continuar más tarde: guardamos tus respuestas automáticamente." />
          <div className="mt-14">
            <StepsList />
          </div>
        </Container>
      </section>

      {/* Documentos */}
      <section className="bg-sand/60 py-24">
        <Container>
          <SectionHeading eyebrow="Documentos" title="Tres documentos coherentes entre sí" lead="Comparten tus datos, tus proveedores y tus herramientas, así que nunca tendrás que responder lo mismo dos veces." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-3">
            {DOCUMENTS.map((d) => (
              <article key={d.name} className="bg-white p-7">
                <d.icon className="h-6 w-6 text-blue" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold">{d.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{d.body}</p>
                <ul className="mt-5 space-y-1.5 text-sm text-ink-soft">
                  {d.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-blue" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Tipos de negocio */}
      <section className="py-24">
        <Container>
          <SectionHeading eyebrow="Para quién" title="Pensado para negocios con página web" />
          <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {BUSINESSES.map((b) => (
              <li key={b.name} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue">
                  <b.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{b.name}</h3>
                  <p className="mt-1 text-[15px] text-muted">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Precios */}
      <section className="border-t border-line bg-white py-24" id="precios">
        <Container>
          <SectionHeading center eyebrow="Precios" title="Elige cómo quieres pagar" lead="Pago único si solo necesitas tus documentos ahora. Suscripción si quieres mantenerlos al día." />
          <div className="mx-auto mt-14 max-w-4xl space-y-10">
            <PlanCards plans={plans} />
            <PlanComparison plans={plans} />
            <p className="text-center text-sm text-muted">{DISCLAIMER}</p>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <SectionHeading eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos" />
            <Link href="/preguntas-frecuentes" className={cn(buttonClass("secondary", "md"), "mt-8")}>
              Ver todas las preguntas
            </Link>
          </div>
          <FaqList faqs={faqs.slice(0, 6)} />
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
