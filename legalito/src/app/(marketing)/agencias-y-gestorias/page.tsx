import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Check, Cookie, FileCode2, Layers, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { CtaBand, Eyebrow, JsonLd, SectionHeading } from "@/components/marketing/sections";
import { getPublicPlans } from "@/lib/public-data";
import { formatPrice } from "@/lib/billing/entitlements";
import { DISCLAIMER, site } from "@/config/site";
import { cn } from "@/lib/cn";

const title = "Textos legales para las webs de tus clientes";
const metaTitle = "Aviso legal y privacidad para agencias web y gestorías";
const description =
  "Plan Agencia a 49 €/mes: aviso legal, política de privacidad, política de cookies y banner de consentimiento para todas las webs de tus clientes. Clientes ilimitados y sin la marca de Legalito.";

export const metadata: Metadata = {
  title: metaTitle,
  description,
  alternates: { canonical: "/agencias-y-gestorias" },
  openGraph: { title: metaTitle, description, url: `${site.url}/agencias-y-gestorias` },
};

const AUDIENCES = [
  { icon: Layers, name: "Agencias web y diseñadores", body: "Entrega cada web con sus textos legales sin redactarlos a mano ni copiar los de otro proyecto." },
  { icon: Building2, name: "Gestorías y asesorías", body: "Ofrece a tus clientes autónomos y pymes los textos de su web como un servicio más." },
  { icon: Users, name: "Consultores y freelancers", body: "Marketing, SEO o tiendas online: resuelve la parte legal de la web de tus clientes en minutos." },
];

const FEATURES = [
  { icon: Users, title: "Un espacio por cliente", body: "Cada cliente tiene sus datos, su formulario y sus documentos. Nunca se mezclan." },
  { icon: Wallet, title: "Una sola suscripción", body: "Un único pago mensual, sin límite de clientes ni de documentos." },
  { icon: FileCode2, title: "PDF y HTML sin nuestra marca", body: "Los documentos no llevan el logo ni el nombre de Legalito: entrégalos como parte de tu trabajo." },
  { icon: RefreshCw, title: "Regenera cuando cambie algo", body: "¿El cliente añade una tienda o una newsletter? Edita sus respuestas y regenera solo el documento afectado." },
  { icon: ShieldCheck, title: "Plantillas con versión y revisión", body: "Cada documento registra la versión de la plantilla con la que se generó." },
  { icon: Cookie, title: "Banner de cookies por cliente", body: "Genera el código del banner de consentimiento de cada web con las herramientas que usa." },
  { icon: Building2, title: "Clientes archivables", body: "Archiva los clientes que ya no gestionas sin perder su historial." },
];

const STEPS = [
  { title: "Crea tu cuenta de agencia", body: "Elige «Agencia o gestoría» al registrarte, o activa el modo agencia desde tu panel." },
  { title: "Añade a tus clientes", body: "Solo el nombre. Después rellenas su formulario: titular, actividad, formularios, cookies…" },
  { title: "Genera y entrega", body: "Revisa la vista previa, genera los tres documentos y descárgalos o copia el HTML para su web." },
];

const FAQ = [
  {
    q: "¿Cuántos clientes puedo gestionar?",
    a: "Con el plan Agencia no hay límite de clientes ni de documentos. Los planes Básico, Medium y Business son para la web propia de un negocio y no incluyen la gestión de clientes.",
  },
  {
    q: "¿Mis clientes necesitan una cuenta?",
    a: "No. Tú rellenas su formulario y descargas sus documentos. Si quieres que el cliente revise sus respuestas, puedes enseñarle la vista previa antes de generar.",
  },
  {
    q: "¿Los documentos llevan la marca de Legalito?",
    a: "No. El PDF y el código HTML se generan con los datos de tu cliente, sin logotipo ni menciones a Legalito.",
  },
  {
    q: "¿Quién es responsable del contenido de los documentos?",
    a: "El titular de cada web es responsable de que la información que se facilita sea veraz y de publicar los textos. Legalito genera los documentos a partir de plantillas estructuradas y no presta asesoramiento jurídico: si un cliente tiene una situación especial, recomiéndale consultar con un profesional.",
  },
  {
    q: "¿Puedo pasar de una cuenta normal a una de agencia?",
    a: "Sí. Desde «Clientes» en tu panel puedes activar el modo agencia en cualquier momento y cambiar al plan Agencia desde «Mi suscripción». Tu propia web sigue disponible como cuenta principal.",
  },
  {
    q: "¿Cómo se factura?",
    a: "Con una única suscripción mensual de 49 € (IVA incluido) a nombre de tu agencia o gestoría, con factura y NIF. Puedes cancelar cuando quieras desde el portal de facturación.",
  },
];

export default async function AgenciesPage() {
  const agency = (await getPublicPlans()).find((p) => p.allowsClients);
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
                { "@type": "ListItem", position: 2, name: "Agencias y gestorías", item: `${site.url}/agencias-y-gestorias` },
              ],
            },
            { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
          ],
        }}
      />

      <section className="relative isolate overflow-hidden pt-16 pb-20 sm:pt-20">
        <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_80%_30%,black,transparent)]" />
        <Container className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Para agencias y gestorías</Eyebrow>
            <h1 className="mt-4 text-[34px] leading-[1.1] font-semibold text-balance sm:text-[46px]">{title}</h1>
            <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-muted">
              Aviso legal, política de privacidad y política de cookies para cada cliente, desde una sola cuenta y con una sola suscripción. Sin redactar a mano y sin copiar textos de otras webs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/registro?tipo=agencia" className={buttonClass("primary", "lg")}>
                Crear cuenta de agencia <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#planes" className={buttonClass("secondary", "lg")}>
                Ver precio
              </Link>
            </div>
          </div>
          <ClientsMock />
        </Container>
      </section>

      <section className="border-y border-line bg-white py-20">
        <Container>
          <SectionHeading eyebrow="Para quién" title="Si haces webs o llevas negocios, tus clientes necesitan estos textos" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div key={a.name} className="rounded-2xl border border-line p-6">
                <a.icon className="h-5 w-5 text-blue" aria-hidden />
                <h3 className="mt-4 font-semibold text-navy-950">{a.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{a.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <SectionHeading eyebrow="Cómo funciona" title="Tres pasos por cliente" />
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-white p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-navy-950">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="bg-sand/60 py-20">
        <Container>
          <SectionHeading eyebrow="Funciones" title="Pensado para gestionar muchas webs" />
          <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue ring-1 ring-line">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-navy-950">{f.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="planes" className="scroll-mt-20 border-t border-line bg-white py-20">
        <Container>
          <SectionHeading center eyebrow="Precio" title="Un solo plan, todos tus clientes" lead="Sin límite de clientes ni de documentos. Cuantas más webs gestionas, menos cuesta cada una." />
          {agency && (
            <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_1fr]">
              <div className="relative flex flex-col rounded-2xl border border-navy bg-white p-7 shadow-[var(--shadow-lift)] ring-1 ring-navy sm:p-8">
                <span className="absolute -top-3 left-7 rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white">Para agencias y gestorías</span>
                <p className="text-lg font-semibold text-navy-950">Plan {agency.name}</p>
                <p className="mt-1 text-[15px] text-muted">{agency.description}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-5xl font-semibold tracking-tight tabular-nums text-navy-950">{formatPrice(agency.priceCents, agency.currency)}</span>
                  <span className="text-muted">/ mes</span>
                </p>
                <p className="mt-1 text-xs text-subtle">IVA incluido · Cancela cuando quieras</p>
                <ul className="mt-6 grid gap-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
                  {agency.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/registro?tipo=agencia" className={cn(buttonClass("primary", "lg"), "mt-8")}>
                  Crear cuenta de agencia <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-3 text-center text-xs text-muted">Da de alta clientes y revisa sus vistas previas antes de contratar.</p>
              </div>
              <div className="rounded-2xl border border-line bg-sand/50 p-7 sm:p-8">
                <p className="font-semibold text-navy-950">Lo que te cuesta cada web</p>
                <p className="mt-1 text-sm text-muted">Precio del plan repartido entre los clientes que gestionas.</p>
                <table className="mt-5 w-full text-left text-[15px]">
                  <caption className="sr-only">Coste mensual por cliente según el número de clientes</caption>
                  <thead>
                    <tr className="border-b border-line-strong text-sm text-muted">
                      <th scope="col" className="py-2 font-medium">Clientes</th>
                      <th scope="col" className="py-2 text-right font-medium">Por cliente y mes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[5, 10, 25, 50].map((n) => (
                      <tr key={n}>
                        <td className="py-2.5 text-ink">{n} webs</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-navy-950">{formatPrice(Math.round(agency.priceCents / n), agency.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-5 text-sm leading-relaxed text-ink-soft">
                  Si cobras a cada cliente el mantenimiento de su web, los textos legales y el banner de cookies pueden ir incluidos en ese servicio.
                </p>
                <p className="mt-4 text-sm text-muted">
                  ¿Solo necesitas tu propia web? <Link href="/precios" className="text-link">Planes desde 5,99 €/mes</Link>.
                </p>
              </div>
            </div>
          )}
        </Container>
      </section>

      <section className="py-20">
        <Container className="max-w-3xl">
          <h2 className="text-[26px] font-semibold">Preguntas frecuentes de agencias</h2>
          <dl className="mt-8 space-y-7">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-navy-950">{f.q}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-sm text-subtle">{DISCLAIMER}</p>
        </Container>
      </section>

      <CtaBand title="Ofrece los textos legales como parte de tus webs" body="Crea tu cuenta de agencia, añade tu primer cliente y revisa su vista previa sin compromiso." />
    </>
  );
}

/** Maqueta ilustrativa del listado de clientes del panel. */
function ClientsMock() {
  const rows = [
    { name: "Panadería Sol", web: "panaderiasol.es", status: "Documentos generados", tone: "bg-success-bg text-success" },
    { name: "Clínica Dental Mar", web: "clinicamar.com", status: "Listo para generar", tone: "bg-blue-50 text-blue" },
    { name: "Taller Norte", web: "tallernorte.es", status: "Formulario en curso", tone: "bg-warning-bg text-warning" },
    { name: "Estudio Lumen", web: "estudiolumen.es", status: "Documentos generados", tone: "bg-success-bg text-success" },
  ];
  return (
    <div aria-hidden className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <p className="text-sm font-semibold text-navy-950">Tus clientes</p>
        <p className="text-xs text-muted">Plan Agencia · 12 clientes</p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{r.name}</p>
              <p className="text-xs text-muted">{r.web}</p>
            </div>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium", r.tone)}>{r.status}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm text-muted">+ Añadir cliente</div>
    </div>
  );
}
