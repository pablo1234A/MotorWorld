import { ArrowRight, Boxes, Copy, FileSpreadsheet, History, LayoutTemplate, PenLine, ShieldCheck, ShoppingBag, Sparkles, Store, Tags, Truck, UserRound } from "lucide-react";
import { PricingGrid } from "@/components/marketing/pricing";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { getLandingExamples } from "@/content/examples";
import { htmlToPlain } from "@/domain/text";
import { MARKETPLACE_OPTIONS } from "@/domain/marketplaces/profiles";
import { paymentsEnabled } from "@/lib/config/env";
import { getPublicPlans } from "@/server/services/public";

const BENEFITS = [
  { icon: Sparkles, title: "Del producto al anuncio en segundos", text: "Rellena los datos una vez y obtén título, descripción, puntos de venta y palabras clave listos para copiar." },
  { icon: ShieldCheck, title: "Anuncios honestos", text: "El generador solo usa la información que tú proporcionas. Si falta un dato, te lo pide en lugar de inventarlo." },
  { icon: Boxes, title: "Todo tu catálogo en un sitio", text: "Productos, fotografías, anuncios y versiones organizados, con búsqueda, filtros y edición en lote." },
];

const FEATURES = [
  { icon: PenLine, title: "Generador universal", text: "Formularios que se adaptan a cada categoría: un móvil pide almacenamiento y batería; un coche, kilómetros y combustible." },
  { icon: FileSpreadsheet, title: "Generación masiva desde CSV", text: "Sube tu inventario, asigna las columnas, revisa los errores por fila y genera cientos de anuncios por lotes." },
  { icon: LayoutTemplate, title: "Perfiles por marketplace", text: `Adapta longitud, formato y estructura para ${MARKETPLACE_OPTIONS.filter((option) => option.value !== "generic").map((option) => option.label).join(", ")} o tus propias plantillas.` },
  { icon: History, title: "Historial de versiones", text: "Cada cambio guarda una versión. Recupera cualquier resultado anterior cuando quieras." },
  { icon: Copy, title: "Copiar y exportar", text: "Copia título y descripción con un clic o exporta tus anuncios en TXT, CSV, JSON o CSV de productos para Shopify." },
  { icon: Tags, title: "Editor con ajustes rápidos", text: "Cambia el tono, acorta, amplía o prueba otro título sin volver a escribir nada." },
];

const SELLERS = [
  { icon: UserRound, title: "Particulares", text: "Vende lo que ya no usas con anuncios claros que resuelven dudas antes de que te las pregunten." },
  { icon: ShoppingBag, title: "Revendedores", text: "Publica más rápido cada lote que entra y mantén el control de costes y márgenes." },
  { icon: Truck, title: "Dropshipping", text: "Convierte el listado de tu proveedor en fichas de producto coherentes para tu tienda." },
  { icon: Store, title: "Tiendas y ecommerce", text: "Unifica el estilo de cientos de referencias y expórtalas al formato de tu plataforma." },
];

const STEPS = [
  { title: "Añade tu producto", text: "Nombre, categoría, estado, precio y las características que conozcas. Las fotos son opcionales." },
  { title: "Genera el anuncio", text: "Elige plataforma y tono. AnunciaPro compone el anuncio y te avisa de la información que convendría añadir." },
  { title: "Revisa y ajusta", text: "Edita libremente, cambia el tono o la extensión y guarda el resultado. Todas las versiones quedan registradas." },
  { title: "Copia o exporta", text: "Lleva el anuncio a tu marketplace con un clic, o exporta todo tu catálogo de una vez." },
];

const FAQ = [
  { q: "¿AnunciaPro publica los anuncios por mí?", a: "No. AnunciaPro prepara, adapta y exporta tus anuncios para que los publiques tú. No utiliza bots ni automatizaciones no autorizadas, y no tiene integración oficial con ningún marketplace." },
  { q: "¿Utiliza inteligencia artificial?", a: "El modo estándar funciona con plantillas y reglas de redacción, sin modelos de IA. La plataforma está preparada para conectar un proveedor de IA externo; cuando un anuncio se genera con IA se indica expresamente." },
  { q: "¿Puede inventarse características de mi producto?", a: "No. El generador solo utiliza los datos que introduces. Si falta información relevante, la omite y te muestra un aviso para que la completes." },
  { q: "¿Qué cuenta como una generación?", a: "Cada vez que generas, regeneras o ajustas un anuncio (tono, extensión o título) se consume una generación. Editar el texto a mano, guardar, copiar y exportar no consume nada." },
  { q: "¿Qué formato debe tener mi CSV?", a: "Un archivo .csv con una fila de cabeceras. Solo el nombre del producto es obligatorio; puedes descargar una plantilla de ejemplo y asignar tus propias columnas al importar." },
  { q: "¿Quién puede ver mis productos?", a: "Solo tú. Cada cuenta trabaja en su propio espacio aislado y las fotografías se guardan en almacenamiento privado." },
  { q: "¿Puedo eliminar mi cuenta?", a: "Sí, en cualquier momento desde «Mi cuenta». Se eliminan tus productos, anuncios y archivos de forma definitiva." },
];

export default async function LandingPage() {
  const [plans, examples] = [await getPublicPlans(), getLandingExamples()];
  const hero = examples[0]!;

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="dotgrid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_70%_40%,black,transparent)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="animate-rise">
            <Badge tone="brand">Para cualquier producto y cualquier marketplace</Badge>
            <h1 className="mt-5 text-[2.6rem] font-bold leading-[1.04] sm:text-6xl">
              Tus productos, convertidos en <span className="text-brand">anuncios que venden</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              AnunciaPro crea, organiza y adapta los anuncios de todo tu catálogo. Uno a uno o por cientos desde un CSV, con la información justa y sin inventar nada.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/registro" size="lg" variant="brand">
                Crear cuenta gratis <ArrowRight aria-hidden />
              </ButtonLink>
              <ButtonLink href="/como-funciona" size="lg" variant="secondary">
                Ver cómo funciona
              </ButtonLink>
            </div>
            <p className="mt-4 text-[13px] text-faint">Plan gratuito permanente · Sin tarjeta</p>
          </div>

          {/* Demostración: datos de entrada → anuncio generado por el motor real */}
          <div className="animate-rise [animation-delay:120ms]">
            <div className="rounded-[20px] border border-line bg-surface p-2 shadow-raised">
              <div className="rounded-[14px] border border-line bg-paper p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Lo que escribes</p>
                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                  {hero.input.map((row) => (
                    <div key={row.label} className="flex justify-between gap-2 border-b border-dashed border-line pb-1.5">
                      <dt className="text-muted">{row.label}</dt>
                      <dd className="truncate font-medium">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 text-[12px] font-medium text-brand-strong">
                <span className="h-px flex-1 bg-line" /> <Sparkles className="size-3.5" aria-hidden /> Anuncio para {hero.platform} <span className="h-px flex-1 bg-line" />
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-4">
                <p className="font-display text-lg font-semibold leading-snug">{hero.title}</p>
                <p className="mt-2 line-clamp-[9] whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{hero.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hero.keywords.slice(0, 5).map((keyword) => (
                    <span key={keyword} className="rounded-md bg-sunken px-2 py-0.5 text-[11px] text-muted">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] text-faint">Ejemplo generado con las plantillas de AnunciaPro a partir de datos de muestra.</p>
          </div>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-5 font-sans text-lg font-semibold tracking-normal">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FUNCIONALIDADES */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-strong">Funcionalidades</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Una mesa de trabajo completa para tus anuncios</h2>
            <p className="mt-4 text-base leading-relaxed text-muted">Sencilla si vendes un artículo de vez en cuando; preparada para catálogos de miles de referencias.</p>
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <h3 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TIPOS DE VENDEDOR */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Pensado para quien vende, sea cual sea su tamaño</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SELLERS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <Icon className="size-5 text-ink" aria-hidden />
              <h3 className="mt-4 font-sans text-base font-semibold tracking-normal">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EJEMPLOS */}
      <section className="border-y border-line bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-brand">Ejemplos de uso</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold sm:text-4xl">El mismo motor, tres productos muy distintos</h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/65">
            Estos anuncios se generan en directo con las plantillas de AnunciaPro a partir de datos de muestra. Cada uno respeta la longitud y el formato de su plataforma.
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {examples.map((example) => (
              <article key={example.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-sans text-sm font-semibold tracking-normal text-white/90">{example.label}</h3>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">{example.platform}</span>
                </div>
                <p className="mt-4 font-display text-lg font-semibold leading-snug">{example.title}</p>
                <p className="mt-2 line-clamp-[12] whitespace-pre-line text-[13px] leading-relaxed text-white/70">
                  {example.isHtml ? htmlToPlain(example.description) : example.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PASOS */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-3xl font-bold sm:text-4xl">Cómo funciona, paso a paso</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative border-t-2 border-ink pt-5">
              <span className="font-display text-sm font-bold text-brand">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-1.5 font-sans text-base font-semibold tracking-normal">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PRECIOS */}
      <section className="border-y border-line bg-surface" id="precios">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-4xl">Planes y precios</h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Empieza gratis. {paymentsEnabled() ? "Cambia de plan cuando tu catálogo crezca." : "Los planes de pago todavía no están a la venta: los precios mostrados son los previstos para el lanzamiento."}
            </p>
          </div>
          <PricingGrid plans={plans} paymentsEnabled={paymentsEnabled()} />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-20" id="faq">
        <h2 className="text-3xl font-bold sm:text-4xl">Preguntas frecuentes</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex list-none items-center justify-between gap-4 text-[15px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="text-xl font-normal text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand px-8 py-14 text-center text-white sm:px-16">
          <div className="dotgrid absolute inset-0 opacity-40 mix-blend-overlay" aria-hidden />
          <h2 className="relative mx-auto max-w-2xl text-3xl font-bold sm:text-4xl">Crea tu primer anuncio en menos de un minuto</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base text-white/85">Regístrate gratis, añade un producto y comprueba el resultado por ti mismo.</p>
          <ButtonLink href="/registro" size="lg" className="relative mt-8 bg-white! text-ink! hover:bg-paper!">
            Crear cuenta gratis <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
