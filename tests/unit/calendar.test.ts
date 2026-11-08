import { afterEach, describe, expect, it, vi } from "vitest";

import { open, seal } from "@/server/integrations/crypto";
import { authUrl, eventIdFor, GOOGLE_SCOPES } from "@/server/integrations/google";
import { parseServerEnv } from "@/server/env";
import { makeState, readState } from "@/server/modules/integrations/calendar";

const KEY = Buffer.alloc(32, 7).toString("base64");
const base = {
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

afterEach(() => vi.unstubAllEnvs());

describe("cifrado de los tokens (AES-256-GCM)", () => {
  it("cifra y descifra; con otra integración (AAD), otra clave o un byte cambiado, falla", () => {
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY);
    const s = seal("refresh-token-secreto", "integracion-a");
    expect(s.ciphertext.toString("utf8")).not.toContain("refresh-token");
    expect(s.nonce).toHaveLength(12);
    expect(s.authTag).toHaveLength(16);
    expect(open(s, "integracion-a")).toBe("refresh-token-secreto");
    expect(() => open(s, "integracion-b")).toThrow();
    const tampered = { ...s, ciphertext: Buffer.from(s.ciphertext) };
    tampered.ciphertext[0] ^= 1;
    expect(() => open(tampered, "integracion-a")).toThrow();
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(() => open(s, "integracion-a")).toThrow();
  });

  it("sin clave no se cifra nada", () => {
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "");
    expect(() => seal("x", "y")).toThrow("integrations_key_missing");
  });
});

describe("OAuth de Google", () => {
  it("el state va firmado, ligado al taller y al usuario, y caduca a los 10 minutos", () => {
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", KEY);
    const now = Date.now();
    const state = makeState(ORG, USER, now);
    expect(readState(state, now)).toEqual({ orgId: ORG, userId: USER });
    expect(readState(state, now + 11 * 60_000)).toBeNull();
    // Cambiar el taller invalida la firma (no se puede conectar la agenda a otro taller).
    expect(readState(state.replace(ORG, "33333333-3333-4333-8333-333333333333"), now)).toBeNull();
    expect(readState(`${state}x`, now)).toBeNull();
    expect(readState("basura", now)).toBeNull();
  });

  it("pide solo los permisos mínimos, acceso offline y el state", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente.apps.googleusercontent.com");
    const u = new URL(authUrl("estado", "https://revisaya.test/api/integrations/google/callback"));
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(GOOGLE_SCOPES).toEqual(["openid", "email", "https://www.googleapis.com/auth/calendar.events"]);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("state")).toBe("estado");
    expect(u.searchParams.get("redirect_uri")).toBe("https://revisaya.test/api/integrations/google/callback");
  });

  it("el id del evento es determinista y válido para Google (base32hex)", () => {
    const id = eventIdFor("0b5e7c1a-2f3d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventIdFor("0b5e7c1a-2f3d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(id);
  });

  it("las URLs de prueba de Google están prohibidas en producción y Google exige la clave de cifrado", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production", GOOGLE_API_BASE: "http://127.0.0.1:9" })).toThrow("GOOGLE_API_BASE");
    expect(() => parseServerEnv({ ...base, GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toThrow("INTEGRATIONS_ENCRYPTION_KEY");
    expect(() => parseServerEnv({ ...base, GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", INTEGRATIONS_ENCRYPTION_KEY: KEY })).not.toThrow();
  });
});
