import { ArrowRight, Check } from "lucide-react";
import { PricingGrid } from "@/components/marketing/pricing";
import { ProductShot } from "@/components/marketing/product-shot";
import { ButtonLink } from "@/components/ui/button";
import { getLandingExamples } from "@/content/examples";
import { MARKETPLACE_OPTIONS } from "@/domain/marketplaces/profiles";
import { htmlToPlain } from "@/domain/text";
import { paymentsEnabled } from "@/lib/config/env";
import { cn } from "@/lib/utils";
import { getPublicPlans } from "@/server/services/public";

const PLATFORMS = MARKETPLACE_OPTIONS.filter((option) => option.value !== "generic").map((option) => option.label);

const PRINCIPLES = [
  { title: "Del producto al anuncio en segundos.", text: "Rellenas los datos una vez y obtienes título, descripción, puntos de venta y palabras clave listos para copiar." },
  { title: "Nunca inventa nada.", text: "El generador solo usa lo que tú le das. Si falta un dato lo omite y te lo señala, en lugar de rellenar con suposiciones." },
  { title: "Todo tu catálogo, ordenado.", text: "Productos, fotografías, anuncios y versiones en un mismo sitio, con búsqueda, filtros y edición en lote." },
];

const TOUR = [
  {
    title: "Un editor que te dice cómo mejorar cada anuncio",
    text: "Elige plataforma y tono y obtén el anuncio completo. El medidor de calidad puntúa el resultado en vivo y te indica qué falta: una foto, el precio, un dato clave.",
    points: ["Cambia el tono, acorta, amplía o prueba otro título con un clic", "Cada cambio guardado es una versión que puedes recuperar", "Copia el título y la descripción o descarga el anuncio"],
    image: "/marketing/editor.png",
    alt: "Editor de anuncios de AnunciaPro con las opciones de generación, el medidor de calidad y el resultado",
  },
  {
    title: "Cientos de anuncios desde un CSV",
    text: "Sube tu inventario, asigna cada columna a un campo y revisa los errores fila a fila antes de confirmar. El procesamiento va por lotes y lo sigues en directo.",
    points: ["Las columnas extra se importan como atributos", "Si una parte falla, lo generado se conserva y reintentas solo los fallidos", "Descarga los resultados en CSV al terminar"],
    image: "/marketing/masivo.png",
    alt: "Asistente de importación de AnunciaPro asignando las columnas de un CSV a los campos del producto",
  },
  {
    title: "Un catálogo que no se te va de las manos",
    text: "Busca por nombre, marca o referencia, filtra por categoría y estado y edita varios productos a la vez. Con el coste de adquisición ves el margen estimado de cada uno.",
    points: ["Vista de tabla o de tarjetas", "Archivar, duplicar y restaurar", "Fotografías en almacenamiento privado"],
    image: "/marketing/catalogo.png",
    alt: "Catálogo de productos de AnunciaPro con buscador, filtros y tabla de productos",
  },
];

const SELLERS = [
  { name: "Particulares", text: "Vende lo que ya no usas con anuncios claros, que resuelven las dudas antes de que te las pregunten." },
  { name: "Revendedores", text: "Publica más rápido cada lote que entra y mantén a la vista costes y márgenes." },
  { name: "Dropshipping", text: "Convierte el listado de tu proveedor en fichas de producto coherentes para tu tienda." },
  { name: "Tiendas y ecommerce", text: "Unifica el estilo de cientos de referencias y expórtalas al formato de tu plataforma." },
];

const STEPS = [
  { title: "Añade tu producto", text: "Nombre, categoría, estado, precio y las características que conozcas. El formulario se adapta a cada categoría." },
  { title: "Genera el anuncio", text: "Elige plataforma y tono. AnunciaPro redacta el anuncio y te avisa de la información que convendría añadir." },
  { title: "Revisa y ajusta", text: "Edita libremente, cambia el tono o la extensión y guarda. Todas las versiones quedan registradas." },
  { title: "Copia o exporta", text: "Lleva el anuncio a tu marketplace con un clic o exporta todo tu catálogo de una vez." },
];

const FAQ = [
  { q: "¿AnunciaPro publica los anuncios por mí?", a: "No. AnunciaPro prepara, adapta y exporta tus anuncios para que los publiques tú. No utiliza bots ni automatizaciones no autorizadas, y no tiene integración oficial con ningún marketplace." },
  { q: "¿Utiliza inteligencia artificial?", a: "El modo estándar funciona con plantillas y reglas de redacción, sin modelos de IA. La plataforma está preparada para conectar un proveedor de IA externo; cuando un anuncio se genera con IA se indica expresamente." },
  { q: "¿Puede inventarse características de mi producto?", a: "No. El generador solo utiliza los datos que introduces. Si falta información relevante, la omite y te muestra un aviso para que la completes." },
  { q: "¿Qué cuenta como una generación?", a: "Cada vez que generas, regeneras o ajustas un anuncio (tono, extensión o título) se consume una generación. Editar el texto a mano, guardar, copiar y exportar no consume nada." },
  { q: "¿Qué formato debe tener mi CSV?", a: "Un archivo .csv con una fila de cabeceras. Solo el nombre del producto es obligatorio; puedes descargar una plantilla de ejemplo y asignar tus propias columnas al importar." },
  { q: "¿Quién puede ver mis productos?", a: "Solo tú y las personas que invites a tu espacio de trabajo. Cada espacio está aislado y las fotografías se guardan en almacenamiento privado." },
  { q: "¿Puedo eliminar mi cuenta?", a: "Sí, en cualquier momento desde «Mi cuenta». Se eliminan tus productos, anuncios y archivos de forma definitiva." },
];

// Prerenderizada; los planes se refrescan desde la base de datos cada 5 minutos.
export const revalidate = 300;

export default async function LandingPage() {
  const [plans, examples] = [await getPublicPlans(), getLandingExamples()];
  const hero = examples[0]!;
  const heroLines = hero.description.split("\n\n");

  return (
    <>
      {/* HERO */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-x-14 gap-y-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
          <div>
            <h1 className="text-[2.7rem] font-bold leading-[1.02] sm:text-6xl lg:text-[4.25rem]">
              Tus productos, convertidos en <span className="text-brand">anuncios que venden</span>.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
              AnunciaPro redacta, organiza y adapta los anuncios de todo tu catálogo. Uno a uno o por cientos desde un CSV, con la información justa y sin inventar nada.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/registro" size="lg" variant="brand">
                Crear cuenta gratis <ArrowRight aria-hidden />
              </ButtonLink>
              <ButtonLink href="/como-funciona" size="lg" variant="secondary">
                Ver cómo funciona
              </ButtonLink>
            </div>
            <p className="mt-5 text-[13px] text-faint">Plan gratuito permanente · Sin tarjeta · Preparado para {PLATFORMS.slice(0, 3).join(", ")} y más</p>
          </div>

          {/* Demostración con el motor real: los datos de la izquierda producen el anuncio de la derecha. */}
          <div>
            <div className="relative">
              <div className="rounded-2xl bg-sunken p-5 pb-16 sm:p-6 sm:pb-20">
                <p className="text-[12px] font-semibold text-muted">Lo que escribes</p>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                  {hero.input.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 border-b border-line-strong/60 py-1.5">
                      <dt className="text-muted">{row.label}</dt>
                      <dd className="truncate font-medium">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="relative -mt-11 ml-4 rounded-2xl bg-surface p-5 shadow-raised ring-1 ring-ink/5 sm:-mt-14 sm:ml-10 sm:p-6">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-brand-strong">
                  <span className="inline-block size-1.5 rounded-full bg-brand" aria-hidden /> Lo que obtienes · {hero.platform}
                </p>
                <p className="mt-3 animate-reveal font-display text-xl font-semibold leading-snug [animation-delay:250ms]">{hero.title}</p>
                <div className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-ink-soft">
                  {heroLines.slice(0, 4).map((line, index) => (
                    <p key={line.slice(0, 24)} className="animate-reveal whitespace-pre-line" style={{ animationDelay: `${450 + index * 180}ms` }}>
                      {line}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {hero.keywords.slice(0, 5).map((keyword) => (
                    <span key={keyword} className="rounded-md bg-sunken px-2 py-0.5 text-[11px] text-muted">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-[12px] text-faint sm:ml-10">Ejemplo generado con las plantillas de AnunciaPro a partir de datos de muestra.</p>
          </div>
        </div>
      </section>

      {/* PRINCIPIOS */}
      <section className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
        <div className="grid gap-y-10 md:grid-cols-3 md:divide-x md:divide-line">
          {PRINCIPLES.map((item, index) => (
            <div key={item.title} className={cn("md:px-9", index === 0 && "md:pl-0", index === PRINCIPLES.length - 1 && "md:pr-0")}>
              <h2 className="text-[1.65rem] font-semibold leading-[1.15]">{item.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RECORRIDO POR EL PRODUCTO (capturas reales) */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <h2 className="max-w-2xl text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Una mesa de trabajo completa para tus anuncios</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">Sencilla si vendes un artículo de vez en cuando; preparada para catálogos de miles de referencias.</p>

          <div className="mt-16 space-y-20 lg:space-y-28">
            {TOUR.map((item, index) => (
              <div key={item.title} className="grid items-center gap-x-14 gap-y-8 lg:grid-cols-[0.8fr_1.2fr]">
                <div className={cn(index % 2 === 1 && "lg:order-2")}>
                  <h3 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">{item.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-muted">{item.text}</p>
                  <ul className="mt-6 space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex gap-3 text-[15px] leading-snug text-ink-soft">
                        <Check className="mt-0.5 size-[18px] shrink-0 text-brand" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <ProductShot src={item.image} alt={item.alt} />
              </div>
            ))}
          </div>

          <dl className="mt-20 grid gap-x-12 gap-y-8 border-t border-line pt-12 sm:grid-cols-2 lg:mt-28">
            {[
              ["Formularios que entienden cada categoría", "Un móvil pide almacenamiento y batería; un coche, kilómetros y combustible; un sofá, plazas y medidas. Y puedes crear tus propias categorías."],
              ["Perfiles por marketplace", `Longitud, formato y estructura adaptados a ${PLATFORMS.join(", ")}, o a tus propias plantillas.`],
              ["Otra redacción cuando la necesites", "«Volver a generar» te da un texto distinto con los mismos datos, para que tus anuncios no suenen todos iguales."],
              ["Exporta a tu manera", "TXT, CSV, JSON o CSV de productos para Shopify, de un anuncio o de todo el catálogo."],
            ].map(([term, description]) => (
              <div key={term}>
                <dt className="text-[17px] font-semibold">{term}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-muted">{description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* TIPOS DE VENDEDOR */}
      <section className="mx-auto grid max-w-6xl gap-x-16 gap-y-10 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <h2 className="text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Pensado para quien vende, sea cual sea su tamaño</h2>
        <dl className="divide-y divide-line border-y border-line">
          {SELLERS.map((seller) => (
            <div key={seller.name} className="grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[11rem_1fr]">
              <dt className="font-display text-lg font-semibold">{seller.name}</dt>
              <dd className="text-[15px] leading-relaxed text-muted">{seller.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* EJEMPLOS */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <h2 className="max-w-2xl text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">El mismo motor, tres productos muy distintos</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
            Estos anuncios se generan en directo con las plantillas de AnunciaPro a partir de datos de muestra. Cada uno respeta la longitud y el formato de su plataforma.
          </p>
          <div className="mt-12 grid gap-x-10 gap-y-12 lg:grid-cols-3 lg:divide-x lg:divide-white/10">
            {examples.map((example, index) => (
              <article key={example.id} className={cn("flex flex-col", index > 0 && "lg:pl-10")}>
                <p className="text-[13px] font-medium text-white/60">
                  {example.label} · <span className="text-brand">{example.platform}</span>
                </p>
                <h3 className="mt-3 font-display text-xl font-semibold leading-snug">{example.title}</h3>
                <p className="mt-3 line-clamp-[14] whitespace-pre-line text-[14px] leading-relaxed text-white/75">{example.isHtml ? htmlToPlain(example.description) : example.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PASOS */}
      <section className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <h2 className="text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Cómo funciona, paso a paso</h2>
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t-2 border-ink pt-5">
              <span className="font-display text-sm font-bold tabular-nums text-brand-strong">Paso {index + 1}</span>
              <h3 className="mt-1.5 font-sans text-[17px] font-semibold tracking-normal">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PRECIOS */}
      <section className="border-y border-line bg-surface" id="precios">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <h2 className="text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Planes y precios</h2>
          <p className="mb-12 mt-4 max-w-2xl text-lg leading-relaxed text-muted">
            Empieza gratis. {paymentsEnabled() ? "Cambia de plan cuando tu catálogo crezca." : "Los planes de pago todavía no están a la venta: los precios mostrados son los previstos para el lanzamiento."}
          </p>
          <PricingGrid plans={plans} paymentsEnabled={paymentsEnabled()} />
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto grid max-w-6xl gap-x-16 gap-y-8 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28" id="faq">
        <h2 className="text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Preguntas frecuentes</h2>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex list-none items-center justify-between gap-4 text-[17px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-lg font-normal leading-none text-muted transition-transform duration-200 group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 rounded-3xl bg-brand px-8 py-12 text-white sm:px-14 sm:py-16">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold sm:text-[2.6rem] sm:leading-[1.08]">Crea tu primer anuncio en menos de un minuto</h2>
            <p className="mt-4 text-lg text-white/90">Regístrate gratis, añade un producto y comprueba el resultado por ti mismo.</p>
          </div>
          <ButtonLink href="/registro" size="lg" className="bg-white! text-ink! hover:bg-paper!">
            Crear cuenta gratis <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
