import { describe, expect, it } from "vitest";
import { evaluate, getPath } from "@/lib/documents/conditions";
import { isValidCif, isValidDni, isValidNie, detectTaxId } from "@/lib/validation/spanish-id";
import {
  QUESTIONS,
  activeAdvisories,
  firstIncompleteStep,
  progress,
  validateAnswers,
  visibleQuestions,
} from "@/lib/documents/questionnaire";
import { buildContext } from "@/lib/documents/context";
import { extractRules, extractVariables, parseTemplateContent, renderTemplate } from "@/lib/documents/engine";
import { DEMO_TEMPLATES } from "@/lib/documents/registry";
import { renderHtmlDocument, richText } from "@/lib/documents/html";
import { renderPdf } from "@/lib/documents/pdf";
import { composeDocument, DocumentGenerationError, prepareInput } from "@/lib/documents/compose";
import { computeRequirements } from "@/lib/documents/requirements";
import { freelancerAnswers, shopAnswers } from "../fixtures/answers";

const NOW = new Date("2026-11-01T10:00:00Z");
const meta = (isDemo = false) => ({
  documentTypeName: "Aviso legal",
  ownerName: "Titular",
  generatedAt: NOW,
  templateVersionLabel: "0.1.0-demo",
  isDemo,
});
const tpl = (type: string) => DEMO_TEMPLATES.find((t) => t.documentType === type)!.content;

describe("Identificadores fiscales", () => {
  it("valida DNI, NIE y CIF con su control", () => {
    expect(isValidDni("12345678Z")).toBe(true);
    expect(isValidDni("12345678A")).toBe(false);
    expect(isValidNie("X1234567L")).toBe(true);
    expect(isValidNie("X1234567A")).toBe(false);
    expect(isValidCif("B12345674")).toBe(true);
    expect(isValidCif("B12345675")).toBe(false);
    expect(detectTaxId("12.345.678-z")).toBe("dni");
  });
});

describe("Condiciones", () => {
  it("evalúa operadores compuestos", () => {
    const ctx = { a: { b: true, list: ["x"] }, n: "tienda" };
    expect(evaluate({ all: [{ truthy: "a.b" }, { includes: ["a.list", "x"] }] }, ctx)).toBe(true);
    expect(evaluate({ any: [{ eq: ["n", "otra"] }, { not: { truthy: "a.b" } }] }, ctx)).toBe(false);
    expect(evaluate({ in: ["n", ["tienda", "local"]] }, ctx)).toBe(true);
    expect(evaluate({ nonEmpty: "a.missing" }, ctx)).toBe(false);
  });

  it("no accede a propiedades heredadas del prototipo", () => {
    expect(getPath({}, "constructor")).toBeUndefined();
    expect(getPath({ a: {} }, "a.__proto__")).toBeUndefined();
  });
});

describe("Cuestionario", () => {
  it("tiene identificadores únicos", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("valida un formulario completo y normaliza valores", () => {
    const r = validateAnswers(shopAnswers);
    expect(r.errors).toEqual({});
    expect(r.valid).toBe(true);
    expect(r.cleaned.contact_email).toBe("hola@barro.example");
    expect(r.cleaned.website_url).toBe("https://www.barro.example");
  });

  it("descarta respuestas de preguntas que no corresponden", () => {
    const r = validateAnswers(shopAnswers);
    expect(r.cleaned).not.toHaveProperty("regulated_profession");
    const f = validateAnswers(freelancerAnswers);
    expect(f.valid).toBe(true);
    expect(f.cleaned).not.toHaveProperty("special_categories");
    expect(f.cleaned).not.toHaveProperty("has_cmp");
  });

  it("muestra preguntas distintas según el tipo de negocio", () => {
    const shop = visibleQuestions(validateAnswers(shopAnswers).cleaned).map((q) => q.id);
    const free = visibleQuestions(validateAnswers(freelancerAnswers).cleaned).map((q) => q.id);
    expect(shop).toContain("sells_to");
    expect(shop).toContain("registry_data");
    expect(shop).toContain("payment_providers");
    expect(free).not.toContain("sells_to");
    expect(free).not.toContain("registry_data");
    expect(free).toContain("regulated_profession");
  });

  it("exige el NIF adecuado al tipo de titular", () => {
    const r = validateAnswers({ ...shopAnswers, nif: "12345678Z" });
    expect(r.errors.nif).toMatch(/entidad/);
    const p = validateAnswers({ ...freelancerAnswers, nif: "B12345674" });
    expect(p.errors.nif).toMatch(/NIF o NIE/);
  });

  it("rechaza opciones exclusivas combinadas y valores desconocidos", () => {
    const r = validateAnswers({ ...freelancerAnswers, data_collection: ["ninguno", "contacto"] });
    expect(r.errors.data_collection).toBeDefined();
    const u = validateAnswers({ ...freelancerAnswers, business_type: "hackeo" });
    expect(u.errors.business_type).toBeDefined();
  });

  it("valida solo el paso indicado e informa del progreso", () => {
    const partial = { business_type: "negocio_local", owner_type: "persona_fisica" };
    expect(validateAnswers(partial, { step: "negocio" }).valid).toBe(true);
    expect(validateAnswers(partial, { step: "titular" }).valid).toBe(false);
    expect(firstIncompleteStep(partial)).toBe("titular");
    const p = progress(partial);
    expect(p.answered).toBe(2);
    expect(p.percent).toBeLessThan(30);
    expect(progress(shopAnswers).percent).toBe(100);
  });

  it("avisa cuando hay cookies sin gestor de consentimiento", () => {
    const answers = validateAnswers({ ...shopAnswers, has_cmp: false }).cleaned;
    expect(activeAdvisories(answers).some((a) => a.questionId === "has_cmp")).toBe(true);
  });
});

describe("Plantillas y motor", () => {
  it("las plantillas de demostración cumplen el esquema", () => {
    for (const t of DEMO_TEMPLATES) {
      expect(() => parseTemplateContent(t.content)).not.toThrow();
      expect(extractVariables(t.content).length).toBeGreaterThan(3);
      expect(extractRules(t.content).length).toBeGreaterThan(0);
    }
  });

  it("rechaza plantillas mal formadas", () => {
    expect(() => parseTemplateContent({ title: "x", sections: [] })).toThrow();
    expect(() =>
      parseTemplateContent({
        title: "x",
        sections: [{ id: "a", heading: "A", blocks: [{ type: "table", columns: ["a", "b"], rows: [{ cells: ["1"] }] }] }],
      }),
    ).toThrow();
    expect(() =>
      parseTemplateContent({ title: "x", sections: [{ id: "a", heading: "A", blocks: [{ type: "paragraph", text: "t", when: { eval: "x" } }] }] }),
    ).toThrow();
  });

  it("todas las variables usadas existen en el contexto de un caso completo", () => {
    const shopCtx = buildContext(validateAnswers(shopAnswers).cleaned, NOW);
    const freeCtx = buildContext(validateAnswers(freelancerAnswers).cleaned, NOW);
    for (const t of DEMO_TEMPLATES) {
      expect(renderTemplate(t.content, shopCtx).missing).toEqual([]);
      expect(renderTemplate(t.content, freeCtx).missing).toEqual([]);
    }
  });

  it("adapta el aviso legal a una tienda online constituida como sociedad", () => {
    const ctx = buildContext(validateAnswers(shopAnswers).cleaned, NOW);
    const r = renderTemplate(tpl("aviso_legal"), ctx);
    expect(r.includedSections).toContain("contratacion");
    expect(r.includedSections).not.toContain("profesion-regulada");
    const text = JSON.stringify(r.document);
    expect(text).toContain("Datos registrales: Registro Mercantil de Madrid");
    expect(text).toContain("Nombre comercial: Barro & Co");
  });

  it("adapta la privacidad a quien no recoge datos", () => {
    const ctx = buildContext(validateAnswers(freelancerAnswers).cleaned, NOW);
    const r = renderTemplate(tpl("privacidad"), ctx);
    expect(r.includedSections).toContain("sin-recogida");
    expect(r.includedSections).not.toContain("finalidades");
    expect(r.includedSections).not.toContain("transferencias");
  });

  it("construye la tabla de finalidades y la de cookies según las respuestas", () => {
    const ctx = buildContext(validateAnswers(shopAnswers).cleaned, NOW);
    const priv = renderTemplate(tpl("privacidad"), ctx);
    const finalidades = priv.document.sections.find((s) => s.id === "finalidades")!;
    const table = finalidades.blocks.find((b) => b.type === "table");
    expect(table && table.type === "table" && table.rows.length).toBe(4);
    expect(priv.includedSections).toContain("transferencias");

    const cookies = renderTemplate(tpl("cookies"), ctx);
    const names = JSON.stringify(cookies.document);
    for (const c of ["_ga", "_fbp", "YSC", "CookieYes"]) expect(names).toContain(c);
    expect(cookies.includedSections).toContain("consentimiento");
  });

  it("detecta variables obligatorias sin valor y no genera texto vacío", () => {
    const ctx = buildContext(validateAnswers({ ...shopAnswers, nif: "" }).cleaned, NOW);
    expect(renderTemplate(tpl("aviso_legal"), ctx).missing).toContain("owner.nif");
    expect(() => composeDocument(tpl("aviso_legal"), ctx, meta())).toThrow(DocumentGenerationError);
  });
});

describe("Salida HTML y PDF", () => {
  it("escapa el contenido introducido por el usuario", () => {
    const answers = { ...freelancerAnswers, legal_name: '<script>alert("x")</script>' };
    const { context } = prepareInput(answers, NOW);
    const out = composeDocument(tpl("aviso_legal"), context, meta());
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(richText('x" onmouseover="y')).not.toContain('" onmouseover');
  });

  it("marca los documentos de demostración", () => {
    const { context } = prepareInput(freelancerAnswers, NOW);
    const out = composeDocument(tpl("aviso_legal"), context, meta(true));
    expect(out.html).toContain("DOCUMENTO DE DEMOSTRACIÓN");
    expect(out.html).toContain('content="noindex"');
    const clean = renderHtmlDocument(out.render.document, meta(false));
    expect(clean).not.toContain("DEMOSTRACIÓN");
  });

  it("produce un hash estable del contenido", () => {
    const { context } = prepareInput(shopAnswers, NOW);
    const a = composeDocument(tpl("privacidad"), context, meta());
    const b = composeDocument(tpl("privacidad"), context, meta());
    expect(a.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("genera un PDF válido con caracteres no soportados por la fuente", async () => {
    const { context } = prepareInput({ ...shopAnswers, trade_name: "Barro 🏺 & Co — Ñandú" }, NOW);
    const out = composeDocument(tpl("cookies"), context, meta(true));
    const pdf = await renderPdf(out.render.document, { ...meta(true), ownerName: "Barro 🏺" });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });
});

describe("Acciones necesarias", () => {
  it("exige gestor de consentimiento y condiciones de venta cuando corresponde", () => {
    const ctx = buildContext(validateAnswers({ ...shopAnswers, has_cmp: false }).cleaned, NOW);
    const ids = computeRequirements(ctx).map((r) => r.id);
    expect(ids).toContain("install_cmp");
    expect(ids).toContain("terms_of_sale");
    expect(ids).toContain("newsletter_consent");
    const free = computeRequirements(buildContext(validateAnswers(freelancerAnswers).cleaned, NOW)).map((r) => r.id);
    expect(free).not.toContain("install_cmp");
    expect(free).not.toContain("terms_of_sale");
  });
});

describe("Seed de plantillas", () => {
  it("el archivo de seed está sincronizado con las plantillas del código", async () => {
    const { readFileSync } = await import("node:fs");
    const { buildTemplateSeedSql } = await import("@/lib/documents/seed-sql");
    const file = readFileSync(new URL("../../supabase/seed/templates.sql", import.meta.url), "utf8");
    expect(file).toBe(buildTemplateSeedSql());
  });
});
