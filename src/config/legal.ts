import "server-only";

/**
 * Datos del titular de RevisaYa para el aviso legal, la privacidad, los
 * términos y el encargo del tratamiento. Los pone el responsable del proyecto
 * en el entorno (no son secretos, pero tampoco se inventan): si falta alguno,
 * los textos lo muestran como «pendiente» y la comprobación de producción
 * (`pnpm check:env`) avisa.
 *
 * Versión de los textos: cambiarla obliga a volver a aceptarlos.
 */
export const LEGAL_VERSION = "2026-11-15";

export interface LegalOwner {
  name: string | null; // persona física (autónomo) o sociedad
  taxId: string | null; // NIF / CIF
  address: string | null;
  email: string | null; // contacto y ejercicio de derechos
  registry: string | null; // datos registrales (solo sociedades)
  domain: string;
}

export function legalOwner(): LegalOwner {
  const v = (k: string) => process.env[k]?.trim() || null;
  return {
    name: v("LEGAL_OWNER_NAME"),
    taxId: v("LEGAL_OWNER_TAX_ID"),
    address: v("LEGAL_OWNER_ADDRESS"),
    email: v("LEGAL_OWNER_EMAIL"),
    registry: v("LEGAL_OWNER_REGISTRY"),
    domain: (process.env.APP_URL ?? "https://revisaya.es").replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
  };
}

export function legalOwnerComplete(o = legalOwner()): boolean {
  return Boolean(o.name && o.taxId && o.address && o.email);
}

/** Subencargados previstos por la arquitectura (el responsable confirma regiones y contratos). */
export const SUBPROCESSORS = [
  { name: "Supabase", purpose: "Base de datos, acceso de usuarios y archivos (logos, presupuestos)", location: "Región de la UE elegida al crear el proyecto" },
  { name: "Vercel", purpose: "Alojamiento de la aplicación", location: "Funciones en la UE; empresa en EE. UU. (cláusulas contractuales tipo / Marco de Privacidad de Datos)" },
  { name: "Resend (o Amazon SES)", purpose: "Envío de los correos", location: "Región de la UE si el proveedor la ofrece; empresa en EE. UU. (cláusulas contractuales tipo)" },
  { name: "Stripe", purpose: "Cobro de la suscripción de la empresa (no trata datos de los clientes de la empresa)", location: "Irlanda / EE. UU. (cláusulas contractuales tipo)" },
  { name: "Google", purpose: "Solo si la empresa conecta Google Calendar: citas en su agenda", location: "EE. UU. (Marco de Privacidad de Datos)" },
  { name: "Cloudflare (Turnstile)", purpose: "Comprobación anti-bots en la página pública de citas, si está activada", location: "EE. UU. (cláusulas contractuales tipo)" },
] as const;
