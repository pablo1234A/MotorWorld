import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { MARKETPLACE_IDS, MARKETPLACE_PROFILES } from "@/domain/marketplaces/profiles";

export const metadata: Metadata = { title: "Cómo funciona", description: "Del producto al anuncio publicado: así se trabaja con AnunciaPro." };

const SECTIONS = [
  {
    title: "1. Registra tus productos",
    paragraphs: [
      "Cada producto se guarda en tu catálogo con su categoría, estado, precio, fotografías y atributos propios. El formulario cambia según la categoría: un smartphone pide almacenamiento y estado de la batería; un vehículo, año, kilómetros y combustible; un sofá, plazas, material y dimensiones.",
      "¿No encuentras tu categoría? Crea las tuyas desde Configuración y añade las características que necesites como texto libre.",
    ],
  },
  {
    title: "2. Genera el anuncio",
    paragraphs: [
      "Elige la plataforma de destino y el tono. AnunciaPro compone un título comercial, una descripción completa, una versión breve, características destacadas, puntos de venta, palabras clave y la información del estado.",
      "El generador trabaja únicamente con los datos que has introducido. Nunca añade especificaciones, garantías ni accesorios que no hayas indicado; cuando falta algo importante, lo señala para que decidas si quieres completarlo.",
    ],
  },
  {
    title: "3. Edita y guarda versiones",
    paragraphs: [
      "El resultado se abre en un editor: cambia cualquier texto, prueba otro tono, acorta, amplía o pide un título alternativo. Cada cambio guardado crea una versión, de modo que siempre puedes recuperar un resultado anterior.",
    ],
  },
  {
    title: "4. Trabaja por lotes con CSV",
    paragraphs: [
      "Sube un CSV con tu inventario, asigna cada columna a un campo y revisa la validación fila a fila antes de confirmar. El procesamiento se hace por lotes y puedes seguir el progreso en tiempo real.",
      "Si una parte del lote falla, los anuncios generados correctamente se conservan y puedes reintentar solo los elementos fallidos. Al terminar, descarga los resultados en CSV.",
    ],
  },
  {
    title: "5. Adapta, copia y exporta",
    paragraphs: [
      "Cada plataforma tiene sus costumbres: títulos más cortos, descripciones en HTML, hashtags… Los perfiles de AnunciaPro aplican esas reglas automáticamente y puedes crear plantillas propias con tus límites y textos fijos.",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-4xl font-bold sm:text-5xl">Cómo funciona AnunciaPro</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">Una herramienta para preparar buenos anuncios con rapidez, sin perder el control de lo que se dice de tus productos.</p>

      <div className="mt-12 space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-3 text-base leading-relaxed text-ink-soft">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Perfiles de marketplace incluidos</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          AnunciaPro no tiene integración oficial ni publica automáticamente en estas plataformas: prepara el texto para que lo copies o lo exportes. Los límites son valores orientativos que puedes ajustar con plantillas propias.
        </p>
        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line bg-paper text-[12px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-4 py-3 font-semibold">Perfil</th>
                <th className="px-4 py-3 font-semibold">Título</th>
                <th className="px-4 py-3 font-semibold">Descripción</th>
                <th className="px-4 py-3 font-semibold">Formato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {MARKETPLACE_IDS.map((id) => {
                const profile = MARKETPLACE_PROFILES[id];
                return (
                  <tr key={id}>
                    <td className="px-4 py-3 font-medium">{profile.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{profile.titleMaxLength} car.</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{profile.descriptionMaxLength.toLocaleString("es-ES")} car.</td>
                    <td className="px-4 py-3 text-muted">{profile.descriptionFormat === "html" ? "HTML" : "Texto plano"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-14 rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <h2 className="text-2xl font-semibold">Pruébalo con uno de tus productos</h2>
        <p className="mt-2 text-sm text-muted">El plan gratuito incluye todo lo necesario para crear tus primeros anuncios.</p>
        <ButtonLink href="/registro" variant="brand" size="lg" className="mt-6">
          Crear cuenta gratis
        </ButtonLink>
      </div>
    </div>
  );
}
