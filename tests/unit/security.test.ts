import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/config/env";
import { estimateMargin, isUuid, slugify } from "@/lib/utils";
import { detectImage, looksLikeText, safeFilename } from "@/server/security/files";
import { sanitizeDescription } from "@/server/services/listings";
import { sanitizeSearch } from "@/server/services/products";
import { sanitizeLine, sanitizeText } from "@/domain/text";

describe("saneamiento de contenido (XSS)", () => {
  it("elimina etiquetas y scripts del texto", () => {
    expect(sanitizeText('<script>alert("x")</script>Hola <b>mundo</b>')).toBe("Hola mundo");
    expect(sanitizeLine("<img src=x onerror=alert(1)>Título\n\nlargo")).toBe("Título largo");
    expect(sanitizeText("a\u0000b\u0007c")).toBe("abc");
  });

  it("solo permite HTML básico y sin atributos en descripciones", () => {
    const dirty = '<p onclick="x()">Hola</p><ul><li>Uno</li></ul><a href="javascript:alert(1)">clic</a><iframe src="x"></iframe><script>alert(1)</script><STRONG>ok</STRONG>';
    const clean = sanitizeDescription(dirty);
    expect(clean).toBe("<p>Hola</p><ul><li>Uno</li></ul>clic<strong>ok</strong>");
    expect(sanitizeDescription("<P CLASS=x>a<br/>b</P>")).toBe("<p>a<br>b</p>");
  });
});

describe("búsquedas (inyección en filtros)", () => {
  it("neutraliza caracteres especiales de PostgREST y LIKE", () => {
    expect(sanitizeSearch("a,name.eq.x)%_*")).toBe("a name.eq.x");
    expect(sanitizeSearch("'; DROP TABLE products;--")).toBe("; DROP TABLE products;--");
  });
});

describe("archivos", () => {
  it("detecta el tipo real por sus bytes", () => {
    expect(detectImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(detectImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.mime).toBe("image/webp");
    // Un SVG o un HTML disfrazado de .jpg se rechaza.
    expect(detectImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("limpia nombres de archivo", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename('C:\\fotos\\a<b>"c".jpg')).toBe("abc.jpg");
    expect(safeFilename("")).toBe("archivo");
  });

  it("distingue texto de binario", () => {
    expect(looksLikeText(new TextEncoder().encode("nombre;precio\nSofá;10"))).toBe(true);
    expect(looksLikeText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]))).toBe(false);
  });
});

describe("configuración de entorno", () => {
  const base = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40) };

  it("acepta el modo gratuito sin claves de Stripe", () => {
    const result = parseEnv({ ...base, PAYMENTS_ENABLED: "false" });
    expect(result.success).toBe(true);
    expect(result.data?.PAYMENTS_ENABLED).toBe(false);
    expect(result.data?.AI_PROVIDER).toBe("template");
  });

  it("exige Stripe completo al activar pagos", () => {
    const result = parseEnv({ ...base, PAYMENTS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_x" });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toContain("STRIPE_WEBHOOK_SECRET");
    expect(paths).toContain("STRIPE_PRICE_PRO");
    expect(paths).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("exige la clave del proveedor de IA al activarlo", () => {
    expect(parseEnv({ ...base, AI_PROVIDER: "anthropic" }).success).toBe(false);
    expect(parseEnv({ ...base, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).success).toBe(true);
  });

  it("rechaza URLs no válidas y falta de claves", () => {
    expect(parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "no-es-url" }).success).toBe(false);
  });
});

describe("utilidades", () => {
  it("calcula el margen", () => {
    expect(estimateMargin(100, 60)).toEqual({ amount: 40, percent: 40 });
    expect(estimateMargin(100, null)).toBeNull();
    expect(estimateMargin(0, 10)).toEqual({ amount: -10, percent: null });
  });
  it("valida UUID y genera slugs", () => {
    expect(isUuid("6f9619ff-8b86-4011-b42d-00c04fc964ff")).toBe(true);
    expect(isUuid("1 OR 1=1")).toBe(false);
    expect(slugify("Instrumentos Músicales & Más")).toBe("instrumentos-musicales-mas");
  });
});
