/**
 * Brief analysis: turns a natural-language description into structured intent.
 * Used by the local engine and as grounding context for Claude.
 */
import type { ProjectKind, StyleId } from "./schema";

export interface BriefAnalysis {
  kind: ProjectKind;
  name: string | null;
  city: string | null;
  lang: "es" | "en";
  offerings: string[];
  audience: string | null;
  wants: {
    store: boolean;
    booking: boolean;
    pricing: boolean;
    blog: boolean;
    threeD: boolean;
    dark: boolean | null;
    animations: "none" | "subtle" | "rich" | null;
    newsletter: boolean;
    team: boolean;
  };
  styleHint: StyleId | null;
  pageHints: string[];
  keywords: string[];
}

const KIND_PATTERNS: Array<[ProjectKind, RegExp]> = [
  ["dealership", /concesionari|dealership|coches? (de )?segunda mano|venta de (coches|vehículos|motos)|car dealer|automoci[oó]n|vehículos de ocasi[oó]n/i],
  ["restaurant", /restaurante|restaurant|bistr[oó]|cafeter[ií]a|\bbar\b|taberna|pizzer[ií]a|trattoria|brunch|panader[ií]a|bakery|cocina|men[uú] del d[ií]a|tapas|sushi/i],
  ["store", /tienda|e-?commerce|ecommerce|shop|vender (productos|online)|cat[aá]logo de productos|marca de ropa|boutique/i],
  ["saas", /\bsaas\b|software|plataforma (de|para)|startup|api\b|herramienta (online|para)|app de|b2b/i],
  ["education", /curso|academia|formaci[oó]n|escuela|education|bootcamp|clases|e-?learning|universidad|mentor[ií]a/i],
  ["portfolio", /portfolio|portafolio|fot[oó]graf|diseñador[a]? |ilustrador|arquitect[oa] |mi trabajo|freelance|estudio creativo/i],
  ["dashboard", /dashboard|panel de (control|m[eé]tricas)|kpi|anal[ií]tica|m[eé]tricas en tiempo real/i],
  ["webapp", /aplicaci[oó]n web|web ?app|gestor de|crm|reservas online|marketplace/i],
  ["experience3d", /\b3d\b|three\.?js|webgl|inmersiv/i],
  ["interactive", /interactiv|experiencia (digital|web)|storytelling|scroll/i],
  ["corporate", /empresa|corporativ|consultor[ií]a|despacho|bufete|abogad|ingenier[ií]a|asesor[ií]a|cl[ií]nica|agencia/i],
];

const STYLE_PATTERNS: Array<[StyleId, RegExp]> = [
  ["luxury", /lujo|luxury|premium|exclusiv|elegante|alta gama|sofisticad/i],
  ["brutalist", /brutalis|crudo|industrial|raw|swiss/i],
  ["minimal", /minimal|limpio|sencill|clean|sobrio/i],
  ["editorial", /editorial|revista|magazine|serif/i],
  ["playful", /divertid|juguet|colorid|playful|alegre|infantil|fresc/i],
  ["sport", /deportiv|racing|motor|energ[ií]a|agresiv|sport/i],
  ["cinematic", /cinematogr|cinematic|oscur[oa] y|dram[aá]tic|awwwards|futurist/i],
  ["warm", /c[aá]lid|acogedor|artesan|familiar|r[uú]stic|natural/i],
  ["tech", /tecnol[oó]gic|tech|moderno|futur|digital/i],
];

const EN_WORDS = /\b(the|and|for|with|website|landing page|our|we|company|store|build|create|want)\b/gi;
const ES_WORDS = /\b(el|la|los|las|de|para|con|una|un|web|página|quiero|nuestra|empresa|tienda)\b/gi;

function detectLang(text: string): "es" | "en" {
  const en = (text.match(EN_WORDS) || []).length;
  const es = (text.match(ES_WORDS) || []).length;
  return en > es * 1.5 ? "en" : "es";
}

function titleCase(s: string) {
  return s.replace(/\s+/g, " ").trim().replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase());
}

function extractName(text: string): string | null {
  const quoted = text.match(/["“«']([^"”»']{2,40})["”»']/);
  if (quoted) return quoted[1].trim();
  const named = text.match(/(?:llamad[oa]|se llama|de nombre|called|named|marca)\s+([A-ZÁÉÍÓÚÑ0-9][\p{L}0-9&'.-]*(?:\s+(?:&\s+)?[A-ZÁÉÍÓÚÑ0-9][\p{L}0-9&'.-]*){0,3})/u);
  if (named) return named[1].trim();
  return null;
}

function extractCity(text: string): string | null {
  const m = text.match(/\b(?:en|in|de|from)\s+((?:San |Santa |Las |Los |La |El |New )?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+de\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/);
  if (!m) return null;
  const stop = /^(La|El|Los|Las|Una|Un|The|Web|Página|Instagram|Google|Madrid Madrid)$/;
  return stop.test(m[1]) ? null : m[1];
}

/** Words that describe the website itself, not what the business offers. */
const SITE_FEATURE_WORDS = /^(precios?|planes|prueba gratis|estilo|modo|oscur|clar|animaci|reservas? online|formulario|contacto|blog|newsletter|carrito|pagos?|web|p[aá]gina|secci[oó]n|dise[nñ]o|3d)/i;

function extractOfferings(text: string): string[] {
  const m = text.match(
    /(?:vende[n]?|vendemos|ofrece[n]?|ofrecemos|especializad[oa]s? en|servicios? de|productos? como|sell[s]?|offer[s]?|que hace[n]?|dedicad[oa] a)\s+([^.;:\n]{3,200})/i,
  );
  if (!m) return [];
  return m[1]
    .split(/,|\sy\s|\se\s|\sand\s|\so\s|\//i)
    .map((s) => s.replace(/^(de|el|la|los|las|un|una|unos|unas|the|a)\s+/i, "").trim())
    .map((s) => s.replace(/\s+(con|para|en|de estilo|estilo)\s.*$/i, "").trim())
    .filter((s) => s.length > 2 && s.length < 48 && !/^(que|para|donde)\b/i.test(s) && !SITE_FEATURE_WORDS.test(s))
    .slice(0, 8)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

export function analyzeBrief(brief: string, explicitKind?: ProjectKind): BriefAnalysis {
  const text = brief.trim();
  let kind: ProjectKind = explicitKind ?? "landing";
  if (!explicitKind) {
    for (const [k, re] of KIND_PATTERNS) {
      if (re.test(text)) {
        kind = k;
        break;
      }
    }
  }
  let styleHint: StyleId | null = null;
  for (const [s, re] of STYLE_PATTERNS) {
    if (re.test(text)) {
      styleHint = s;
      break;
    }
  }
  const darkMatch = /oscur|dark|negro|noche/i.test(text) ? true : /claro|light|blanco|luminos/i.test(text) ? false : null;
  const animations = /sin animaci|no animation/i.test(text)
    ? "none"
    : /animaci|gsap|scroll|parallax|movimiento|motion|3d/i.test(text)
      ? "rich"
      : null;

  const pageHints: string[] = [];
  const pageWords: Array<[string, RegExp]> = [
    ["Sobre nosotros", /sobre nosotros|qui[eé]nes somos|about/i],
    ["Servicios", /servicios|services/i],
    ["Contacto", /contacto|contact/i],
    ["Precios", /precios|pricing|planes|tarifas/i],
    ["Blog", /\bblog\b|noticias|news/i],
    ["Carta", /\bcarta\b|men[uú]/i],
    ["Reservas", /reserva|booking/i],
    ["Tienda", /tienda|shop|cat[aá]logo/i],
    ["Proyectos", /proyectos|projects|casos de [eé]xito|portfolio/i],
    ["Inventario", /inventario|stock|veh[ií]culos disponibles/i],
    ["Cursos", /cursos|courses/i],
  ];
  for (const [label, re] of pageWords) if (re.test(text)) pageHints.push(label);

  const keywords = Array.from(new Set((text.toLowerCase().match(/\p{L}{5,}/gu) || []).slice(0, 30)));
  const name = extractName(text);

  return {
    kind,
    name: name ? titleCase(name) : null,
    city: extractCity(text),
    lang: detectLang(text),
    offerings: extractOfferings(text),
    audience: (text.match(/(?:para|dirigid[oa] a|for)\s+([^.,;]{4,60})/i) || [])[1]?.trim() ?? null,
    wants: {
      store: /tienda|comprar|carrito|cart|checkout|vender|pagos?|stripe|e-?commerce/i.test(text) || kind === "store",
      booking: /reserva|cita|booking|agenda|prueba de conducci[oó]n|test drive/i.test(text) || kind === "restaurant",
      pricing: /precio|plan|tarifa|suscripci|pricing|membres/i.test(text) || kind === "saas",
      blog: /\bblog\b|noticias|art[ií]culos/i.test(text),
      threeD: /\b3d\b|three|webgl|inmersiv/i.test(text) || kind === "experience3d",
      dark: darkMatch,
      animations,
      newsletter: /newsletter|bolet[ií]n|suscr[ií]bete/i.test(text),
      team: /equipo|team|profesores|instructores|doctores|socios/i.test(text),
    },
    styleHint,
    pageHints,
    keywords,
  };
}
