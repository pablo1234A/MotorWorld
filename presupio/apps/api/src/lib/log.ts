/**
 * Serializador de errores para los logs: conserva lo útil para diagnosticar (tipo, mensaje,
 * código, restricción y traza) y descarta lo que puede llevar datos personales, como el
 * `detail` de PostgreSQL («Key (email)=(…) already exists») o los parámetros de la consulta.
 */
const EMAIL = /[^\s<>"'@(),=]+@[^\s<>"'@(),=]+/g;

export function safeErrorSerializer(err: unknown): { [key: string]: unknown; type: string; message: string; stack: string } {
  if (!(err instanceof Error)) return { type: 'NonError', message: String(err).replace(EMAIL, '[email]').slice(0, 500), stack: '' };
  const e = err as Error & { code?: unknown; constraint?: unknown; table?: unknown };
  return {
    type: e.name,
    message: e.message.replace(EMAIL, '[email]').slice(0, 500),
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    ...(typeof e.constraint === 'string' ? { constraint: e.constraint } : {}),
    ...(typeof e.table === 'string' ? { table: e.table } : {}),
    stack: (e.stack ?? '').replace(EMAIL, '[email]'),
  };
}
