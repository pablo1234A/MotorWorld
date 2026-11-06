/**
 * Mensajes para el usuario (español de España) a partir de los códigos de
 * error de dominio. Compartido por formularios y API.
 */

const LIMIT_RESOURCE: Record<string, string> = {
  customers: "clientes",
  active_vehicles: "vehículos activos",
  users: "usuarios",
  branches: "talleres",
  emails: "correos de este mes",
};

const INVITATION_REASON: Record<string, string> = {
  not_found: "La invitación no existe.",
  expired: "La invitación ha caducado. Pide al administrador que te envíe otra.",
  revoked: "La invitación ha sido anulada por el administrador.",
  accepted: "Esta invitación ya se ha utilizado.",
  email_mismatch: "Esta invitación es para otra dirección de correo. Entra con la cuenta a la que se envió.",
  email_not_verified: "Verifica tu correo electrónico antes de aceptar la invitación.",
  already_member: "Ya formas parte de este taller.",
  no_branches: "La invitación no tiene ningún taller válido asignado.",
};

const PERMISSION_REASON: Record<string, string> = {
  owner_protected: "El propietario de la cuenta no se puede degradar, suspender ni eliminar.",
  email_not_verified: "Verifica tu correo electrónico para continuar.",
  tenant_immutable: "Este registro no se puede mover a otro taller.",
};

const CONFLICT_REASON: Record<string, string> = {
  organizations_slug_key: "Esa dirección pública ya está en uso. Elige otra.",
  invitations_pending_unique: "Ya hay una invitación pendiente para ese correo.",
  organization_members_unique: "Esa persona ya forma parte del taller.",
  vehicles_plate_unique: "Ya existe un vehículo con esa matrícula en este taller.",
  sending_domains_unique: "Ese dominio ya está añadido.",
  email_suppressions_pkey: "Esa dirección ya está bloqueada.",
};

const VALIDATION_REASON: Record<string, string> = {
  km_lower_than_current: "Los kilómetros son menores que los actuales. Si se ha cambiado el cuentakilómetros, márcalo para confirmarlo.",
  read_on_in_future: "La fecha de la lectura no puede ser futura.",
  service_date_in_future: "La fecha de la revisión no puede ser futura.",
  vehicles_next_after_last: "La próxima revisión debe ser posterior a la última.",
  maintenance_records_next_after: "La próxima revisión recomendada debe ser posterior a la fecha de la revisión.",
  vehicles_vin_check: "El bastidor no es válido.",
  slug_reserved: "Esa dirección pública está reservada. Elige otra.",
  logo_empty: "El archivo del logo está vacío.",
  logo_too_large: "El logo no puede superar 1 MB.",
  logo_type: "El logo debe ser una imagen PNG, JPG o WebP.",
  domain_rejected: "El proveedor de correo no acepta ese dominio. Comprueba que esté bien escrito y que sea tuyo.",
  too_many_domains: "Puedes tener como máximo 3 dominios. Elimina uno que no uses.",
  sending_domain_not_verified: "El dominio todavía no está verificado. Comprueba los registros DNS y vuelve a intentarlo.",
};

const INTEGRITY_REASON: Record<string, string> = {
  customer_has_vehicles: "El cliente tiene vehículos. Bórralos también o asígnalos a otro cliente antes.",
  customer_deleted: "El cliente seleccionado ya no existe.",
  owner_other_branch: "El nuevo propietario debe ser un cliente del mismo taller.",
};

const IMPORT_REASON: Record<string, string> = {
  already_committed: "Esta importación ya se ha confirmado.",
  has_errors: "Corrige o excluye las filas con errores antes de confirmar.",
  expired: "La importación ha caducado (7 días). Vuelve a subir el archivo.",
  repeated_file: "Este archivo ya se importó antes en este taller. Marca la casilla si quieres importarlo de nuevo.",
  not_editable: "La importación ya no se puede modificar.",
};

const IMPORT_FILE_REASON: Record<string, string> = {
  file_empty: "El archivo está vacío.",
  file_too_large: "El archivo supera los 5 MB.",
  file_type: "El archivo no es un Excel (.xlsx) ni un CSV.",
  file_xls: "Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV.",
  file_corrupt: "No se ha podido leer el archivo. Comprueba que no esté dañado.",
  file_too_big_uncompressed: "El archivo es demasiado grande una vez descomprimido.",
  no_header: "No se encuentra la fila de cabeceras. Usa la plantilla o pon los nombres de las columnas en la primera fila.",
  missing_columns: "Faltan columnas obligatorias: nombre del cliente, matrícula y última revisión.",
  too_many_rows: "El archivo tiene más de 2.000 filas. Divídelo en varios archivos.",
  no_rows: "El archivo no tiene filas de datos.",
};

export function errorMessage(code: string, detail?: string): string {
  switch (code) {
    case "unauthenticated":
      return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    case "permission_denied":
      return (detail && PERMISSION_REASON[detail]) || "No tienes permiso para realizar esta acción.";
    case "plan_limit_reached":
      return `Has alcanzado el límite de ${(detail && LIMIT_RESOURCE[detail]) || "recursos"} de tu plan.`;
    case "subscription_inactive":
      return "Tu taller no tiene un plan activo. Los datos están en modo de solo lectura.";
    case "feature_unavailable":
      return "Esta funcionalidad no está incluida en tu plan.";
    case "invitation_invalid":
      return (detail && INVITATION_REASON[detail]) || "La invitación no es válida.";
    case "organization_quota":
      return "Has alcanzado el máximo de talleres que puedes crear con tu cuenta.";
    case "import_invalid":
      return (detail && IMPORT_REASON[detail]) || "La importación no se puede completar.";
    case "import_file_invalid":
      return (detail && IMPORT_FILE_REASON[detail]) || "No se ha podido leer el archivo.";
    case "rate_limited":
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    case "conflict":
      return (detail && CONFLICT_REASON[detail]) || "Ya existe un registro con esos datos.";
    case "integrity_violation":
      return (detail && INTEGRITY_REASON[detail]) || "La operación no es coherente con los datos existentes.";
    case "validation_error":
      return (detail && VALIDATION_REASON[detail]) || "Revisa los datos del formulario.";
    case "not_found":
      return "No se ha encontrado lo que buscas.";
    case "email_not_configured":
      return "El envío de correo todavía no está configurado en RevisaYa. Los avisos quedan programados hasta que lo esté.";
    case "email_send_failed":
      return detail === "domain"
        ? "No se ha podido contactar con el proveedor de correo. Inténtalo de nuevo en unos minutos."
        : "El proveedor de correo no ha aceptado el envío. Inténtalo de nuevo en unos minutos.";
    default:
      return "Ha ocurrido un error inesperado. Inténtalo de nuevo; si persiste, contacta con soporte.";
  }
}
