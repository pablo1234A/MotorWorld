import { z } from "zod";

import { normalizePhone } from "@/lib/phone";
import { checkTaxId, normalizeTaxId } from "@/lib/tax-id";

/**
 * Datos de la empresa (marca y datos fiscales para presupuestos). Mismas reglas
 * que los CHECK de `organizations`.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const organizationProfileSchema = z.object({
  tradeName: z.string().trim().min(1, "Indica el nombre comercial").max(120, "Máximo 120 caracteres"),
  legalName: optionalText(160),
  taxId: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = normalizeTaxId(v ?? "");
      if (!t) return null;
      if (checkTaxId(t) === "invalid") {
        ctx.addIssue({ code: "custom", message: "NIF, NIE o CIF no válido (revisa la letra o el dígito de control)" });
        return z.NEVER;
      }
      return t;
    }),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  postalCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[0-9]{5}$/.test(v), "Código postal de 5 cifras"),
  city: optionalText(80),
  province: optionalText(80),
  phone: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const r = normalizePhone(v);
      if (!r.ok) {
        ctx.addIssue({ code: "custom", message: "Teléfono no válido" });
        return z.NEVER;
      }
      return r.value;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.email("Correo electrónico no válido").nullable()),
  brandPrimary: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || /^#[0-9a-f]{6}$/.test(v), "Color no válido"),
});
export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;

export const LOGO_MAX_BYTES = 1024 * 1024;

/** Tipo real del archivo por su firma (no se confía en la extensión ni en el MIME del navegador). */
export function detectImage(bytes: Uint8Array): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: string } | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" };
  return null;
}
