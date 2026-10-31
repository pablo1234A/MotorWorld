export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "EMAIL_NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "PLAN_LIMIT"
  | "PLAN_FEATURE"
  | "NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  PLAN_LIMIT: 402,
  PLAN_FEATURE: 403,
  NOT_CONFIGURED: 503,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
};

/** Error de aplicación con mensaje seguro para el usuario (nunca detalles internos). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, opts: { details?: unknown; retryAfter?: number } = {}) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = opts.details;
    this.retryAfter = opts.retryAfter;
  }
}

export const notFound = (what = "Recurso") => new AppError("NOT_FOUND", `${what} no encontrado`);
