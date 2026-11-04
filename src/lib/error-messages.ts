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
    case "rate_limited":
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    case "conflict":
      return (detail && CONFLICT_REASON[detail]) || "Ya existe un registro con esos datos.";
    case "integrity_violation":
      return "La operación no es coherente con los datos existentes.";
    case "validation_error":
      return "Revisa los datos del formulario.";
    case "not_found":
      return "No se ha encontrado lo que buscas.";
    default:
      return "Ha ocurrido un error inesperado. Inténtalo de nuevo; si persiste, contacta con soporte.";
  }
}
