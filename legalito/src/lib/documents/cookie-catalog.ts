/**
 * Catálogo orientativo de cookies instaladas por herramientas habituales,
 * basado en la documentación pública de cada proveedor (revisado 2026-11).
 * Las herramientas cambian sus cookies con el tiempo: por eso los documentos
 * recomiendan siempre verificar la lista con un escaneo real de la web.
 */
export type CookieKind = "tecnica" | "preferencias" | "analitica" | "publicitaria";

export interface CookieEntry {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  kind: CookieKind;
  thirdParty: boolean;
}

export const COOKIE_KIND_LABEL: Record<CookieKind, string> = {
  tecnica: "Técnica",
  preferencias: "Preferencias",
  analitica: "Analítica",
  publicitaria: "Publicitaria",
};

export const COOKIE_CATALOG: Record<string, CookieEntry[]> = {
  google_analytics: [
    { name: "_ga", provider: "Google", purpose: "Distinguir usuarios para elaborar estadísticas de uso", duration: "2 años", kind: "analitica", thirdParty: true },
    { name: "_ga_<ID>", provider: "Google", purpose: "Mantener el estado de la sesión para estadísticas", duration: "2 años", kind: "analitica", thirdParty: true },
  ],
  matomo: [
    { name: "_pk_id.*", provider: "Matomo", purpose: "Distinguir visitantes para elaborar estadísticas", duration: "13 meses", kind: "analitica", thirdParty: false },
    { name: "_pk_ses.*", provider: "Matomo", purpose: "Agrupar las páginas vistas durante una visita", duration: "30 minutos", kind: "analitica", thirdParty: false },
  ],
  google_ads: [
    { name: "_gcl_au", provider: "Google", purpose: "Medir la eficacia de los anuncios y las conversiones", duration: "3 meses", kind: "publicitaria", thirdParty: true },
    { name: "IDE", provider: "Google (doubleclick.net)", purpose: "Mostrar y medir anuncios personalizados", duration: "13 meses", kind: "publicitaria", thirdParty: true },
  ],
  meta_pixel: [
    { name: "_fbp", provider: "Meta", purpose: "Medir y optimizar campañas publicitarias", duration: "3 meses", kind: "publicitaria", thirdParty: true },
    { name: "fr", provider: "Meta", purpose: "Mostrar anuncios relevantes y medir su rendimiento", duration: "3 meses", kind: "publicitaria", thirdParty: true },
  ],
  tiktok_pixel: [
    { name: "_ttp", provider: "TikTok", purpose: "Medir y optimizar campañas publicitarias", duration: "13 meses", kind: "publicitaria", thirdParty: true },
  ],
  linkedin_insight: [
    { name: "li_sugr", provider: "LinkedIn", purpose: "Identificar el navegador para publicidad y medición", duration: "3 meses", kind: "publicitaria", thirdParty: true },
    { name: "bcookie", provider: "LinkedIn", purpose: "Identificar el navegador", duration: "1 año", kind: "publicitaria", thirdParty: true },
    { name: "lidc", provider: "LinkedIn", purpose: "Seleccionar el centro de datos", duration: "1 día", kind: "tecnica", thirdParty: true },
  ],
  youtube: [
    { name: "YSC", provider: "Google (YouTube)", purpose: "Registrar las reproducciones de vídeos incrustados", duration: "Sesión", kind: "analitica", thirdParty: true },
    { name: "VISITOR_INFO1_LIVE", provider: "Google (YouTube)", purpose: "Estimar el ancho de banda y recordar preferencias del reproductor", duration: "6 meses", kind: "preferencias", thirdParty: true },
  ],
  vimeo: [
    { name: "vuid", provider: "Vimeo", purpose: "Registrar el uso del reproductor de vídeo", duration: "2 años", kind: "analitica", thirdParty: true },
  ],
  google_maps: [
    { name: "NID", provider: "Google", purpose: "Recordar preferencias del usuario en servicios de Google", duration: "6 meses", kind: "preferencias", thirdParty: true },
  ],
  recaptcha: [
    { name: "_GRECAPTCHA", provider: "Google", purpose: "Proteger los formularios frente a abusos automatizados", duration: "6 meses", kind: "tecnica", thirdParty: true },
  ],
};

export const TOOL_LABELS: Record<string, string> = {
  google_analytics: "Google Analytics",
  matomo: "Matomo",
  plausible: "Plausible",
  google_ads: "Google Ads",
  meta_pixel: "Píxel de Meta",
  tiktok_pixel: "Píxel de TikTok",
  linkedin_insight: "LinkedIn Insight Tag",
  youtube: "YouTube",
  vimeo: "Vimeo",
  google_maps: "Google Maps",
  recaptcha: "Google reCAPTCHA",
  chat: "Chat integrado",
};
