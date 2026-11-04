import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/server/env";

const base = {
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};

describe("validación del entorno", () => {
  it("acepta una configuración mínima local con Stripe en TEST", () => {
    const env = parseServerEnv({ ...base, STRIPE_SECRET_KEY: "sk_test_123" });
    expect(env.APP_ENV).toBe("local");
    expect(env.PAYMENTS_LIVE_ENABLED).toBe(false);
  });

  it("bloquea claves LIVE de Stripe si los pagos reales no están autorizados", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production", STRIPE_SECRET_KEY: "sk_live_123" })).toThrow(
      /Clave LIVE de Stripe bloqueada/,
    );
  });

  it("no permite activar pagos reales fuera de producción", () => {
    expect(() =>
      parseServerEnv({ ...base, APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_live_123", PAYMENTS_LIVE_ENABLED: "true" }),
    ).toThrow(/solo se pueden activar en producción/);
  });

  it("activar LIVE exige una clave live", () => {
    expect(() =>
      parseServerEnv({ ...base, APP_ENV: "production", STRIPE_SECRET_KEY: "sk_test_1", PAYMENTS_LIVE_ENABLED: "true" }),
    ).toThrow(/exige una clave sk_live_/);
  });

  it("los errores nunca incluyen el valor de los secretos", () => {
    try {
      parseServerEnv({ ...base, DATABASE_URL: "mysql://usuario:CONTRASENA_SECRETA@host/db" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).toContain("DATABASE_URL");
      expect(String(e)).not.toContain("CONTRASENA_SECRETA");
    }
  });

  it("valida la longitud de la clave de cifrado de integraciones", () => {
    expect(() => parseServerEnv({ ...base, INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(
      /32 bytes/,
    );
    expect(parseServerEnv({ ...base, INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") })).toBeTruthy();
  });
});
