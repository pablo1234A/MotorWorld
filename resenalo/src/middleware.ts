import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirección rápida en el edge si no hay cookie de sesión. La validación real
 * de la sesión (BD) se hace siempre en el servidor (layouts y rutas API).
 */
export function middleware(req: NextRequest) {
  const has = req.cookies.get("rsn_session")?.value;
  if (!has) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/onboarding/:path*"] };
