import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { CtaBand, Eyebrow, JsonLd } from "@/components/marketing/sections";
import { SiteChecker } from "@/components/marketing/site-checker";
import { DISCLAIMER, site } from "@/config/site";

const title = "Comprueba gratis los textos legales de tu web";
const metaTitle = "Comprobador de aviso legal, privacidad y cookies gratis";
const description =
  "Analiza gratis tu web en segundos: aviso legal, política de privacidad, política de cookies, banner de consentimiento, herramientas de seguimiento y HTTPS. Sin registro.";

export const metadata: Metadata = {
  title: metaTitle,
  description,
  alternates: { canonical: "/comprobador" },
  openGraph: { title: metaTitle, description, url: `${site.url}/comprobador` },
};

const WHAT = [
  "Enlaces visibles al aviso legal, la política de privacidad y la de cookies.",
  "Datos básicos del aviso legal: NIF del titular y email de contacto.",
  "Derechos de los usuarios y reclamación ante la AEPD en la política de privacidad.",
  "Analítica, píxeles publicitarios y contenidos de terceros que instalan cookies.",
  "Herramienta de consentimiento (banner de cookies) y si los rastreadores se cargan antes.",
  "Conexión segura (HTTPS) y fuentes cargadas desde servidores de terceros.",
];

const FAQ = [
  {
    q: "¿Es gratis?",
    a: "Sí. No hace falta registrarse y puedes comprobar todas las webs que quieras, con un límite razonable por hora para evitar abusos.",
  },
  {
    q: "¿Guardáis la dirección que analizo?",
    a: "No. Descargamos la portada y las páginas legales enlazadas para analizarlas en el momento y no guardamos ni la dirección ni su contenido. Solo registramos de forma anónima que se ha hecho una comprobación.",
  },
  {
    q: "¿Si supero todas las comprobaciones mi web cumple la ley?",
    a: "No necesariamente. Es una revisión automática de señales visibles en el código: no evalúa si el contenido de tus textos es correcto para tu actividad ni lo que ocurre después de interactuar con la web. Sirve para detectar carencias habituales.",
  },
  {
    q: "¿Puedo comprobar las webs de mis clientes?",
    a: "Sí. Si eres agencia o gestoría, puedes analizar cada web y después generar sus textos y su banner de cookies con el plan Agencia.",
  },
];

export default function CheckerPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "Comprobador de textos legales",
              url: `${site.url}/comprobador`,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              inLanguage: "es-ES",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
              publisher: { "@id": `${site.url}/#organization` },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Inicio", item: site.url },
                { "@type": "ListItem", position: 2, name: "Comprobador gratuito", item: `${site.url}/comprobador` },
              ],
            },
            { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
          ],
        }}
      />
      <section className="relative isolate overflow-hidden pt-16 pb-20 sm:pt-20">
        <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_20%,black,transparent)]" />
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Herramienta gratuita</Eyebrow>
            <h1 className="mt-4 text-[34px] leading-[1.1] font-semibold text-balance sm:text-[46px]">{title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-muted">
              Escribe la dirección de cualquier web y en unos segundos verás si tiene aviso legal, política de privacidad y de cookies, banner de consentimiento y qué
              herramientas de seguimiento carga.
            </p>
          </div>
          <div className="mt-10">
            <SiteChecker />
          </div>
        </Container>
      </section>

      <section className="border-t border-line bg-white py-20">
        <Container className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-semibold">Qué comprobamos</h2>
            <ul className="mt-6 space-y-3 text-[15px] text-ink-soft">
              {WHAT.map((w) => (
                <li key={w} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[26px] font-semibold">Preguntas frecuentes</h2>
            <dl className="mt-6 space-y-6">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold text-navy-950">{f.q}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
        <Container>
          <p className="mt-12 text-sm text-subtle">{DISCLAIMER}</p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
