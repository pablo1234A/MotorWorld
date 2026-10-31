/**
 * Servicios locales para las pruebas E2E:
 *  - SMTP (puerto 2527): recibe los correos del sistema (verificación, recuperación…).
 *  - HTTP (puerto 4010): reproduce los endpoints de Google OAuth + Gmail API en el borde HTTP,
 *    para ejercitar el código real de Reseñalo sin credenciales de Google. Registra cada
 *    mensaje MIME "enviado" para poder comprobar su contenido.
 * Estado consultable en GET /__state y modificable con POST /__mode.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const dir = path.join(__dirname, ".artifacts");
fs.mkdirSync(dir, { recursive: true });
const systemMail: { to: string; subject: string; text: string }[] = [];
const gmailSent: { raw: string; at: string }[] = [];
let mode: { refresh?: "invalid_grant" } = {};

new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, _s, cb) {
    simpleParser(stream).then((m) => {
      systemMail.push({ to: (m.to as { text: string }).text, subject: m.subject ?? "", text: m.text ?? "" });
      cb();
    }, cb);
  },
}).listen(2527, "127.0.0.1");

http
  .createServer((rq, rs) => {
    let body = "";
    rq.on("data", (c) => (body += c));
    rq.on("end", () => {
      const json = (st: number, j: unknown) => {
        rs.writeHead(st, { "content-type": "application/json" });
        rs.end(JSON.stringify(j));
      };
      const u = rq.url ?? "";
      if (u === "/__state") return json(200, { systemMail, gmailSent, mode });
      if (u === "/__mode") {
        mode = JSON.parse(body || "{}");
        return json(200, mode);
      }
      if (u === "/__reset") {
        systemMail.length = 0;
        gmailSent.length = 0;
        mode = {};
        return json(200, {});
      }
      if (u === "/google/token") {
        const p = new URLSearchParams(body);
        if (p.get("grant_type") === "refresh_token" && mode.refresh === "invalid_grant") return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        return json(200, { access_token: `ya29.${Date.now()}`, expires_in: 3599, refresh_token: "1//e2e-refresh", scope: "openid email https://www.googleapis.com/auth/gmail.send" });
      }
      if (u === "/google/userinfo") return json(200, { email: "negocio.e2e@gmail.com", email_verified: true, name: "Negocio E2E" });
      if (u === "/gmail/gmail/v1/users/me/messages/send") {
        if (!/^Bearer ya29\./.test(rq.headers.authorization ?? "")) return json(401, { error: { code: 401, message: "Invalid Credentials" } });
        const raw = Buffer.from(JSON.parse(body).raw, "base64url").toString("utf8");
        gmailSent.push({ raw, at: new Date().toISOString() });
        return json(200, { id: `e2e-${gmailSent.length}`, threadId: "t", labelIds: ["SENT"] });
      }
      json(404, { error: "not found" });
    });
  })
  .listen(4010, "127.0.0.1", () => console.log("mock services ready"));
