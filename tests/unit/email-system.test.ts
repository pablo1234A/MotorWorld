import { afterEach, describe, expect, it, vi } from "vitest";

import { renderPlatformEmail } from "@/lib/email/platform-email";
import { domainSchema, templateSchema } from "@/lib/validation/email";
import { DomainProviderError, getDomainProvider, mapDomainStatus, ResendDomainsAdapter } from "@/server/email/domains";
import { platformFrom } from "@/server/email/sender";
import { parseResendEvent, signWebhook, verifyWebhook } from "@/server/email/webhooks";

const SECRET = `whsec_${Buffer.from("clave-de-prueba-de-32-bytes!!!!!").toString("base64")}`;
const NOW = 1_800_000_000;

function signed(body: string, opts: { id?: string; ts?: number; secret?: string } = {}) {
  const id = opts.id ?? "msg_2abc";
  const ts = String(opts.ts ?? NOW);
  return { id, timestamp: ts, signature: `v1,${signWebhook(opts.secret ?? SECRET, id, ts, body)}` };
}

describe("firma de los webhooks (Svix)", () => {
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });

  it("acepta una firma correcta", () => {
    expect(verifyWebhook(body, signed(body), SECRET, NOW)).toEqual({ ok: true, id: "msg_2abc" });
  });

  it("acepta si una de varias firmas coincide (rotación del secreto)", () => {
    const h = signed(body);
    expect(verifyWebhook(body, { ...h, signature: `v1,AAAA ${h.signature}` }, SECRET, NOW).ok).toBe(true);
  });

  it("rechaza cuerpo alterado, otro secreto, cabeceras ausentes y marcas antiguas", () => {
    const h = signed(body);
    expect(verifyWebhook(body.replace("delivered", "bounced"), h, SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyWebhook(body, signed(body, { secret: `whsec_${Buffer.from("otra").toString("base64")}` }), SECRET, NOW).ok).toBe(false);
    expect(verifyWebhook(body, { ...h, id: "msg_otro" }, SECRET, NOW).ok).toBe(false);
    expect(verifyWebhook(body, { ...h, signature: null }, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyWebhook(body, { ...h, timestamp: "no-numero" }, SECRET, NOW)).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyWebhook(body, signed(body, { ts: NOW - 301 }), SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    expect(verifyWebhook(body, { ...h, signature: h.signature.replace("v1,", "v2,") }, SECRET, NOW).ok).toBe(false);
  });
});

describe("eventos de Resend", () => {
  it("extrae solo lo necesario", () => {
    expect(parseResendEvent({ type: "email.delivered", created_at: "2026-11-07T10:00:00.000Z", data: { email_id: "e1", to: ["x@y.z"] } })).toEqual({
      type: "delivered",
      messageId: "e1",
      occurredAt: new Date("2026-11-07T10:00:00.000Z"),
      bounceType: null,
    });
  });

  it("tipos de rebote", () => {
    const b = (type?: string) => parseResendEvent({ type: "email.bounced", data: { email_id: "e1", bounce: type ? { type } : undefined } })?.bounceType;
    expect(b("Permanent")).toBe("hard");
    expect(b("Transient")).toBe("soft");
    expect(b("Undetermined")).toBe("undetermined");
    expect(b()).toBe("undetermined");
  });

  it("ignora lo que no es un evento de correo válido", () => {
    expect(parseResendEvent(null)).toBeNull();
    expect(parseResendEvent({ type: "contact.created", data: { email_id: "e1" } })).toBeNull();
    expect(parseResendEvent({ type: "email.delivered", data: {} })).toBeNull();
    expect(parseResendEvent({ type: "email.delivered", data: { email_id: "x".repeat(201) } })).toBeNull();
    expect(parseResendEvent({ type: "email.delivered", created_at: "basura", data: { email_id: "e1" } })?.occurredAt).toBeInstanceOf(Date);
  });
});

describe("validación de plantillas", () => {
  const ok = { kind: "reminder_service_date", subject: "Revisión de tu {modelo}", body: "Hola {nombre}", buttonLabel: "Pedir cita", buttonEnabled: "on" };

  it("acepta las variables conocidas", () => {
    expect(templateSchema.parse(ok)).toMatchObject({ buttonEnabled: true, subject: "Revisión de tu {modelo}" });
  });

  it("rechaza variables desconocidas, asuntos multilínea y textos vacíos", () => {
    const r = templateSchema.safeParse({ ...ok, body: "Hola {nombre}, te costará {precio}" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("{precio}");
    expect(templateSchema.safeParse({ ...ok, subject: "Hola\nBcc: x@y.z" }).success).toBe(false);
    expect(templateSchema.safeParse({ ...ok, body: "   " }).success).toBe(false);
    expect(templateSchema.safeParse({ ...ok, kind: "factura" }).success).toBe(false);
    // Desde la Fase 7 los correos de citas también son editables (con sus variables).
    expect(templateSchema.safeParse({ ...ok, kind: "booking_confirmed" }).success).toBe(true);
    expect(templateSchema.safeParse({ ...ok, buttonLabel: "x".repeat(41) }).success).toBe(false);
  });
});

describe("dominio propio", () => {
  it("normaliza y valida el dominio", () => {
    expect(domainSchema.parse({ domain: " TallerSur.ES ", fromLocalPart: "Avisos" })).toEqual({ domain: "tallersur.es", fromLocalPart: "avisos" });
    expect(domainSchema.parse({ domain: "correo.tallersur.es" }).fromLocalPart).toBe("avisos");
    expect(domainSchema.safeParse({ domain: "https://tallersur.es" }).success).toBe(false);
    expect(domainSchema.safeParse({ domain: "tallersur" }).success).toBe(false);
    expect(domainSchema.safeParse({ domain: "gmail.com" }).error?.issues[0].message).toContain("gratuito");
    expect(domainSchema.safeParse({ domain: "tallersur.es", fromLocalPart: "avisos@x" }).success).toBe(false);
  });

  it("estados del proveedor", () => {
    expect(mapDomainStatus("verified")).toBe("verified");
    expect(mapDomainStatus("not_started")).toBe("pending");
    expect(mapDomainStatus("temporary_failure")).toBe("temporary_failure");
    expect(mapDomainStatus("failed")).toBe("failed");
  });

  it("solo con Resend configurado", () => {
    expect(getDomainProvider({})).toBeNull();
    expect(getDomainProvider({ EMAIL_PROVIDER: "smtp", SMTP_URL: "smtp://x:1", RESEND_API_KEY: "re_x" })).toBeNull();
    expect(getDomainProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" })?.name).toBe("resend");
  });
});

describe("adaptador de dominios de Resend", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("crea el dominio en la región UE y devuelve los registros DNS", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "d_1",
        name: "tallersur.es",
        status: "not_started",
        records: [{ record: "SPF", type: "TXT", name: "send", value: "v=spf1 include:amazonses.com ~all", ttl: "Auto", status: "not_started" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const d = await new ResendDomainsAdapter("re_test", "https://resend.test").create("tallersur.es");
    expect(d).toMatchObject({ id: "d_1", status: "pending", records: [{ type: "TXT", name: "send", priority: null }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://resend.test/domains");
    expect(JSON.parse(String(init.body))).toEqual({ name: "tallersur.es", region: "eu-west-1" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
  });

  it("errores del proveedor con su estado y sin direcciones", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Invalid domain for a@b.com" }, { status: 422 })));
    const err = await new ResendDomainsAdapter("re_test", "https://resend.test").get("d_1").catch((e) => e);
    expect(err).toBeInstanceOf(DomainProviderError);
    expect(err).toMatchObject({ status: 422, message: "Invalid domain for [email]" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNRESET"))));
    await expect(new ResendDomainsAdapter("re_test", "https://resend.test").verify("d_1")).rejects.toMatchObject({ status: 503 });
  });
});

describe("correos de la plataforma", () => {
  it("escapa el contenido", () => {
    const r = renderPlatformEmail({ title: "Resumen <b>", intro: "Taller & <script>", rows: [["Enviados", "3"]], link: { href: "https://app.test/x?a=1&b=2", label: "Ver" } });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("Taller &amp; &lt;script&gt;");
    expect(r.html).toContain('href="https://app.test/x?a=1&amp;b=2"');
    expect(r.text).toContain("Enviados: 3");
  });

  it("el remitente de la plataforma no puede coincidir con el de un taller", () => {
    const { address } = platformFrom({ sharedDomain: "avisos.test", appUrl: "https://app.test", linkSecret: "x".repeat(32) });
    // Los slugs solo admiten [a-z0-9-]: "no_reply" nunca es un slug válido.
    expect(address).toBe("no_reply@avisos.test");
    expect(/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/.test(address.split("@")[0])).toBe(false);
  });
});
