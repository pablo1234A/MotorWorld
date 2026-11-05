/**
 * World Builder AI — document model.
 *
 * A site is a structured document (Project → Pages → Sections → Content), never loose code.
 * This lets the AI edit one section without touching the rest, lets the visual editor and the
 * chat operate on the same model, makes undo/redo exact, and guarantees that the preview,
 * the published site and the exported ZIP are rendered by the very same function.
 *
 * Section content is a uniform superset (heading, body, items, ctas…). Every renderer picks
 * the fields it needs. A flat, uniform shape is what makes structured AI output reliable.
 */
import { z } from "zod";

export const PROJECT_KINDS = [
  "landing",
  "store",
  "saas",
  "corporate",
  "portfolio",
  "restaurant",
  "dealership",
  "webapp",
  "dashboard",
  "education",
  "experience3d",
  "interactive",
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const STYLE_IDS = [
  "editorial",
  "luxury",
  "tech",
  "minimal",
  "brutalist",
  "warm",
  "sport",
  "playful",
  "cinematic",
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const SECTION_TYPES = [
  "navbar",
  "hero",
  "logos",
  "features",
  "showcase",
  "steps",
  "stats",
  "gallery",
  "testimonials",
  "pricing",
  "products",
  "menu",
  "team",
  "timeline",
  "faq",
  "cta",
  "contact",
  "newsletter",
  "richtext",
  "marquee",
  "dashboard",
  "scene3d",
  "custom",
  "footer",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const ANIMATION_PRESETS = ["none", "fade-up", "fade", "reveal", "stagger", "scale", "parallax", "cinematic"] as const;
export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal #rrggbb");
const id = z.string().min(1).max(64);
const shortText = z.string().max(240);
const longText = z.string().max(4000);
/** Internal links: "/path", "/path#anchor", "#anchor"; external: http(s), mailto, tel. */
export const hrefSchema = z
  .string()
  .max(600)
  .refine((v) => v === "" || /^(\/|#|https?:\/\/|mailto:|tel:)/.test(v), "Enlace no válido");

export const mediaSchema = z.object({
  kind: z.enum(["image", "video", "generated"]).default("image"),
  src: z.string().max(200_000), // generated SVG art travels as a data: URI
  alt: shortText.default(""),
  credit: z
    .object({ name: shortText, url: z.string().max(600), provider: z.enum(["unsplash", "pexels", "upload", "generated"]) })
    .optional(),
  /** Search query used to source the image from a stock provider. */
  query: shortText.optional(),
});
export type Media = z.infer<typeof mediaSchema>;

export const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  href: hrefSchema,
  style: z.enum(["primary", "secondary", "ghost", "link"]).default("primary"),
});
export type Cta = z.infer<typeof ctaSchema>;

export const itemSchema = z.object({
  id,
  title: shortText.default(""),
  text: longText.default(""),
  meta: shortText.optional(),
  price: shortText.optional(),
  badge: shortText.optional(),
  icon: z.string().max(40).optional(),
  image: mediaSchema.optional(),
  href: hrefSchema.optional(),
  features: z.array(z.string().max(160)).max(20).optional(),
  /** Stripe Payment Link or Price ID for commerce items. */
  checkout: z.object({ paymentLink: z.string().max(600).optional(), priceId: z.string().max(120).optional() }).optional(),
  value: z.number().optional(),
});
export type Item = z.infer<typeof itemSchema>;

export const formFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Nombre de campo en minúsculas"),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "email", "tel", "textarea", "select", "date", "number", "checkbox"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(80)).max(30).optional(),
  placeholder: z.string().max(120).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSchema = z.object({
  id,
  fields: z.array(formFieldSchema).min(1).max(20),
  submitLabel: z.string().min(1).max(40),
  successMessage: z.string().max(240),
});
export type FormSpec = z.infer<typeof formSchema>;

export const sectionContentSchema = z.object({
  eyebrow: shortText.optional(),
  heading: z.string().max(300).optional(),
  subheading: z.string().max(600).optional(),
  body: longText.optional(),
  image: mediaSchema.optional(),
  media: z.array(mediaSchema).max(24).optional(),
  items: z.array(itemSchema).max(48).optional(),
  ctas: z.array(ctaSchema).max(4).optional(),
  form: formSchema.optional(),
  /** Sanitized HTML for "custom" sections only. */
  html: z.string().max(40_000).optional(),
  /** Free-form note (e.g. legal line in footer, address in contact). */
  note: z.string().max(600).optional(),
});
export type SectionContent = z.infer<typeof sectionContentSchema>;

export const sectionStyleSchema = z.object({
  background: z.enum(["default", "surface", "primary", "inverse", "image", "accent"]).default("default"),
  padding: z.enum(["none", "sm", "md", "lg", "xl"]).default("lg"),
  align: z.enum(["start", "center"]).default("start"),
  width: z.enum(["narrow", "default", "wide", "full"]).default("default"),
  overlay: z.number().min(0).max(0.95).optional(),
  anchor: z.string().regex(/^[a-z0-9-]{0,40}$/).optional(),
});
export type SectionStyle = z.infer<typeof sectionStyleSchema>;

export const sectionSchema = z.object({
  id,
  type: z.enum(SECTION_TYPES),
  /** Layout variant name; each renderer documents its variants (see render/variants). */
  variant: z.string().max(40).default("a"),
  style: sectionStyleSchema.default({ background: "default", padding: "lg", align: "start", width: "default" }),
  animation: z
    .object({ preset: z.enum(ANIMATION_PRESETS).default("fade-up"), delay: z.number().min(0).max(2).default(0) })
    .default({ preset: "fade-up", delay: 0 }),
  hidden: z.object({ desktop: z.boolean(), tablet: z.boolean(), mobile: z.boolean() }).partial().optional(),
  /** Reusable component reference: sections saved to the library carry their origin id. */
  componentId: z.string().max(64).optional(),
  /**
   * True when the section contains illustrative content (testimonials, figures, contact
   * details, prices) generated without real data. QA asks the user to replace it before
   * publishing so no fabricated reviews or numbers go live as if they were real.
   */
  sample: z.boolean().optional(),
  content: sectionContentSchema,
});
export type Section = z.infer<typeof sectionSchema>;

export const seoSchema = z.object({
  title: z.string().max(120).default(""),
  description: z.string().max(320).default(""),
  ogImage: z.string().max(600).optional(),
  noindex: z.boolean().default(false),
});
export type Seo = z.infer<typeof seoSchema>;

export const pageSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  path: z.string().regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/, "Ruta como /contacto"),
  seo: seoSchema,
  sections: z.array(sectionSchema).max(60),
});
export type Page = z.infer<typeof pageSchema>;

export const themeSchema = z.object({
  style: z.enum(STYLE_IDS),
  mode: z.enum(["light", "dark"]),
  colors: z.object({
    bg: hex,
    surface: hex,
    text: hex,
    muted: hex,
    primary: hex,
    primaryText: hex,
    accent: hex,
    border: hex,
  }),
  fonts: z.object({ display: z.string().max(60), body: z.string().max(60), mono: z.string().max(60).optional() }),
  /** Base corner radius in px. */
  radius: z.number().min(0).max(40),
  density: z.enum(["compact", "comfortable", "airy"]),
  motion: z.enum(["none", "subtle", "expressive", "cinematic"]),
  /** Display type scale ratio. */
  scale: z.number().min(1.1).max(1.6).default(1.25),
  headingCase: z.enum(["normal", "upper"]).default("normal"),
});
export type Theme = z.infer<typeof themeSchema>;

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1).max(80),
  lang: z.enum(["es", "en", "fr", "de", "it", "pt"]).default("es"),
  favicon: z.string().max(200_000).optional(),
  /** Email that receives form notifications (requires RESEND_API_KEY on the server). */
  notifyEmail: z.string().email().optional().or(z.literal("")),
  /** Optional Make/Zapier webhook forwarded every form submission. */
  formWebhook: z.string().url().optional().or(z.literal("")),
  currency: z.string().length(3).default("EUR"),
  analytics: z.object({ plausibleDomain: z.string().max(120).optional() }).optional(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const siteDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(PROJECT_KINDS),
  brief: z.string().max(4000),
  settings: siteSettingsSchema,
  theme: themeSchema,
  pages: z.array(pageSchema).min(1).max(30),
  /** Reusable components saved by the user, inserted as copies. */
  library: z.array(z.object({ id, name: z.string().max(60), section: sectionSchema })).max(100).default([]),
});
export type SiteDocument = z.infer<typeof siteDocumentSchema>;

export function parseDocument(input: unknown): SiteDocument {
  return siteDocumentSchema.parse(input);
}

export function safeParseDocument(input: unknown) {
  return siteDocumentSchema.safeParse(input);
}
