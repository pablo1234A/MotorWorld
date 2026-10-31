import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, detectIncentiveLanguage, findUnknownVariables, renderTemplate, sanitizeHeader, templateHasReviewLink } from "@/lib/template";

const ctx = { customerName: "Laura", businessName: "Clínica Sonrisa", reviewUrl: "https://g.page/r/abc/review", serviceName: "limpieza dental", unsubscribeUrl: "https://app/baja/x", footerLines: ["Clínica Sonrisa · Calle Mayor 1"] };

describe("motor de plantillas", () => {
  it("sustituye todas las variables dinámicas en texto y HTML", () => {
    const tpl = { ...DEFAULT_TEMPLATE, subject: "{{nombre_cliente}}, ¿qué tal tu {{nombre_servicio}}?" };
    const r = renderTemplate(tpl, ctx);
    expect(r.subject).toBe("Laura, ¿qué tal tu limpieza dental?");
    expect(r.text).toContain("Hola Laura,");
    expect(r.text).toContain("Desde Clínica Sonrisa queremos");
    expect(r.text).toContain("https://g.page/r/abc/review");
    expect(r.text).toContain("https://app/baja/x");
    expect(r.html).toContain('href="https://g.page/r/abc/review"');
    expect(r.html).toContain("Dejar mi opinión");
    expect(r.html).not.toMatch(/\{\{/);
    expect(r.text).not.toMatch(/\{\{/);
  });

  it("escapa HTML de los datos del cliente (anti-XSS)", () => {
    const r = renderTemplate(DEFAULT_TEMPLATE, { ...ctx, customerName: '<script>alert("x")</script>' });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("evita inyección de cabeceras en el asunto", () => {
    const r = renderTemplate({ ...DEFAULT_TEMPLATE, subject: "Hola {{nombre_cliente}}" }, { ...ctx, customerName: "Ana\r\nBcc: victima@x.com" });
    expect(r.subject).not.toMatch(/[\r\n]/);
    expect(sanitizeHeader("a\nb\r\nc")).toBe("a b c");
  });

  it("limpia la puntuación si falta el nombre", () => {
    const r = renderTemplate(DEFAULT_TEMPLATE, { ...ctx, customerName: "" });
    expect(r.text.startsWith("Hola,")).toBe(true);
  });

  it("detecta variables desconocidas y ausencia de enlace", () => {
    expect(findUnknownVariables({ body: "Hola {{nombre}} {{enlace_resena}}" })).toEqual(["nombre"]);
    expect(templateHasReviewLink({ body: "sin enlace" })).toBe(false);
    expect(templateHasReviewLink({ body: "aquí {{ enlace_resena }}" })).toBe(true);
  });

  it("detecta incentivos o condicionamiento de la reseña", () => {
    expect(detectIncentiveLanguage({ body: "Déjanos 5 estrellas y te damos un descuento" }).length).toBeGreaterThan(0);
    expect(detectIncentiveLanguage(DEFAULT_TEMPLATE)).toEqual([]);
  });

  it("rechaza enlaces de reseña no http(s)", () => {
    expect(() => renderTemplate(DEFAULT_TEMPLATE, { ...ctx, reviewUrl: "javascript:alert(1)" })).toThrow();
  });
});
