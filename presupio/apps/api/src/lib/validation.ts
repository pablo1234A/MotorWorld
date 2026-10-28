import { z } from 'zod';
import { errors, type ErrorDetail } from './errors.js';

z.config(z.locales.es());

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw errors.validation('Los datos enviados no son válidos.', details);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Esquemas reutilizables
// ---------------------------------------------------------------------------

export const uuid = z.uuid('Identificador no válido');
export const idParams = z.strictObject({ id: uuid });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El email es demasiado largo')
  .pipe(z.email('Email no válido'));

export const password = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña no puede superar 128 caracteres')
  .refine((p) => p.trim().length >= 10, 'La contraseña no puede ser solo espacios');

/** Texto obligatorio, recortado. */
export const requiredText = (max: number, min = 1) =>
  z.string().trim().min(min, 'Este campo es obligatorio').max(max, `Máximo ${max} caracteres`);

/** Texto opcional: cadena vacía → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable();

/** Teléfono: se eliminan espacios, guiones, puntos y paréntesis; se admite + inicial. */
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+?[0-9]{6,15}$/, 'Teléfono no válido'));

export const isoDateTime = z.iso.datetime({ offset: true, error: 'Fecha y hora no válida (ISO 8601)' }).transform((v) => new Date(v));
export const isoDate = z.iso.date('Fecha no válida (AAAA-MM-DD)');

export const amountCents = z
  .number('Debe ser un número entero de céntimos')
  .int('Debe ser un número entero de céntimos')
  .min(0, 'No puede ser negativo')
  .max(100_000_000_000, 'Importe demasiado alto');

export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
};
