import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Servidor HTTP que imita las partes de Google que usa RevisaYa (token OAuth,
 * userinfo, revocación y eventos de Calendar v3). SOLO para pruebas: la app
 * real habla con accounts.google.com / oauth2.googleapis.com / googleapis.com.
 */

export interface FakeEvent {
  id: string;
  summary: string;
  description: string;
  status: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string };
}

export class FakeGoogle {
  events = new Map<string, FakeEvent>();
  revoked: string[] = [];
  tokenRequests: Record<string, string>[] = [];
  /** Refresh tokens que Google ya no acepta (contraseña cambiada, acceso retirado). */
  deadRefreshTokens = new Set<string>();
  failNextEventCall = 0;
  private server!: Server;
  url = "";

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(({ status, body }) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()));
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; body?: unknown }> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://x");
    const auth = req.headers.authorization ?? "";

    if (url.pathname === "/token" && req.method === "POST") {
      const p = Object.fromEntries(new URLSearchParams(raw));
      this.tokenRequests.push(p);
      if (p.client_secret !== "secreto-de-prueba") return { status: 401, body: { error: "invalid_client" } };
      if (p.grant_type === "authorization_code") {
        if (p.code === "codigo-sin-permiso") return { status: 200, body: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "openid email" } };
        if (p.code !== "codigo-bueno") return { status: 400, body: { error: "invalid_grant" } };
        return { status: 200, body: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "openid https://www.googleapis.com/auth/calendar.events email" } };
      }
      if (p.grant_type === "refresh_token") {
        if (this.deadRefreshTokens.has(p.refresh_token)) return { status: 400, body: { error: "invalid_grant" } };
        return { status: 200, body: { access_token: `at-${Date.now()}`, expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events" } };
      }
    }
    if (url.pathname === "/v1/userinfo") return auth.startsWith("Bearer ") ? { status: 200, body: { email: "agenda@taller.test" } } : { status: 401 };
    if (url.pathname === "/revoke") {
      this.revoked.push(new URLSearchParams(raw).get("token") ?? "");
      return { status: 200, body: {} };
    }

    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (m) {
      if (!auth.startsWith("Bearer at-")) return { status: 401, body: { error: { status: "UNAUTHENTICATED" } } };
      if (this.failNextEventCall > 0) {
        this.failNextEventCall--;
        return { status: 503, body: { error: { status: "UNAVAILABLE" } } };
      }
      const id = m[2];
      if (req.method === "PUT" && id) {
        if (!this.events.has(id)) return { status: 404, body: { error: { status: "NOT_FOUND" } } };
        const e = { ...(JSON.parse(raw) as FakeEvent), id };
        this.events.set(id, e);
        return { status: 200, body: { ...e, etag: `"${Date.now()}"` } };
      }
      if (req.method === "POST" && !id) {
        const e = JSON.parse(raw) as FakeEvent;
        if (!/^[a-v0-9]{5,1024}$/.test(e.id)) return { status: 400, body: { error: { status: "INVALID_ARGUMENT" } } };
        if (this.events.has(e.id)) return { status: 409, body: { error: { status: "ALREADY_EXISTS" } } };
        this.events.set(e.id, e);
        return { status: 200, body: { ...e, etag: '"1"' } };
      }
      if (req.method === "DELETE" && id) {
        const existed = this.events.delete(id);
        return { status: existed ? 204 : 410 };
      }
    }
    return { status: 404, body: { error: { status: "NOT_FOUND" } } };
  }
}
