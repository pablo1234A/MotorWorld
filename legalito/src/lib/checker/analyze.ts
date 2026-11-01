/**
 * Comprobador de textos legales: análisis automático y orientativo del HTML
 * de una web. Solo detecta señales visibles en el código; no evalúa el
 * contenido jurídico ni garantiza el cumplimiento normativo.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";

export interface Check {
  id: string;
  group: "textos" | "cookies" | "seguridad";
  status: CheckStatus;
  title: string;
  detail: string;
}

export interface LegalLinks {
  aviso?: string;
  privacidad?: string;
  cookies?: string;
}

const CMPS: [RegExp, string][] = [
  [/consent\.cookiebot\.com|cookiebot/i, "Cookiebot"],
  [/cdn\.cookielaw\.org|otSDKStub|onetrust/i, "OneTrust"],
  [/cdn-cookieyes\.com|cookieyes/i, "CookieYes"],
  [/complianz/i, "Complianz"],
  [/iubenda\.com\/cs|_iub\./i, "iubenda"],
  [/usercentrics/i, "Usercentrics"],
  [/cookie-law-info|cli_cookiebar/i, "CookieYes (GDPR Cookie Consent)"],
  [/borlabs-cookie|BorlabsCookie/i, "Borlabs Cookie"],
  [/app\.termly\.io|termly/i, "Termly"],
  [/sdk\.privacy-center\.org|didomi/i, "Didomi"],
  [/axeptio/i, "Axeptio"],
  [/quantcast\.mgr|choice\.js|__tcfapi/i, "Quantcast Choice / TCF"],
  [/cmp\.osano\.com|osano/i, "Osano"],
  [/klaro/i, "Klaro"],
  [/tarteaucitron/i, "tarteaucitron"],
  [/cookieconsent(\.min)?\.js|cookieconsent\.insites|CookieConsent\.run|cc\.run\(/i, "Cookie Consent"],
  [/cookie-notice|cn-notice/i, "Cookie Notice"],
  [/moove_gdpr|gdpr_cookie/i, "GDPR Cookie Compliance"],
  [/real-cookie-banner/i, "Real Cookie Banner"],
  [/cookiehub/i, "CookieHub"],
  [/data-cookie-category|cookieConsent\.open|ccb-style/i, "Banner de consentimiento"],
];

const TRACKERS: [RegExp, string, "analitica" | "publicitaria" | "terceros"][] = [
  [/googletagmanager\.com\/gtag\/js|google-analytics\.com\/(analytics|ga)\.js/i, "Google Analytics", "analitica"],
  [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/, "Google Tag Manager", "analitica"],
  [/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i, "Píxel de Meta", "publicitaria"],
  [/analytics\.tiktok\.com|ttq\.load/i, "Píxel de TikTok", "publicitaria"],
  [/snap\.licdn\.com|_linkedin_partner_id/i, "LinkedIn Insight", "publicitaria"],
  [/googleadservices\.com|googlesyndication\.com|AW-\d{6,}/i, "Google Ads", "publicitaria"],
  [/static\.hotjar\.com|hotjar/i, "Hotjar", "analitica"],
  [/clarity\.ms/i, "Microsoft Clarity", "analitica"],
  [/(?<!-nocookie)\.youtube\.com\/embed/i, "Vídeos de YouTube", "terceros"],
  [/player\.vimeo\.com/i, "Vídeos de Vimeo", "terceros"],
  [/google\.com\/maps\/embed|maps\.googleapis\.com/i, "Google Maps", "terceros"],
];

const LINK_PATTERNS: Record<keyof LegalLinks, RegExp> = {
  aviso: /aviso[\s_-]*legal|nota[\s_-]*legal|informaci[oó]n[\s_-]*legal|legal[\s_-]*notice|imprint|t[eé]rminos[\s_-]*legales/i,
  privacidad: /privacidad|privacy|protecci[oó]n[\s_-]*de[\s_-]*datos/i,
  cookies: /cookie/i,
};

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function textOf(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}

/** Enlaces del documento con su texto visible. */
export function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^(javascript|mailto|tel):/i.test(href)) continue;
    try {
      const abs = new URL(decode(href), base);
      if (!["http:", "https:"].includes(abs.protocol)) continue;
      const label = textOf(m[2]).trim() || (m[1].match(/(?:title|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] ?? "");
      out.push({ href: abs.toString(), text: label });
    } catch {
      // enlace mal formado: se ignora
    }
  }
  return out;
}

/**
 * Busca los enlaces a los textos legales. Puntúa cada candidato para preferir
 * el enlace real del sitio (texto breve, en el pie) frente a artículos o
 * herramientas que solo hablan del tema («Generador de aviso legal», «Guía…»).
 */
export function findLegalLinks(html: string, base: string): LegalLinks {
  const links = extractLinks(html, base);
  const found: LegalLinks = {};
  const noise = /generador|gu[ií]a|qu[eé]\s+es|c[oó]mo\s|plantilla|modelo|ejemplo|blog|noticia|curso/i;
  for (const key of ["aviso", "privacidad", "cookies"] as const) {
    const re = LINK_PATTERNS[key];
    let best: { href: string; score: number } | null = null;
    for (const l of links) {
      const path = decodeURIComponent(new URL(l.href).pathname);
      const byText = re.test(l.text) && !(key === "privacidad" && /cookie/i.test(l.text));
      const byPath = re.test(path) && !(key === "privacidad" && /cookie/i.test(path));
      if (!byText && !byPath) continue;
      let score = (byText ? 3 : 0) + (byPath ? 2 : 0) + (l.text.length > 0 && l.text.length <= 30 ? 1 : 0);
      if (noise.test(l.text) || noise.test(path)) score -= 6;
      if (!best || score > best.score) best = { href: l.href, score };
    }
    if (best && best.score > 0) found[key] = best.href;
  }
  return found;
}

/** Scripts y marcos que se cargan directamente (no aplazados con type="text/plain"). */
function activeResources(html: string): string {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/type\s*=\s*["']?text\/plain/i.test(attrs) && !/data-cookie-category|data-cookieconsent|data-category/i.test(attrs))
    .map(([, attrs, body]) => `${attrs} ${body}`);
  const frames = [...html.matchAll(/<iframe\b([^>]*)>/gi)].map(([, attrs]) => (/\bsrc\s*=/.test(attrs) ? attrs : ""));
  return [...scripts, ...frames].join("\n");
}

export function detectCmp(html: string): string | null {
  return CMPS.find(([re]) => re.test(html))?.[1] ?? null;
}

export function detectTrackers(html: string): { name: string; kind: "analitica" | "publicitaria" | "terceros" }[] {
  const active = activeResources(html);
  return TRACKERS.filter(([re]) => re.test(active)).map(([, name, kind]) => ({ name, kind }));
}

const TAX_ID = /\b(?:[ABCDEFGHJKLMNPQRSUVW][-\s.]?\d{7}[-\s.]?[0-9A-J]|\d{8}[-\s.]?[A-Z]|[XYZ][-\s.]?\d{7}[-\s.]?[A-Z])\b/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export interface LegalPagesContent {
  aviso?: string;
  privacidad?: string;
  cookies?: string;
}

export interface AnalysisInput {
  url: string;
  html: string;
  headers: Record<string, string>;
  pages: LegalPagesContent;
}

export interface Report {
  url: string;
  host: string;
  checks: Check[];
  passed: number;
  total: number;
  cmp: string | null;
  trackers: { name: string; kind: string }[];
}

/** Evalúa la portada y, si se pudieron descargar, las páginas legales enlazadas. */
export function analyze({ url, html, headers, pages }: AnalysisInput): Report {
  const checks: Check[] = [];
  const base = new URL(url);
  const links = findLegalLinks(html, url);
  const cmp = detectCmp(html);
  const trackers = detectTrackers(html);
  const needsConsent = trackers.length > 0;

  // ---- Textos legales
  const linkCheck = (id: keyof LegalLinks, name: string, why: string) => {
    checks.push(
      links[id]
        ? { id: `enlace_${id}`, group: "textos", status: "ok", title: `Enlace a ${name}`, detail: `Encontrado en la portada: ${links[id]}` }
        : { id: `enlace_${id}`, group: "textos", status: "fail", title: `Enlace a ${name}`, detail: `No encontramos un enlace visible en la portada. ${why}` },
    );
  };
  linkCheck("aviso", "aviso legal", "La LSSI-CE exige que los datos del titular sean accesibles de forma permanente, fácil y directa.");
  linkCheck("privacidad", "política de privacidad", "Es necesaria si la web recoge datos personales (formularios, email, reservas, pedidos…).");
  linkCheck("cookies", "política de cookies", "Es necesaria si la web instala cookies que no sean técnicas.");

  if (pages.aviso !== undefined) {
    const t = textOf(pages.aviso);
    checks.push(
      TAX_ID.test(t)
        ? { id: "aviso_nif", group: "textos", status: "ok", title: "NIF del titular en el aviso legal", detail: "El aviso legal parece incluir un NIF, NIE o CIF." }
        : { id: "aviso_nif", group: "textos", status: "warn", title: "NIF del titular en el aviso legal", detail: "No hemos encontrado un NIF, NIE o CIF en el aviso legal. Es uno de los datos que debe figurar." },
    );
    checks.push(
      EMAIL.test(t) || /href\s*=\s*["']mailto:/i.test(pages.aviso)
        ? { id: "aviso_email", group: "textos", status: "ok", title: "Email de contacto en el aviso legal", detail: "Hay una dirección de email de contacto." }
        : { id: "aviso_email", group: "textos", status: "warn", title: "Email de contacto en el aviso legal", detail: "No vemos un email de contacto directo en el aviso legal." },
    );
  }
  if (pages.privacidad !== undefined) {
    const t = textOf(pages.privacidad).toLowerCase();
    const rights = /derecho/.test(t) && /(acceso|rectificaci|supresi)/.test(t);
    checks.push(
      rights
        ? { id: "privacidad_derechos", group: "textos", status: "ok", title: "Derechos de los usuarios", detail: "La política de privacidad menciona los derechos de acceso, rectificación o supresión." }
        : { id: "privacidad_derechos", group: "textos", status: "warn", title: "Derechos de los usuarios", detail: "No encontramos cómo ejercer los derechos (acceso, rectificación, supresión…)." },
    );
    checks.push(
      /agencia española de protección de datos|aepd/.test(t)
        ? { id: "privacidad_aepd", group: "textos", status: "ok", title: "Reclamación ante la AEPD", detail: "Se informa del derecho a reclamar ante la Agencia Española de Protección de Datos." }
        : { id: "privacidad_aepd", group: "textos", status: "warn", title: "Reclamación ante la AEPD", detail: "No se menciona el derecho a presentar una reclamación ante la AEPD." },
    );
    if (/rgpd|reglamento general de protección de datos|2016\/679/.test(t) === false && /lopd\b|ley orgánica 15\/1999/.test(t)) {
      checks.push({ id: "privacidad_lopd", group: "textos", status: "warn", title: "Normativa citada", detail: "La política parece citar solo la antigua LOPD (Ley 15/1999), sustituida por el RGPD y la LOPDGDD." });
    }
  }

  // ---- Cookies y consentimiento
  if (needsConsent) {
    const names = trackers.map((t) => t.name).join(", ");
    checks.push({ id: "rastreadores", group: "cookies", status: "info", title: "Herramientas que suelen instalar cookies", detail: `Detectadas en el código de la portada: ${names}.` });
    checks.push(
      cmp
        ? { id: "banner", group: "cookies", status: "ok", title: "Banner de consentimiento", detail: `Detectado: ${cmp}. Comprueba que bloquea estas herramientas hasta que el visitante acepta.` }
        : { id: "banner", group: "cookies", status: "fail", title: "Banner de consentimiento", detail: "No detectamos ninguna herramienta de consentimiento. Las cookies de analítica, publicidad o contenidos de terceros necesitan el consentimiento previo del visitante." },
    );
    if (!cmp) {
      checks.push({ id: "carga_previa", group: "cookies", status: "warn", title: "Carga antes del consentimiento", detail: "Estas herramientas se cargan directamente en el código, por lo que probablemente se ejecutan antes de que el visitante pueda elegir." });
    }
  } else {
    checks.push({ id: "rastreadores", group: "cookies", status: "ok", title: "Herramientas de seguimiento", detail: "No hemos detectado analítica, píxeles publicitarios ni contenidos de terceros habituales en la portada." });
    if (cmp) checks.push({ id: "banner", group: "cookies", status: "info", title: "Banner de consentimiento", detail: `Detectado: ${cmp}.` });
  }
  if (pages.cookies !== undefined) {
    const t = textOf(pages.cookies).toLowerCase();
    checks.push(
      /(retirar|revocar|cambiar|modificar|configurar).{0,80}(consentimiento|preferencias|cookies)|desactivar|eliminar las cookies|configuración del navegador/.test(t)
        ? { id: "cookies_retirar", group: "cookies", status: "ok", title: "Cómo retirar el consentimiento", detail: "La política de cookies explica cómo cambiar la elección o desactivar las cookies." }
        : { id: "cookies_retirar", group: "cookies", status: "warn", title: "Cómo retirar el consentimiento", detail: "No encontramos cómo retirar el consentimiento o configurar las cookies." },
    );
  }

  // ---- Seguridad básica
  checks.push(
    base.protocol === "https:"
      ? { id: "https", group: "seguridad", status: "ok", title: "Conexión segura (HTTPS)", detail: "La web se sirve cifrada." }
      : { id: "https", group: "seguridad", status: "fail", title: "Conexión segura (HTTPS)", detail: "La web no usa HTTPS. Los datos que envían los visitantes (formularios) viajan sin cifrar." },
  );
  if (/fonts\.googleapis\.com/i.test(html)) {
    checks.push({ id: "google_fonts", group: "seguridad", status: "info", title: "Google Fonts desde los servidores de Google", detail: "Cargar las fuentes desde Google envía la IP del visitante a un tercero. Alojarlas en tu propio servidor lo evita." });
  }
  if (headers["strict-transport-security"] === undefined && base.protocol === "https:") {
    checks.push({ id: "hsts", group: "seguridad", status: "info", title: "Cabecera HSTS", detail: "Recomendable para forzar siempre la conexión segura." });
  }

  const scored = checks.filter((c) => c.status !== "info");
  return {
    url,
    host: base.hostname,
    checks,
    passed: scored.filter((c) => c.status === "ok").length,
    total: scored.length,
    cmp,
    trackers,
  };
}
