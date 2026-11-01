import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./cookies";
import { validateSessionToken } from "./session";
import { getBusinessForUser } from "./context";

/** Sesión para Server Components (layouts/páginas). */
export async function getPageAuth() {
  const jar = await cookies();
  return validateSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(next = "/app") {
  const auth = await getPageAuth();
  if (!auth) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!auth.user.emailVerifiedAt) redirect("/verificar-pendiente");
  return auth;
}

export async function requirePageTenant(next = "/app") {
  const auth = await requirePageUser(next);
  const business = await getBusinessForUser(auth.user.id);
  if (!business || !business.onboardingCompletedAt) redirect("/onboarding");
  return { ...auth, business };
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Acceso al panel de administración de la plataforma: solo emails listados en ADMIN_EMAILS. */
export async function requirePageAdmin() {
  const auth = await requirePageUser("/admin");
  const { notFound } = await import("next/navigation");
  if (!isAdminEmail(auth.user.email)) notFound();
  return auth;
}
