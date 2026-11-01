import "server-only";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Descarga de páginas de terceros para el comprobador, con protección SSRF:
 *  - solo http/https y puertos 80/443;
 *  - toda dirección resuelta debe ser pública, comprobado en el propio
 *    `lookup` de la conexión (evita el «DNS rebinding» entre comprobar y conectar);
 *  - redirecciones manuales y limitadas, cada una validada igual;
 *  - límite de tamaño, tiempo y tipo de contenido.
 */

export class FetchBlockedError extends Error {}

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (compatible; ComprobadorTextosLegales/1.0)";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** Bucle local (127.0.0.0/8, ::1). Es lo único que se puede permitir, y solo en pruebas. */
export function isLoopback(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  return (net.isIPv4(v) && v.startsWith("127.")) || v === "::1";
}

/** true si la IP no es enrutable públicamente (privada, local, reservada, multicast…). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (v === "::" || v === "::1") return true;
    // fc00::/7 (únicas locales), fe80::/10 (enlace local), ff00::/8 (multicast), 2001:db8::/32 (documentación), 64:ff9b::/96 (NAT64)
    return /^(f[cd]|fe[89ab]|ff|2001:db8:|64:ff9b:)/.test(v) || /^::ffff:/.test(v) || /^::[0-9a-f.]*$/.test(v);
  }
  return true;
}

type Lookup = (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => void;

function guardedLookup(allowLoopback: boolean): Lookup {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 4);
      const list = addresses as dns.LookupAddress[];
      if (!list.length) return callback(new FetchBlockedError("Sin direcciones") as NodeJS.ErrnoException, "", 4);
      if (list.some((a) => isPrivateAddress(a.address) && !(allowLoopback && isLoopback(a.address)))) {
        return callback(new FetchBlockedError("Dirección no pública") as NodeJS.ErrnoException, "", 4);
      }
      if (options.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

/** Normaliza lo que escribe el usuario («miweb.es», «http://…») y valida esquema, puerto y host. */
export function normalizeUrl(input: string, allowLoopback = false): URL {
  let raw = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Dirección no válida");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new FetchBlockedError("Solo se admiten direcciones http o https");
  if (url.username || url.password) throw new FetchBlockedError("La dirección no puede incluir credenciales");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const loopbackHost = allowLoopback && (host === "localhost" || (net.isIP(host) > 0 && isLoopback(host)));
  if (url.port && !["80", "443"].includes(url.port) && !loopbackHost) throw new FetchBlockedError("Puerto no permitido");
  if (!loopbackHost) {
    if (net.isIP(host) && isPrivateAddress(host)) throw new FetchBlockedError("Dirección no pública");
    if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp)$/i.test(host) || host === "localhost") throw new FetchBlockedError("Dirección no pública");
  }
  url.hash = "";
  return url;
}

export interface FetchedPage {
  url: string;
  status: number;
  headers: Record<string, string>;
  html: string;
}

function requestOnce(url: URL, allowLoopback: boolean): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(allowLoopback),
        timeout: TIMEOUT_MS,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-encoding": "gzip, deflate, br", "accept-language": "es-ES,es;q=0.9" },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy();
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    const deadline = setTimeout(() => req.destroy(new Error("Tiempo de espera agotado")), TIMEOUT_MS + 2000);
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
    req.on("error", (e) => {
      clearTimeout(deadline);
      reject(e);
    });
    req.on("close", () => clearTimeout(deadline));
    req.end();
  });
}

/** Descarga una página HTML siguiendo redirecciones de forma segura. */
export async function safeFetchHtml(input: string | URL, opts: { allowLoopback?: boolean } = {}): Promise<FetchedPage> {
  const allowLoopback = Boolean(opts.allowLoopback);
  let url = typeof input === "string" ? normalizeUrl(input, allowLoopback) : normalizeUrl(input.toString(), allowLoopback);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await requestOnce(url, allowLoopback);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      url = normalizeUrl(new URL(location, url).toString(), allowLoopback);
      continue;
    }
    const type = String(res.headers["content-type"] ?? "");
    if (type && !/html|xml/i.test(type)) throw new FetchBlockedError("La dirección no devuelve una página web");
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) if (typeof v === "string") headers[k] = v;
    return { url: url.toString(), status: res.status, headers, html: res.body.toString("utf8") };
  }
  throw new FetchBlockedError("Demasiadas redirecciones");
}
