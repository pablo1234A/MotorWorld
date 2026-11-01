import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import dns from "node:dns";
import type { AddressInfo } from "node:net";
import { analyze, detectCmp, detectTrackers, findLegalLinks } from "@/lib/checker/analyze";
import { FetchBlockedError, isPrivateAddress, normalizeUrl, safeFetchHtml } from "@/lib/checker/safe-fetch";

const GOOD = `<!doctype html><html><head>
<script src="https://consent.cookiebot.com/uc.js"></script>
<script type="text/plain" data-cookie-category="analitica" src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
</head><body><footer>
<a href="/aviso-legal">Aviso legal</a> · <a href="/privacidad">Política de privacidad</a> · <a href="/cookies">Política de cookies</a>
</footer></body></html>`;

const BAD = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>
<script>!function(f,b,e,v,n,t,s){}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1');</script>
</head><body><iframe src="https://www.youtube.com/embed/abc"></iframe><a href="/contacto">Contacto</a></body></html>`;

describe("Comprobador: análisis", () => {
  it("encuentra los enlaces legales por texto o por dirección", () => {
    expect(findLegalLinks(GOOD, "https://ejemplo.es/")).toEqual({
      aviso: "https://ejemplo.es/aviso-legal",
      privacidad: "https://ejemplo.es/privacidad",
      cookies: "https://ejemplo.es/cookies",
    });
    const byHref = findLegalLinks('<a href="/legal/politica-de-privacidad"><img alt=""></a><a href="/p/aviso_legal">Legal</a>', "https://x.es");
    expect(byHref.privacidad).toBe("https://x.es/legal/politica-de-privacidad");
    expect(byHref.aviso).toBe("https://x.es/p/aviso_legal");
    // Prefiere el enlace legal real frente a artículos o herramientas sobre el tema.
    const mixed = findLegalLinks(
      '<a href="/generador-aviso-legal">Generador de aviso legal</a><a href="/guias/politica-de-privacidad">Guía de privacidad</a><a href="/legal/aviso-legal">Aviso legal</a><a href="/legal/privacidad">Privacidad</a>',
      "https://x.es",
    );
    expect(mixed).toMatchObject({ aviso: "https://x.es/legal/aviso-legal", privacidad: "https://x.es/legal/privacidad" });
    expect(findLegalLinks('<a href="/blog/que-es-el-aviso-legal">¿Qué es el aviso legal?</a>', "https://x.es").aviso).toBeUndefined();
  });

  it("distingue rastreadores activos de los bloqueados hasta el consentimiento", () => {
    expect(detectTrackers(GOOD)).toEqual([]);
    expect(detectTrackers(BAD).map((t) => t.name)).toEqual(["Google Analytics", "Píxel de Meta", "Vídeos de YouTube"]);
    expect(detectTrackers('<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>')).toEqual([]);
    expect(detectCmp(GOOD)).toBe("Cookiebot");
    expect(detectCmp(BAD)).toBeNull();
  });

  it("una web sin textos ni banner suspende las comprobaciones clave", () => {
    const r = analyze({ url: "http://mal.example/", html: BAD, headers: {}, pages: {} });
    const status = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(status).toMatchObject({ enlace_aviso: "fail", enlace_privacidad: "fail", enlace_cookies: "fail", banner: "fail", carga_previa: "warn", https: "fail", google_fonts: "info" });
    expect(r.passed).toBe(0);
  });

  it("revisa el contenido básico de las páginas legales enlazadas", () => {
    const r = analyze({
      url: "https://bien.example/",
      html: GOOD,
      headers: { "strict-transport-security": "max-age=1" },
      pages: {
        aviso: "<p>Titular: Bien SL, CIF B12345674. Email: hola@bien.example</p>",
        privacidad: "<p>Puedes ejercer tus derechos de acceso, rectificación y supresión y reclamar ante la Agencia Española de Protección de Datos.</p>",
        cookies: "<p>Puedes retirar tu consentimiento o cambiar tus preferencias de cookies en cualquier momento.</p>",
      },
    });
    expect(r.checks.every((c) => c.status === "ok" || c.status === "info")).toBe(true);
    expect(r.passed).toBe(r.total);
    const old = analyze({ url: "https://x.example/", html: GOOD, headers: {}, pages: { privacidad: "<p>Conforme a la LOPD 15/1999 no informamos de nada.</p>" } });
    expect(old.checks.find((c) => c.id === "privacidad_lopd")?.status).toBe("warn");
    expect(old.checks.find((c) => c.id === "privacidad_aepd")?.status).toBe("warn");
  });

  it("no promete cumplimiento", () => {
    const r = analyze({ url: "https://bien.example/", html: GOOD, headers: {}, pages: {} });
    expect(JSON.stringify(r)).not.toMatch(/cumple la ley|garantiza|garantizado/i);
  });
});

describe("Comprobador: protección SSRF", () => {
  it("clasifica direcciones privadas y reservadas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "151.101.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("rechaza esquemas, puertos, credenciales y hosts internos", () => {
    expect(normalizeUrl("ejemplo.es").toString()).toBe("https://ejemplo.es/");
    for (const bad of ["file:///etc/passwd", "ftp://ejemplo.es", "http://ejemplo.es:8080", "http://user:pw@ejemplo.es", "http://localhost", "http://127.0.0.1", "http://[::1]/", "http://intranet", "http://servidor.local", "http://169.254.169.254/latest/meta-data"]) {
      expect(() => normalizeUrl(bad), bad).toThrow(FetchBlockedError);
    }
  });

  it("bloquea dominios públicos que resuelven a una IP interna (comprobado al conectar)", async () => {
    const spy = vi.spyOn(dns, "lookup").mockImplementation(((_h: string, _o: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
      cb(null, [{ address: "127.0.0.1", family: 4 }])) as unknown as typeof dns.lookup);
    try {
      await expect(safeFetchHtml("http://rebinding.example/")).rejects.toThrow(/no pública/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Comprobador: descarga", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/salto") return res.writeHead(302, { location: "/final" }).end();
      if (req.url === "/interno") return res.writeHead(302, { location: "http://169.254.169.254/" }).end();
      if (req.url === "/pdf") return res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        return res.end(zlib.gzipSync("<a href='/aviso-legal'>Aviso legal</a>"));
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<p>página ${req.url}</p>`);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("sigue redirecciones, descomprime y rechaza lo que no es HTML", async () => {
    const page = await safeFetchHtml(`${base}/salto`, { allowLoopback: true });
    expect(page.url).toBe(`${base}/final`);
    expect(page.html).toContain("página /final");
    expect((await safeFetchHtml(`${base}/gzip`, { allowLoopback: true })).html).toContain("Aviso legal");
    await expect(safeFetchHtml(`${base}/pdf`, { allowLoopback: true })).rejects.toThrow(/no devuelve una página/);
  });

  it("sin permiso explícito no accede al equipo local", async () => {
    await expect(safeFetchHtml(`${base}/final`)).rejects.toThrow(FetchBlockedError);
  });

  it("aun con el permiso de pruebas, una redirección a la red interna o a metadatos se bloquea", async () => {
    await expect(safeFetchHtml(`${base}/interno`, { allowLoopback: true })).rejects.toThrow(/no pública/);
    expect(() => normalizeUrl("http://10.0.0.5/", true)).toThrow(FetchBlockedError);
    expect(normalizeUrl("http://localhost:3000/", true).port).toBe("3000");
  });
});
