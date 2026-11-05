/**
 * Teléfonos: normalización a E.164 (misma restricción que la base de datos,
 * `^\+[1-9][0-9]{6,14}$`). Los números españoles sin prefijo (9 cifras que
 * empiezan por 6, 7, 8 o 9) reciben +34. Compartido por formularios e importación.
 */
export type PhoneResult = { ok: true; value: string | null } | { ok: false };

const E164 = /^\+[1-9][0-9]{6,14}$/;

export function normalizePhone(input: string | null | undefined): PhoneResult {
  const raw = (input ?? "").trim();
  if (raw === "") return { ok: true, value: null };
  if (/[^0-9+\s().\-/]/.test(raw)) return { ok: false };
  let digits = raw.replace(/[\s().\-/]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) {
    if (/^[6789][0-9]{8}$/.test(digits)) digits = `+34${digits}`;
    else if (/^34[6789][0-9]{8}$/.test(digits)) digits = `+${digits}`;
    else return { ok: false };
  }
  return E164.test(digits) ? { ok: true, value: digits } : { ok: false };
}

/** Presentación legible: +34 600 123 456 para números españoles. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const es = e164.match(/^\+34([0-9]{3})([0-9]{3})([0-9]{3})$/);
  return es ? `${es[1]} ${es[2]} ${es[3]}` : e164;
}
