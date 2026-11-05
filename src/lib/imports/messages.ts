import { COLUMN_LABELS } from "./columns";
import type { Issue, IssueCode } from "./validate";

/** Mensajes en español para el taller (vista previa e informe de errores). */
const MESSAGES: Record<IssueCode, string> = {
  name_missing: "Falta el nombre del cliente",
  name_too_long: "El nombre es demasiado largo (máximo 120 caracteres)",
  email_missing: "Falta el correo electrónico (sin correo no recibirá avisos)",
  email_missing_no_reminders: "Sin correo: se importa, pero no recibirá avisos",
  email_invalid: "Correo electrónico no válido",
  phone_invalid: "Teléfono no válido",
  plate_missing: "Falta la matrícula",
  plate_invalid: "Matrícula no válida (solo letras y números, de 4 a 10)",
  plate_unrecognized: "Formato de matrícula poco habitual: revísala",
  plate_repeated_in_file: "Matrícula repetida en el archivo",
  plate_exists: "Ese vehículo ya existe en el taller: se omite",
  last_service_missing: "Falta la fecha de la última revisión",
  date_invalid: "Fecha no válida (usa dd/mm/aaaa)",
  date_two_digit_year: "Escribe el año con 4 cifras (dd/mm/aaaa)",
  last_service_future: "La última revisión no puede ser una fecha futura",
  date_too_old: "Fecha demasiado antigua",
  next_before_last: "La próxima revisión debe ser posterior a la última",
  km_invalid: "Kilómetros no válidos (solo números enteros)",
  km_negative: "Los kilómetros no pueden ser negativos",
  customer_exists: "Ya existe un cliente con ese correo: el vehículo se añadirá a su ficha",
  email_names_differ: "El mismo correo aparece con otro nombre: se usará el primero",
  text_too_long: "Texto demasiado largo (máximo 60 caracteres)",
  example_row: "Fila de ejemplo de la plantilla: se ignora",
};

export function issueMessage(issue: Issue): string {
  const base = MESSAGES[issue.code] ?? issue.code;
  if (issue.code === "plate_repeated_in_file" && issue.ref) return `${base} (ya está en la fila ${issue.ref})`;
  return base;
}

export function issueWithColumn(issue: Issue): string {
  return issue.column ? `${COLUMN_LABELS[issue.column]}: ${issueMessage(issue)}` : issueMessage(issue);
}
