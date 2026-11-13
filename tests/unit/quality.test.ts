import { describe, expect, it } from "vitest";
import { scoreListing, type QualityFacts } from "@/domain/quality";

const facts: QualityFacts = { hasPrice: true, imageCount: 4, hasCategory: true, hasBrand: true, missingAttributes: [], hasDefects: true, condition: "good" };
const limits = { titleMaxLength: 80, descriptionMaxLength: 2000 };
const good = { title: "Bicicleta de montaña Orbea MX 40 · Talla L", description: "x".repeat(400), keywords: ["orbea", "bicicleta", "mtb", "29"] };

describe("medidor de calidad", () => {
  it("un anuncio completo obtiene 100", () => {
    const report = scoreListing(good, facts, limits);
    expect(report.score).toBe(100);
    expect(report.level).toBe("excelente");
  });

  it("penaliza lo que falta y explica cómo mejorarlo", () => {
    const report = scoreListing({ title: "BICI!!!", description: "Vendo", keywords: [] }, { ...facts, hasPrice: false, imageCount: 0, missingAttributes: ["Talla del cuadro"], hasDefects: false }, limits);
    const failed = report.checks.filter((check) => !check.passed).map((check) => check.id);
    expect(failed).toEqual(expect.arrayContaining(["title-length", "title-style", "description-length", "keywords", "price", "photos", "photos-3", "category", "defects"]));
    expect(report.score).toBeLessThan(30);
    expect(report.level).toBe("incompleto");
    expect(report.checks.find((check) => check.id === "category")?.hint).toContain("Talla del cuadro");
  });

  it("detecta textos que superan el límite de la plataforma", () => {
    const report = scoreListing({ ...good, title: "x".repeat(81) }, facts, limits);
    expect(report.checks.find((check) => check.id === "title-limit")?.passed).toBe(false);
  });

  it("no exige defectos en productos nuevos y adapta mínimos a plataformas cortas", () => {
    const report = scoreListing({ ...good, description: "x".repeat(130) }, { ...facts, hasDefects: false, condition: "new" }, { titleMaxLength: 50, descriptionMaxLength: 640 });
    expect(report.checks.find((check) => check.id === "defects")?.passed).toBe(true);
    expect(report.checks.find((check) => check.id === "description-length")?.passed).toBe(true);
  });

  it("mide la descripción HTML por su texto", () => {
    const report = scoreListing({ ...good, description: `<p>${"x".repeat(10)}</p>` }, facts, limits);
    expect(report.checks.find((check) => check.id === "description-length")?.passed).toBe(false);
  });
});
