import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import type { SiteDocument } from "@/engine/schema";
import { renderCss, renderPage, robotsTxt, sitemapXml } from "@/render";
import { RUNTIME_JS } from "@/render/runtime";
import { collectDocumentFiles } from "./storage";

export interface ExportedFile {
  file: string;
  data: Buffer;
}

/**
 * Builds a static, dependency-free site: one folder per page, shared CSS/JS, vendored
 * GSAP/Three only if used, uploaded media copied in, plus sitemap, robots and a README.
 * Deployable as-is on Vercel, Cloudflare Pages, Netlify, Render or any static host.
 */
export async function buildStaticSite(doc: SiteDocument, projectId: string, appUrl: string, siteUrl?: string): Promise<ExportedFile[]> {
  const files: ExportedFile[] = [];
  const uploads = await collectDocumentFiles(doc);
  const assetMap: Record<string, string> = {};
  for (const [src, f] of uploads) {
    const path = `assets/media/${f.key}`;
    assetMap[src] = path;
    files.push({ file: path, data: f.data });
  }
  const docJson = JSON.stringify(doc);
  const usesGsap = docJson.includes('"cinematic"');
  const uses3d = doc.pages.some((p) => p.sections.some((s) => s.type === "scene3d"));
  const vendorDir = join(process.cwd(), "public", "vendor");
  const vendor = [...(usesGsap ? ["gsap.min.js", "ScrollTrigger.min.js"] : []), ...(uses3d ? ["three.module.js", "three.core.js"] : [])];
  for (const v of vendor) {
    try {
      files.push({ file: `vendor/${v}`, data: await readFile(join(vendorDir, v)) });
    } catch {
      /* vendor file missing: the runtime keeps the CSS fallback */
    }
  }

  for (const page of doc.pages) {
    const { html } = renderPage(doc, page, { mode: "export", projectId, appUrl, assetMap, externalAssets: true, checkoutEnabled: !!process.env.STRIPE_SECRET_KEY });
    const path = page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "")}/index.html`;
    files.push({ file: path, data: Buffer.from(html) });
  }
  files.push({ file: "assets/site.css", data: Buffer.from(renderCss(doc)) });
  files.push({ file: "assets/site.js", data: Buffer.from(RUNTIME_JS) });
  const base = (siteUrl || appUrl).replace(/\/$/, "");
  files.push({ file: "sitemap.xml", data: Buffer.from(sitemapXml(doc, base)) });
  files.push({ file: "robots.txt", data: Buffer.from(robotsTxt(base)) });
  files.push({ file: "404.html", data: Buffer.from(`<!doctype html><html lang="${doc.settings.lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada — ${doc.settings.siteName}</title><link rel="stylesheet" href="/assets/site.css"><body><main class="wb-s pad-xl"><div class="wb-c"><p class="wb-eyebrow">404</p><h1 class="wb-h wb-h1">Esta página no existe</h1><div class="wb-ctas"><a class="wb-btn wb-btn-primary" href="/">Volver al inicio</a></div></div></main></body></html>`) });
  files.push({ file: "project.json", data: Buffer.from(JSON.stringify(doc, null, 2)) });
  files.push({
    file: "README.md",
    data: Buffer.from(`# ${doc.settings.siteName}

Sitio estático exportado desde World Builder AI.

## Publicar
- **Vercel**: \`npx vercel deploy\` dentro de esta carpeta (o arrastra la carpeta en vercel.com/new).
- **Cloudflare Pages**: \`npx wrangler pages deploy .\`
- **Netlify**: arrastra la carpeta en app.netlify.com/drop.
- **Cualquier hosting estático**: sube el contenido tal cual.

## Formularios
Los formularios envían a \`${appUrl}/api/forms/${projectId}\`. Mientras esa instancia de World Builder AI esté en línea, los envíos aparecen en el panel del proyecto.

## Edición
\`project.json\` contiene el documento completo del sitio. Puedes importarlo de nuevo en World Builder AI.
`),
  });
  return files;
}

export function zipFiles(files: ExportedFile[]): Uint8Array {
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[f.file] = new Uint8Array(f.data);
  return zipSync(tree, { level: 6 });
}

export { strToU8 };
