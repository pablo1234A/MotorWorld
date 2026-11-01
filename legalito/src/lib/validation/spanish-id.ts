/**
 * Validación de identificadores fiscales españoles (NIF, NIE y CIF/NIF de
 * persona jurídica) mediante su dígito o letra de control.
 */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

export function normalizeTaxId(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, "");
}

export function isValidDni(id: string): boolean {
  const m = /^(\d{8})([A-Z])$/.exec(id);
  if (!m) return false;
  return DNI_LETTERS[Number(m[1]) % 23] === m[2];
}

export function isValidNie(id: string): boolean {
  const m = /^([XYZ])(\d{7})([A-Z])$/.exec(id);
  if (!m) return false;
  const prefix = { X: "0", Y: "1", Z: "2" }[m[1] as "X" | "Y" | "Z"];
  return DNI_LETTERS[Number(prefix + m[2]) % 23] === m[3];
}

export function isValidCif(id: string): boolean {
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(id);
  if (!m) return false;
  const digits = m[2];
  let sumEven = 0;
  let sumOdd = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = d * 2;
      sumOdd += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sumEven += d;
    }
  }
  const controlDigit = (10 - ((sumEven + sumOdd) % 10)) % 10;
  const letter = m[1];
  const control = m[3];
  // Entidades que usan letra (P, Q, R, S, N, W), número (A, B, E, H) o cualquiera de ambos.
  if ("PQRSNW".includes(letter)) return control === CIF_CONTROL_LETTERS[controlDigit];
  if ("ABEH".includes(letter)) return control === String(controlDigit);
  return control === String(controlDigit) || control === CIF_CONTROL_LETTERS[controlDigit];
}

export type TaxIdKind = "dni" | "nie" | "cif";

export function detectTaxId(value: string): TaxIdKind | null {
  const id = normalizeTaxId(value);
  if (isValidDni(id)) return "dni";
  if (isValidNie(id)) return "nie";
  if (isValidCif(id)) return "cif";
  return null;
}

export function isValidPersonTaxId(value: string): boolean {
  const kind = detectTaxId(value);
  return kind === "dni" || kind === "nie";
}

export function isValidCompanyTaxId(value: string): boolean {
  return detectTaxId(value) === "cif";
}
