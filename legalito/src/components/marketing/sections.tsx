import Link from "next/link";
import { Check, ChevronDown, FileCheck2, Cookie, ShieldCheck, Minus } from "lucide-react";
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

const quotaLabel = (p: PublicPlan) =>
  p.kind === "one_time"
    ? `${p.generationsLimit ?? "Ilimitadas"} generaciones`
    : p.documentsPerPeriod === null
      ? "Documentos ilimitados"
      : `Hasta ${p.documentsPerPeriod} documentos al mes`;

/** Planes: las suscripciones en primer plano (Medium recomendado) y el pago único como alternativa. */
export function PlanCards({ plans, ctaHref = "/registro" }: { plans: PublicPlan[]; ctaHref?: string }) {
  const subs = plans.filter((p) => p.kind === "subscription");
  const oneTime = plans.find((p) => p.kind === "one_time");
  const featuredCode = subs.length >= 3 ? subs[1].code : subs[0]?.code;
  return (
    <div className="space-y-5">
      <div className={cn("grid gap-5", subs.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
        {subs.map((p) => {
          const featured = p.code === featuredCode;
          return (
            <div
              key={p.code}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-white p-6 sm:p-7",
                featured ? "border-navy shadow-[var(--shadow-lift)] lg:-my-2 lg:py-9" : "border-line shadow-[var(--shadow-soft)]",
              )}
            >
              {featured && <span className="absolute -top-3 left-6 rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white">Recomendado</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 min-h-[2.75rem] text-[14.5px] leading-snug text-muted">{p.description}</p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-navy-950 tabular-nums">{formatPrice(p.priceCents, p.currency)}</span>
                <span className="text-sm text-muted">/ mes</span>
              </p>
              <p className="mt-1 text-xs text-subtle">IVA incluido · Cancela cuando quieras</p>
              <p className="mt-5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-navy">{quotaLabel(p)}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.filter((f) => !/documentos (al mes|ilimitados)/i.test(f)).map((f) => (
                  <li key={f} className="flex gap-2.5 text-[14.5px]">
                    <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-success" />
                    <span className="text-ink-soft">{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={ctaHref} className={cn(buttonClass(featured ? "primary" : "secondary", "lg"), "mt-7 w-full")}>
                Empezar con {p.name}
              </Link>
            </div>
          );
        })}
      </div>
      {oneTime && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="max-w-xl">
            <h3 className="text-lg font-semibold">
              {oneTime.name} <span className="ml-1 text-base font-normal text-muted">· {formatPrice(oneTime.priceCents, oneTime.currency)}</span>
            </h3>
            <p className="mt-1 text-[14.5px] text-muted">
              ¿Solo los necesitas una vez? Tus tres documentos con acceso permanente y {oneTime.generationsLimit ?? "varias"} generaciones para corregir datos. No incluye
              actualizaciones futuras.
            </p>
          </div>
          <Link href={ctaHref} className={cn(buttonClass("secondary", "md"), "shrink-0")}>
            Elegir pago único
          </Link>
        </div>
      )}
    </div>
  );
}

export function PlanComparison({ plans }: { plans: PublicPlan[] }) {
  const ordered = [...plans.filter((p) => p.kind === "subscription"), ...plans.filter((p) => p.kind === "one_time")];
  if (ordered.length < 2) return null;
  const rows: [string, (p: PublicPlan) => React.ReactNode][] = [
    ["Precio", (p) => `${formatPrice(p.priceCents, p.currency)}${p.kind === "subscription" ? " / mes" : ""}`],
    ["Documentos", (p) => (p.kind === "one_time" ? `${p.generationsLimit ?? "Ilimitadas"} generaciones` : p.documentsPerPeriod === null ? "Ilimitados" : `${p.documentsPerPeriod} al mes`)],
    ["Aviso legal, privacidad y cookies", () => true],
    ["Vista previa antes de pagar", () => true],
    ["PDF y código HTML", () => true],
    ["Regenerar un solo documento", (p) => p.kind === "subscription"],
    ["Nuevas versiones revisadas", (p) => p.includesUpdates],
    ["Avisos de cambios relevantes", (p) => p.includesUpdates],
  ];
  const cell = (v: React.ReactNode) =>
    v === true ? <Check className="mx-auto h-4.5 w-4.5 text-success" aria-label="Incluido" /> : v === false ? <Minus className="mx-auto h-4.5 w-4.5 text-subtle" aria-label="No incluido" /> : <span className="text-sm text-ink-soft">{v}</span>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white" tabIndex={0} role="region" aria-label="Comparación de planes">
      <table className="w-full min-w-[640px] text-left">
        <caption className="sr-only">Comparación de planes</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-4 text-sm font-medium text-muted">Qué incluye</th>
            {ordered.map((p) => (
              <th key={p.code} scope="col" className="w-32 px-4 py-4 text-center text-sm font-semibold">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, get]) => (
            <tr key={label}>
              <th scope="row" className="px-5 py-3.5 text-[15px] font-normal text-ink-soft">{label}</th>
              {ordered.map((p) => (
                <td key={p.code} className="px-4 py-3.5 text-center">{cell(get(p))}</td>
              ))}
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
