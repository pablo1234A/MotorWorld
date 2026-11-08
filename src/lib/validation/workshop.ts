import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { checkPlate } from "@/lib/plate";
import { checkTaxId, normalizeTaxId } from "@/lib/tax-id";

/**
 * Esquemas de clientes, vehículos e historial (compartidos cliente/servidor).
 * La base de datos vuelve a imponer las mismas reglas (CHECK, FK, triggers).
 */

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, "Fecha no válida")
  .refine((v) => v >= "1950-01-01", "Fecha no válida");

export const optionalDate = z
  .union([z.literal(""), isoDateSchema])
  .optional()
  .transform((v) => (v ? v : null));

const kmSchema = z.coerce
  .number({ error: "Indica un número de kilómetros" })
  .int("Sin decimales")
  .min(0, "Los kilómetros no pueden ser negativos")
  .max(2_000_000, "Demasiados kilómetros");

const optionalKm = z
  .union([z.literal(""), kmSchema])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const CUSTOMER_SOURCES = ["manual", "walk_in", "referral", "booking_page", "import", "api", "other"] as const;
export const CUSTOMER_SOURCE_LABELS: Record<(typeof CUSTOMER_SOURCES)[number], string> = {
  manual: "Alta en el taller",
  walk_in: "Vino al taller",
  referral: "Recomendación",
  booking_page: "Página de citas",
  import: "Importación",
  api: "API",
  other: "Otro",
};
/** Orígenes que se pueden elegir a mano (los demás los fija el sistema). */
export const SELECTABLE_SOURCES = ["manual", "walk_in", "referral", "other"] as const;

// ------------------------------------------------------------------ clientes
const customerFields = {
  firstName: z.string().trim().min(1, "Indica el nombre").max(80, "Máximo 80 caracteres"),
  lastName: z.string().trim().max(120, "Máximo 120 caracteres").default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Demasiado largo")
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.email("Correo electrónico no válido").nullable()),
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
  source: z.enum(SELECTABLE_SOURCES).default("manual"),
  notes: optionalText(5000),
  remindersOptOut: checkbox,
};

// Datos de empresa (PCI): un cliente con muchas instalaciones.
const customerCompanyFields = {
  customerKind: z.enum(["company", "individual"]).default("individual"),
  legalName: optionalText(200),
  taxId: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const n = normalizeTaxId(v ?? "");
      if (!n) return null;
      if (checkTaxId(n) === "invalid") {
        ctx.addIssue({ code: "custom", message: "NIF/CIF no válido" });
        return z.NEVER;
      }
      return n;
    }),
  addressLine1: optionalText(200),
  postalCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9]{5}$/.test(v), "Código postal de 5 cifras"),
  city: optionalText(100),
  province: optionalText(100),
  contactName: optionalText(160),
  contactRole: optionalText(100),
};

export const createCustomerSchema = z.object({
  ...customerFields,
  ...customerCompanyFields,
  branchId: z.uuid("Elige un taller"),
  confirmDuplicate: checkbox,
});

/**
 * Al editar, los datos de empresa que no llegan se quedan como están (un
 * formulario o una integración antigua no los borra): sin valor por defecto.
 */
const customerCompanyUpdateFields = {
  customerKind: z.enum(["company", "individual"]).optional(),
  legalName: customerCompanyFields.legalName.optional(),
  taxId: customerCompanyFields.taxId.optional(),
  addressLine1: customerCompanyFields.addressLine1.optional(),
  postalCode: customerCompanyFields.postalCode.optional(),
  city: customerCompanyFields.city.optional(),
  province: customerCompanyFields.province.optional(),
  contactName: customerCompanyFields.contactName.optional(),
  contactRole: customerCompanyFields.contactRole.optional(),
};

export const updateCustomerSchema = z.object({
  ...customerFields,
  ...customerCompanyUpdateFields,
  id: z.uuid(),
  // El origen de un cliente importado o de la página de citas no se cambia a mano.
  source: z.enum(CUSTOMER_SOURCES).default("manual"),
});

export const deleteCustomerSchema = z.object({ id: z.uuid(), withVehicles: checkbox });

// ----------------------------------------------------------------- vehículos
export const VEHICLE_STATUSES = ["active", "inactive", "sold", "scrapped"] as const;
export const VEHICLE_STATUS_LABELS: Record<(typeof VEHICLE_STATUSES)[number], string> = {
  active: "Activo",
  inactive: "Inactivo",
  sold: "Vendido",
  scrapped: "Dado de baja",
};

export const plateSchema = z
  .string()
  .trim()
  .min(1, "Indica la matrícula")
  .max(20, "Demasiado larga")
  .refine((v) => checkPlate(v).valid, "Matrícula no válida: solo letras y números (4 a 10)");

const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v.replace(/\s|-/g, "") : null))
  .refine((v) => v === null || /^[A-HJ-NPR-Z0-9]{17}$/.test(v), "El bastidor tiene 17 caracteres (sin I, O ni Q)");

const vehicleFields = {
  plate: plateSchema,
  make: optionalText(60),
  model: optionalText(60),
  vin: vinSchema,
};

export const createVehicleSchema = z
  .object({
    ...vehicleFields,
    customerId: z.uuid("Elige el propietario"),
    currentKm: optionalKm,
    lastServiceDate: optionalDate,
    lastServiceKm: optionalKm,
    nextServiceDate: optionalDate,
  })
  .superRefine((d, ctx) => {
    if (d.nextServiceDate && d.lastServiceDate && d.nextServiceDate <= d.lastServiceDate) {
      ctx.addIssue({ code: "custom", path: ["nextServiceDate"], message: "Debe ser posterior a la última revisión" });
    }
    if (d.lastServiceKm !== null && !d.lastServiceDate) {
      ctx.addIssue({ code: "custom", path: ["lastServiceDate"], message: "Indica la fecha de esa revisión" });
    }
  });

export const updateVehicleSchema = z.object({
  ...vehicleFields,
  id: z.uuid(),
  status: z.enum(VEHICLE_STATUSES),
});

export const mileageSchema = z.object({
  id: z.uuid(),
  km: kmSchema,
  readOn: isoDateSchema,
  confirmLower: checkbox,
});

export const nextServiceSchema = z
  .object({ id: z.uuid(), nextServiceDate: optionalDate, nextServiceKm: optionalKm })
  .refine((d) => d.nextServiceDate !== null || d.nextServiceKm !== null, {
    path: ["nextServiceDate"],
    message: "Indica una fecha o unos kilómetros",
  });

export const changeOwnerSchema = z.object({ id: z.uuid(), customerId: z.uuid("Elige el nuevo propietario") });

// ----------------------------------------------------------------- historial
const partsSchema = z
  .array(
    z.object({
      description: z.string().trim().min(1).max(200, "Máximo 200 caracteres"),
      reference: optionalText(80),
      quantity: z.coerce.number().positive("Cantidad mayor que 0").max(99999),
    }),
  )
  .max(50, "Máximo 50 piezas");

export const maintenanceSchema = z
  .object({
    serviceDate: isoDateSchema,
    km: optionalKm,
    workPerformed: z.string().trim().min(1, "Describe los trabajos realizados").max(5000, "Máximo 5.000 caracteres"),
    notes: optionalText(5000),
    nextRecommendedDate: optionalDate,
    nextRecommendedKm: optionalKm,
    parts: partsSchema.default([]),
  })
  .superRefine((d, ctx) => {
    if (d.nextRecommendedDate && d.nextRecommendedDate <= d.serviceDate) {
      ctx.addIssue({ code: "custom", path: ["nextRecommendedDate"], message: "Debe ser posterior a la fecha de la revisión" });
    }
    if (d.nextRecommendedKm !== null && d.km !== null && d.nextRecommendedKm <= d.km) {
      ctx.addIssue({ code: "custom", path: ["nextRecommendedKm"], message: "Debe ser mayor que los kilómetros actuales" });
    }
  });

type CompanyKeys = "customerKind" | "legalName" | "taxId" | "addressLine1" | "postalCode" | "city" | "province" | "contactName" | "contactRole";
type Company<T> = Omit<T, CompanyKeys> & Partial<Pick<T & Record<CompanyKeys, unknown>, CompanyKeys>>;
/** Los datos de empresa son opcionales en los servicios (compatibilidad con los usos anteriores). */
export type CreateCustomerInput = Company<z.infer<typeof createCustomerSchema>>;
export type UpdateCustomerInput = Company<z.infer<typeof updateCustomerSchema>>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

/**
 * Las piezas llegan del formulario como columnas paralelas
 * (partDescription[], partReference[], partQuantity[]); las filas vacías se ignoran.
 */
export function partsFromForm(formData: FormData): Array<{ description: string; reference: string; quantity: string }> {
  const d = formData.getAll("partDescription").map(String);
  const r = formData.getAll("partReference").map(String);
  const q = formData.getAll("partQuantity").map(String);
  return d
    .map((description, i) => ({
      description: description.trim(),
      reference: (r[i] ?? "").trim(),
      // Coma decimal española: "4,5" → "4.5".
      quantity: (q[i] ?? "1").trim().replace(",", ".") || "1",
    }))
    .filter((p) => p.description !== "" || p.reference !== "");
}
