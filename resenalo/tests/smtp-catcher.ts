import { SMTPServer } from "smtp-server";
import { simpleParser, type ParsedMail } from "mailparser";

/** Servidor SMTP local para pruebas: recibe de verdad los correos del sistema. */
export async function startSmtpCatcher(port: number) {
  const inbox: ParsedMail[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, _session, cb) {
      simpleParser(stream).then((m) => {
        inbox.push(m);
        cb();
      }, cb);
    },
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return {
    inbox,
    async waitFor(pred: (m: ParsedMail) => boolean, ms = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const m = inbox.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("correo no recibido");
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export const linkFrom = (m: ParsedMail, path: string) => {
  const re = new RegExp(`https?://[^\\s"<]+${path.replace(/[-/]/g, "\\$&")}\\?token=([A-Za-z0-9_%-]+)`);
  const match = (m.text ?? "").match(re);
  if (!match) throw new Error(`enlace ${path} no encontrado`);
  return decodeURIComponent(match[1]);
};
