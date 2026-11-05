/**
 * Columnas de la plantilla de importación (PDF §3) y alias aceptados en las
 * cabeceras de archivos propios del taller.
 */

export const IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "plate",
  "make",
  "model",
  "lastService",
  "km",
  "nextService",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  name: "Nombre del cliente",
  email: "Correo electrónico",
  phone: "Teléfono",
  plate: "Matrícula",
  make: "Marca",
  model: "Modelo",
  lastService: "Última revisión",
  km: "Kilómetros",
  nextService: "Próxima revisión",
};

/** Columnas sin las que no se puede importar. */
export const REQUIRED_COLUMNS: readonly ImportColumn[] = ["name", "plate", "lastService"];

/** Fila de ejemplo de la plantilla (la del PDF). Si no se borra, se ignora. */
export const EXAMPLE_ROW: Record<ImportColumn, string> = {
  name: "Laura Martín",
  email: "laura@correo.com",
  phone: "600 123 456",
  plate: "1234 ABC",
  make: "Seat",
  model: "Ibiza",
  lastService: "15/03/2026",
  km: "82000",
  nextService: "",
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const ALIASES: Record<ImportColumn, string[]> = {
  name: ["nombre del cliente", "nombre cliente", "nombre", "cliente", "nombre y apellidos", "nombre completo", "titular", "propietario"],
  email: ["correo electronico", "correo", "email", "e mail", "mail", "correo e"],
  phone: ["telefono", "tel", "movil", "telefono movil", "telefono de contacto", "contacto"],
  plate: ["matricula", "placa", "matricula vehiculo"],
  make: ["marca"],
  model: ["modelo"],
  lastService: ["ultima revision", "fecha ultima revision", "ultima", "fecha de la ultima revision", "revision", "fecha revision"],
  km: ["kilometros", "km", "kms", "kilometraje", "kilometros ultima revision"],
  nextService: ["proxima revision", "proxima revision opcional", "fecha proxima revision", "proxima", "siguiente revision"],
};

/** Normaliza una cabecera: minúsculas, sin tildes, sin signos. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, ImportColumn>(
  IMPORT_COLUMNS.flatMap((col) => [normalizeHeader(COLUMN_LABELS[col]), ...ALIASES[col]].map((alias) => [alias, col] as const)),
);

export function columnForHeader(header: unknown): ImportColumn | undefined {
  return LOOKUP.get(normalizeHeader(header));
}
