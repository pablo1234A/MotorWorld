/**
 * Local instruction interpreter (no API key needed). Understands common editing intents in
 * Spanish and English and turns them into atomic operations. It handles several clauses per
 * message ("fondo oscuro, animaciones suaves y tipografía elegante"). Anything it cannot map
 * is reported back instead of guessed. With ANTHROPIC_API_KEY, Claude Opus 5.5 handles chat.
 */
import type { Operation } from "./ops";
import type { Section, SectionType, SiteDocument, StyleId } from "./schema";
import { STYLES } from "./styles";
import { hslToHex } from "./util";
import { VARIANTS } from "./variants";

export interface Selection {
  pageId: string;
  sectionId?: string;
}

export interface IntentResult {
  ops: Operation[];
  notes: string[];
  understood: boolean;
}

const COLOR_WORDS: Array<[RegExp, string]> = [
  [/rojo|red|granate|burdeos/i, hslToHex(356, 78, 48)],
  [/naranja|orange|terracota/i, hslToHex(22, 85, 50)],
  [/amarillo|yellow|mostaza/i, hslToHex(44, 92, 52)],
  [/dorado|oro|gold/i, hslToHex(40, 55, 55)],
  [/verde|green|oliva|esmeralda/i, hslToHex(152, 60, 36)],
  [/turquesa|teal|cian|cyan/i, hslToHex(180, 70, 36)],
  [/azul marino|navy/i, hslToHex(222, 60, 28)],
  [/azul|blue/i, hslToHex(218, 85, 52)],
  [/morado|violeta|lila|purple|violet/i, hslToHex(268, 70, 56)],
  [/rosa|pink|magenta|fucsia/i, hslToHex(330, 78, 56)],
  [/negro|black/i, "#111111"],
  [/gris|grey|gray/i, hslToHex(220, 8, 40)],
];

const FONT_STYLES: Array<[RegExp, { display: string; body?: string }]> = [
  [/elegante|serif|clásic|lujo|luxury|elegant/i, { display: "Cormorant Garamond", body: "Manrope" }],
  [/editorial|revista/i, { display: "Instrument Serif", body: "Inter Tight" }],
  [/técnic|tecnic|mono|tech/i, { display: "Space Grotesk", body: "IBM Plex Sans" }],
  [/moderna|modern|geométric|limpia|sans/i, { display: "Geist", body: "Geist" }],
  [/redondead|amable|friendly|divertid|playful/i, { display: "Bricolage Grotesque", body: "DM Sans" }],
  [/condensad|deportiv|impacto|bold/i, { display: "Barlow Condensed", body: "Barlow" }],
  [/brutal/i, { display: "Archivo Black", body: "Archivo" }],
];

const SECTION_WORDS: Array<[RegExp, SectionType]> = [
  [/precio|pricing|planes|tarifa/i, "pricing"],
  [/testimonio|opinion|opinión|reseña|review/i, "testimonials"],
  [/preguntas|faq/i, "faq"],
  [/contacto|formulario|contact/i, "contact"],
  [/galer[ií]a|gallery|proyectos|portfolio/i, "gallery"],
  [/equipo|team/i, "team"],
  [/cifras|estad[ií]stic|stats|n[uú]meros/i, "stats"],
  [/producto|tienda|cat[aá]logo|product/i, "products"],
  [/carta|men[uú]/i, "menu"],
  [/pasos|proceso|c[oó]mo funciona|steps/i, "steps"],
  [/cronolog|historia|timeline|trayectoria/i, "timeline"],
  [/newsletter|bolet[ií]n|suscrip/i, "newsletter"],
  [/logos|clientes|marcas/i, "logos"],
  [/caracter[ií]sticas|servicios|features|ventajas/i, "features"],
  [/llamada a la acci[oó]n|cta|banner/i, "cta"],
  [/3d|tres d|webgl|escena/i, "scene3d"],
  [/marquesina|marquee|cinta/i, "marquee"],
  [/panel|dashboard|kpi/i, "dashboard"],
  [/destacad|showcase|imagen y texto/i, "showcase"],
  [/hero|portada|cabecera/i, "hero"],
  [/texto|p[aá]rrafo|rich/i, "richtext"],
];

const STYLE_WORDS: Array<[RegExp, StyleId]> = [
  [/lujo|luxury|premium/i, "luxury"],
  [/editorial/i, "editorial"],
  [/minimal/i, "minimal"],
  [/brutal/i, "brutalist"],
  [/c[aá]lid|warm|acogedor/i, "warm"],
  [/deportiv|sport/i, "sport"],
  [/playful|divertid|juguet/i, "playful"],
  [/cinemat|cinematic/i, "cinematic"],
  [/tech|tecnol[oó]gic|saas/i, "tech"],
];

function quoted(text: string): string[] {
  return Array.from(text.matchAll(/["“«']([^"”»']{1,300})["”»']/g)).map((m) => m[1]);
}

function selected(doc: SiteDocument, sel: Selection): { section?: Section; pageId: string } {
  const page = doc.pages.find((p) => p.id === sel.pageId) ?? doc.pages[0];
  return { pageId: page.id, section: sel.sectionId ? page.sections.find((s) => s.id === sel.sectionId) : undefined };
}

function findSectionByWord(doc: SiteDocument, pageId: string, text: string): Section | undefined {
  const page = doc.pages.find((p) => p.id === pageId)!;
  for (const [re, type] of SECTION_WORDS) if (re.test(text)) return page.sections.find((s) => s.type === type);
  return undefined;
}

export function interpret(doc: SiteDocument, instruction: string, sel: Selection): IntentResult {
  const text = instruction.trim();
  const low = text.toLowerCase();
  const ops: Operation[] = [];
  const notes: string[] = [];
  const { section: sel0, pageId } = selected(doc, sel);
  const refersToThis = /\b(esta|este|la secci[oó]n|this|it)\b/i.test(low);
  const target = sel0 ?? (refersToThis ? undefined : findSectionByWord(doc, pageId, low));
  const q = quoted(text);
  const themePatch: Extract<Operation, { op: "update_theme" }>["patch"] = {};
  const sectionPatch: Extract<Operation, { op: "update_section" }>["patch"] = {};

  // ── Pages ──
  const pageAdd = low.match(/(?:a[ñn]ade|agrega|crea|add|create)\s+(?:una\s+)?(?:nueva\s+)?p[aá]gina\s+(?:de\s+|llamada\s+|called\s+)?["“«]?([^"”».,]+)/i);
  if (pageAdd) {
    const name = (q[0] ?? pageAdd[1]).trim().replace(/^\w/, (c) => c.toUpperCase());
    const types: SectionType[] = [];
    for (const [re, t] of SECTION_WORDS) if (re.test(name)) types.push(t);
    ops.push({ op: "add_page", name, sectionTypes: types.length ? [types[0], "cta"] : undefined });
    return { ops, notes, understood: true };
  }
  const pageRemove = low.match(/(?:elimina|borra|quita|remove|delete)\s+(?:la\s+)?p[aá]gina\s+(?:de\s+)?["“«]?([^"”».,]+)/i);
  if (pageRemove) {
    const name = pageRemove[1].trim();
    const page = doc.pages.find((p) => p.name.toLowerCase() === name || p.path === "/" + name);
    if (page) ops.push({ op: "remove_page", pageId: page.id });
    else notes.push(`No encuentro la página «${name}».`);
    return { ops, notes, understood: !!page };
  }

  // ── Section structure ──
  const addSection = /(?:a[ñn]ade|agrega|inserta|incluye|pon|add|insert)\b/i.test(low) && !/(?:a[ñn]ade|agrega|pon)\s+(m[aá]s\s+)?(espacio|aire|animaci|sombra)/i.test(low);
  if (addSection) {
    for (const [re, type] of SECTION_WORDS) {
      if (re.test(low)) {
        const page = doc.pages.find((p) => p.id === pageId)!;
        const idx = sel0 ? page.sections.findIndex((s) => s.id === sel0.id) + 1 : undefined;
        ops.push({ op: "add_section", pageId, sectionType: type, index: idx });
        return { ops, notes, understood: true };
      }
    }
  }
  if (/(?:elimina|borra|quita|remove|delete)\b/i.test(low) && !/(animaci|sombra|borde|fondo)/i.test(low)) {
    const s = target ?? sel0;
    if (s) ops.push({ op: "remove_section", pageId, sectionId: s.id });
    else notes.push("Selecciona la sección que quieres eliminar o nómbrala (por ejemplo, «elimina la sección de precios»).");
    return { ops, notes, understood: !!s };
  }
  if (/duplica|duplicate|copia/i.test(low) && (target ?? sel0)) {
    ops.push({ op: "duplicate_section", pageId, sectionId: (target ?? sel0)!.id });
    return { ops, notes, understood: true };
  }
  const move = low.match(/(?:mueve|sube|baja|move)\b.*?(arriba|abajo|up|down|al principio|al final|top|bottom)/i);
  if (move && (target ?? sel0)) {
    const s = (target ?? sel0)!;
    const page = doc.pages.find((p) => p.id === pageId)!;
    const i = page.sections.findIndex((x) => x.id === s.id);
    const dir = move[1];
    const to = /principio|top/.test(dir) ? 1 : /final|bottom/.test(dir) ? page.sections.length - 2 : /arriba|up/.test(dir) ? Math.max(1, i - 1) : Math.min(page.sections.length - 2, i + 1);
    ops.push({ op: "move_section", pageId, sectionId: s.id, toIndex: to });
    return { ops, notes, understood: true };
  }

  // ── Global style ──
  const wantsWholeSite = /toda la web|todo el sitio|la web entera|el sitio|whole site|entire site|global/i.test(low) || !(target ?? sel0);
  const styleMatch = low.match(/estilo\s+(\w+)|style\s+(\w+)/i);
  if (styleMatch) {
    const word = styleMatch[1] ?? styleMatch[2];
    const st = STYLE_WORDS.find(([re]) => re.test(word))?.[1];
    if (st) {
      ops.push({ op: "restyle", style: st, keepBrandColor: /mant[eé]n|conserva|keep/i.test(low) });
      notes.push(`Estilo «${STYLES[st].label}» aplicado a todo el sitio.`);
    }
  }

  const darkWanted = /oscur|dark|negro|noche/i.test(low);
  const lightWanted = /\bclaro\b|light mode|modo claro|fondo blanco|luminos/i.test(low);

  // Section-scoped "premium/dark background" vs whole-site mode
  if (target && !wantsWholeSite) {
    if (darkWanted) sectionPatch.style = { ...(sectionPatch.style ?? {}), background: doc.theme.mode === "dark" ? "surface" : "inverse" };
    if (lightWanted) sectionPatch.style = { ...(sectionPatch.style ?? {}), background: doc.theme.mode === "dark" ? "inverse" : "default" };
    if (/color principal|de color|primary background|fondo de color/i.test(low)) sectionPatch.style = { ...(sectionPatch.style ?? {}), background: "primary" };
    if (/premium|experiencia|lujo|elegante|luxury/i.test(low)) {
      sectionPatch.style = { ...(sectionPatch.style ?? {}), padding: "xl" };
      sectionPatch.animation = { preset: doc.theme.motion === "cinematic" ? "cinematic" : "reveal" };
    }
  } else {
    if (darkWanted && doc.theme.mode !== "dark") themePatch.mode = "dark";
    if (lightWanted && doc.theme.mode !== "light") themePatch.mode = "light";
  }

  // Colors
  const hexMatch = text.match(/#[0-9a-fA-F]{6}\b/);
  if (/color|colou?r|tono|acento|accent/i.test(low) || hexMatch) {
    let value = hexMatch?.[0];
    if (!value) for (const [re, hex] of COLOR_WORDS) if (re.test(low.replace(/fondo (oscuro|negro)/, ""))) { value = hex; break; }
    if (value) {
      if (/acento|accent|secundario/i.test(low)) themePatch.colors = { ...(themePatch.colors ?? {}), accent: value.toLowerCase() };
      else themePatch.colors = { ...(themePatch.colors ?? {}), primary: value.toLowerCase() };
    }
  }

  // Typography
  if (/tipograf|fuente|letra|font|typograph/i.test(low)) {
    const explicit = q.find((s) => /^[A-Z][A-Za-z ]{2,40}$/.test(s));
    if (explicit) themePatch.fonts = { display: explicit };
    else for (const [re, fonts] of FONT_STYLES) if (re.test(low)) { themePatch.fonts = { ...fonts }; break; }
  }
  if (/may[uú]sculas|uppercase/i.test(low)) themePatch.headingCase = "upper";
  if (/min[uú]sculas|sin may[uú]sculas|lowercase|normal case/i.test(low)) themePatch.headingCase = "normal";

  // Motion
  if (/sin animaci|quita (las )?animaci|no animation|remove animation/i.test(low)) {
    if (target && !wantsWholeSite) sectionPatch.animation = { preset: "none" };
    else themePatch.motion = "none";
  } else if (/animaci|movimiento|motion|animate/i.test(low)) {
    const level = /cinemat|scroll|gsap|espectacular|impactante/i.test(low) ? "cinematic" : /suave|sutil|smooth|subtle|elegante/i.test(low) ? "subtle" : "expressive";
    if (target && !wantsWholeSite) sectionPatch.animation = { preset: level === "cinematic" ? "cinematic" : level === "subtle" ? "fade-up" : "reveal" };
    else themePatch.motion = level;
  }

  // Spacing & shape
  if (/m[aá]s (espacio|aire)|espaciad|airy|more space|respira/i.test(low)) {
    if (target && !wantsWholeSite) sectionPatch.style = { ...(sectionPatch.style ?? {}), padding: "xl" };
    else themePatch.density = "airy";
  }
  if (/compact|menos espacio|less space|denso/i.test(low)) {
    if (target && !wantsWholeSite) sectionPatch.style = { ...(sectionPatch.style ?? {}), padding: "sm" };
    else themePatch.density = "compact";
  }
  if (/redonde|rounded|esquinas suaves/i.test(low)) themePatch.radius = 20;
  if (/rect[oa]s|cuadrad|sharp|sin redonde|square/i.test(low)) themePatch.radius = 0;
  if (/centr|center/i.test(low) && target) sectionPatch.style = { ...(sectionPatch.style ?? {}), align: "center" };
  if (/a la izquierda|alinea.*izquierda|left/i.test(low) && target) sectionPatch.style = { ...(sectionPatch.style ?? {}), align: "start" };

  // Layout variant
  if (/(otro|otra|diferente|distint|cambia el) (diseño|layout|variante|composici)|another layout|different layout|variante/i.test(low) && target) {
    const vs = VARIANTS[target.type].map((v) => v.id);
    const named = VARIANTS[target.type].find((v) => low.includes(v.label.toLowerCase()) || low.includes(v.id));
    sectionPatch.variant = named?.id ?? vs[(vs.indexOf(target.variant) + 1) % vs.length];
  }

  // Text content
  if (q.length && target) {
    const content: NonNullable<typeof sectionPatch.content> = {};
    if (/t[ií]tulo|titular|heading|title/i.test(low)) content.heading = q[0];
    else if (/subt[ií]tulo|subheading|entradilla/i.test(low)) content.subheading = q[0];
    else if (/texto|p[aá]rrafo|body|descripci/i.test(low)) content.body = q[0];
    else if (/etiqueta|eyebrow|antet[ií]tulo/i.test(low)) content.eyebrow = q[0];
    else if (/bot[oó]n|button|cta/i.test(low) && target.content.ctas?.length) content.ctas = target.content.ctas.map((c, i) => (i === 0 ? { ...c, label: q[0] } : c));
    else if (!themePatch.fonts) content.heading = q[0];
    if (Object.keys(content).length) sectionPatch.content = content;
  }

  if (Object.keys(themePatch).length) ops.push({ op: "update_theme", patch: themePatch });
  if (target && Object.keys(sectionPatch).length) ops.push({ op: "update_section", pageId, sectionId: target.id, patch: sectionPatch });

  if (!ops.length) {
    notes.push(
      "No he podido traducir esa instrucción con el motor local. Prueba con algo concreto: «fondo oscuro», «color principal azul», «tipografía elegante», «añade una sección de precios», «cambia el título a \"…\"», «otra variante», «sin animaciones». Con una clave de Claude configurada, el chat entiende instrucciones libres.",
    );
  }
  return { ops, notes, understood: ops.length > 0 };
}
