import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_TEMPLATES, escapeHtml, renderReminderEmail, unknownVariables, type ReminderEmailInput } from "@/lib/email/reminder-email";
import { unsubscribeToken, verifyUnsubscribeToken } from "@/server/email/links";
import { sanitizeProviderMessage, type OutboundEmail } from "@/server/email/port";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { ResendEmailAdapter } from "@/server/email/resend";
import { isAuthorizedJobRequest } from "@/server/jobs/auth";
import { backoffMs } from "@/server/reminders/dispatcher";

const base: ReminderEmailInput = {
  template: DEFAULT_TEMPLATES.reminder_service_date,
  customerFirstName: "Lucía",
  vehicleMake: "Seat",
  vehicleModel: "Ibiza",
  plate: "1234BCD",
  dueDate: "2026-12-04",
  workshop: { name: "Taller Pérez", brandColor: "#aa0000", phone: "600 000 000" },
  ctaHref: "mailto:taller@example.com",
  unsubscribeUrl: "https://app.test/baja/abc",
};

describe("renderReminderEmail", () => {
  it("rellena las variables de la plantilla original", () => {
    const r = renderReminderEmail(base);
    expect(r.subject).toBe("Revisión de tu Seat Ibiza en Taller Pérez");
    expect(r.text).toContain("Hola Lucía, te recordamos que la revisión de tu Seat Ibiza (1234BCD) está prevista para el 04/12/2026.");
    expect(r.text).toContain("Para no recibir más avisos: https://app.test/baja/abc");
    expect(r.html).toContain('href="mailto:taller@example.com"');
    expect(r.html).toContain("#aa0000");
    expect(r.html).toContain("No quiero recibir más avisos");
  });

  it("escapa los datos del cliente y del taller en el HTML (sin XSS)", () => {
    const r = renderReminderEmail({
      ...base,
      customerFirstName: '<script>alert("x")</script>',
      workshop: { name: "Taller <b>&</b>", brandColor: "red;background:url(x)" },
      template: { ...base.template, body: "Hola {nombre} <img src=x onerror=alert(1)>" },
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img");
    expect(r.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(r.html).toContain("Taller &lt;b&gt;&amp;&lt;/b&gt;");
    // Un color no válido no se inserta en los estilos.
    expect(r.html).not.toContain("url(x)");
  });

  it("limpia el asunto de saltos de línea (sin inyección de cabeceras)", () => {
    const r = renderReminderEmail({ ...base, customerFirstName: "Ana\r\nBcc: x@y.z", template: { ...base.template, subject: "Hola {nombre}" } });
    expect(r.subject).toBe("Hola Ana Bcc: x@y.z");
    expect(r.subject).not.toMatch(/[\r\n]/);
  });

  it("valores por defecto y sin botón cuando no hay destino o está desactivado", () => {
    const r = renderReminderEmail({ ...base, customerFirstName: " ", vehicleMake: null, vehicleModel: null, ctaHref: null });
    expect(r.subject).toBe("Revisión de tu vehículo en Taller Pérez");
    expect(r.text).toContain("Hola cliente");
    expect(r.html).not.toContain("Pedir cita</a>");
    const off = renderReminderEmail({ ...base, template: { ...base.template, buttonEnabled: false } });
    expect(off.html).not.toContain("Pedir cita</a>");
  });

  it("deja tal cual las variables desconocidas y las detecta", () => {
    const r = renderReminderEmail({ ...base, template: { ...base.template, subject: "{precio} para {nombre}" } });
    expect(r.subject).toBe("{precio} para Lucía");
    expect(unknownVariables("Hola {nombre}, {precio} y {km_actuales}")).toEqual(["precio", "km_actuales"]);
    expect(unknownVariables(DEFAULT_TEMPLATES.reminder_service_km.body)).toEqual([]);
  });

  it("escapeHtml cubre los cinco caracteres especiales", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("enlaces de baja firmados", () => {
  const secret = "s".repeat(40);
  const id = randomUUID();

  it("un token auténtico devuelve el cliente", () => {
    expect(verifyUnsubscribeToken(unsubscribeToken(id, secret), secret)).toBe(id);
  });

  it("rechaza tokens manipulados, de otro secreto o mal formados", () => {
    const token = unsubscribeToken(id, secret);
    const [, sig] = token.split(".");
    expect(verifyUnsubscribeToken(`${randomUUID()}.${sig}`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, "otro".repeat(10))).toBeNull();
    expect(verifyUnsubscribeToken(`${token}.x`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}A`, secret)).toBeNull();
    expect(verifyUnsubscribeToken("no-es-uuid.abc", secret)).toBeNull();
    expect(verifyUnsubscribeToken("", secret)).toBeNull();
  });
});

describe("backoffMs", () => {
  it("crece con los intentos, con un ±20 % de jitter y tope", () => {
    expect(backoffMs(1, () => 0.5)).toBe(60_000);
    expect(backoffMs(2, () => 0.5)).toBe(5 * 60_000);
    expect(backoffMs(5, () => 0.5)).toBe(360 * 60_000);
    expect(backoffMs(99, () => 0.5)).toBe(360 * 60_000);
    expect(backoffMs(0, () => 0.5)).toBe(60_000);
    expect(backoffMs(1, () => 0)).toBe(48_000);
    expect(backoffMs(1, () => 0.9999999)).toBeLessThanOrEqual(72_000);
  });
});

describe("configuración del proveedor de correo", () => {
  it("sin proveedor configurado no hay envíos", () => {
    expect(getEmailProvider({})).toBeNull();
    expect(getEmailProvider({ EMAIL_PROVIDER: "smtp" })).toBeNull();
    expect(getEmailProvider({ EMAIL_PROVIDER: "resend" })).toBeNull();
    expect(getEmailProvider({ EMAIL_PROVIDER: "otro", SMTP_URL: "smtp://h:25" })).toBeNull();
  });

  it("elige el adaptador configurado", () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: "smtp", SMTP_URL: "smtp://localhost:1025" })?.name).toBe("smtp");
    expect(getEmailProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test" })?.name).toBe("resend");
  });

  it("los enlaces exigen dominio, URL y un secreto suficientemente largo", () => {
    const ok = { EMAIL_SHARED_DOMAIN: "avisos.test", APP_URL: "https://app.test", EMAIL_LINK_SECRET: "x".repeat(32) };
    expect(getSenderConfig(ok)).toEqual({ sharedDomain: "avisos.test", appUrl: "https://app.test", linkSecret: "x".repeat(32) });
    expect(getSenderConfig({ ...ok, EMAIL_LINK_SECRET: "corto" })).toBeNull();
    expect(getSenderConfig({ ...ok, EMAIL_SHARED_DOMAIN: undefined })).toBeNull();
  });

  it("los mensajes del proveedor se guardan sin direcciones de correo ni saltos de línea", () => {
    expect(sanitizeProviderMessage("Invalid `to`: ana@example.com\nretry")).toBe("Invalid `to`: [email] retry");
    expect(sanitizeProviderMessage("x".repeat(900))).toHaveLength(500);
  });
});

describe("adaptador de Resend", () => {
  const email: OutboundEmail = {
    from: '"Taller" <t@avisos.test>',
    to: "c@example.com",
    replyTo: "taller@example.com",
    subject: "Hola",
    html: "<p>Hola</p>",
    text: "Hola",
    headers: { "List-Unsubscribe": "<https://app.test/x>" },
    idempotencyKey: "reminder-1",
    tags: { org: "a b" },
  };
  afterEach(() => vi.unstubAllGlobals());

  function stub(status: number, body: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("envía con clave de idempotencia y devuelve el id del proveedor", async () => {
    const fn = stub(200, { id: "msg_1" });
    expect(await new ResendEmailAdapter("re_test", "https://resend.test/emails").send(email)).toEqual({ kind: "accepted", messageId: "msg_1" });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://resend.test/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("reminder-1");
    expect(headers.Authorization).toBe("Bearer re_test");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ to: ["c@example.com"], reply_to: "taller@example.com", tags: [{ name: "org", value: "a_b" }] });
  });

  it("clasifica los errores: 429/409/5xx temporales, resto definitivos", async () => {
    const adapter = new ResendEmailAdapter("re_test", "https://resend.test/emails");
    stub(429, { name: "rate_limit_exceeded", message: "Too many" });
    expect(await adapter.send(email)).toMatchObject({ kind: "retryable", code: "resend_429_rate_limit_exceeded" });
    stub(503, {});
    expect(await adapter.send(email)).toMatchObject({ kind: "retryable", code: "resend_503" });
    stub(422, { name: "validation_error", message: "Invalid to: c@example.com" });
    expect(await adapter.send(email)).toEqual({ kind: "permanent", code: "resend_422_validation_error", message: "Invalid to: [email]" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNRESET"))));
    expect(await adapter.send(email)).toMatchObject({ kind: "retryable", code: "network_error" });
  });
});

describe("autenticación de los jobs internos", () => {
  const secret = "c".repeat(40);
  afterEach(() => vi.unstubAllEnvs());
  const req = (auth?: string) => new Request("https://app.test/api/internal/jobs/status", { headers: auth ? { authorization: auth } : {} });

  it("acepta solo el Bearer correcto", () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect(isAuthorizedJobRequest(req(`Bearer ${secret}`))).toBe(true);
    expect(isAuthorizedJobRequest(req(`Bearer ${secret}x`))).toBe(false);
    expect(isAuthorizedJobRequest(req(secret))).toBe(false);
    expect(isAuthorizedJobRequest(req())).toBe(false);
  });

  it("sin CRON_SECRET (o demasiado corto) los endpoints quedan desactivados", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedJobRequest(req("Bearer "))).toBe(false);
    vi.stubEnv("CRON_SECRET", "corto");
    expect(isAuthorizedJobRequest(req("Bearer corto"))).toBe(false);
  });
});
