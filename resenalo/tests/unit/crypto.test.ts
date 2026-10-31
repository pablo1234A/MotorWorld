import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/server/crypto";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/server/auth/password";

describe("cifrado de secretos", () => {
  it("AES-256-GCM: cifra, descifra y detecta manipulación", () => {
    const c = encrypt("refresh-token-secreto");
    expect(c).not.toContain("refresh-token");
    expect(decrypt(c)).toBe("refresh-token-secreto");
    const parts = c.split(".");
    parts[3] = Buffer.from("manipulado").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("Argon2id para contraseñas", async () => {
    const h = await hashPassword("ClaveSegura123");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "ClaveSegura123")).toBe(true);
    expect(await verifyPassword(h, "otra")).toBe(false);
  });
  it("política de contraseñas", () => {
    expect(passwordPolicyError("corta1")).toBeTruthy();
    expect(passwordPolicyError("soloLetrasLargas")).toBeTruthy();
    expect(passwordPolicyError("ClaveSegura123")).toBeNull();
  });
});
