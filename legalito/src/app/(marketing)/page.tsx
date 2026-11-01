import Link from "next/link";
import { ArrowRight, Check, Eye, FileCode2, ListChecks, Scale, Briefcase, Building2, Laptop, ShoppingBag, Store, UserRound } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import {
  CtaBand,
  DOCUMENTS,
  DocumentMock,
  FaqList,
  JsonLd,
  PlanCards,
  PlanComparison,
  SectionHeading,
  StepsList,
} from "@/components/marketing/sections";
import { getPublicFaqs, getPublicPlans } from "@/lib/public-data";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { DISCLAIMER, site } from "@/config/site";
import { cn } from "@/lib/cn";
import { GUIDES } from "@/content/guides";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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
      <section className="relative isolate overflow-hidden pt-14 pb-24 sm:pt-20 lg:pt-24">
        <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_75%_35%,black,transparent)]" />
        <div aria-hidden className="bg-grain pointer-events-none absolute inset-0 -z-10 opacity-60" />
        <Container className="grid items-center gap-16 lg:grid-cols-[1.08fr_1fr] lg:gap-12">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 py-1.5 pr-3.5 pl-1.5 text-[12px] whitespace-nowrap text-ink-soft shadow-[var(--shadow-soft)] backdrop-blur sm:gap-2.5 sm:pr-4 sm:text-[13px]">
              <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-medium text-white">Para webs en España</span>
              Aviso legal · Privacidad · Cookies
            </p>
            <h1 className="mt-6 text-[38px] leading-[1.06] font-semibold sm:text-[48px] xl:text-[52px]">
              Los textos legales de tu web, <span className="text-blue">adaptados a tu negocio.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-muted">
              Responde unas preguntas sobre tu actividad y obtén tu aviso legal, tu política de privacidad y tu política de cookies, listos para
              publicar en tu web.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/registro" className={buttonClass("primary", "lg")}>
                Crear mis documentos <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/como-funciona" className={buttonClass("secondary", "lg")}>
                Ver cómo funciona
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">
              ¿Ya tienes textos legales?{" "}
              <Link href="/comprobador" className="text-link font-medium">
                Comprueba tu web gratis
              </Link>
            </p>
            <ul className="mt-10 grid max-w-[34rem] gap-4 border-t border-line pt-6 sm:grid-cols-3">
              {[
                { icon: ListChecks, t: "Solo lo que te aplica", d: "Preguntas según tu actividad" },
                { icon: Eye, t: "Vista previa gratis", d: "Antes de elegir plan" },
                { icon: FileCode2, t: "PDF y código HTML", d: "Listo para pegar en tu web" },
              ].map((f) => (
                <li key={f.t} className="flex gap-3 sm:block">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-blue sm:mb-2" aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold text-navy-950">{f.t}</span>
                    <span className="block text-[13px] text-muted">{f.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </Container>
      </section>

      {/* Marco normativo */}
      <section aria-label="Normativa de referencia" className="border-y border-line bg-white/70">
        <Container className="flex flex-col items-center gap-x-10 gap-y-3 py-6 text-center sm:flex-row sm:justify-center">
          <p className="text-sm font-medium text-ink">Plantillas estructuradas según la normativa española y europea</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-sm text-muted">
            {["LSSI-CE", "RGPD", "LOPDGDD", "Guía de cookies de la AEPD"].map((n) => (
              <li key={n} className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 text-blue" aria-hidden /> {n}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Problema y propuesta de valor */}
      <section className="border-b border-line bg-white py-20">
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
          <div className="mt-16 space-y-20 lg:space-y-24">
            {DOCUMENTS.map((d, i) => (
              <article key={d.name} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-blue shadow-[var(--shadow-soft)] ring-1 ring-line">
                    <d.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold">{d.name}</h3>
                  <p className="mt-3 max-w-md text-[16px] leading-relaxed text-muted">{d.body}</p>
                  <ul className="mt-6 grid max-w-md gap-x-6 gap-y-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
                    {d.points.map((p) => (
                      <li key={p} className="flex gap-2.5">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <DocumentMock kind={d.kind} />
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
          <SectionHeading center eyebrow="Precios" title="Un plan para cada negocio" lead="Elige según cuántos documentos generes al mes, o paga una sola vez si solo los necesitas ahora." />
          <div className="mx-auto mt-14 max-w-6xl space-y-10">
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

      {/* Guías */}
      <section className="border-t border-line bg-white py-24">
        <Container>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Guías" title="Aprende qué necesita tu web" lead="Explicaciones claras sobre aviso legal, privacidad y cookies, sin jerga innecesaria." />
            <Link href="/guias" className={cn(buttonClass("secondary", "md"), "shrink-0")}>
              Ver todas las guías
            </Link>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {GUIDES.slice(0, 3).map((g) => (
              <li key={g.slug}>
                <Link href={`/guias/${g.slug}`} className="group flex h-full flex-col rounded-2xl border border-line bg-white p-6 transition-[border-color,box-shadow] hover:border-navy/30 hover:shadow-[var(--shadow-lift)]">
                  <span className="font-semibold leading-snug text-navy-950">{g.title}</span>
                  <span className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{g.description}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-navy">
                    Leer guía <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
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
