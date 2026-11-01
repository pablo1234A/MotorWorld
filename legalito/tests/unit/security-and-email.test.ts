import { afterEach, describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";
import { maskEmail, maskTaxId } from "@/lib/mask";
import { renderEmail, type EmailTemplate } from "@/lib/email/templates";
import { env, resetEnvCache, stripeMode, demoTemplatesAllowed } from "@/lib/env";
import { DEFAULT_FAQS } from "@/content/faqs";
import { readFileSync } from "node:fs";

describe("Redirecciones seguras", () => {
  it("solo permite rutas internas", () => {
    expect(safeNextPath("/panel/documentos")).toBe("/panel/documentos");
    expect(safeNextPath("https://evil.example")).toBe("/panel");
    expect(safeNextPath("//evil.example")).toBe("/panel");
    expect(safeNextPath("/\\evil.example")).toBe("/panel");
    expect(safeNextPath("/a\r\nSet-Cookie: x")).toBe("/panel");
    expect(safeNextPath(undefined)).toBe("/panel");
  });
});

describe("Minimización de datos en administración", () => {
  it("enmascara emails y NIF", () => {
    expect(maskEmail("lucia@ejemplo.es")).toBe("lu***@ejemplo.es");
    expect(maskTaxId("12345678Z")).toBe("*****678Z");
  });
});

describe("Configuración de entorno", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCache();
  };

  it("impide plantillas de demostración en producción", () => {
    set({ APP_ENV: "production", ALLOW_DEMO_TEMPLATES: "true", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40), HASH_SALT: "c".repeat(32) });
    expect(() => env()).toThrow(/ALLOW_DEMO_TEMPLATES/);
  });

  it("exige los secretos obligatorios en producción", () => {
    set({ APP_ENV: "production", ALLOW_DEMO_TEMPLATES: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(() => env()).toThrow(/Faltan variables/);
  });

  it("no acepta claves LIVE de Stripe fuera de producción", () => {
    set({ APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_live_123" });
    expect(() => env()).toThrow(/LIVE/);
  });

  it("los cobros reales requieren autorización expresa", () => {
    const base = { APP_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40), HASH_SALT: "c".repeat(32), ALLOW_DEMO_TEMPLATES: "false", STRIPE_SECRET_KEY: "sk_live_123" };
    set({ ...base, STRIPE_LIVE_PAYMENTS_ENABLED: undefined });
    expect(stripeMode()).toBe("disabled");
    set({ ...base, STRIPE_LIVE_PAYMENTS_ENABLED: "true" });
    expect(stripeMode()).toBe("live");
    set({ APP_ENV: "development", STRIPE_SECRET_KEY: "sk_test_1", ALLOW_DEMO_TEMPLATES: "true" });
    expect(stripeMode()).toBe("test");
    expect(demoTemplatesAllowed()).toBe(true);
  });
});

describe("Emails", () => {
  const all: EmailTemplate[] = [
    { template: "welcome", data: { name: "<b>Ana</b>" } },
    { template: "purchase_confirmed", data: { productName: "Pago único", amount: "39,00 €" } },
    { template: "subscription_activated", data: { productName: "Suscripción", amount: "9,99 €" } },
    { template: "subscription_cancel_scheduled", data: { endDate: "1 de diciembre de 2026" } },
    { template: "subscription_ended", data: {} },
    { template: "renewal_reminder", data: { date: "1 de diciembre de 2026", amount: "9,99 €" } },
    { template: "payment_failed", data: { amount: "9,99 €", attempt: 2, nextAttempt: "3 de diciembre de 2026" } },
    { template: "documents_ready", data: { documents: ["Aviso legal"], isDemo: true } },
    { template: "legal_update", data: { title: "Nueva versión", summary: "Resumen" } },
    { template: "support_received", data: { subject: "Duda" } },
    { template: "support_notification", data: { subject: "Duda", from: "a@b.es", message: "Hola" } },
  ];

  it("todas las plantillas generan asunto, HTML y texto con la marca", () => {
    for (const t of all) {
      const e = renderEmail(t, "https://legalito.example");
      expect(e.subject.length).toBeGreaterThan(5);
      expect(e.html).toContain("Legalito");
      expect(e.html).toContain("#1F3A5F");
      expect(e.text.length).toBeGreaterThan(20);
    }
  });

  it("escapa los datos introducidos por usuarios", () => {
    const e = renderEmail(all[0], "https://legalito.example");
    expect(e.html).not.toContain("<b>Ana</b>");
    expect(e.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });

  it("avisa de que los documentos demo no tienen validez", () => {
    expect(renderEmail(all[7], "https://x").text).toMatch(/no tienen validez/);
  });
});

describe("Contenido", () => {
  it("las FAQ por defecto coinciden con las del seed de base de datos", () => {
    const seed = readFileSync(new URL("../../supabase/seed/base.sql", import.meta.url), "utf8");
    for (const f of DEFAULT_FAQS) expect(seed).toContain(f.question);
  });
});
