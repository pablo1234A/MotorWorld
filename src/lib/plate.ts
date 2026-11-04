/**
 * Matrículas españolas: normalización (idéntica a `app.normalize_plate` en la
 * base de datos) y clasificación del formato para la validación de entrada.
 *
 * La BD solo exige `^[A-Z0-9]{2,12}$` tras normalizar; la aplicación es más
 * estricta y avisa cuando el formato no es reconocible (docs/IMPORTACION.md R5).
 */

export type PlateFormat =
  | "es_current" // 0000BBB (desde 2000; sin vocales, Ñ ni Q)
  | "es_moped" // C0000BBB (ciclomotores)
  | "es_provincial" // M1234AB, B1234A, M123456 (anterior a 2000)
  | "other"; // históricas, temporales, extranjeras…

export interface PlateCheck {
  normalized: string;
  format: PlateFormat | null;
  /** Se puede guardar. */
  valid: boolean;
  /** Formato no reconocido: se guarda, pero se pide revisarla. */
  warning: boolean;
}

const CURRENT_LETTERS = "BCDFGHJKLMNPRSTVWXYZ";
const ES_CURRENT = new RegExp(`^[0-9]{4}[${CURRENT_LETTERS}]{3}$`);
const ES_MOPED = new RegExp(`^C[0-9]{4}[${CURRENT_LETTERS}]{3}$`);
const PROVINCES = [
  "A", "AB", "AL", "AV", "B", "BA", "BI", "BU", "C", "CA", "CC", "CE", "CO", "CR", "CS", "CU",
  "GC", "GE", "GI", "GR", "GU", "H", "HU", "IB", "J", "L", "LE", "LO", "LU", "M", "MA", "ML",
  "MU", "NA", "O", "OR", "OU", "P", "PM", "PO", "S", "SA", "SE", "SG", "SO", "SS", "T", "TE",
  "TF", "TO", "V", "VA", "VI", "Z", "ZA",
];
const ES_PROVINCIAL = new RegExp(`^(${PROVINCES.join("|")})([0-9]{4}[A-Z]{1,2}|[0-9]{1,6})$`);
const GENERIC = /^[A-Z0-9]{4,10}$/;

export function normalizePlate(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function checkPlate(input: string): PlateCheck {
  // Caracteres que no son letras, números, espacios, guiones o puntos: error.
  if (/[^A-Za-z0-9 .\-]/.test(input.trim())) {
    return { normalized: normalizePlate(input), format: null, valid: false, warning: false };
  }
  const normalized = normalizePlate(input);
  if (ES_CURRENT.test(normalized)) return { normalized, format: "es_current", valid: true, warning: false };
  if (ES_MOPED.test(normalized)) return { normalized, format: "es_moped", valid: true, warning: false };
  if (ES_PROVINCIAL.test(normalized)) return { normalized, format: "es_provincial", valid: true, warning: false };
  if (GENERIC.test(normalized)) return { normalized, format: "other", valid: true, warning: true };
  return { normalized, format: null, valid: false, warning: false };
}
