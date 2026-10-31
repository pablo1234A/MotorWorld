/**
 * Datos del titular del servicio para los textos legales (LSSI-CE art. 10, RGPD art. 13).
 * NO se inventan: si faltan, se muestran como «PENDIENTE DE COMPLETAR».
 */
const v = (k: string) => (process.env[k] ?? "").trim() || null;

export function legalInfo() {
  return {
    ownerName: v("LEGAL_OWNER_NAME"),
    taxId: v("LEGAL_OWNER_TAX_ID"),
    address: v("LEGAL_OWNER_ADDRESS"),
    registry: v("LEGAL_OWNER_REGISTRY"),
    contactEmail: v("LEGAL_CONTACT_EMAIL"),
    dpoEmail: v("LEGAL_DPO_EMAIL"),
    appUrl: process.env.APP_URL ?? "",
    lastUpdated: "31 de octubre de 2026",
  };
}
export const LEGAL_PAGES = [
  { slug: "aviso-legal", title: "Aviso legal" },
  { slug: "privacidad", title: "Política de privacidad" },
  { slug: "cookies", title: "Política de cookies" },
  { slug: "condiciones", title: "Condiciones generales de contratación" },
  { slug: "cancelacion", title: "Suscripciones y cancelación" },
  { slug: "precios-e-impuestos", title: "Precios e impuestos" },
  { slug: "encargo-tratamiento", title: "Acuerdo de encargo del tratamiento" },
  { slug: "derechos", title: "Ejercicio de derechos" },
];
