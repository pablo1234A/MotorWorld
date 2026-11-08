/**
 * Errores de dominio estables y traducción desde PostgreSQL.
 * Los códigos RY00x los lanzan las funciones SQL de límites, entitlements,
 * invitaciones y alta de talleres.
 *
 * Nunca se expone al usuario el mensaje interno de la base de datos: solo un
 * código estable y, cuando aplica, el recurso o motivo afectados.
 */

export type DomainErrorCode =
  | "unauthenticated"
  | "permission_denied"
  | "plan_limit_reached"
  | "subscription_inactive"
  | "feature_unavailable"
  | "invitation_invalid"
  | "organization_quota"
  | "import_invalid"
  | "import_file_invalid"
  | "rate_limited"
  | "conflict"
  | "integrity_violation"
  | "validation_error"
  | "not_found"
  | "email_not_configured"
  | "payments_not_configured"
  | "integration_not_configured"
  | "integration_failed"
  | "email_send_failed"
  | "internal_error";

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  unauthenticated: 401,
  permission_denied: 403,
  plan_limit_reached: 422,
  subscription_inactive: 403,
  feature_unavailable: 403,
  invitation_invalid: 410,
  organization_quota: 422,
  import_invalid: 409,
  import_file_invalid: 400,
  rate_limited: 429,
  conflict: 409,
  integrity_violation: 409,
  validation_error: 400,
  not_found: 404,
  email_not_configured: 503,
  payments_not_configured: 503,
  integration_not_configured: 503,
  integration_failed: 502,
  email_send_failed: 502,
  internal_error: 500,
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Recurso, funcionalidad, motivo o restricción (nunca datos personales). */
  readonly detail?: string;
  readonly status: number;

  constructor(code: DomainErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(detail ? `${code}: ${detail}` : code, options);
    this.name = "DomainError";
    this.code = code;
    this.detail = detail;
    this.status = HTTP_STATUS[code];
  }
}

interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null && typeof (err as PgErrorLike).code === "string";
}

/** Mensajes propios lanzados por triggers/funciones con significado de negocio. */
const KNOWN_MESSAGES = new Set([
  "tenant_immutable",
  "owner_protected",
  "permission_denied",
  "email_not_verified",
  "customer_has_vehicles",
  "customer_deleted",
  "service_date_in_future",
  "sending_domain_not_verified",
  "quote_not_editable",
  "quote_number_immutable",
  "quote_totals_mismatch",
  "invalid_quote_transition",
  "invalid_appointment_status",
  "invalid_appointment_transition",
  "invalid_branches",
  "duplicate_offsets",
  "duplicate_weekdays",
  "invalid_timezone",
  "slug_reserved",
  "invalid_bounce_type",
  "invalid_report_range",
  // PCI
  "action_type_not_applicable",
  "amendment_reason_required",
  "customer_has_installations",
  "equipment_deleted",
  "equipment_not_in_installation",
  "equipment_record_immutable",
  "equipment_record_voided",
  "equipment_type_mismatch",
  "installation_customer_mismatch",
  "installation_has_equipment",
  "invalid_work_order_transition",
  "qr_token_immutable",
  "work_order_closed",
  "work_order_has_items",
  "work_order_item_immutable",
  "work_order_items_pending",
  "work_order_number_immutable",
]);

export function mapDatabaseError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  if (!isPgError(err)) return new DomainError("internal_error", undefined, { cause: err });

  const known = err.message && KNOWN_MESSAGES.has(err.message) ? err.message : undefined;
  switch (err.code) {
    case "RY001":
      return new DomainError("plan_limit_reached", err.detail, { cause: err });
    case "RY002":
      return new DomainError("subscription_inactive", undefined, { cause: err });
    case "RY003":
      return new DomainError("feature_unavailable", err.detail, { cause: err });
    case "RY004":
      return new DomainError("invitation_invalid", err.detail, { cause: err });
    case "RY005":
      return new DomainError("organization_quota", undefined, { cause: err });
    case "RY006":
      return new DomainError("import_invalid", err.detail, { cause: err });
    case "P0002": // no_data_found
      return new DomainError("not_found", undefined, { cause: err });
    case "42501": // insufficient_privilege / violación de RLS
      return new DomainError("permission_denied", known, { cause: err });
    case "23505": // unique_violation
      return new DomainError("conflict", err.constraint, { cause: err });
    case "23503": // foreign_key_violation
      return new DomainError("integrity_violation", known ?? err.constraint, { cause: err });
    case "23514": // check_violation
    case "23502": // not_null_violation
    case "22P02": // invalid_text_representation
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
    case "22003": // numeric_value_out_of_range
    case "22001": // string_data_right_truncation
    case "22023": // invalid_parameter_value
      return new DomainError("validation_error", known ?? err.constraint, { cause: err });
    default:
      return new DomainError("internal_error", undefined, { cause: err });
  }
}
