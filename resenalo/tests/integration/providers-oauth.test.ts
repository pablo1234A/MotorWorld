import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { resetEnvCache } from "@/server/env";
import { decrypt } from "@/server/crypto";
import { googleProvider } from "@/server/email/providers/google";
import { microsoftProvider } from "@/server/email/providers/microsoft";
import { clearProviderOverrides } from "@/server/email/providers";
import { POST as connectRoute } from "@/app/api/v1/email-connection/connect/route";
import { GET as callbackRoute } from "@/app/api/v1/email-connection/callback/[provider]/route";
import { POST as checkRoute } from "@/app/api/v1/email-connection/check/route";
import { DELETE as disconnectRoute } from "@/app/api/v1/email-connection/route";
import { ctx, makeTenant, req, resetDb } from "../helpers";

/**
 * Servidor HTTP local que reproduce los contratos de las APIs de Google y
 * Microsoft. Verifica que nuestras peticiones tienen el formato correcto y que
 * los errores del proveedor se clasifican bien. NO sustituye la prueba con
 * cuentas reales (ver docs/PRUEBAS.md).
 */
type Rec = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
const calls: Rec[] = [];
let mode: Record<string, number> = {};
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((rq, rs) => {
    let body = "";
    rq.on("data", (c) => (body += c));
    rq.on("end", () => {
      calls.push({ method: rq.method!, url: rq.url!, headers: rq.headers, body });
      const send = (status: number, json: unknown) => {
        rs.writeHead(status, { "content-type": "application/json" });
        rs.end(JSON.stringify(json));
      };
      const u = rq.url!;
      if (u === "/google/token") {
        const p = new URLSearchParams(body);
        if (p.get("grant_type") === "refresh_token" && mode.refresh === 400) return send(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        if (p.get("grant_type") === "authorization_code" && p.get("code") === "sin-permiso")
          return send(200, { access_token: "at", expires_in: 3599, refresh_token: "rt", scope: "openid email" });
        return send(200, { access_token: "ya29.access", expires_in: 3599, refresh_token: "1//refresh", scope: "openid https://www.googleapis.com/auth/gmail.send email" });
      }
      if (u === "/google/userinfo") return send(200, { email: "Tienda@Gmail.com", email_verified: true, name: "Tienda" });
      if (u === "/gmail/gmail/v1/users/me/messages/send") {
        if (mode.send) {
          const st = mode.send;
          if (st === 400) return send(400, { error: { code: 400, message: "Invalid To header", errors: [{ reason: "invalidArgument" }] } });
          if (st === 429) {
            rs.writeHead(429, { "content-type": "application/json", "retry-after": "120" });
            return rs.end(JSON.stringify({ error: { code: 429, message: "Rate", errors: [{ reason: "rateLimitExceeded" }] } }));
          }
          return send(st, { error: { code: st, message: "err" } });
        }
        return send(200, { id: "18c2f0a1b2c3", threadId: "18c2", labelIds: ["SENT"] });
      }
      if (u.startsWith("/ms/common/oauth2/v2.0/token"))
        return send(200, { access_token: "eyJ.ms", expires_in: 3600, refresh_token: "M.R3", scope: "openid email User.Read Mail.Send" });
      if (u.startsWith("/graph/v1.0/me?")) return send(200, { mail: "Oficina@Empresa.com", displayName: "Oficina" });
      if (u === "/graph/v1.0/me/sendMail") {
        if (mode.graph === 401) return send(401, { error: { code: "InvalidAuthenticationToken", message: "expired" } });
        rs.writeHead(202);
        return rs.end();
      }
      send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, {
    GOOGLE_OAUTH_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_GMAIL_API_URL: `${base}/gmail`,
    MICROSOFT_LOGIN_URL: `${base}/ms`,
    MICROSOFT_GRAPH_URL: `${base}/graph`,
  });
  resetEnvCache();
});
afterAll(async () => {
  for (const k of ["GOOGLE_OAUTH_TOKEN_URL", "GOOGLE_USERINFO_URL", "GOOGLE_GMAIL_API_URL", "MICROSOFT_LOGIN_URL", "MICROSOFT_GRAPH_URL"]) delete process.env[k];
  resetEnvCache();
  server.close();
  redis().disconnect();
});
beforeEach(async () => {
  await resetDb();
  clearProviderOverrides();
  calls.length = 0;
  mode = {};
});

describe("conexión OAuth de Gmail (flujo completo con PKCE)", () => {
  it("connect → URL de Google con state y PKCE → callback → cuenta conectada con tokens cifrados", async () => {
    const t = await makeTenant({ connected: false });
    const r = await connectRoute(req("/api/v1/email-connection/connect", { method: "POST", cookie: t.cookie, json: { provider: "GOOGLE" } }), ctx());
    const { url } = await r.json();
    const u = new URL(url);
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3999/api/v1/email-connection/callback/google");
    const state = u.searchParams.get("state")!;

    // Un state falso o de otro usuario se rechaza
    const forged = await callbackRoute(req(`/api/v1/email-connection/callback/google?code=x&state=falso`, { cookie: t.cookie }), ctx({ provider: "google" }));
    expect(forged.headers.get("location")).toContain("error=");
    expect(await prisma.emailConnection.count()).toBe(0);

    const cb = await callbackRoute(req(`/api/v1/email-connection/callback/google?code=codigo-ok&state=${state}`, { cookie: t.cookie }), ctx({ provider: "google" }));
    expect(cb.status).toBe(303);
    expect(cb.headers.get("location")).toContain("connected=1");
    const tokenCall = calls.find((c) => c.url === "/google/token")!;
    const form = new URLSearchParams(tokenCall.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code_verifier")!.length).toBeGreaterThan(40);

    const conn = await prisma.emailConnection.findUniqueOrThrow({ where: { businessId: t.business.id } });
    expect(conn.status).toBe("ACTIVE");
    expect(conn.emailAddress).toBe("tienda@gmail.com");
    expect(conn.accessTokenEnc).not.toContain("ya29");
    expect(conn.refreshTokenEnc).not.toContain("1//refresh");
    expect(decrypt(conn.refreshTokenEnc!)).toBe("1//refresh");
    // El state es de un solo uso
    const replay = await callbackRoute(req(`/api/v1/email-connection/callback/google?code=codigo-ok&state=${state}`, { cookie: t.cookie }), ctx({ provider: "google" }));
    expect(replay.headers.get("location")).toContain("error=");
  });

  it("no marca la cuenta como conectada si el usuario no concede el permiso de envío", async () => {
    const t = await makeTenant({ connected: false });
    const { url } = await (await connectRoute(req("/api/v1/email-connection/connect", { method: "POST", cookie: t.cookie, json: { provider: "GOOGLE" } }), ctx())).json();
    const state = new URL(url).searchParams.get("state")!;
    const cb = await callbackRoute(req(`/api/v1/email-connection/callback/google?code=sin-permiso&state=${state}`, { cookie: t.cookie }), ctx({ provider: "google" }));
    expect(decodeURIComponent(cb.headers.get("location")!)).toContain("permiso");
    expect(await prisma.emailConnection.count()).toBe(0);
  });

  it("comprobar conexión: token revocado (invalid_grant) → NEEDS_REAUTH; desconectar elimina tokens", async () => {
    const t = await makeTenant();
    mode.refresh = 400;
    const r = await (await checkRoute(req("/api/v1/email-connection/check", { method: "POST", cookie: t.cookie }), ctx())).json();
    expect(r.ok).toBe(false);
    expect(r.status).toBe("NEEDS_REAUTH");
    const d = await disconnectRoute(req("/api/v1/email-connection", { method: "DELETE", cookie: t.cookie }), ctx());
    expect(d.status).toBe(200);
    const conn = await prisma.emailConnection.findUniqueOrThrow({ where: { businessId: t.business.id } });
    expect(conn.status).toBe("DISCONNECTED");
    expect(conn.accessTokenEnc).toBeNull();
    expect(conn.refreshTokenEnc).toBeNull();
  });
});

describe("Gmail API — envío y clasificación de errores", () => {
  const mime = Buffer.from("From: a@b.es\r\nTo: c@d.es\r\nSubject: Hola\r\n\r\ncuerpo");
  it("envía raw en base64url con Bearer y devuelve el id del mensaje", async () => {
    const r = await googleProvider.send("ya29.token", mime);
    expect(r.providerMessageId).toBe("18c2f0a1b2c3");
    const c = calls.find((x) => x.url.endsWith("/messages/send"))!;
    expect(c.headers.authorization).toBe("Bearer ya29.token");
    expect(Buffer.from(JSON.parse(c.body).raw, "base64url").toString()).toBe(mime.toString());
  });
  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limit"],
    [503, "transient"],
    [400, "invalid_recipient"],
  ])("HTTP %i → %s", async (status, kind) => {
    mode.send = status;
    await expect(googleProvider.send("t", mime)).rejects.toMatchObject({ kind });
  });
  it("respeta Retry-After en 429", async () => {
    mode.send = 429;
    await expect(googleProvider.send("t", mime)).rejects.toMatchObject({ retryAfterSec: 120 });
  });
});

describe("Microsoft Graph — OAuth y envío MIME", () => {
  it("intercambio de código + perfil + envío (202)", async () => {
    const id = await microsoftProvider.exchangeCode({ code: "c", codeVerifier: "v".repeat(50), redirectUri: "http://localhost:3999/cb" });
    expect(id.email).toBe("oficina@empresa.com");
    expect(id.refreshToken).toBe("M.R3");
    const r = await microsoftProvider.send("eyJ.ms", Buffer.from("MIME"));
    expect(r.providerMessageId).toBeNull();
    const c = calls.find((x) => x.url === "/graph/v1.0/me/sendMail")!;
    expect(c.headers["content-type"]).toBe("text/plain");
    expect(Buffer.from(c.body, "base64").toString()).toBe("MIME");
  });
  it("token caducado → auth", async () => {
    mode.graph = 401;
    await expect(microsoftProvider.send("x", Buffer.from("M"))).rejects.toMatchObject({ kind: "auth" });
  });
});
