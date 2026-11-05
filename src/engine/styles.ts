/**
 * Style engine. Each art direction is a set of decisions (type pairing, palette logic,
 * rhythm, radius, motion), not a template. Palettes are derived from a hue chosen per
 * industry + seed, then contrast-checked, so two briefs in the same style never share
 * the exact same look.
 */
import type { ProjectKind, StyleId, Theme } from "./schema";
import { createRng, ensureContrast, hslToHex, mix, readableOn, type Rng } from "./util";

export interface FontPair {
  display: string;
  body: string;
  mono?: string;
}

export interface StyleDefinition {
  id: StyleId;
  label: string;
  description: string;
  modes: Array<"light" | "dark">;
  fonts: FontPair[];
  radius: [number, number];
  density: Theme["density"];
  motion: Theme["motion"];
  scale: number;
  headingCase: Theme["headingCase"];
  /** Saturation / lightness ranges for the primary color. */
  primary: { s: [number, number]; l: [number, number] };
  /** Neutral temperature: negative = cool, positive = warm. */
  warmth: number;
  /** Preferred section variants per type (renderer variant ids), ordered by affinity. */
  variants: Partial<Record<string, string[]>>;
}

export const STYLES: Record<StyleId, StyleDefinition> = {
  editorial: {
    id: "editorial",
    label: "Editorial",
    description: "Serif expresiva, retícula de revista, mucho aire y fotografía protagonista.",
    modes: ["light"],
    fonts: [
      { display: "Instrument Serif", body: "Inter Tight" },
      { display: "Fraunces", body: "Instrument Sans" },
      { display: "Newsreader", body: "Geist" },
    ],
    radius: [0, 4],
    density: "airy",
    motion: "subtle",
    scale: 1.333,
    headingCase: "normal",
    primary: { s: [35, 65], l: [30, 42] },
    warmth: 6,
    variants: { hero: ["editorial", "split", "centered"], features: ["list", "grid"], showcase: ["split", "offset"] },
  },
  luxury: {
    id: "luxury",
    label: "Lujo",
    description: "Contraste alto, serif clásica, dorados contenidos y ritmo pausado.",
    modes: ["dark", "light"],
    fonts: [
      { display: "Cormorant Garamond", body: "Manrope" },
      { display: "Playfair Display", body: "Figtree" },
      { display: "Bodoni Moda", body: "Jost" },
    ],
    radius: [0, 2],
    density: "airy",
    motion: "subtle",
    scale: 1.414,
    headingCase: "normal",
    primary: { s: [35, 55], l: [52, 62] },
    warmth: 10,
    variants: { hero: ["fullbleed", "centered", "editorial"], features: ["list", "grid"], showcase: ["offset", "split"] },
  },
  tech: {
    id: "tech",
    label: "Tech / SaaS",
    description: "Grotesca precisa, bordes finos, detalles mono y un único acento vivo.",
    modes: ["dark", "light"],
    fonts: [
      { display: "Space Grotesk", body: "IBM Plex Sans", mono: "IBM Plex Mono" },
      { display: "Geist", body: "Geist", mono: "Geist Mono" },
      { display: "Sora", body: "Inter", mono: "JetBrains Mono" },
    ],
    radius: [8, 14],
    density: "comfortable",
    motion: "expressive",
    scale: 1.25,
    headingCase: "normal",
    primary: { s: [70, 92], l: [52, 62] },
    warmth: -8,
    variants: { hero: ["product", "centered", "split"], features: ["bento", "grid"], showcase: ["split", "offset"] },
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Monocromo cálido, tipografía como estructura y color solo con significado.",
    modes: ["light"],
    fonts: [
      { display: "Geist", body: "Geist", mono: "Geist Mono" },
      { display: "Inter Tight", body: "Inter Tight" },
      { display: "Manrope", body: "Manrope" },
    ],
    radius: [4, 10],
    density: "airy",
    motion: "subtle",
    scale: 1.2,
    headingCase: "normal",
    primary: { s: [10, 30], l: [14, 22] },
    warmth: 4,
    variants: { hero: ["centered", "split", "editorial"], features: ["list", "grid"], showcase: ["split"] },
  },
  brutalist: {
    id: "brutalist",
    label: "Brutalista",
    description: "Retícula rígida, escala tipográfica extrema, contraste puro y mono utilitaria.",
    modes: ["light", "dark"],
    fonts: [
      { display: "Archivo Black", body: "Archivo", mono: "JetBrains Mono" },
      { display: "Anton", body: "Space Grotesk", mono: "Space Mono" },
    ],
    radius: [0, 0],
    density: "compact",
    motion: "expressive",
    scale: 1.5,
    headingCase: "upper",
    primary: { s: [80, 100], l: [48, 56] },
    warmth: 0,
    variants: { hero: ["poster", "split"], features: ["grid", "list"], showcase: ["split"] },
  },
  warm: {
    id: "warm",
    label: "Cálido",
    description: "Tonos tierra, serif amable, fotografía cercana. Ideal para hostelería y servicios.",
    modes: ["light"],
    fonts: [
      { display: "Fraunces", body: "Work Sans" },
      { display: "DM Serif Display", body: "DM Sans" },
      { display: "Young Serif", body: "Outfit" },
    ],
    radius: [10, 22],
    density: "comfortable",
    motion: "subtle",
    scale: 1.3,
    headingCase: "normal",
    primary: { s: [45, 70], l: [36, 46] },
    warmth: 14,
    variants: { hero: ["split", "fullbleed", "centered"], features: ["grid", "list"], showcase: ["offset", "split"] },
  },
  sport: {
    id: "sport",
    label: "Deportivo",
    description: "Condensada en mayúsculas, diagonales, energía y datos técnicos visibles.",
    modes: ["dark"],
    fonts: [
      { display: "Barlow Condensed", body: "Barlow", mono: "JetBrains Mono" },
      { display: "Oswald", body: "Inter", mono: "Roboto Mono" },
      { display: "Saira Condensed", body: "Saira", mono: "JetBrains Mono" },
    ],
    radius: [0, 4],
    density: "comfortable",
    motion: "expressive",
    scale: 1.414,
    headingCase: "upper",
    primary: { s: [78, 95], l: [46, 54] },
    warmth: -4,
    variants: { hero: ["fullbleed", "poster", "split"], features: ["grid", "bento"], showcase: ["split", "offset"] },
  },
  playful: {
    id: "playful",
    label: "Playful",
    description: "Formas redondeadas, color con personalidad y microinteracciones juguetonas.",
    modes: ["light"],
    fonts: [
      { display: "Bricolage Grotesque", body: "DM Sans" },
      { display: "Syne", body: "Outfit" },
      { display: "Gloock", body: "Figtree" },
    ],
    radius: [16, 28],
    density: "comfortable",
    motion: "expressive",
    scale: 1.333,
    headingCase: "normal",
    primary: { s: [70, 90], l: [55, 64] },
    warmth: 6,
    variants: { hero: ["centered", "split"], features: ["bento", "grid"], showcase: ["split", "offset"] },
  },
  cinematic: {
    id: "cinematic",
    label: "Oscuro cinematográfico",
    description: "Negro profundo, luz dirigida, scroll narrativo con GSAP y profundidad 3D cuando aporta.",
    modes: ["dark"],
    fonts: [
      { display: "Syne", body: "Manrope", mono: "JetBrains Mono" },
      { display: "Unbounded", body: "Inter Tight", mono: "JetBrains Mono" },
      { display: "Instrument Serif", body: "Geist", mono: "Geist Mono" },
    ],
    radius: [6, 14],
    density: "airy",
    motion: "cinematic",
    scale: 1.414,
    headingCase: "normal",
    primary: { s: [60, 90], l: [58, 68] },
    warmth: -6,
    variants: { hero: ["fullbleed", "centered", "product"], features: ["bento", "list"], showcase: ["offset", "split"] },
  },
};

/** Default art direction and base hue per industry. Hue is degrees on the HSL wheel. */
export const KIND_DEFAULTS: Record<ProjectKind, { styles: StyleId[]; hues: number[] }> = {
  landing: { styles: ["tech", "playful", "editorial"], hues: [220, 255, 160, 18] },
  store: { styles: ["minimal", "editorial", "playful"], hues: [24, 340, 150, 210] },
  saas: { styles: ["tech", "minimal", "cinematic"], hues: [235, 262, 190, 145] },
  corporate: { styles: ["minimal", "editorial", "tech"], hues: [212, 200, 170, 230] },
  portfolio: { styles: ["editorial", "brutalist", "cinematic"], hues: [10, 45, 280, 200] },
  restaurant: { styles: ["warm", "luxury", "editorial"], hues: [18, 32, 8, 95] },
  dealership: { styles: ["sport", "luxury", "cinematic"], hues: [356, 210, 28, 0] },
  webapp: { styles: ["tech", "minimal"], hues: [230, 160, 265] },
  dashboard: { styles: ["tech", "minimal"], hues: [215, 170, 255] },
  education: { styles: ["playful", "warm", "minimal"], hues: [200, 145, 28, 260] },
  experience3d: { styles: ["cinematic", "tech"], hues: [265, 190, 320, 25] },
  interactive: { styles: ["cinematic", "playful", "brutalist"], hues: [300, 180, 48] },
};

export interface ThemeOptions {
  style: StyleId;
  kind: ProjectKind;
  seed: number;
  mode?: "light" | "dark";
  hue?: number;
}

function range(rng: Rng, [a, b]: [number, number]) {
  return a + rng.next() * (b - a);
}

/** Builds a complete, contrast-safe theme for a style. */
export function buildTheme({ style, kind, seed, mode, hue }: ThemeOptions): Theme {
  const def = STYLES[style];
  const rng = createRng(seed ^ 0x9e3779b9);
  const resolvedMode = mode ?? def.modes[0];
  const baseHue = hue ?? rng.pick(KIND_DEFAULTS[kind].hues) + rng.int(-10, 10);
  const fonts = rng.pick(def.fonts);

  const ps = range(rng, def.primary.s);
  let pl = range(rng, def.primary.l);
  if (resolvedMode === "dark" && pl < 50) pl = 56;
  let primary = hslToHex(baseHue, ps, pl);

  // Neutrals carry a hint of the brand hue (or warmth) so surfaces never look default grey.
  const neutralHue = def.warmth >= 0 ? 35 + def.warmth : 220 + def.warmth;
  const neutralSat = Math.min(14, Math.abs(def.warmth) + 3);

  let bg: string, surface: string, text: string, muted: string, border: string;
  if (resolvedMode === "dark") {
    bg = hslToHex(neutralHue, neutralSat * 0.6, style === "cinematic" ? 4 : 7);
    surface = hslToHex(neutralHue, neutralSat * 0.6, style === "cinematic" ? 8 : 11);
    text = hslToHex(neutralHue, 8, 94);
    muted = hslToHex(neutralHue, 6, 64);
    border = hslToHex(neutralHue, 6, 18);
  } else {
    bg = hslToHex(neutralHue, neutralSat, style === "minimal" ? 98 : 97);
    surface = hslToHex(neutralHue, neutralSat, style === "brutalist" ? 92 : 94);
    text = hslToHex(neutralHue, 12, 8);
    muted = hslToHex(neutralHue, 6, 38);
    border = hslToHex(neutralHue, 8, 86);
  }
  if (style === "brutalist") {
    bg = resolvedMode === "dark" ? "#0a0a0a" : "#f2f0eb";
    text = resolvedMode === "dark" ? "#f2f0eb" : "#0a0a0a";
    border = text;
  }

  // Primary must be usable as a button on bg and as text on bg.
  primary = ensureContrast(primary, bg, 3.2);
  const primaryText = readableOn(primary);
  const accent = ensureContrast(hslToHex(baseHue + rng.pick([150, 180, 35, -35]), ps * 0.8, pl), bg, 3);
  muted = ensureContrast(muted, bg, 4.6);
  muted = ensureContrast(muted, surface, 4.5);

  return {
    style,
    mode: resolvedMode,
    colors: { bg, surface, text, muted, primary, primaryText, accent, border },
    fonts,
    radius: Math.round(range(rng, def.radius)),
    density: def.density,
    motion: def.motion,
    scale: def.scale,
    headingCase: def.headingCase,
  };
}

/** Re-derives dependent colors after a manual change so the palette stays coherent. */
export function harmonizeTheme(theme: Theme): Theme {
  const c = { ...theme.colors };
  c.primaryText = readableOn(c.primary);
  c.text = ensureContrast(c.text, c.bg, 7);
  c.muted = ensureContrast(c.muted, c.bg, 4.6);
  c.muted = ensureContrast(c.muted, c.surface, 4.5);
  return { ...theme, colors: c };
}

/** Converts a theme to the opposite mode keeping the brand colors. */
export function flipMode(theme: Theme, mode: "light" | "dark"): Theme {
  if (theme.mode === mode) return theme;
  const fresh = buildTheme({ style: theme.style, kind: "landing", seed: 1, mode });
  const colors = {
    ...fresh.colors,
    primary: ensureContrast(theme.colors.primary, fresh.colors.bg, 3.2),
    accent: ensureContrast(theme.colors.accent, fresh.colors.bg, 3),
  };
  colors.primaryText = readableOn(colors.primary);
  return { ...theme, mode, colors };
}

export function googleFontsHref(theme: Theme): string {
  const families = Array.from(new Set([theme.fonts.display, theme.fonts.body, theme.fonts.mono].filter(Boolean) as string[]));
  const query = families
    .map((f) => {
      const name = f.replace(/ /g, "+");
      if (/Instrument Serif|DM Serif Display|Young Serif|Gloock|Anton|Archivo Black/.test(f)) return `family=${name}:ital@0;1`;
      if (/Cormorant Garamond|Playfair Display|Bodoni Moda|Fraunces|Newsreader/.test(f)) return `family=${name}:ital,wght@0,400;0,500;0,600;1,400`;
      return `family=${name}:wght@400;500;600;700`;
    })
    .join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function surfaceFor(theme: Theme, t = 0.5) {
  return mix(theme.colors.bg, theme.colors.surface, t);
}
