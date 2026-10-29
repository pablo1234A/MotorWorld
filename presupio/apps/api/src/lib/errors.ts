export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'CONTACT_EXCLUDED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  validation: (message: string, details?: ErrorDetail[]) => new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Necesitas iniciar sesión.'),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.'),
  forbidden: (message = 'No tienes permiso para realizar esta acción.') => new AppError(403, 'FORBIDDEN', message),
  // Para recursos de otra empresa se responde 404: no se revela que existen.
  notFound: (message = 'No encontrado.') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  invalidTransition: (message: string) => new AppError(409, 'INVALID_STATE_TRANSITION', message),
  contactExcluded: (message = 'Este contacto está en la lista de exclusión para ese canal.') =>
    new AppError(409, 'CONTACT_EXCLUDED', message),
  invalidToken: () => new AppError(400, 'INVALID_TOKEN', 'El enlace no es válido o ha caducado.'),
  rateLimited: () => new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtalo de nuevo más tarde.'),
};

/** Código de error de PostgreSQL, si lo hay. */
export function pgErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'constraint' in error) {
    const c = (error as { constraint: unknown }).constraint;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';

/**
 * Errores de disponibilidad de la base de datos (caída, reinicio, conexiones agotadas,
 * tiempo de espera). Se responden con 503 y sin detalles: el cliente puede reintentar.
 */
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '08000',
  '08001',
  '08003',
  '08006',
  '28P01', // credenciales de la base de datos rechazadas (configuración)
  '28000',
  '3D000', // la base de datos no existe (configuración)
]);

export function isDatabaseUnavailable(error: unknown): boolean {
  const code = pgErrorCode(error);
  if (code && DB_UNAVAILABLE_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : '';
  return /timeout exceeded when trying to connect|Connection terminated|connect ECONNREFUSED/i.test(message);
}
