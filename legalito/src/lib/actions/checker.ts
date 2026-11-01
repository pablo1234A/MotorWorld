"use server";

import { z } from "zod";
import { analyze, findLegalLinks, type LegalPagesContent, type Report } from "@/lib/checker/analyze";
import { FetchBlockedError, normalizeUrl, safeFetchHtml } from "@/lib/checker/safe-fetch";
import { ipHash } from "@/lib/request";
import { logError, rateLimit } from "@/lib/observability";
import { trackServer } from "@/lib/analytics-server";

export interface CheckerState {
  report?: Report;
  error?: string;
}

/**
 * Comprobador gratuito. No se guarda la dirección analizada ni el contenido:
 * solo un evento anónimo de uso con el resultado numérico.
 */
const urlSchema = z.string().trim().min(4, "Escribe la dirección de la web.").max(300, "La dirección es demasiado larga.");

/** Solo en pruebas (nunca en producción) se permite analizar el propio equipo (loopback); el resto de la red interna, nunca. */
function allowLoopback(): boolean {
  return process.env.CHECKER_ALLOW_PRIVATE === "1" && process.env.APP_ENV !== "production";
}

function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.replace(/^www\./, "");
  return strip(new URL(a).hostname) === strip(new URL(b).hostname);
}

export async function checkWebsite(_prev: CheckerState, formData: FormData): Promise<CheckerState> {
  const parsed = urlSchema.safeParse(formData.get("url") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await rateLimit(`checker:${await ipHash()}`, 15, 3600))) {
    return { error: "Has hecho muchas comprobaciones en poco tiempo. Inténtalo de nuevo en una hora." };
  }

  let target: URL;
  try {
    target = normalizeUrl(parsed.data, allowLoopback());
  } catch (e) {
    return { error: e instanceof FetchBlockedError ? `${e.message}.` : "Dirección no válida." };
  }

  try {
    const home = await safeFetchHtml(target, { allowLoopback: allowLoopback() });
    if (home.status >= 400) return { error: `La web respondió con un error (${home.status}). Comprueba la dirección.` };

    // Páginas legales enlazadas (solo del mismo sitio) para revisar su contenido básico.
    const links = findLegalLinks(home.html, home.url);
    const entries = (Object.entries(links) as [keyof LegalPagesContent, string][]).filter(([, href]) => sameSite(href, home.url));
    const unique = [...new Set(entries.map(([, href]) => href))].slice(0, 3);
    const fetched = await Promise.allSettled(unique.map((href) => safeFetchHtml(href, { allowLoopback: allowLoopback() })));
    const byHref = new Map(unique.map((href, i) => [href, fetched[i]]));
    const pages: LegalPagesContent = {};
    for (const [key, href] of entries) {
      const r = byHref.get(href);
      if (r?.status === "fulfilled" && r.value.status < 400) pages[key] = r.value.html;
    }

    const report = analyze({ url: home.url, html: home.html, headers: home.headers, pages });
    await trackServer("site_checked", { props: { passed: report.passed, total: report.total } });
    return { report };
  } catch (e) {
    if (e instanceof FetchBlockedError) return { error: `${e.message}.` };
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { error: "No encontramos esa web. Revisa que la dirección esté bien escrita." };
    if (/tiempo de espera/i.test(String((e as Error).message))) return { error: "La web ha tardado demasiado en responder. Inténtalo de nuevo." };
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || /certificate|SSL|TLS/i.test(String((e as Error).message))) {
      return { error: "No hemos podido conectar con la web (conexión rechazada o certificado no válido)." };
    }
    await logError("checker", e, {});
    return { error: "No hemos podido analizar la web. Inténtalo de nuevo en unos minutos." };
  }
}
