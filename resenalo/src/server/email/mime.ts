import MailComposer from "nodemailer/lib/mail-composer";
import { sanitizeHeader } from "@/lib/template";

export type MimeInput = {
  from: { name: string; address: string };
  to: { name: string; address: string };
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  unsubscribeUrl?: string;
  headers?: Record<string, string>;
};

/** Construye un mensaje RFC 5322 (multipart/alternative, UTF-8). */
export async function buildMime(m: MimeInput): Promise<Buffer> {
  const headers: Record<string, string> = { ...(m.headers ?? {}) };
  if (m.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${m.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const composer = new MailComposer({
    from: { name: sanitizeHeader(m.from.name), address: m.from.address },
    to: { name: sanitizeHeader(m.to.name), address: m.to.address },
    replyTo: m.replyTo || undefined,
    subject: sanitizeHeader(m.subject),
    text: m.text,
    html: m.html,
    messageId: m.messageId,
    headers,
    textEncoding: "quoted-printable",
  });
  return new Promise((resolve, reject) => composer.compile().build((err, msg) => (err ? reject(err) : resolve(msg))));
}
