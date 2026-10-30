/**
 * Interpreta un importe escrito por el usuario en formato español y lo devuelve en céntimos.
 * Acepta "18.500", "18.500,50", "18500,5", "18500.5" y "18 500 €". Devuelve null si no es válido.
 */
export function parseEuroInput(raw: string): number | null {
  let s = raw.trim().replace(/€/g, '').replace(/\s/g, '') /* \s incluye los espacios duros (U+00A0, U+202F) */;
  if (s === '') return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;

  if (s.includes(',')) {
    // La coma es el separador decimal; los puntos, de miles.
    if ((s.match(/,/g) ?? []).length > 1) return null;
    const [int, dec] = s.split(',') as [string, string];
    if (int.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(int)) return null;
    s = `${int.replace(/\./g, '')}.${dec}`;
  } else if (s.includes('.')) {
    // "18.500" o "1.250.000" → miles; "18500.5" → decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if ((s.match(/\./g) ?? []).length > 1) return null;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) return null;
  return cents;
}

/** Céntimos → texto editable en formato español sin símbolo ("18.500,5" → "18500,50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest ? `${euros},${String(rest).padStart(2, '0')}` : String(euros);
}
