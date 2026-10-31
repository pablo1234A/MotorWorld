import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { resetEnvCache } from "@/server/env";
import { resetSystemMailer } from "@/server/email/system-mailer";
import { POST as registerRoute } from "@/app/api/v1/auth/register/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { POST as verifyRoute } from "@/app/api/v1/auth/verify-email/route";
import { POST as forgotRoute } from "@/app/api/v1/auth/forgot-password/route";
import { POST as resetRoute } from "@/app/api/v1/auth/reset-password/route";
import { POST as createBusinessRoute } from "@/app/api/v1/business/route";
import { ctx, req, resetDb } from "../helpers";
import { linkFrom, startSmtpCatcher } from "../smtp-catcher";

let smtp: Awaited<ReturnType<typeof startSmtpCatcher>>;
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

beforeAll(async () => {
  smtp = await startSmtpCatcher(2526);
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2526", SMTP_SECURE: "false" });
  resetEnvCache();
  resetSystemMailer();
});
afterAll(async () => {
  delete process.env.SMTP_HOST;
  resetEnvCache();
  await smtp.close();
  redis().disconnect();
});
beforeEach(async () => {
  await resetDb();
  smtp.inbox.length = 0;
});

const EMAIL = "propietaria@peluqueria-prueba.es";
const PASS = "MiClaveSegura2026";

describe("autenticación completa", () => {
  it("registro → verificación por email → logout → login → la cuenta persiste", async () => {
    const r = await registerRoute(req("/api/v1/auth/register", { method: "POST", json: { name: "Ana García", email: EMAIL, password: PASS, acceptTerms: true } }), ctx());
    expect(r.status).toBe(201);
    const cookie1 = cookieOf(r);
    expect(cookie1).toMatch(/^rsn_session=/);
    expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(r.headers.get("set-cookie")).toMatch(/SameSite=Lax/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.passwordHash).not.toContain(PASS);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);

    // Sin verificar no puede crear el negocio
    const blocked = await createBusinessRoute(req("/api/v1/business", { method: "POST", cookie: cookie1, json: { name: "Pelu", acceptDpa: true } }), ctx());
    expect(blocked.status).toBe(403);

    // El correo de verificación llega por SMTP real
    const mail = await smtp.waitFor((m) => m.subject?.includes("Confirma tu correo") ?? false);
    expect((mail.to as { text: string }).text).toContain(EMAIL);
    const token = linkFrom(mail, "/verificar-email");
    expect((await verifyRoute(req("/api/v1/auth/verify-email", { method: "POST", json: { token } }), ctx())).status).toBe(200);
    expect((await verifyRoute(req("/api/v1/auth/verify-email", { method: "POST", json: { token } }), ctx())).status).toBe(400); // un solo uso

    const me = await (await meRoute(req("/api/v1/auth/me", { cookie: cookie1 }), ctx())).json();
    expect(me.user.emailVerified).toBe(true);

    // Logout invalida la sesión
    await logoutRoute(req("/api/v1/auth/logout", { method: "POST", cookie: cookie1 }), ctx());
    expect((await meRoute(req("/api/v1/auth/me", { cookie: cookie1 }), ctx())).status).toBe(401);

    // Login de nuevo
    const bad = await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL, password: "Incorrecta123" } }), ctx());
    expect(bad.status).toBe(401);
    const unknown = await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: "nadie@x.es", password: "Incorrecta123" } }), ctx());
    expect((await unknown.json()).error.message).toBe((await bad.json()).error.message); // no revela si existe
    const ok = await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL.toUpperCase(), password: PASS } }), ctx());
    expect(ok.status).toBe(200);
    const me2 = await (await meRoute(req("/api/v1/auth/me", { cookie: cookieOf(ok) }), ctx())).json();
    expect(me2.user.email).toBe(EMAIL);

    // No se puede registrar dos veces
    const again = await registerRoute(req("/api/v1/auth/register", { method: "POST", json: { name: "Ana", email: EMAIL, password: PASS, acceptTerms: true } }), ctx());
    expect(again.status).toBe(409);
  });

  it("recuperación y restablecimiento de contraseña (invalida sesiones previas)", async () => {
    const r = await registerRoute(req("/api/v1/auth/register", { method: "POST", json: { name: "Luis", email: EMAIL, password: PASS, acceptTerms: true } }), ctx());
    const oldCookie = cookieOf(r);
    expect((await forgotRoute(req("/api/v1/auth/forgot-password", { method: "POST", json: { email: EMAIL } }), ctx())).status).toBe(200);
    expect((await forgotRoute(req("/api/v1/auth/forgot-password", { method: "POST", json: { email: "no-existe@x.es" } }), ctx())).status).toBe(200);
    const mail = await smtp.waitFor((m) => m.subject?.includes("Restablece") ?? false);
    const token = linkFrom(mail, "/restablecer-contrasena");
    const weak = await resetRoute(req("/api/v1/auth/reset-password", { method: "POST", json: { token, password: "corta" } }), ctx());
    expect(weak.status).toBe(422);
    const res = await resetRoute(req("/api/v1/auth/reset-password", { method: "POST", json: { token, password: "NuevaClave2026xx" } }), ctx());
    expect(res.status).toBe(200);
    expect((await resetRoute(req("/api/v1/auth/reset-password", { method: "POST", json: { token, password: "OtraClave2026xx" } }), ctx())).status).toBe(400);
    expect((await meRoute(req("/api/v1/auth/me", { cookie: oldCookie }), ctx())).status).toBe(401);
    expect((await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL, password: PASS } }), ctx())).status).toBe(401);
    expect((await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL, password: "NuevaClave2026xx" } }), ctx())).status).toBe(200);
    expect(smtp.inbox.filter((m) => m.subject?.includes("Restablece"))).toHaveLength(1); // nada para la cuenta inexistente
  });

  it("protección contra fuerza bruta: bloqueo de cuenta tras 5 fallos", async () => {
    await registerRoute(req("/api/v1/auth/register", { method: "POST", json: { name: "Eva", email: EMAIL, password: PASS, acceptTerms: true } }), ctx());
    for (let i = 0; i < 5; i++) await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL, password: `Mala${i}clave99` } }), ctx());
    const locked = await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: EMAIL, password: PASS } }), ctx());
    expect(locked.status).toBe(429);
    expect((await locked.json()).error.message).toMatch(/bloqueada/);
  });

  it("rate limiting por IP en login", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 31; i++)
      last = await loginRoute(req("/api/v1/auth/login", { method: "POST", json: { email: `x${i}@y.es`, password: "abcdefgh12" }, headers: { "x-forwarded-for": "9.9.9.9" } }), ctx());
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });

  it("valida la entrada del registro", async () => {
    const r = await registerRoute(req("/api/v1/auth/register", { method: "POST", json: { name: "A", email: "mal", password: "x", acceptTerms: false } }), ctx());
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.error.details.fields).toBeTruthy();
  });
});
