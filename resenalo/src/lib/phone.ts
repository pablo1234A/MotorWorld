/**
 * Normalización de teléfonos a E.164. Por defecto se asume España (+34).
 * Para SMS solo se aceptan móviles: en España empiezan por 6 o 7.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "ES"): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s.\-()/]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (defaultCountry === "ES" && /^[6789]\d{8}$/.test(s)) s = "+34" + s;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export function isMobileForSms(e164: string): boolean {
  if (e164.startsWith("+34")) return /^\+34[67]\d{8}$/.test(e164);
  return /^\+[1-9]\d{7,14}$/.test(e164);
}
