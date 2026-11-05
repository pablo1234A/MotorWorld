import type { SectionType } from "./schema";

/** Layout variants available per section type. The renderer implements each one. */
export const VARIANTS: Record<SectionType, { id: string; label: string }[]> = {
  navbar: [
    { id: "bar", label: "Barra" },
    { id: "center", label: "Logo centrado" },
    { id: "floating", label: "Flotante" },
  ],
  hero: [
    { id: "centered", label: "Centrado" },
    { id: "split", label: "Texto + imagen" },
    { id: "editorial", label: "Editorial" },
    { id: "fullbleed", label: "Imagen a sangre" },
    { id: "product", label: "Producto" },
    { id: "poster", label: "Cartel tipográfico" },
  ],
  logos: [
    { id: "row", label: "Fila" },
    { id: "marquee", label: "Carrusel continuo" },
  ],
  features: [
    { id: "grid", label: "Rejilla" },
    { id: "bento", label: "Bento" },
    { id: "list", label: "Lista editorial" },
  ],
  showcase: [
    { id: "split", label: "Dividido" },
    { id: "offset", label: "Desplazado" },
  ],
  steps: [
    { id: "numbered", label: "Numerado" },
    { id: "rail", label: "Raíl" },
  ],
  stats: [
    { id: "row", label: "Fila" },
    { id: "cards", label: "Tarjetas" },
  ],
  gallery: [
    { id: "masonry", label: "Mosaico" },
    { id: "grid", label: "Rejilla" },
    { id: "scroller", label: "Desplazable" },
  ],
  testimonials: [
    { id: "grid", label: "Rejilla" },
    { id: "single", label: "Destacado" },
    { id: "marquee", label: "Carrusel" },
  ],
  pricing: [
    { id: "cards", label: "Tarjetas" },
    { id: "compact", label: "Compacto" },
  ],
  products: [
    { id: "grid", label: "Tienda" },
    { id: "inventory", label: "Inventario (vehículos)" },
    { id: "courses", label: "Cursos" },
  ],
  menu: [
    { id: "columns", label: "Columnas" },
    { id: "list", label: "Lista" },
  ],
  team: [{ id: "grid", label: "Rejilla" }],
  timeline: [{ id: "vertical", label: "Vertical" }],
  faq: [
    { id: "accordion", label: "Acordeón" },
    { id: "split", label: "Dos columnas" },
  ],
  cta: [
    { id: "banner", label: "Banda" },
    { id: "big", label: "Gran titular" },
    { id: "split", label: "Dividido" },
  ],
  contact: [
    { id: "split", label: "Formulario + datos" },
    { id: "centered", label: "Centrado" },
  ],
  newsletter: [
    { id: "inline", label: "En línea" },
    { id: "card", label: "Tarjeta" },
  ],
  richtext: [{ id: "prose", label: "Texto" }],
  marquee: [{ id: "text", label: "Texto en movimiento" }],
  dashboard: [{ id: "panel", label: "Panel" }],
  scene3d: [
    { id: "orb", label: "Esfera líquida" },
    { id: "knot", label: "Nudo de cristal" },
    { id: "particles", label: "Partículas" },
  ],
  custom: [{ id: "html", label: "HTML" }],
  footer: [
    { id: "columns", label: "Columnas" },
    { id: "minimal", label: "Mínimo" },
    { id: "big", label: "Marca grande" },
  ],
};

export const SECTION_LABELS: Record<SectionType, string> = {
  navbar: "Navegación",
  hero: "Hero",
  logos: "Logos",
  features: "Características",
  showcase: "Destacado",
  steps: "Pasos",
  stats: "Cifras",
  gallery: "Galería",
  testimonials: "Testimonios",
  pricing: "Precios",
  products: "Productos",
  menu: "Carta",
  team: "Equipo",
  timeline: "Cronología",
  faq: "Preguntas frecuentes",
  cta: "Llamada a la acción",
  contact: "Contacto",
  newsletter: "Newsletter",
  richtext: "Texto",
  marquee: "Marquesina",
  dashboard: "Panel de datos",
  scene3d: "Escena 3D",
  custom: "HTML personalizado",
  footer: "Pie de página",
};

export function isValidVariant(type: SectionType, variant: string) {
  return VARIANTS[type].some((v) => v.id === variant);
}
