import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (antes "middleware"): refresca la sesión de Supabase en cada petición
 * y redirige a /acceder a quien entra sin sesión en zonas privadas.
 * Es una primera barrera de experiencia de usuario: cada página, acción y ruta
 * vuelve a verificar la sesión y los permisos en servidor.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const path = request.nextUrl.pathname;
  const isPrivate = path === "/panel" || path.startsWith("/panel/") || path === "/admin" || path.startsWith("/admin/");
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  const toLogin = () => {
    const login = request.nextUrl.clone();
    login.pathname = "/acceder";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  };

  // Visitantes anónimos: sin llamadas de red en páginas públicas.
  if (!hasSessionCookie) return isPrivate ? toLogin() : response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser valida el token con Supabase y lo renueva si es necesario.
  const { data } = await supabase.auth.getUser();
  if (isPrivate && !data.user) return toLogin();
  return response;
}

export const config = {
  matcher: [
    // Todo salvo estáticos, imágenes, metadatos y el webhook de Stripe (que no usa cookies).
    "/((?!_next/static|_next/image|icon.svg|logo.svg|logo-512.png|robots.txt|sitemap.xml|api/stripe/webhook|api/analytics).*)",
  ],
};
