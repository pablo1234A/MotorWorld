import { createServerClient } from "@supabase/ssr";
import { adminClient, env } from "./supabase";

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

/** Cliente HTTP con almacén de cookies que se comporta como un navegador de la propia app. */
export class HttpSession {
  readonly cookies = new Map<string, string>();

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  store(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index).trim();
      const value = pair!.slice(index + 1).trim();
      if (!value || /max-age=0/i.test(header) || /expires=thu, 01 jan 1970/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: { method?: string; body?: unknown; form?: FormData; origin?: string | null; headers?: Record<string, string>; redirect?: RequestRedirect } = {}) {
    const method = init.method ?? (init.body !== undefined || init.form ? "POST" : "GET");
    const headers: Record<string, string> = { ...init.headers };
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (init.origin !== null && method !== "GET") headers.origin = init.origin ?? BASE_URL;
    let body: BodyInit | undefined;
    if (init.form) body = init.form;
    else if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${BASE_URL}${path}`, { method, headers, body, redirect: init.redirect ?? "manual" });
    this.store(response);
    return response;
  }

  async json<T = unknown>(path: string, init: Parameters<HttpSession["request"]>[1] = {}) {
    const response = await this.request(path, init);
    const payload = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
    return { status: response.status, data: payload?.data as T, error: payload?.error };
  }

  /**
   * Inicia sesión escribiendo las cookies con el mismo formato que usa la app
   * (@supabase/ssr), sin pasar por el endpoint de login para no consumir su límite.
   */
  async signInDirect(email: string, password: string) {
    const { url, anon } = env();
    const client = createServerClient(url, anon, {
      cookies: {
        getAll: () => [...this.cookies.entries()].map(([name, value]) => ({ name, value })),
        setAll: (list) => {
          for (const { name, value } of list) {
            if (value) this.cookies.set(name, encodeURIComponent(value));
            else this.cookies.delete(name);
          }
        },
      },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
}

/** Limpia los contadores de limitación de peticiones (entre pruebas). */
export async function resetRateLimits() {
  await adminClient().from("rate_limit_buckets").delete().gte("count", 0);
}

// --- Buzón de correo local (Mailpit, incluido en `supabase start`) --------------
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function waitForEmail(to: string, subjectIncludes: string, timeoutMs = 15_000): Promise<{ html: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = (await response.json()) as { messages?: { ID: string; Subject: string }[] };
    const message = list.messages?.find((item) => item.Subject.includes(subjectIncludes));
    if (message) {
      const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { HTML: string; Text: string };
      return { html: detail.HTML, text: detail.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No ha llegado el correo "${subjectIncludes}" para ${to}`);
}

export function extractConfirmLink(html: string): string {
  const match = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(html);
  if (!match) throw new Error("El correo no contiene un enlace de confirmación");
  const url = new URL(match[1]!.replace(/&amp;/g, "&"));
  return `${url.pathname}${url.search}`;
}
