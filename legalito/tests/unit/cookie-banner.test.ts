import { describe, expect, it } from "vitest";
import { buildBannerSnippet, bannerVersion, categoriesFromCookieList, normalizeOptions } from "@/lib/cookie-banner";
import { prepareInput } from "@/lib/documents/compose";
import { freelancerAnswers, shopAnswers } from "@/lib/documents/samples";

const base = {
  siteName: "Cerámicas Ficticias",
  policyUrl: "https://ceramicas.example/politica-de-cookies",
  color: "#1F3A5F",
  position: "bar" as const,
  version: "v1-test",
};

describe("Banner de cookies", () => {
  it("deduce las categorías que requieren consentimiento a partir de las respuestas", () => {
    const shop = categoriesFromCookieList(prepareInput(shopAnswers).context.cookies.list);
    expect(shop.map((c) => c.id)).toEqual(["preferencias", "analitica", "publicitaria"]);
    expect(shop.find((c) => c.id === "publicitaria")!.providers).toContain("Meta");
    // Analítica sin cookies (Plausible), sin publicidad ni contenidos: nada que consentir.
    expect(categoriesFromCookieList(prepareInput(freelancerAnswers).context.cookies.list)).toEqual([]);
  });

  it("la versión cambia solo si cambian las categorías", () => {
    expect(bannerVersion([{ id: "analitica" }, { id: "publicitaria" }])).toBe(bannerVersion([{ id: "publicitaria" }, { id: "analitica" }]));
    expect(bannerVersion([{ id: "analitica" }])).not.toBe(bannerVersion([{ id: "analitica" }, { id: "publicitaria" }]));
  });

  it("rechazar está al mismo nivel que aceptar y se puede reabrir la configuración", () => {
    const cats = categoriesFromCookieList(prepareInput(shopAnswers).context.cookies.list);
    const s = buildBannerSnippet({ ...base, categories: cats });
    // Mismo estilo para rechazar y aceptar (ninguno de los dos es secundario).
    expect(s).toContain('<button type="button" data-a="reject">Rechazar</button>');
    expect(s).toContain('<button type="button" data-a="accept">Aceptar</button>');
    expect(s).toContain('<button type="button" data-a="reject">Rechazar todas</button>');
    expect(s).toContain("data-cookie-settings");
    expect(s).toContain("\"purposes\":\"preferencias y contenidos integrados, analítica y publicidad\"");
    expect(s).toContain("con fines de ");
    expect(s).not.toMatch(/legalito/i); // marca blanca para agencias
  });

  it("neutraliza contenido malicioso en la configuración", () => {
    const s = buildBannerSnippet({
      ...base,
      siteName: '</script><script>alert(1)</script>',
      policyUrl: "javascript:alert(1)",
      color: "red;}</style><script>",
      categories: categoriesFromCookieList([{ kind: "Analítica", provider: "X" }]),
    });
    expect(s.match(/<\/script>/g)).toHaveLength(1); // solo el cierre propio
    expect(s).not.toContain("javascript:");
    expect(s).toContain('"color":"#1F3A5F"');
    expect(normalizeOptions({ ...base, categories: [], policyUrl: "/cookies" }).policyUrl).toBe("/cookies");
  });
});
