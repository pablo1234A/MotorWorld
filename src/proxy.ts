import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Proxy (antes "middleware"):
 *  1. Refresca la sesión de Supabase en cada petición y reescribe las cookies.
 *  2. Redirección OPTIMISTA de las zonas privadas sin sesión a /acceso.
 *
 * No es el control de acceso: cada página, Server Action y Route Handler
 * verifica sesión y permisos en el servidor (src/server/auth/guards.ts), y la
 * base de datos aplica RLS.
 */

const PROTECTED_PREFIXES = ["/app", "/onboarding", "/cuenta"];

export async function proxy(request: NextRequest) {
  // La API pública se autentica con clave (Bearer), no con la sesión.
  if (request.nextUrl.pathname.startsWith("/api/v1/")) return NextResponse.next();
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Cabeceras anti-caché que @supabase/ssr exige al reescribir cookies de sesión.
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  // No ejecutar código entre la creación del cliente y getClaims(): refresca el token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!signedIn && isProtected) {
    const target = request.nextUrl.clone();
    target.pathname = "/acceso";
    target.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(target);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)$).*)"],
};
