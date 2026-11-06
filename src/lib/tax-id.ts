/**
 * NIF, NIE y CIF españoles: normalización y dígito de control. Sirve para los
 * datos fiscales del taller en los presupuestos. Un NIF-IVA de otro país de la
 * UE se admite si cumple el formato general (hasta 14 letras y números): no se
 * puede comprobar su control aquí.
 */

const LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

export function normalizeTaxId(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "");
}

function validNif(v: string): boolean {
  const m = v.match(/^(\d{8})([A-Z])$/);
  return !!m && LETTERS[Number(m[1]) % 23] === m[2];
}

function validNie(v: string): boolean {
  const m = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const num = Number(`${"XYZ".indexOf(m[1])}${m[2]}`);
  return LETTERS[num % 23] === m[3];
}

function validCif(v: string): boolean {
  const m = v.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return false;
  const digits = m[2].split("").map(Number);
  let even = 0;
  let odd = 0;
  digits.forEach((d, i) => {
    if (i % 2 === 1) even += d;
    else {
      const x = d * 2;
      odd += Math.floor(x / 10) + (x % 10);
    }
  });
  const control = (10 - ((even + odd) % 10)) % 10;
  const letter = "JABCDEFGHI"[control];
  // Según el tipo de entidad el control es letra, número o cualquiera de los dos.
  if ("PQRSNW".includes(m[1])) return m[3] === letter;
  if ("ABEH".includes(m[1])) return m[3] === String(control);
  return m[3] === String(control) || m[3] === letter;
}

export type TaxIdCheck = "nif" | "nie" | "cif" | "foreign" | "invalid";

export function checkTaxId(input: string): TaxIdCheck {
  const v = normalizeTaxId(input);
  if (/^\d{8}[A-Z]$/.test(v)) return validNif(v) ? "nif" : "invalid";
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return validNie(v) ? "nie" : "invalid";
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return validCif(v) ? "cif" : "invalid";
  // NIF-IVA de otro país de la UE (prefijo de país + 2–12 caracteres; máx. 14 en total).
  if (/^[A-Z]{2}[A-Z0-9]{6,12}$/.test(v) && !v.startsWith("ES")) return "foreign";
  return "invalid";
}
