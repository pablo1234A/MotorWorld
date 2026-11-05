import { renderPage, robotsTxt, sitemapXml } from "@/render";
import { appUrl } from "@/server/http";
import { getPublicationBySlug } from "@/server/projects";

/**
 * Hosted sites: /s/<slug>/<page path>. Renders the published snapshot with the same renderer
 * used by the editor and the export, so what you see is exactly what goes live.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await params;
  const pub = await getPublicationBySlug(slug);
  const base = appUrl(req);
  if (!pub) return notFound("Este sitio no existe o no está publicado.");
  const doc = pub.doc;
  const joined = "/" + path.join("/");
  if (joined === "/sitemap.xml") return new Response(sitemapXml(doc, `${base}/s/${slug}`), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
  if (joined === "/robots.txt") return new Response(robotsTxt(`${base}/s/${slug}`), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const page = doc.pages.find((p) => p.path === joined.replace(/\/+$/, "") || (joined === "/" && p.path === "/"));
  if (!page) return notFound("Esta página no existe.", `/s/${slug}/`);
  const { html } = renderPage(doc, page, { mode: "publish", projectId: pub.projectId, appUrl: base, basePath: `/s/${slug}`, checkoutEnabled: !!process.env.STRIPE_SECRET_KEY });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://plausible.io",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https:",
        "media-src 'self' https:",
        "connect-src 'self' https://plausible.io",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "base-uri 'self'",
      ].join("; "),
    },
  });
}

function notFound(message: string, home = "/") {
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No encontrado</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f5;color:#111"><div style="text-align:center"><p style="font-size:13px;letter-spacing:.14em;color:#777">404</p><h1 style="font-weight:600">${message}</h1><a href="${home}" style="color:#111">Volver</a></div></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
