export type ApiErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "limit_reached"
  | "plan_required"
  | "payments_disabled"
  | "payload_too_large"
  | "unsupported_media_type"
  | "not_configured"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  limit_reached: 402,
  plan_required: 402,
  payments_disabled: 503,
  payload_too_large: 413,
  unsupported_media_type: 415,
  not_configured: 503,
  internal_error: 500,
};

/** Error controlado: su mensaje es seguro para mostrarlo al usuario. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what = "El recurso") => new ApiError("not_found", `${what} no existe o no tienes acceso.`);
