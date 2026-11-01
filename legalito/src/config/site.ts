/**
 * Datos públicos del sitio. Los datos identificativos de la empresa titular
 * de Legalito se configuran por entorno (ver .env.example) y aparecen en las
 * páginas legales propias. Si faltan, se muestran marcadores visibles.
 */
export const site = {
  name: "Legalito",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  description:
    "Genera el aviso legal, la política de privacidad y la política de cookies de tu web, adaptados a tu negocio con plantillas estructuradas. Para autónomos, profesionales y pequeñas empresas en España.",
  locale: "es_ES",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "soporte@legalito.es",
};

export const company = {
  legalName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME ?? "[RAZÓN SOCIAL DEL TITULAR]",
  taxId: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NIF ?? "[NIF]",
  address: process.env.NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS ?? "[DOMICILIO SOCIAL]",
  registry: process.env.NEXT_PUBLIC_LEGAL_COMPANY_REGISTRY ?? "[DATOS REGISTRALES]",
  email: process.env.NEXT_PUBLIC_LEGAL_COMPANY_EMAIL ?? "[EMAIL DE CONTACTO]",
  /** true solo cuando un profesional haya revisado las páginas legales propias. */
  legalPagesReviewed: process.env.NEXT_PUBLIC_LEGAL_PAGES_REVIEWED === "true",
};

export const mainNav = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/precios", label: "Precios" },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
  { href: "/contacto", label: "Contacto" },
];

export const legalNav = [
  { href: "/legal/aviso-legal", label: "Aviso legal" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/condiciones", label: "Condiciones de contratación" },
];

export const DISCLAIMER =
  "Legalito no es un despacho de abogados ni presta asesoramiento jurídico. Los documentos se generan a partir de plantillas estructuradas y reglas de adaptación. Tener estos documentos no garantiza por sí solo el cumplimiento normativo de tu web.";
