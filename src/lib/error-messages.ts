/**
 * Mensajes para el usuario (español de España) a partir de los códigos de
 * error de dominio. Compartido por formularios y API.
 */

const LIMIT_RESOURCE: Record<string, string> = {
  customers: "clientes",
  active_vehicles: "vehículos activos",
  users: "usuarios",
  branches: "delegaciones",
  emails: "correos de este mes",
  equipment: "equipos PCI",
};

const INVITATION_REASON: Record<string, string> = {
  not_found: "La invitación no existe.",
  expired:
    "La invitación ha caducado. Pide al administrador que te envíe otra.",
  revoked: "La invitación ha sido anulada por el administrador.",
  accepted: "Esta invitación ya se ha utilizado.",
  email_mismatch:
    "Esta invitación es para otra dirección de correo. Entra con la cuenta a la que se envió.",
  email_not_verified:
    "Verifica tu correo electrónico antes de aceptar la invitación.",
  already_member: "Ya formas parte de este taller.",
  no_branches: "La invitación no tiene ningún taller válido asignado.",
};

const PERMISSION_REASON: Record<string, string> = {
  owner_protected:
    "El propietario de la cuenta no se puede degradar, suspender ni eliminar.",
  email_not_verified: "Verifica tu correo electrónico para continuar.",
  tenant_immutable: "Este registro no se puede mover a otro taller.",
};

const CONFLICT_REASON: Record<string, string> = {
  mfa_already_enabled: "Ya tienes activada la verificación en dos pasos.",
  organizations_slug_key: "Esa dirección pública ya está en uso. Elige otra.",
  invitations_pending_unique:
    "Ya hay una invitación pendiente para ese correo.",
  organization_members_unique: "Esa persona ya forma parte del taller.",
  vehicles_plate_unique:
    "Ya existe un vehículo con esa matrícula en este taller.",
  equipment_code_unique: "Ya hay otro equipo con ese código en tu empresa.",
  work_order_items_unique: "Ese equipo ya está en la orden con esa operación.",
  technicians_member_unique: "Ese usuario ya está vinculado a otro técnico.",
  sending_domains_unique: "Ese dominio ya está añadido.",
  subscription_exists:
    "Tu taller ya tiene una suscripción. Cambia de plan desde esta misma página.",
  appointments_open_per_reminder:
    "Ya tienes una solicitud de cita pendiente para este aviso. El taller te contestará pronto.",
  email_suppressions_pkey: "Esa dirección ya está bloqueada.",
};

const VALIDATION_REASON: Record<string, string> = {
  api_scopes: "Elige al menos un permiso para la clave.",
  api_key_limit:
    "Has llegado al máximo de 20 claves activas: revoca alguna que no uses.",
  invalid_report_range:
    "El periodo no es válido: la fecha de inicio tiene que ser anterior a la de fin y abarcar como máximo dos años.",
  km_lower_than_current:
    "Los kilómetros son menores que los actuales. Si se ha cambiado el cuentakilómetros, márcalo para confirmarlo.",
  read_on_in_future: "La fecha de la lectura no puede ser futura.",
  service_date_in_future: "La fecha de la revisión no puede ser futura.",
  vehicles_next_after_last:
    "La próxima revisión debe ser posterior a la última.",
  maintenance_records_next_after:
    "La próxima revisión recomendada debe ser posterior a la fecha de la revisión.",
  vehicles_vin_check: "El bastidor no es válido.",
  slug_reserved: "Esa dirección pública está reservada. Elige otra.",
  logo_empty: "El archivo del logo está vacío.",
  logo_too_large: "El logo no puede superar 1 MB.",
  logo_type: "El logo debe ser una imagen PNG, JPG o WebP.",
  oauth_state:
    "La conexión ha caducado o no es válida. Vuelve a pulsar «Conectar Google Calendar».",
  google_scope:
    "Hace falta aceptar el permiso de Google Calendar para conectar la agenda.",
  quote_not_editable:
    "Este presupuesto ya está emitido y no se puede modificar. Duplícalo para hacer otro.",
  quote_not_issued: "Emite el presupuesto antes de enviarlo.",
  slot_unavailable: "Ese hueco ya no está libre. Elige otro, por favor.",
  booking_closed:
    "Este taller no acepta citas en línea ahora mismo. Llámale o escríbele directamente.",
  booking_date:
    "Elige un día a partir de mañana (y dentro de los próximos 3 meses).",
  booking_slot_required: "Elige uno de los huecos disponibles.",
  bot_check:
    "No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.",
  appointments_open_per_reminder:
    "Ya tienes una solicitud de cita pendiente para este aviso. El taller te contestará pronto.",
  domain_rejected:
    "El proveedor de correo no acepta ese dominio. Comprueba que esté bien escrito y que sea tuyo.",
  too_many_domains:
    "Puedes tener como máximo 3 dominios. Elimina uno que no uses.",
  sending_domain_not_verified:
    "El dominio todavía no está verificado. Comprueba los registros DNS y vuelve a intentarlo.",
  // PCI
  action_type_not_applicable:
    "Esa operación no corresponde a este tipo de equipo.",
  amendment_reason_required: "Indica el motivo de la corrección.",
  equipment_deleted: "El equipo ya no existe.",
  equipment_not_in_installation:
    "El equipo no pertenece a la instalación de la orden.",
  equipment_record_immutable:
    "Las actuaciones registradas no se pueden cambiar así: corrígelas indicando el motivo o anúlalas.",
  equipment_record_voided:
    "Esa actuación está anulada y ya no se puede modificar.",
  equipment_type_mismatch:
    "El tipo elegido no corresponde a la categoría del equipo.",
  equipment_category_immutable:
    "La categoría de un equipo no se puede cambiar. Da de alta un equipo nuevo.",
  extinguisher_agent_required:
    "Indica el agente extintor (o elige un tipo de extintor).",
  installation_customer_mismatch: "La instalación no pertenece a ese cliente.",
  installation_other_branch: "La instalación es de otra delegación.",
  interval_longer_than_reference:
    "La periodicidad no puede ser mayor que la de referencia (RIPCI). Puedes acortarla o desactivar la operación.",
  invalid_work_order_transition:
    "La orden no puede pasar a ese estado desde el actual.",
  qr_token_immutable: "El código QR de un equipo no se puede cambiar.",
  work_order_closed: "La orden está cerrada y ya no se puede modificar.",
  work_order_has_items: "La orden tiene equipos: quítalos antes.",
  work_order_item_immutable: "Ese equipo de la orden ya tiene resultado.",
  work_order_item_done: "Ese equipo de la orden ya tiene resultado.",
  work_order_items_pending:
    "Quedan equipos sin resultado. Registra el resultado de todos antes de finalizar la orden.",
  work_order_not_in_progress:
    "Pulsa «Empezar el trabajo» antes de registrar resultados.",
  work_order_number_immutable: "El número de la orden no se puede cambiar.",
  work_orders_assigned_has_technician:
    "Asigna un técnico a la orden antes de empezarla (Planificación → Técnico asignado).",
  work_orders_scheduled_has_date: "Pon una fecha a la orden para programarla.",
  work_order_not_scheduled:
    "Pon fecha a la orden antes de avisar al cliente (y no puede estar cerrada).",
  work_order_not_completed:
    "El parte se envía cuando la orden está completada.",
  member_not_found: "Ese usuario no pertenece a la empresa.",
  document_missing: "Elige al menos un archivo.",
  document_size: "Cada archivo puede ocupar como máximo 10 MB.",
  document_too_many: "Sube como máximo 10 archivos a la vez.",
  document_type: "Solo se admiten PDF, JPG, PNG o WebP.",
};

const INTEGRITY_REASON: Record<string, string> = {
  customer_has_vehicles:
    "El cliente tiene vehículos. Bórralos también o asígnalos a otro cliente antes.",
  customer_has_installations:
    "El cliente tiene instalaciones. Bórralas antes (van a la papelera).",
  installation_has_equipment:
    "La instalación tiene equipos. Bórralos antes (van a la papelera).",
  customer_deleted:
    "El cliente seleccionado ya no existe (o está en la papelera: restáuralo antes).",
  installation_deleted: "La instalación está en la papelera: restáurala antes.",
  owner_other_branch:
    "El nuevo propietario debe ser un cliente del mismo taller.",
};

const IMPORT_REASON: Record<string, string> = {
  already_committed: "Esta importación ya se ha confirmado.",
  has_errors: "Hay filas con errores: corrígelas (en el archivo) o marca «Importar solo las filas correctas».",
  expired: "La importación ha caducado (7 días). Vuelve a subir el archivo.",
  repeated_file:
    "Este archivo ya se importó antes en este taller. Marca la casilla si quieres importarlo de nuevo.",
  not_editable: "La importación ya no se puede modificar.",
  nothing_to_import: "No hay ninguna fila nueva que importar.",
};

const IMPORT_FILE_REASON: Record<string, string> = {
  file_empty: "El archivo está vacío.",
  file_too_large: "El archivo supera los 5 MB.",
  file_type: "El archivo no es un Excel (.xlsx) ni un CSV.",
  file_xls: "Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV.",
  file_corrupt:
    "No se ha podido leer el archivo. Comprueba que no esté dañado.",
  file_too_big_uncompressed:
    "El archivo es demasiado grande una vez descomprimido.",
  no_header:
    "No se encuentra la fila de cabeceras. Usa la plantilla o pon los nombres de las columnas en la primera fila.",
  missing_columns:
    "Faltan columnas obligatorias: nombre del cliente, matrícula y última revisión.",
  too_many_rows:
    "El archivo tiene más de 2.000 filas. Divídelo en varios archivos.",
  no_rows: "El archivo no tiene filas de datos.",
  missing_columns_pci: "Faltan columnas obligatorias de la plantilla. Descarga la plantilla de este tipo de datos y usa sus cabeceras.",
};

export function errorMessage(code: string, detail?: string): string {
  switch (code) {
    case "unauthenticated":
      return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    case "permission_denied":
      return (
        (detail && PERMISSION_REASON[detail]) ||
        "No tienes permiso para realizar esta acción."
      );
    case "plan_limit_reached":
      return `Has alcanzado el límite de ${(detail && LIMIT_RESOURCE[detail]) || "recursos"} de tu plan.`;
    case "subscription_inactive":
      return "Tu empresa no tiene un plan activo. Los datos están en modo de solo lectura.";
    case "feature_unavailable":
      return "Esta funcionalidad no está incluida en tu plan.";
    case "invitation_invalid":
      return (
        (detail && INVITATION_REASON[detail]) || "La invitación no es válida."
      );
    case "organization_quota":
      return "Has alcanzado el máximo de talleres que puedes crear con tu cuenta.";
    case "import_invalid":
      return (
        (detail && IMPORT_REASON[detail]) ||
        "La importación no se puede completar."
      );
    case "import_file_invalid":
      return (
        (detail && IMPORT_FILE_REASON[detail]) ||
        "No se ha podido leer el archivo."
      );
    case "rate_limited":
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    case "conflict":
      return (
        (detail && CONFLICT_REASON[detail]) ||
        "Ya existe un registro con esos datos."
      );
    case "integrity_violation":
      return (
        (detail && INTEGRITY_REASON[detail]) ||
        "La operación no es coherente con los datos existentes."
      );
    case "validation_error":
      if (detail?.startsWith("plan_too_small:"))
        return `No puedes pasar a ese plan: ${detail.slice("plan_too_small:".length)}. Reduce primero lo que sobra.`;
      return (
        (detail && VALIDATION_REASON[detail]) ||
        "Revisa los datos del formulario."
      );
    case "not_found":
      return "No se ha encontrado lo que buscas.";
    case "integration_not_configured":
      return detail === "api_key_pepper"
        ? "La API todavía no está configurada en RevisaYa."
        : "La conexión con Google todavía no está configurada en RevisaYa.";
    case "integration_failed":
      return "Google no ha completado la conexión. Vuelve a intentarlo y acepta los permisos de Google Calendar.";
    case "payments_not_configured":
      return "Los pagos todavía no están configurados en RevisaYa. No se ha hecho ningún cargo.";
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
