/** Solo permite redirecciones a rutas internas (evita redirecciones abiertas). */
export function safeNextPath(value: unknown, fallback = "/panel"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}
