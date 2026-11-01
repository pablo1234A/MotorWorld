import Link from "next/link";
import { Check, ChevronDown, FileCheck2, FileText, Cookie, ShieldCheck, Minus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { formatPrice } from "@/lib/billing/entitlements";
import type { PublicPlan } from "@/lib/public-data";
import type { Faq } from "@/content/faqs";
import { cn } from "@/lib/cn";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-sm font-semibold text-blue", className)}>
      <span aria-hidden className="h-px w-5 bg-blue/50" />
      {children}
    </p>
  );
}

export function SectionHeading({ eyebrow, title, lead, center, as = "h2" }: { eyebrow?: string; title: string; lead?: string; center?: boolean; as?: "h1" | "h2" }) {
  const Heading = as;
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading className={cn("mt-3 font-semibold leading-tight", as === "h1" ? "text-[32px] sm:text-[42px]" : "text-[28px] sm:text-[34px]")}>{title}</Heading>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-muted">{lead}</p>}
    </div>
  );
}

/** Representación visual del producto: un documento que se adapta a las respuestas. */
export function DocumentVisual() {
  const answers = [
    { label: "Tienda online", on: true },
    { label: "Newsletter", on: true },
    { label: "Google Analytics", on: true },
    { label: "Datos de salud", on: false },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[28px] bg-sand" />
      <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-lift)] sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <FileText className="h-4 w-4" /> Política de privacidad
          </div>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue">Versión 1.0</span>
        </div>
        <div className="mt-5 space-y-4">
          {[
            { t: "1. Responsable del tratamiento", w: ["w-11/12", "w-3/4"] },
            { t: "2. Finalidades y base jurídica", w: ["w-full", "w-5/6", "w-2/3"], hl: true },
            { t: "3. Destinatarios", w: ["w-10/12", "w-1/2"] },
          ].map((s) => (
            <div key={s.t} className={cn("rounded-lg p-2.5 transition-colors", s.hl && "bg-blue-50/70 ring-1 ring-blue/15")}>
              <p className="text-[13px] font-semibold text-navy-950">{s.t}</p>
              <div className="mt-2 space-y-1.5">
                {s.w.map((w, i) => (
                  <div key={i} className={cn("h-1.5 rounded-full bg-sand-200", w)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 w-56 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-lift)] sm:-left-10">
        <p className="text-xs font-medium text-subtle">Tus respuestas</p>
        <ul className="mt-2 space-y-1.5">
          {answers.map((a) => (
            <li key={a.label} className="flex items-center justify-between text-[13px]">
              <span className={a.on ? "text-ink" : "text-subtle line-through"}>{a.label}</span>
              {a.on ? <Check className="h-3.5 w-3.5 text-success" /> : <Minus className="h-3.5 w-3.5 text-subtle" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const STEPS = [
  { title: "Regístrate", body: "Crea tu cuenta con tu email. Solo necesitas verificarlo una vez." },
  { title: "Indica qué negocio tienes", body: "Autónomo, profesional, pequeña empresa, negocio local o tienda online." },
  { title: "Responde las preguntas", body: "Unas diez preguntas básicas y solo las adicionales que correspondan a tu actividad." },
  { title: "Revisa la información", body: "Comprueba tus datos y consulta una vista previa de cada documento." },
  { title: "Elige cómo pagar", body: "Pago único o suscripción mensual con actualizaciones revisadas." },
  { title: "Genera y descarga", body: "Descarga tus documentos en PDF y HTML y publícalos en tu web." },
];

export function StepsList({ compact }: { compact?: boolean }) {
  return (
    <ol className={cn("grid gap-x-8 gap-y-8", compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative pl-12">
          <span className="absolute top-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border border-navy/15 bg-white text-sm font-semibold text-navy tabular-nums">
            {i + 1}
          </span>
          <h3 className="text-[16px] font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export const DOCUMENTS = [
  {
    kind: "aviso" as const,
    icon: FileCheck2,
    name: "Aviso legal",
    body: "Identifica al titular de la web y regula su uso. Incluye datos registrales o colegiales cuando corresponden.",
    points: ["Datos identificativos", "Condiciones de uso", "Propiedad intelectual", "Contratación, si vendes online"],
  },
  {
    kind: "privacidad" as const,
    icon: ShieldCheck,
    name: "Política de privacidad",
    body: "Explica qué datos tratas, para qué, con qué base jurídica, durante cuánto tiempo y con qué proveedores.",
    points: ["Tabla de tratamientos", "Proveedores y transferencias", "Derechos de las personas", "Menores y datos sensibles"],
  },
  {
    kind: "cookies" as const,
    icon: Cookie,
    name: "Política de cookies",
    body: "Informa de las cookies de tus herramientas y de cómo gestionarlas. Te avisa si además necesitas un banner de consentimiento.",
    points: ["Tabla de cookies orientativa", "Cookies propias y de terceros", "Gestión desde el navegador", "Consentimiento"],
  },
];

export function PlanCards({ plans, ctaHref = "/registro" }: { plans: PublicPlan[]; ctaHref?: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {plans.map((p) => {
        const featured = p.kind === "subscription";
        return (
          <div
            key={p.code}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-white p-6 sm:p-8",
              featured ? "border-navy shadow-[var(--shadow-lift)]" : "border-line shadow-[var(--shadow-soft)]",
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-navy px-3 py-1 text-xs font-medium text-white">Incluye actualizaciones</span>
            )}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1.5 text-[15px] text-muted">{p.description}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight text-navy-950 tabular-nums">{formatPrice(p.priceCents, p.currency)}</span>
              <span className="text-sm text-muted">{p.interval === "month" ? "/ mes" : p.interval === "year" ? "/ año" : "pago único"}</span>
            </p>
            <p className="mt-1 text-xs text-subtle">IVA incluido{p.interval ? " · Cancela cuando quieras" : ""}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {p.features.map((f) => {
                const negative = /^sin /i.test(f);
                return (
                  <li key={f} className="flex gap-2.5 text-[15px]">
                    {negative ? <Minus className="mt-0.5 h-4.5 w-4.5 shrink-0 text-subtle" /> : <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" />}
                    <span className={negative ? "text-muted" : "text-ink-soft"}>{f}</span>
                  </li>
                );
              })}
            </ul>
            <Link href={ctaHref} className={cn(buttonClass(featured ? "primary" : "secondary", "lg"), "mt-8 w-full")}>
              Empezar con {p.name.toLowerCase()}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function PlanComparison({ plans }: { plans: PublicPlan[] }) {
  const one = plans.find((p) => p.kind === "one_time");
  const sub = plans.find((p) => p.kind === "subscription");
  if (!one || !sub) return null;
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ["Aviso legal, privacidad y cookies", true, true],
    ["Vista previa antes de pagar", true, true],
    ["Descarga en PDF y HTML", true, true],
    ["Acceso a los documentos generados", "Permanente", "Permanente"],
    ["Regeneraciones", one.generationsLimit ? `Hasta ${one.generationsLimit}` : "Ilimitadas", sub.generationsLimit ? `Hasta ${sub.generationsLimit}` : "Ilimitadas"],
    ["Nuevas versiones revisadas de las plantillas", false, true],
    ["Avisos de cambios relevantes", false, true],
  ];
  const cell = (v: React.ReactNode) =>
    v === true ? <Check className="mx-auto h-4.5 w-4.5 text-success" aria-label="Incluido" /> : v === false ? <Minus className="mx-auto h-4.5 w-4.5 text-subtle" aria-label="No incluido" /> : <span className="text-sm text-ink-soft">{v}</span>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white" tabIndex={0} role="region" aria-label="Comparación de planes">
      <table className="w-full min-w-[520px] text-left">
        <caption className="sr-only">Comparación de planes</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-4 text-sm font-medium text-muted">Qué incluye</th>
            <th scope="col" className="w-36 px-5 py-4 text-center text-sm font-semibold">{one.name}</th>
            <th scope="col" className="w-36 px-5 py-4 text-center text-sm font-semibold">{sub.name}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, a, b]) => (
            <tr key={label}>
              <th scope="row" className="px-5 py-3.5 text-[15px] font-normal text-ink-soft">{label}</th>
              <td className="px-5 py-3.5 text-center">{cell(a)}</td>
              <td className="px-5 py-3.5 text-center">{cell(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {faqs.map((f) => (
        <details key={f.question} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16px] font-medium text-navy-950">
            {f.question}
            <ChevronDown className="h-4.5 w-4.5 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <p className="-mt-1 pb-5 text-[15px] leading-relaxed text-muted">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title = "Prepara los textos legales de tu web hoy", body = "Responde el formulario y revisa la vista previa antes de decidir. Sin compromiso." }: { title?: string; body?: string }) {
  return (
    <section className="py-20">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-navy px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
          <h2 className="relative text-[26px] font-semibold text-white sm:text-[32px]">{title}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[16px] text-white/75">{body}</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/registro" className={buttonClass("light", "lg")}>
              Crear mis documentos
            </Link>
            <Link href="/precios" className={cn(buttonClass("ghost", "lg"), "text-white hover:bg-white/10")}>
              Ver precios
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // JSON.stringify no escapa "<": se neutraliza para evitar cierres prematuros del script.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Maqueta ilustrativa de cada documento mostrando cómo se adaptan sus bloques. */
export function DocumentMock({ kind }: { kind: "aviso" | "privacidad" | "cookies" }) {
  const frame = (title: string, children: React.ReactNode) => (
    <div aria-hidden className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[26px] bg-white/60 ring-1 ring-line/70" />
      <div className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-lift)]">
        <p className="text-[15px] font-semibold text-navy">{title}</p>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  );
  const line = (w: string) => <div className={cn("h-1.5 rounded-full bg-sand-200", w)} />;
  const chip = (label: string, on: boolean, note: string) => (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]", on ? "border-blue/20 bg-blue-50/60" : "border-dashed border-line-strong text-subtle")}>
      <span className={on ? "font-medium text-navy" : ""}>{label}</span>
      <span className={cn("text-xs", on ? "text-success" : "text-subtle")}>{note}</span>
    </div>
  );
  if (kind === "aviso")
    return frame(
      "Aviso legal",
      <>
        {line("w-11/12")}
        {line("w-2/3")}
        {chip("Datos registrales", true, "Eres una sociedad")}
        {chip("Colegio profesional", false, "No aplica")}
        {chip("Contratación online", true, "Vendes por internet")}
        {line("w-4/5")}
      </>,
    );
  if (kind === "privacidad")
    return frame(
      "Política de privacidad",
      <div className="overflow-hidden rounded-lg border border-line text-[12.5px]">
        <div className="grid grid-cols-3 bg-sand px-3 py-2 font-medium text-navy">
          <span>Finalidad</span>
          <span>Base jurídica</span>
          <span>Plazo</span>
        </div>
        {[
          ["Contacto", "Consentimiento", "Hasta responder"],
          ["Pedidos", "Contrato", "Plazos fiscales"],
          ["Newsletter", "Consentimiento", "Hasta la baja"],
        ].map((r) => (
          <div key={r[0]} className="grid grid-cols-3 border-t border-line px-3 py-2 text-ink-soft">
            {r.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        ))}
      </div>,
    );
  return frame(
    "Política de cookies",
    <div className="space-y-2 text-[12.5px]">
      {[
        ["_ga", "Google Analytics", "Analítica"],
        ["_fbp", "Meta", "Publicitaria"],
        ["Sesión", "Propia", "Técnica"],
      ].map(([n, p, k]) => (
        <div key={n} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
          <span className="font-mono text-navy">{n}</span>
          <span className="text-muted">{p}</span>
          <span className="rounded-md bg-sand px-2 py-0.5 text-xs text-ink-soft">{k}</span>
        </div>
      ))}
      <div className="flex gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">Necesitas un banner de consentimiento: te lo indicamos.</div>
    </div>,
  );
}
