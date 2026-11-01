import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadBannerData } from "@/lib/data/banner";
import { buildBannerSnippet } from "@/lib/cookie-banner";

/**
 * Página de ejemplo para probar el banner con la configuración elegida.
 * Incluye un script de analítica simulado que solo se activa si se acepta.
 */
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.redirect(new URL("/acceder?next=/panel/banner-cookies", request.url));
  const data = await loadBannerData();
  if (data.state !== "ready") return NextResponse.redirect(new URL("/panel/banner-cookies", request.url));
  const sp = request.nextUrl.searchParams;
  const snippet = buildBannerSnippet({
    siteName: data.siteName,
    policyUrl: sp.get("policy") ?? data.defaultPolicyUrl,
    categories: data.categories,
    color: sp.get("color") ?? "#1F3A5F",
    position: sp.get("pos") === "box" ? "box" : "bar",
    version: `${data.version}-preview`,
  });
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = data.categories
    .map((c) => `<tr><td>${esc(c.label)}</td><td id="estado-${c.id}">Bloqueado</td></tr>`)
    .join("");
  const probes = data.categories
    .map(
      (c) =>
        `<script type="text/plain" data-cookie-category="${c.id}">document.getElementById("estado-${c.id}").textContent = "Activado";</script>`,
    )
    .join("\n");
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Vista previa del banner de cookies</title>
${snippet}
<style>body{font:16px/1.6 system-ui,sans-serif;color:#1d2533;max-width:720px;margin:0 auto;padding:32px 20px 220px}table{border-collapse:collapse;width:100%}td{border:1px solid #e3e6eb;padding:8px 12px}</style>
</head><body>
<p style="font-size:13px;color:#5d6878">Vista previa · página de ejemplo</p>
<h1 style="font-size:26px;margin:0 0 12px">${esc(data.siteName)}</h1>
<p>Así verán el banner los visitantes de la web. Los scripts marcados solo se ejecutan cuando se acepta su categoría.</p>
<table aria-label="Estado de los scripts de ejemplo"><tbody>${rows}</tbody></table>
<p style="margin-top:24px"><a href="#" data-cookie-settings>Configurar cookies</a> · <a href="/panel/banner-cookies">Volver al panel</a></p>
${probes}
</body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
