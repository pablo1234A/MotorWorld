import { z } from "zod";

import {
  CATEGORY_CODES,
  EQUIPMENT_STATUSES,
  ESTABLISHMENT_TYPES,
  EXTINGUISHER_AGENTS,
  INCIDENT_STATUSES,
  RESULTS,
  SERVICE_TYPES,
  SEVERITIES,
  WORK_ORDER_STATUSES,
} from "@/lib/pci/labels";
import { normalizePhone } from "@/lib/phone";

import { checkbox, isoDateSchema, optionalDate, optionalText } from "./workshop";

/**
 * Esquemas PCI (compartidos cliente/servidor). La base de datos vuelve a
 * imponer las mismas reglas: CHECK, FK compuestas y triggers.
 */

const phone = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const r = normalizePhone(v);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: "Teléfono no válido" });
      return z.NEVER;
    }
    return r.value;
  });
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.email("Correo electrónico no válido").nullable());
const postalCode = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9]{5}$/.test(v), "Código postal de 5 cifras");
const uuid = z.uuid();
const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .optional()
  .transform((v) => v || null);

// --------------------------------------------------------------- instalaciones
const installationFields = {
  name: z.string().trim().min(1, "Indica un nombre para la instalación").max(160),
  establishmentType: z.enum(ESTABLISHMENT_TYPES).default("other"),
  addressLine1: z.string().trim().min(1, "Indica la dirección").max(200),
  postalCode,
  city: optionalText(100),
  province: optionalText(100),
  contactName: optionalText(160),
  contactPhone: phone,
  contactEmail: email,
  notes: optionalText(5000),
};
export const createInstallationSchema = z.object({ ...installationFields, customerId: uuid });
export const updateInstallationSchema = z.object({ ...installationFields, id: uuid, status: z.enum(["active", "inactive"]) });
export type CreateInstallationInput = z.infer<typeof createInstallationSchema>;
export type UpdateInstallationInput = z.infer<typeof updateInstallationSchema>;

// --------------------------------------------------------------------- equipos
const charge = z
  .union([z.literal(""), z.coerce.number().positive("Mayor que 0").max(500)])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));
const retimbrados = z.coerce.number().int().min(0).max(3).default(0);

const equipmentFields = {
  categoryCode: z.enum(CATEGORY_CODES),
  typeId: optionalUuid,
  code: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || "")
    .refine((v) => v === "" || /^[A-Za-z0-9._/-]{1,40}$/.test(v), "Solo letras, números y . _ / -"),
  manufacturer: optionalText(100),
  model: optionalText(100),
  serialNumber: optionalText(100),
  location: optionalText(200),
  installedOn: optionalDate,
  manufacturedOn: optionalDate,
  notes: optionalText(5000),
  // Extintor
  agent: z.union([z.literal(""), z.enum(EXTINGUISHER_AGENTS)]).optional().transform((v) => v || null),
  chargeValue: charge,
  chargeUnit: z.union([z.literal(""), z.enum(["kg", "l"])]).optional().transform((v) => v || null),
  efficacy: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[0-9A-Za-z ,./-]{1,40}$/.test(v), "Eficacia no válida (p. ej. 21A-113B-C)"),
  mobility: z.enum(["portable", "wheeled"]).default("portable"),
  stampedOn: optionalDate,
  putInServiceOn: optionalDate,
  retimbradosBefore: retimbrados,
};
function extinguisherRules(d: { categoryCode: string; agent: string | null; chargeValue: number | null; chargeUnit: string | null; installedOn: string | null; manufacturedOn: string | null }, ctx: z.RefinementCtx) {
  if (d.categoryCode === "extinguisher" && !d.agent) ctx.addIssue({ code: "custom", path: ["agent"], message: "Indica el agente extintor" });
  if ((d.chargeValue === null) !== (d.chargeUnit === null)) ctx.addIssue({ code: "custom", path: ["chargeUnit"], message: "Indica la capacidad y su unidad" });
  if (d.installedOn && d.manufacturedOn && d.installedOn < d.manufacturedOn)
    ctx.addIssue({ code: "custom", path: ["installedOn"], message: "No puede ser anterior a la fabricación" });
}
export const createEquipmentSchema = z.object({ ...equipmentFields, installationId: uuid }).superRefine(extinguisherRules);
export const updateEquipmentSchema = z
  .object({ ...equipmentFields, id: uuid, installationId: uuid, status: z.enum(EQUIPMENT_STATUSES) })
  .superRefine(extinguisherRules);
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

// ----------------------------------------------------------------- actuaciones
const materialsSchema = z
  .array(
    z.object({
      description: z.string().trim().min(1).max(200),
      reference: optionalText(80),
      quantity: z.coerce.number().positive("Cantidad mayor que 0").max(99999),
      unit: optionalText(20),
    }),
  )
  .max(50, "Máximo 50 materiales");
export const recordSchema = z
  .object({
    equipmentId: uuid,
    actionTypeId: uuid,
    performedOn: isoDateSchema,
    result: z.enum(RESULTS),
    observations: optionalText(5000),
    nextActionRecommendedOn: optionalDate,
    technicianId: optionalUuid,
    workOrderId: optionalUuid,
    materials: materialsSchema.default([]),
    // Incidencia detectada en la misma actuación (opcional).
    incidentTitle: optionalText(200),
    incidentSeverity: z.enum(SEVERITIES).default("medium"),
  })
  .superRefine((d, ctx) => {
    if (d.nextActionRecommendedOn && d.nextActionRecommendedOn <= d.performedOn)
      ctx.addIssue({ code: "custom", path: ["nextActionRecommendedOn"], message: "Debe ser posterior a la fecha de la actuación" });
    if (d.result === "non_compliant" && !d.observations)
      ctx.addIssue({ code: "custom", path: ["observations"], message: "Describe qué no es conforme" });
  });
export type RecordInput = z.infer<typeof recordSchema>;
export const amendRecordSchema = z.object({
  id: uuid,
  result: z.enum(RESULTS),
  observations: optionalText(5000),
  nextActionRecommendedOn: optionalDate,
  amendmentReason: z.string().trim().min(5, "Explica el motivo de la corrección").max(1000),
});
export const voidRecordSchema = z.object({ id: uuid, voidReason: z.string().trim().min(5, "Explica el motivo").max(1000) });

/** Materiales enviados como filas del formulario: materials[0][description]… */
export function materialsFromForm(formData: FormData) {
  const rows: Array<{ description: string; reference: string; quantity: string; unit: string }> = [];
  for (let i = 0; i < 50; i++) {
    const description = String(formData.get(`materials[${i}][description]`) ?? "").trim();
    if (!description) continue;
    rows.push({
      description,
      reference: String(formData.get(`materials[${i}][reference]`) ?? ""),
      quantity: String(formData.get(`materials[${i}][quantity]`) ?? "1"),
      unit: String(formData.get(`materials[${i}][unit]`) ?? ""),
    });
  }
  return rows;
}

/** Campos del formulario (sin las filas de materiales) + materiales como lista. */
export function formWithMaterials(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (!k.startsWith("materials[") && !k.startsWith("$ACTION") && typeof v === "string") raw[k] = v;
  raw.materials = materialsFromForm(formData);
  return raw;
}

// ---------------------------------------------------------- órdenes de trabajo
export const createWorkOrderSchema = z.object({
  installationId: uuid,
  serviceType: z.enum(SERVICE_TYPES),
  scheduledFor: optionalDate,
  scheduledTime: z
    .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM")])
    .optional()
    .transform((v) => v || null),
  technicianId: optionalUuid,
  description: optionalText(5000),
  // Equipos: «todos los que vencen» o una selección (equipo:operación).
  includeDue: checkbox,
  dueUntil: optionalDate,
  items: z.array(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i)).max(500).default([]),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export const updateWorkOrderSchema = z.object({
  id: uuid,
  serviceType: z.enum(SERVICE_TYPES),
  scheduledFor: optionalDate,
  scheduledTime: z
    .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM")])
    .optional()
    .transform((v) => v || null),
  technicianId: optionalUuid,
  description: optionalText(5000),
  notes: optionalText(5000),
});
export const workOrderStatusSchema = z.object({
  id: uuid,
  status: z.enum(WORK_ORDER_STATUSES),
  completionNotes: optionalText(5000),
});
export const itemResultSchema = z
  .object({
    itemId: uuid,
    result: z.enum(RESULTS),
    performedOn: isoDateSchema,
    observations: optionalText(2000),
    nextActionRecommendedOn: optionalDate,
    materials: materialsSchema.default([]),
    incidentTitle: optionalText(200),
    incidentSeverity: z.enum(SEVERITIES).default("medium"),
  })
  .superRefine((d, ctx) => {
    if (d.result === "non_compliant" && !d.observations)
      ctx.addIssue({ code: "custom", path: ["observations"], message: "Describe qué no es conforme" });
  });

// -------------------------------------------------------------- incidencias
export const createIncidentSchema = z.object({
  installationId: uuid,
  equipmentId: optionalUuid,
  workOrderId: optionalUuid,
  severity: z.enum(SEVERITIES),
  title: z.string().trim().min(1, "Resume la incidencia").max(200),
  description: optionalText(5000),
  detectedOn: isoDateSchema,
});
export const updateIncidentSchema = z
  .object({
    id: uuid,
    status: z.enum(INCIDENT_STATUSES),
    severity: z.enum(SEVERITIES),
    resolution: optionalText(5000),
  })
  .superRefine((d, ctx) => {
    if ((d.status === "resolved" || d.status === "dismissed") && !d.resolution)
      ctx.addIssue({ code: "custom", path: ["resolution"], message: "Indica cómo se ha resuelto o por qué se descarta" });
  });

// ------------------------------------------------------------------ técnicos
export const technicianSchema = z.object({
  id: optionalUuid,
  fullName: z.string().trim().min(1, "Indica el nombre").max(160),
  phone,
  email,
  memberId: optionalUuid,
  qualificationNotes: optionalText(1000),
  active: checkbox,
});
