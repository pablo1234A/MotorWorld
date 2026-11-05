import "server-only";
import { aiEnabled, MODEL } from "@/ai/claude";
import { HttpError } from "./http";

/**
 * Third-party integrations. Each one is real: it calls the provider's documented API with a
 * server-side key, and reports "not configured" instead of pretending when the key is missing.
 */

export interface IntegrationStatus {
  id: string;
  name: string;
  category: string;
  configured: boolean;
  envVars: string[];
  description: string;
  docsUrl: string;
  detail?: string;
}

export function integrationStatus(): IntegrationStatus[] {
  const has = (k: string) => !!process.env[k];
  return [
    { id: "anthropic", name: "Claude Opus 5.5", category: "IA", configured: aiEnabled(), envVars: ["ANTHROPIC_API_KEY"], description: "Generación de sitios y edición por chat con el modelo principal.", docsUrl: "https://console.anthropic.com/", detail: aiEnabled() ? `Modelo: ${MODEL}` : "Sin clave: se usa el motor local determinista." },
    { id: "database", name: process.env.DATABASE_URL ? "Postgres (Neon / Supabase)" : "PGlite embebido", category: "Datos", configured: true, envVars: ["DATABASE_URL"], description: "Proyectos, versiones, formularios y usuarios.", docsUrl: "https://neon.tech/docs/connect/connect-from-any-app", detail: process.env.DATABASE_URL ? "Conectado mediante DATABASE_URL." : "Base de datos local en .data/pglite. Para producción configura DATABASE_URL." },
    { id: "unsplash", name: "Unsplash", category: "Imágenes", configured: has("UNSPLASH_ACCESS_KEY"), envVars: ["UNSPLASH_ACCESS_KEY"], description: "Búsqueda de fotografía con atribución automática.", docsUrl: "https://unsplash.com/developers" },
    { id: "pexels", name: "Pexels", category: "Imágenes", configured: has("PEXELS_API_KEY"), envVars: ["PEXELS_API_KEY"], description: "Fotos y vídeos libres con atribución.", docsUrl: "https://www.pexels.com/api/" },
    { id: "resend", name: "Resend", category: "Email", configured: has("RESEND_API_KEY"), envVars: ["RESEND_API_KEY", "RESEND_FROM"], description: "Aviso por email de cada envío de formulario.", docsUrl: "https://resend.com/docs" },
    { id: "stripe", name: "Stripe", category: "Pagos", configured: has("STRIPE_SECRET_KEY"), envVars: ["STRIPE_SECRET_KEY"], description: "Checkout para carritos. Los Payment Links funcionan sin clave.", docsUrl: "https://docs.stripe.com/payments/checkout" },
    { id: "vercel", name: "Vercel", category: "Despliegue", configured: has("VERCEL_TOKEN"), envVars: ["VERCEL_TOKEN", "VERCEL_TEAM_ID"], description: "Despliegue del sitio exportado a un proyecto de Vercel.", docsUrl: "https://vercel.com/docs/rest-api/endpoints/deployments" },
    { id: "make", name: "Make / webhooks", category: "Automatización", configured: true, envVars: [], description: "Cada envío de formulario puede reenviarse a un webhook de Make, Zapier o n8n (se configura por proyecto).", docsUrl: "https://www.make.com/en/help/tools/webhooks" },
  ];
}

// ───────────── Stock images ─────────────

export interface StockImage {
  id: string;
  src: string;
  thumb: string;
  alt: string;
  width: number;
  height: number;
  credit: { name: string; url: string; provider: "unsplash" | "pexels" };
  /** Unsplash requires hitting the download endpoint when a photo is used. */
  downloadLocation?: string;
}

export async function searchImages(query: string, provider?: "unsplash" | "pexels"): Promise<{ provider: string; results: StockImage[] }> {
  const q = query.trim().slice(0, 100);
  if (!q) return { provider: "none", results: [] };
  const useUnsplash = provider ? provider === "unsplash" : !!process.env.UNSPLASH_ACCESS_KEY;
  if (useUnsplash && process.env.UNSPLASH_ACCESS_KEY) {
    const r = await fetch(`https://api.unsplash.com/search/photos?per_page=24&content_filter=high&query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" },
    });
    if (!r.ok) throw new HttpError(502, `Unsplash respondió ${r.status}.`);
    const j = (await r.json()) as { results: Array<{ id: string; alt_description: string | null; description: string | null; width: number; height: number; urls: { regular: string; small: string }; user: { name: string; links: { html: string } }; links: { download_location: string } }> };
    return {
      provider: "unsplash",
      results: j.results.map((p) => ({
        id: p.id,
        src: p.urls.regular,
        thumb: p.urls.small,
        alt: p.alt_description ?? p.description ?? q,
        width: p.width,
        height: p.height,
        credit: { name: p.user.name, url: `${p.user.links.html}?utm_source=world_builder_ai&utm_medium=referral`, provider: "unsplash" },
        downloadLocation: p.links.download_location,
      })),
    };
  }
  if (process.env.PEXELS_API_KEY) {
    const r = await fetch(`https://api.pexels.com/v1/search?per_page=24&query=${encodeURIComponent(q)}`, { headers: { Authorization: process.env.PEXELS_API_KEY } });
    if (!r.ok) throw new HttpError(502, `Pexels respondió ${r.status}.`);
    const j = (await r.json()) as { photos: Array<{ id: number; alt: string; width: number; height: number; photographer: string; photographer_url: string; src: { large2x: string; medium: string } }> };
    return {
      provider: "pexels",
      results: j.photos.map((p) => ({ id: String(p.id), src: p.src.large2x, thumb: p.src.medium, alt: p.alt || q, width: p.width, height: p.height, credit: { name: p.photographer, url: p.photographer_url, provider: "pexels" } })),
    };
  }
  throw new HttpError(412, "Configura UNSPLASH_ACCESS_KEY o PEXELS_API_KEY para buscar fotos de stock.");
}

/** Required by the Unsplash API guidelines whenever a photo is inserted. */
export async function trackUnsplashDownload(downloadLocation: string) {
  if (!process.env.UNSPLASH_ACCESS_KEY || !downloadLocation.startsWith("https://api.unsplash.com/")) return;
  await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }).catch(() => undefined);
}

// ───────────── Email (Resend) ─────────────

export async function sendSubmissionEmail(to: string, siteName: string, page: string, data: Record<string, string>) {
  if (!process.env.RESEND_API_KEY || !to) return { sent: false as const, reason: "not_configured" };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows = Object.entries(data).map(([k, v]) => `<tr><td style="padding:6px 12px;color:#666">${esc(k)}</td><td style="padding:6px 12px">${esc(v)}</td></tr>`).join("");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "World Builder <onboarding@resend.dev>",
      to: [to],
      subject: `Nuevo mensaje en ${siteName}`,
      html: `<p>Nuevo envío desde <strong>${esc(siteName)}</strong> (${esc(page)}):</p><table>${rows}</table>`,
      ...(data.email && /^[^\s@]+@[^\s@]+$/.test(data.email) ? { reply_to: data.email } : {}),
    }),
  });
  return r.ok ? { sent: true as const } : { sent: false as const, reason: `resend_${r.status}` };
}

export async function forwardWebhook(url: string, payload: unknown) {
  if (!url || !/^https:\/\//.test(url)) return;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}

// ───────────── Payments (Stripe Checkout) ─────────────

export async function createStripeCheckout(lines: Array<{ name: string; unitAmount: number; quantity: number; priceId?: string }>, currency: string, successUrl: string, cancelUrl: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(412, "Stripe no está configurado en el servidor.");
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  lines.forEach((l, i) => {
    body.set(`line_items[${i}][quantity]`, String(l.quantity));
    if (l.priceId) body.set(`line_items[${i}][price]`, l.priceId);
    else {
      body.set(`line_items[${i}][price_data][currency]`, currency.toLowerCase());
      body.set(`line_items[${i}][price_data][unit_amount]`, String(l.unitAmount));
      body.set(`line_items[${i}][price_data][product_data][name]`, l.name.slice(0, 200));
    }
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = (await r.json()) as { url?: string; error?: { message: string } };
  if (!r.ok || !j.url) throw new HttpError(502, `Stripe: ${j.error?.message ?? r.status}`);
  return j.url;
}

// ───────────── Deploy (Vercel) ─────────────

export async function deployToVercel(projectName: string, files: Array<{ file: string; data: Buffer }>) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new HttpError(412, "Configura VERCEL_TOKEN para desplegar en Vercel.");
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const r = await fetch(`https://api.vercel.com/v13/deployments${team}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: projectName,
      target: "production",
      files: files.map((f) => ({ file: f.file, data: f.data.toString("base64"), encoding: "base64" })),
      projectSettings: { framework: null, buildCommand: null, outputDirectory: null, installCommand: null },
    }),
  });
  const j = (await r.json()) as { id?: string; url?: string; readyState?: string; error?: { message: string } };
  if (!r.ok) throw new HttpError(502, `Vercel: ${j.error?.message ?? r.status}`);
  return { id: j.id!, url: `https://${j.url}`, state: j.readyState ?? "QUEUED" };
}
