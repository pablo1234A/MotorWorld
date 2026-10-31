import Link from "next/link";
import { ArrowRight, BarChart3, CalendarClock, Check, FileSpreadsheet, Link2, Lock, Mail, MessageSquareText, PlugZap, Send, ShieldCheck, Users } from "lucide-react";
import { buttonClass } from "@/components/ui/button-class";
import { StarMark } from "@/components/brand/Logo";
import { DashboardShowcase, HeroComposition } from "@/components/marketing/ProductPreview";
import { PLANS } from "@/config/plans";
import { formatEur, vatBreakdown } from "@/lib/money";

const steps = [
  { icon: Mail, title: "Conecta tu correo", text: "Autoriza tu Gmail u Outlook con OAuth. Los correos salen desde tu propia dirección; nunca guardamos tu contraseña." },
  { icon: MessageSquareText, title: "Personaliza el mensaje", text: "Escribe el asunto, el texto y la firma con variables como {{nombre_cliente}}. Revisa la vista previa antes de activarlo." },
  { icon: Users, title: "Registra a tus clientes", text: "Añádelos a mano, importa un CSV o conecta tu CRM por API o webhook cuando termine un servicio." },
  { icon: Send, title: "Reseñalo envía por ti", text: "Tras el retardo que elijas, cada cliente recibe un correo personal con el enlace directo para opinar." },
];

const benefits = [
  { title: "Pides reseñas en el mejor momento", text: "Justo después del servicio, cuando la experiencia está reciente. Sin depender de acordarte." },
  { title: "Tu marca, tu remitente", text: "El cliente recibe un correo de tu negocio, desde tu cuenta, con tu tono. No parece publicidad masiva." },
  { title: "Cero trabajo repetitivo", text: "Configúralo una vez. A partir de ahí, cada nuevo cliente genera su solicitud de forma automática." },
  { title: "Control total del consumo", text: "Ves en todo momento cuántos correos llevas, cuántos quedan y qué se ha enviado a quién." },
];

const features = [
  { icon: Mail, title: "Gmail y Outlook", text: "Conexión segura OAuth 2.0 con Gmail API y Microsoft Graph. Tokens cifrados." },
  { icon: MessageSquareText, title: "Editor con vista previa", text: "Asunto, saludo, mensaje, despedida, firma y botón. Variables dinámicas." },
  { icon: CalendarClock, title: "Retardo y ventanas horarias", text: "Envía 2 horas, 1 día o 1 semana después; solo en horario laboral si lo prefieres." },
  { icon: FileSpreadsheet, title: "Importación CSV", text: "Sube tus clientes con validación de correos y detección de duplicados." },
  { icon: PlugZap, title: "API y webhooks", text: "Tu CRM, agenda o tienda avisan a Reseñalo cuando finaliza un servicio." },
  { icon: BarChart3, title: "Estadísticas reales", text: "Enviados, pendientes, fallidos y clics en el enlace. Sin cifras infladas." },
  { icon: ShieldCheck, title: "Protección anti‑duplicados", text: "Nunca se envía dos veces la misma solicitud ni se supera el límite de tu plan." },
  { icon: Link2, title: "Cualquier plataforma", text: "Google, Tripadvisor, Trustpilot, Facebook… pega el enlace de tu perfil de reseñas." },
];

const faqs = [
  { q: "¿Desde qué dirección se envían los correos?", a: "Desde tu propia cuenta de Gmail, Google Workspace, Outlook o Microsoft 365, que conectas mediante OAuth. El cliente ve tu nombre y tu dirección, y las respuestas llegan a tu bandeja." },
  { q: "¿Guardáis mi contraseña de correo?", a: "No. La conexión se hace con OAuth: autorizas a Reseñalo solo a enviar correos. Guardamos los tokens de acceso cifrados y puedes revocarlos en cualquier momento desde el panel o desde tu cuenta de Google/Microsoft." },
  { q: "¿Cómo sabe Reseñalo que un cliente ha terminado un servicio?", a: "Tú se lo indicas: añadiendo el cliente a mano, importando un CSV o conectando tu software (CRM, agenda, tienda) mediante nuestra API o webhook. No adivinamos nada ni accedemos a tu bandeja de entrada." },
  { q: "¿Qué pasa si llego al límite de correos de mi plan?", a: "Reseñalo deja de enviar: las nuevas solicitudes se bloquean y te avisamos en el panel. El contador se reinicia al comenzar tu siguiente periodo de facturación, o puedes cambiar a un plan superior en cualquier momento." },
  { q: "¿Puedo pedir solo reseñas a clientes satisfechos?", a: "No. Reseñalo envía solicitudes neutrales a todos los clientes que registres. Filtrar opiniones negativas u ofrecer premios por reseñas positivas puede infringir la normativa de consumo y las políticas de Google, y daña la confianza en tu negocio." },
  { q: "¿Sabéis si el cliente ha dejado la reseña?", a: "No podemos confirmarlo: Google y el resto de plataformas no lo comunican. Te mostramos datos verificables: correos enviados y aceptados por tu proveedor, fallidos y clics en el enlace de reseña." },
  { q: "¿Los precios incluyen IVA?", a: "Sí. Los precios mostrados incluyen el IVA del 21 %. En cada factura verás desglosados la base imponible, la cuota de IVA y el total." },
  { q: "¿Puedo cancelar cuando quiera?", a: "Sí. La suscripción es mensual y sin permanencia. Si cancelas, mantienes el servicio hasta el final del periodo ya pagado y no se renueva." },
];

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section className="overflow-hidden">
        <div className="container-page grid items-center gap-12 pb-24 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600">
              <StarMark className="h-3.5 w-3.5" /> Para negocios que viven de su reputación
            </p>
            <h1 className="mt-6 text-[40px] font-bold leading-[1.05] sm:text-[52px] lg:text-[56px]">
              Pide reseñas a todos tus clientes.{" "}
              <span className="relative inline-block">
                Automáticamente.
                <svg aria-hidden viewBox="0 0 220 12" className="absolute -bottom-3.5 left-0 w-full" preserveAspectRatio="none"><path d="M2 9c55-6 150-8 216-3" stroke="#F9C440" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
              Reseñalo automatiza las solicitudes de reseña: cuando un cliente termina su servicio, le envía un correo personalizado desde tu propio Gmail u Outlook con el enlace directo para opinar. Tú solo lo configuras una vez.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/registro" className={buttonClass("primary", "lg")}>
                Empezar ahora <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#como-funciona" className={buttonClass("secondary", "lg")}>
                Ver cómo funciona
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
              {["Desde 15 € al mes, IVA incluido", "Sin permanencia", "Envíos desde tu propio correo"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-ok-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroComposition />
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="scroll-mt-20 border-t border-ink-200 bg-white py-20 sm:py-24">
        <div className="container-page">
          <SectionHead kicker="Cómo funciona" title="De servicio terminado a solicitud enviada, sin tocar nada" />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-white p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 font-display text-sm font-semibold text-white">{i + 1}</span>
                  <s.icon className="h-5 w-5 text-ink-400" aria-hidden />
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="py-20 sm:py-24">
        <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <SectionHead kicker="Beneficios" title="Más opiniones reales, con menos esfuerzo" align="left" />
            <p className="mt-5 max-w-md text-ink-600">
              La mayoría de clientes contentos dejaría una reseña si se lo pidieras en el momento adecuado y con un enlace directo. Reseñalo se encarga de que eso ocurra siempre.
            </p>
          </div>
          <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {benefits.map((b) => (
              <div key={b.title}>
                <StarMark className="h-5 w-5" />
                <h3 className="mt-3 text-base font-semibold">{b.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FUNCIONALIDADES */}
      <section id="funcionalidades" className="scroll-mt-20 border-t border-ink-200 bg-white py-20 sm:py-24">
        <div className="container-page">
          <SectionHead kicker="Funcionalidades" title="Todo lo necesario para pedir reseñas de forma profesional" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-ink-200 p-5">
                <f.icon className="h-5 w-5 text-ink-700" aria-hidden />
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO DEL PANEL */}
      <section className="py-20 sm:py-24">
        <div className="container-page">
          <SectionHead kicker="El panel" title="Sabes en todo momento qué se ha enviado y qué queda" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-ink-600">Consumo del mes, envíos pendientes, fallidos y clics en el enlace de reseña. Datos de tu cuenta, nunca estimaciones.</p>
          <div className="mt-12">
            <DashboardShowcase />
            <p className="mt-3 text-center text-[11px] text-ink-400">Ilustración con datos de ejemplo</p>
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" className="scroll-mt-20 border-t border-ink-200 bg-white py-20 sm:py-24">
        <div className="container-page">
          <SectionHead kicker="Precios" title="Un plan para cada volumen de clientes" />
          <p className="mx-auto mt-4 max-w-xl text-center text-ink-600">Suscripción mensual, sin permanencia. Todos los precios incluyen el 21 % de IVA.</p>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((p) => {
              const vat = vatBreakdown(p.priceCents, p.vatRateBps);
              const featured = p.code === "PRO";
              return (
                <div key={p.code} className={`relative flex flex-col rounded-xl border p-6 sm:p-7 ${featured ? "border-ink-800 ring-1 ring-ink-800" : "border-ink-200"}`}>
                  {featured ? <span className="absolute -top-3 left-6 rounded-full bg-star-300 px-3 py-0.5 text-xs font-semibold text-ink-900">Más elegido</span> : null}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-[40px] font-bold tabular-nums leading-none">{formatEur(p.priceCents)}</span>
                    <span className="text-sm text-ink-500">/mes</span>
                  </p>
                  <p className="mt-2 text-xs text-ink-500">
                    IVA incluido · Base {formatEur(vat.baseCents)} + IVA {formatEur(vat.vatCents)}
                  </p>
                  <p className="mt-5 rounded-lg bg-cream-200 px-3 py-2 text-sm font-semibold">Hasta {p.monthlyEmailLimit} correos al mes</p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                    {p.highlights.slice(1).map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" /> {h}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/registro?plan=${p.code}`} className={buttonClass(featured ? "primary" : "secondary", "lg", "mt-7 w-full")}>
                    Elegir {p.name}
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-xs text-ink-500">
            El límite se aplica por periodo de facturación y se reinicia en cada renovación. Consulta <Link className="underline" href="/legal/precios-e-impuestos">precios e impuestos</Link> y <Link className="underline" href="/legal/cancelacion">cancelación</Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="scroll-mt-20 py-20 sm:py-24">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead kicker="Preguntas frecuentes" title="Lo que suelen preguntarnos" align="left" />
          <div className="divide-y divide-ink-200 border-y border-ink-200">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 pr-10 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="container-page">
          <div className="relative overflow-hidden rounded-2xl bg-ink-800 px-6 py-14 text-center sm:px-12 sm:py-16">
            <StarMark className="mx-auto h-10 w-10" />
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-bold text-white sm:text-4xl">Empieza hoy a pedir reseñas sin tener que acordarte</h2>
            <p className="mx-auto mt-4 max-w-xl text-ink-300">Crea tu cuenta, conecta tu correo y deja que Reseñalo haga el resto.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/registro" className={buttonClass("accent", "lg")}>
                Crear mi cuenta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-400">
              <Lock className="h-3.5 w-3.5" /> Pago seguro con Stripe · Sin permanencia
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHead({ kicker, title, align = "center" }: { kicker: string; title: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-star-700">{kicker}</p>
      <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-[40px]">{title}</h2>
    </div>
  );
}
