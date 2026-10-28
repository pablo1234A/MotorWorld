// Validación en el navegador para dar respuesta inmediata. Es una ayuda, no una barrera:
// el servidor vuelve a validar todo y sus errores se muestran igual.

export type Errors = Record<string, string>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateEmail(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Introduce tu email';
  if (v.length > 254 || !EMAIL.test(v)) return 'Email no válido';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (value.length < 10) return 'Debe tener al menos 10 caracteres';
  if (value.length > 128) return 'No puede superar 128 caracteres';
  if (value.trim().length < 10) return 'No puede ser solo espacios';
  return undefined;
}

export function required(value: string, max: number, label = 'Este campo'): string | undefined {
  const v = value.trim();
  if (!v) return `${label} es obligatorio`;
  if (v.length > max) return `Máximo ${max} caracteres`;
  return undefined;
}

export function validatePhone(value: string): string | undefined {
  const v = value.trim().replace(/[\s\-().]/g, '');
  if (!v) return undefined;
  if (!/^\+?[0-9]{6,15}$/.test(v)) return 'Teléfono no válido';
  return undefined;
}

/** Quita entradas vacías. */
export function compact(errors: Record<string, string | undefined>): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(errors)) if (v) out[k] = v;
  return out;
}

/**
 * Ruta interna segura para redirigir tras iniciar sesión. Rechaza URLs externas
 * ("//evil.com", "https://…", "/\\evil") para evitar redirecciones abiertas.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(target)) return fallback;
  try {
    const url = new URL(target, 'https://presupio.invalid');
    if (url.origin !== 'https://presupio.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
