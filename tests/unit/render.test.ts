import { describe, expect, it } from "vitest";
import { autofix } from "@/engine/autofix";
import { generateSite } from "@/engine/generate";
import { linkMapper, renderPage } from "@/render";

const target = { projectId: "prj_test", appUrl: "https://builder.test" } as const;

describe("renderer", () => {
  const { doc } = autofix(generateSite({ brief: 'Concesionario de coches de ocasión en Madrid llamado "Motor Vértice"' }));

  it("renders exactly one h1 per page with landmarks and lang", () => {
    for (const page of doc.pages) {
      const { html } = renderPage(doc, page, { ...target, mode: "publish", basePath: "/s/motor" });
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      expect(html).toContain('<main id="wb-main">');
      expect(html).toContain('<html lang="es"');
      expect(html).toContain('<meta name="description"');
      expect(html).toContain('rel="canonical"');
    }
  });

  it("only includes editor hooks in edit mode", () => {
    const page = doc.pages[0];
    expect(renderPage(doc, page, { ...target, mode: "publish" }).html).not.toContain("data-wb-section");
    const edit = renderPage(doc, page, { ...target, mode: "edit" }).html;
    expect(edit).toContain("data-wb-section");
    expect(edit).toContain('name="robots" content="noindex');
  });

  it("escapes user content", () => {
    const d = structuredClone(doc);
    const hero = d.pages[0].sections.find((s) => s.type === "hero")!;
    hero.content.heading = '<img src=x onerror="alert(1)">';
    const { html } = renderPage(d, d.pages[0], { ...target, mode: "publish" });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("maps links per target", () => {
    const home = doc.pages[0];
    const sub = doc.pages[1];
    expect(linkMapper(doc, home, { ...target, mode: "publish", basePath: "/s/motor" })("/inventario")).toBe("/s/motor/inventario");
    expect(linkMapper(doc, home, { ...target, mode: "publish", basePath: "/s/motor" })("/")).toBe("/s/motor");
    expect(linkMapper(doc, sub, { ...target, mode: "export" })("/")).toBe("../index.html");
    expect(linkMapper(doc, home, { ...target, mode: "export" })("/inventario#x")).toBe("inventario/index.html#x");
    expect(linkMapper(doc, home, { ...target, mode: "export" })("https://example.com")).toBe("https://example.com");
  });

  it("points forms to the platform endpoint and includes a honeypot", () => {
    const page = doc.pages.find((p) => p.sections.some((s) => s.content.form))!;
    const { html } = renderPage(doc, page, { ...target, mode: "publish" });
    expect(html).toContain('action="https://builder.test/api/forms/prj_test"');
    expect(html).toContain('name="_gotcha"');
  });
});
