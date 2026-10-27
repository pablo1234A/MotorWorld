import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError, IntegrationRequiredError, TransientError } from '../core/errors.js';
import { now } from '../core/ids.js';
import type { IntegrationInfo, StorePageSnapshot } from './types.js';

/**
 * BUILT-IN PUBLIC PAGE SNAPSHOT.
 * Fetches the product page URL the owner configured and extracts observable
 * conversion signals (title, prices, CTAs, images, trust signals…). It reads
 * public HTML only — no private store data and no writes.
 */
export class PublicPageSnapshotAdapter {
  readonly id = 'public-page-snapshot';

  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'Public Product Page Snapshot',
      category: 'store',
      kind: 'builtin',
      status: 'BUILTIN',
      description: 'Lee la página pública del producto (campo "URL de la tienda") y extrae señales observables para EVA. Solo lectura.',
      capabilities: ['read-public-page'],
      requiredEnv: [],
      notes: ['Bloquea direcciones privadas/locales (protección SSRF).'],
      active: true,
    };
  }

  async snapshot(url: string): Promise<StorePageSnapshot> {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new AppError('Only http(s) URLs are allowed', 'VALIDATION', 422);
    await assertPublicHost(parsed.hostname);
    let res: Response;
    try {
      res = await fetch(parsed, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: { 'user-agent': 'AIProductCompany-EVA/1.0 (+store audit)', accept: 'text/html' },
      });
    } catch (err) {
      throw new TransientError(`Could not reach ${parsed.hostname}: ${(err as Error).message}`);
    }
    const html = (await res.text()).slice(0, 2_000_000);
    return extractSignals(url, res.status, html);
  }
}

export function extractSignals(url: string, httpStatus: number, html: string): StorePageSnapshot {
  const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = strip(body);
  const all = (re: RegExp) => [...body.matchAll(re)].map((m) => strip(m[1])).filter(Boolean);
  const uniq = (xs: string[], n: number) => [...new Set(xs)].slice(0, n);
  const lower = text.toLowerCase();
  const TRUST = [
    ['envío gratis', 'free shipping', 'envio gratis'],
    ['devolución', 'devoluciones', 'returns', 'refund'],
    ['garantía', 'guarantee', 'warranty'],
    ['reseñas', 'reviews', 'valoraciones', '★'],
    ['pago seguro', 'secure checkout', 'secure payment'],
    ['paypal'],
    ['contacto', 'contact', 'soporte', 'support'],
  ];
  return {
    url,
    fetchedAt: now(),
    httpStatus,
    title: all(/<title[^>]*>([\s\S]*?)<\/title>/gi)[0] ?? null,
    metaDescription: /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? null,
    h1: uniq(all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi), 5),
    prices: uniq(text.match(/(?:€|\$|£)\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:€|EUR|USD)/g) ?? [], 10),
    ctaTexts: uniq(all(/<button[^>]*>([\s\S]*?)<\/button>/gi).filter((t) => t.length < 60), 12),
    imageCount: (body.match(/<img\b/gi) ?? []).length,
    hasVideo: /<video\b|youtube\.com\/embed|player\.vimeo/i.test(body),
    trustSignals: TRUST.filter((group) => group.some((k) => lower.includes(k))).map((g) => g[0]),
    wordCount: text.split(' ').length,
    textExcerpt: text.slice(0, 3500),
  };
}

async function assertPublicHost(hostname: string) {
  const addrs = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new TransientError(`Cannot resolve ${hostname}`);
  for (const { address } of addrs) {
    if (isPrivate(address)) throw new AppError(`Refusing to fetch private address ${address}`, 'SSRF_BLOCKED', 422);
  }
}

function isPrivate(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l === '::' || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * SHOPIFY slot. Read-only connection check through the official Admin GraphQL API
 * (POST /admin/api/{version}/graphql.json with X-Shopify-Access-Token).
 * Store WRITES are deliberately not implemented: every change goes through
 * NOAH + the Approval Center and is marked INTEGRATION_REQUIRED until a write
 * adapter is built and reviewed.
 */
export class ShopifyAdapter {
  readonly id = 'shopify';
  constructor(private domain: string | null, private token: string | null, private apiVersion = process.env.SHOPIFY_API_VERSION ?? '2025-07') {}

  get configured() {
    return Boolean(this.domain && this.token);
  }

  info(): IntegrationInfo {
    return {
      id: this.id,
      name: 'Shopify',
      category: 'store',
      kind: 'external',
      status: this.configured ? 'CONNECTED' : 'INTEGRATION_REQUIRED',
      description: 'Lectura de la tienda vía Admin GraphQL API. La escritura (aplicar cambios aprobados) está deshabilitada hasta implementarse y revisarse.',
      capabilities: this.configured ? ['read-shop (connection test)'] : [],
      requiredEnv: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_API_VERSION (opcional)'],
      notes: ['Aplicar cambios en tienda: INTEGRATION_REQUIRED (sin implementar a propósito).'],
      active: this.configured,
    };
  }

  async testConnection(): Promise<{ shopName: string }> {
    if (!this.configured) throw new IntegrationRequiredError('shopify', 'Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN');
    const res = await fetch(`https://${this.domain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': this.token! },
      body: JSON.stringify({ query: '{ shop { name } }' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new AppError(`Shopify responded ${res.status}`, 'INTEGRATION_ERROR', 502, res.status >= 500);
    const json = (await res.json()) as { data?: { shop?: { name?: string } }; errors?: unknown };
    if (!json.data?.shop?.name) throw new AppError(`Shopify error: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`, 'INTEGRATION_ERROR', 502);
    return { shopName: json.data.shop.name };
  }

  async applyChange(): Promise<never> {
    throw new IntegrationRequiredError('shopify', 'Store write adapter not implemented — change approved and queued for manual application');
  }
}
