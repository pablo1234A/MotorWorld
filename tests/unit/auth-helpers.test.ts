import { describe, expect, it } from "vitest";

import { errorMessage } from "@/lib/error-messages";
import { slugify } from "@/lib/slug";
import { inviteSchema, passwordSchema, signUpSchema } from "@/lib/validation/auth";
import { safeNextPath } from "@/server/http/request";
import { redact } from "@/server/logger";
import { generateToken, hashToken, isWellFormedToken } from "@/server/security/tokens";

describe("safeNextPath (sin redirecciones abiertas)", () => {
  it.each([
    ["/app/usuarios", "/app/usuarios"],
    ["/invitacion/abc?x=1", "/invitacion/abc?x=1"],
    ["//evil.com", "/app"],
    ["/\\evil.com", "/app"],
    ["https://evil.com", "/app"],
    ["javascript:alert(1)", "/app"],
    ["/app\r\nSet-Cookie: x", "/app"],
    [undefined, "/app"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("política de contraseñas (igual que Supabase Auth)", () => {
  it.each(["corta1A", "sinmayusculas123", "SINMINUSCULAS123", "SinNumerosNunca"])("rechaza %s", (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(false);
  });
  it("acepta una contraseña válida", () => {
    expect(passwordSchema.safeParse("Taller2026Seguro").success).toBe(true);
  });
  it("el registro exige que coincidan y normaliza el email", () => {
    const r = signUpSchema.safeParse({ firstName: "A", lastName: "B", email: "  Laura@Correo.COM ", password: "Taller2026Seguro", passwordConfirm: "Taller2026Seguro", acceptTerms: "on" });
    expect(r.success && r.data.email).toBe("laura@correo.com");
    expect(signUpSchema.safeParse({ firstName: "A", lastName: "B", email: "a@b.es", password: "Taller2026Seguro", passwordConfirm: "x", acceptTerms: "on" }).success).toBe(false);
    // Sin aceptar los términos y la privacidad no hay registro (ADR-025).
    expect(signUpSchema.safeParse({ firstName: "A", lastName: "B", email: "a@b.es", password: "Taller2026Seguro", passwordConfirm: "Taller2026Seguro" }).success).toBe(false);
  });
});

describe("invitaciones", () => {
  it("un administrador no lleva permisos explícitos y 'todos los talleres' no lleva lista", () => {
    const r = inviteSchema.parse({ email: "a@b.es", role: "admin", permissions: ["customers.write"], branchScope: "all", branchIds: [crypto.randomUUID()] });
    expect(r.permissions).toEqual([]);
    expect(r.branchIds).toEqual([]);
  });
  it("alcance por talleres exige al menos uno y rechaza permisos inventados", () => {
    expect(inviteSchema.safeParse({ email: "a@b.es", role: "operator", branchScope: "selected" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.es", role: "operator", permissions: ["billing.manage"] }).success).toBe(false);
  });
  it("tokens de 256 bits y hash SHA-256", () => {
    const t = generateToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(hashToken(t)).toHaveLength(32);
    expect(generateToken()).not.toBe(t);
    expect(isWellFormedToken("../../etc/passwd")).toBe(false);
  });
});

describe("utilidades", () => {
  it("slugify", () => {
    expect(slugify("Talleres Núñez & Hijos, S.L.")).toBe("talleres-nunez-hijos-s-l");
    expect(slugify("AB")).toMatch(/^ab-[a-z0-9]+$/);
  });
  it("el logger redacta secretos y emails", () => {
    expect(redact({ password: "x", token: "y", nested: { email: "a@b.es", ok: 1 }, msg: "fallo para pepe@correo.es" })).toEqual({
      password: "[redactado]",
      token: "[redactado]",
      nested: { email: "[redactado]", ok: 1 },
      msg: "fallo para [email]",
    });
    expect(redact({ code: "plan_limit_reached" })).toEqual({ code: "plan_limit_reached" });
  });
  it("mensajes de error en español", () => {
    expect(errorMessage("plan_limit_reached", "users")).toBe("Has alcanzado el límite de usuarios de tu plan.");
    expect(errorMessage("invitation_invalid", "expired")).toContain("caducado");
    expect(errorMessage("algo_raro")).toContain("error inesperado");
  });
});
