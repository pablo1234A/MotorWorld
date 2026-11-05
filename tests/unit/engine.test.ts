import { describe, expect, it } from "vitest";
import { autofix, sanitizeCustomHtml } from "@/engine/autofix";
import { analyzeBrief } from "@/engine/brief";
import { generateSite } from "@/engine/generate";
import { interpret } from "@/engine/intents";
import { applyOperations } from "@/engine/ops";
import { parseDocument, PROJECT_KINDS, safeParseDocument } from "@/engine/schema";
import { contrast } from "@/engine/util";
import { validateDocument } from "@/engine/validate";

const BRIEFS = [
  'Restaurante de cocina de temporada llamado "Casa Lumbre" en Valencia, con reservas y carta',
  "SaaS para automatizar la facturación de pequeñas empresas, con precios y prueba gratis, estilo oscuro",
  "Concesionario de coches de ocasión premium en Madrid llamado Motor Vértice con financiación",
  "Tienda online de cerámica artesanal que vende tazas, cuencos y jarrones, estilo minimal",
  "Portfolio de una fotógrafa de arquitectura en Barcelona, estilo editorial",
  "Experiencia 3D inmersiva para el lanzamiento de unos auriculares llamados Halo",
];

describe("brief analysis", () => {
  it("extracts kind, name, city and offerings", () => {
    const a = analyzeBrief(BRIEFS[0]);
    expect(a.kind).toBe("restaurant");
    expect(a.name).toBe("Casa Lumbre");
    expect(a.city).toBe("Valencia");
    const store = analyzeBrief(BRIEFS[3]);
    expect(store.kind).toBe("store");
    expect(store.offerings).toEqual(["Tazas", "Cuencos", "Jarrones"]);
    expect(store.styleHint).toBe("minimal");
  });

  it("does not treat website features as business offerings", () => {
    const a = analyzeBrief(BRIEFS[1]);
    expect(a.offerings.some((o) => /precio|estilo|oscur/i.test(o))).toBe(false);
    expect(a.wants.dark).toBe(true);
    expect(a.wants.pricing).toBe(true);
  });
});

describe("generation", () => {
  it.each(PROJECT_KINDS)("produces a schema-valid site without QA errors for kind %s", (kind) => {
    const { doc, after } = autofix(generateSite({ brief: `Web para un proyecto de tipo ${kind} en Sevilla`, kind }));
    expect(safeParseDocument(doc).success).toBe(true);
    expect(after.issues.filter((i) => i.severity === "error")).toEqual([]);
    for (const p of doc.pages) {
      expect(p.sections[0].type).toBe("navbar");
      expect(p.sections.at(-1)!.type).toBe("footer");
    }
  });

  it("produces different designs for different briefs", () => {
    const docs = BRIEFS.map((b) => generateSite({ brief: b }));
    const signatures = new Set(docs.map((d) => `${d.theme.style}|${d.theme.colors.primary}|${d.theme.fonts.display}|${d.pages[0].sections.map((s) => `${s.type}:${s.variant}`).join(",")}`));
    expect(signatures.size).toBe(BRIEFS.length);
  });

  it("is deterministic for the same brief and seed, and varies with the seed", () => {
    const a = generateSite({ brief: BRIEFS[1], seed: 42 });
    const b = generateSite({ brief: BRIEFS[1], seed: 42 });
    const c = generateSite({ brief: BRIEFS[1], seed: 43 });
    const sig = (d: typeof a) => JSON.stringify([d.theme, d.pages.map((p) => p.sections.map((s) => s.variant))]);
    expect(sig(a)).toBe(sig(b));
    expect(sig(a)).not.toBe(sig(c));
  });

  it("respects explicit choices and the dark request", () => {
    const d = generateSite({ brief: BRIEFS[1] });
    expect(d.theme.mode).toBe("dark");
    const forced = generateSite({ brief: BRIEFS[0], style: "brutalist", mode: "dark", name: "Fogón" });
    expect(forced.theme.style).toBe("brutalist");
    expect(forced.settings.siteName).toBe("Fogón");
  });

  it("never uses lorem ipsum and flags illustrative content as sample", () => {
    for (const b of BRIEFS) {
      const d = generateSite({ brief: b });
      expect(JSON.stringify(d)).not.toMatch(/lorem ipsum/i);
      for (const p of d.pages) for (const s of p.sections) if (s.type === "testimonials" || s.type === "stats") expect(s.sample).toBe(true);
    }
  });

  it("generates palettes that meet WCAG AA", () => {
    for (const b of BRIEFS) {
      const { colors } = generateSite({ brief: b }).theme;
      expect(contrast(colors.text, colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.muted, colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.primaryText, colors.primary)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("QA and autofix", () => {
  it("detects and fixes broken links, missing alt text and bad contrast", () => {
    const doc = generateSite({ brief: BRIEFS[0] });
    const hero = doc.pages[0].sections.find((s) => s.type === "hero")!;
    hero.content.ctas![0].href = "/no-existe";
    hero.content.image!.alt = "";
    doc.theme.colors.primaryText = doc.theme.colors.primary;
    const before = validateDocument(doc);
    expect(before.issues.some((i) => i.category === "links" && i.severity === "error")).toBe(true);
    expect(before.issues.some((i) => /texto alternativo/.test(i.message))).toBe(true);
    expect(before.issues.some((i) => /contraste/i.test(i.message))).toBe(true);
    const { after, doc: fixed } = autofix(doc);
    expect(after.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(fixed.pages[0].sections.find((s) => s.type === "hero")!.content.ctas![0].href).not.toBe("/no-existe");
  });

  it("sanitizes custom HTML", () => {
    const dirty = '<div onclick="steal()">hola<script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe></div>';
    const clean = sanitizeCustomHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|javascript:|iframe/i);
    expect(clean).toContain("hola");
  });
});

describe("operations", () => {
  it("applies atomic edits without touching other sections", () => {
    const doc = generateSite({ brief: BRIEFS[2] });
    const page = doc.pages[0];
    const target = page.sections[1];
    const other = parseDocument(doc).pages[0].sections[2];
    const r = applyOperations(doc, [{ op: "update_section", pageId: page.id, sectionId: target.id, patch: { content: { heading: "Nuevo titular" }, style: { background: "inverse" } } }]);
    expect(r.errors).toEqual([]);
    const p2 = r.doc.pages[0];
    expect(p2.sections[1].content.heading).toBe("Nuevo titular");
    expect(p2.sections[1].style.background).toBe("inverse");
    expect(p2.sections[2]).toEqual(other);
    expect(doc.pages[0].sections[1].content.heading).not.toBe("Nuevo titular"); // input untouched
  });

  it("rejects invalid operations and keeps the document valid", () => {
    const doc = generateSite({ brief: BRIEFS[0] });
    const r = applyOperations(doc, [{ op: "update_section", pageId: doc.pages[0].id, sectionId: "nope", patch: {} }, { op: "explode" }, { op: "update_theme", patch: { colors: { primary: "red" } } }]);
    expect(r.applied).toEqual([]);
    expect(r.errors.length).toBe(3);
    expect(r.doc).toBe(doc);
  });

  it("adds pages and keeps navigation in sync", () => {
    const doc = generateSite({ brief: BRIEFS[4] });
    const r = applyOperations(doc, [{ op: "add_page", name: "Prensa", sectionTypes: ["richtext"] }]);
    expect(r.errors).toEqual([]);
    const page = r.doc.pages.find((p) => p.path === "/prensa");
    expect(page).toBeTruthy();
    const nav = r.doc.pages[0].sections.find((s) => s.type === "navbar")!;
    expect(nav.content.items!.some((i) => i.href === "/prensa")).toBe(true);
    const removed = applyOperations(r.doc, [{ op: "remove_page", pageId: page!.id }]);
    expect(removed.doc.pages[0].sections.find((s) => s.type === "navbar")!.content.items!.some((i) => i.href === "/prensa")).toBe(false);
  });

  it("refuses to delete the home page", () => {
    const doc = generateSite({ brief: BRIEFS[0] });
    const r = applyOperations(doc, [{ op: "remove_page", pageId: doc.pages[0].id }]);
    expect(r.errors[0]).toMatch(/inicio/);
  });

  it("saves and inserts reusable components", () => {
    const doc = generateSite({ brief: BRIEFS[0] });
    const page = doc.pages[0];
    const r1 = applyOperations(doc, [{ op: "save_component", pageId: page.id, sectionId: page.sections[1].id, name: "Mi hero" }]);
    expect(r1.doc.library).toHaveLength(1);
    const r2 = applyOperations(r1.doc, [{ op: "insert_component", pageId: page.id, componentId: r1.doc.library[0].id }]);
    expect(r2.doc.pages[0].sections.length).toBe(page.sections.length + 1);
  });
});

describe("local intent interpreter", () => {
  const doc = generateSite({ brief: BRIEFS[0] });
  const page = doc.pages[0];
  const hero = page.sections.find((s) => s.type === "hero")!;

  it("handles the brief's example instruction on a selected section", () => {
    const r = interpret(doc, "Convierte esta sección en una experiencia premium con animaciones suaves, fondo oscuro y tipografía elegante", { pageId: page.id, sectionId: hero.id });
    expect(r.understood).toBe(true);
    const applied = applyOperations(doc, r.ops);
    const h2 = applied.doc.pages[0].sections.find((s) => s.id === hero.id)!;
    expect(["inverse", "surface"]).toContain(h2.style.background);
    expect(applied.doc.theme.fonts.display).toBe("Cormorant Garamond");
    // Other sections keep their background.
    expect(applied.doc.pages[0].sections.filter((s) => s.id !== hero.id).map((s) => s.style.background)).toEqual(page.sections.filter((s) => s.id !== hero.id).map((s) => s.style.background));
  });

  it("maps global and structural instructions", () => {
    expect(applyOperations(doc, interpret(doc, "pasa la web a modo oscuro", { pageId: page.id }).ops).doc.theme.mode).toBe("dark");
    const added = applyOperations(doc, interpret(doc, "añade una sección de precios", { pageId: page.id }).ops);
    expect(added.doc.pages[0].sections.some((s) => s.type === "pricing")).toBe(true);
    const titled = applyOperations(doc, interpret(doc, 'cambia el título a "Fuego lento"', { pageId: page.id, sectionId: hero.id }).ops);
    expect(titled.doc.pages[0].sections.find((s) => s.id === hero.id)!.content.heading).toBe("Fuego lento");
  });

  it("says so instead of guessing when it does not understand", () => {
    const r = interpret(doc, "hazme un café", { pageId: page.id });
    expect(r.understood).toBe(false);
    expect(r.notes[0]).toMatch(/No he podido/);
  });
});
