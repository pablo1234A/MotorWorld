import type { TemplateContent } from "./engine";
import { avisoLegalDemo } from "./templates/aviso-legal.demo";
import { privacidadDemo } from "./templates/privacidad.demo";
import { cookiesDemo } from "./templates/cookies.demo";

export type DocumentType = "aviso_legal" | "privacidad" | "cookies";

export const DOCUMENT_TYPES: { code: DocumentType; name: string; slug: string; description: string }[] = [
  { code: "aviso_legal", name: "Aviso legal", slug: "aviso-legal", description: "Identifica al titular de la web y regula su uso." },
  { code: "privacidad", name: "Política de privacidad", slug: "politica-de-privacidad", description: "Explica qué datos personales tratas, para qué y con qué derechos." },
  { code: "cookies", name: "Política de cookies", slug: "politica-de-cookies", description: "Informa de las cookies que usa tu web y cómo gestionarlas." },
];

export function documentTypeName(code: string): string {
  return DOCUMENT_TYPES.find((d) => d.code === code)?.name ?? code;
}

/**
 * Plantillas de demostración incluidas en el código. Se cargan en la base de
 * datos con `npm run db:seed:templates` como versiones `is_demo = true`, que la
 * base de datos impide aprobar o publicar. Sirven para desarrollo, pruebas y
 * como borrador de partida para la revisión jurídica.
 */
export const DEMO_TEMPLATES: {
  slug: string;
  documentType: DocumentType;
  name: string;
  versionLabel: string;
  content: TemplateContent;
  changelog: string;
}[] = [
  {
    slug: "aviso-legal",
    documentType: "aviso_legal",
    name: "Aviso legal",
    versionLabel: "0.1.0-demo",
    content: avisoLegalDemo,
    changelog: "Borrador inicial de demostración pendiente de revisión jurídica.",
  },
  {
    slug: "politica-privacidad",
    documentType: "privacidad",
    name: "Política de privacidad",
    versionLabel: "0.1.0-demo",
    content: privacidadDemo,
    changelog: "Borrador inicial de demostración pendiente de revisión jurídica.",
  },
  {
    slug: "politica-cookies",
    documentType: "cookies",
    name: "Política de cookies",
    versionLabel: "0.1.0-demo",
    content: cookiesDemo,
    changelog: "Borrador inicial de demostración pendiente de revisión jurídica.",
  },
];
