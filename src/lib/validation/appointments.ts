import { SERVICE_TYPES } from "@/lib/pci/labels";
import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";

/**
 * Citas: configuración de la página pública, solicitud del cliente y gestión
 * en el panel. La BD vuelve a imponer formatos, estados y transiciones.
 */

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)");

const isoDate = z.string().trim().refine(isValidIsoDate, "Fecha no válida");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const SLOT_MINUTES = [15, 30, 45, 60, 90, 120] as const;

export const bookingSettingsSchema = z.object({
  branchId: z.uuid(),
  bookingEnabled: checkbox,
  bookingMode: z.enum(["free_request", "slots"]),
  slotMinutes: z.coerce
    .number()
    .int()
    .refine((v) => (SLOT_MINUTES as readonly number[]).includes(v), "Duración no válida"),
  bookingNoticeHours: z.coerce.number({ error: "Indica un número de horas" }).int("Sin decimales").min(0, "No puede ser negativo").max(336, "Máximo 14 días (336 horas)"),
});

export const availabilityRuleSchema = z
  .object({
    branchId: z.uuid(),
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
    capacity: z.coerce.number({ error: "Indica cuántos coches a la vez" }).int().min(1, "Mínimo 1").max(50, "Máximo 50"),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "La hora de fin debe ser posterior a la de inicio" });

// ------------------------------------------------------- solicitud pública

export const publicBookingSchema = z
  .object({
    slug: z.string().trim().min(3).max(50),
    token: z.string().trim().max(200).optional().transform((v) => v || null),
    branchId: z
      .union([z.literal(""), z.uuid()])
      .optional()
      .transform((v) => v || null),
    name: z.string().trim().min(1, "Escribe tu nombre").max(160, "Máximo 160 caracteres"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
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
    plate: z
      .string()
      .trim()
      .toUpperCase()
      .max(20, "Matrícula demasiado larga")
      .optional()
      .transform((v) => v || null),
    /** Visita técnica (PCI): qué se necesita y dónde. */
    serviceType: z
      .union([z.literal(""), z.enum(SERVICE_TYPES)])
      .optional()
      .transform((v) => v || null),
    requesterAddress: optionalText(200),
    requestedDate: z
      .union([z.literal(""), isoDate])
      .optional()
      .transform((v) => v || null),
    slot: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Hueco no válido"),
    message: optionalText(2000),
    /** Campo trampa: invisible para personas; si llega relleno, es un robot. */
    website: z.string().max(200).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Déjanos un correo o un teléfono para confirmarte la visita" });
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

// ------------------------------------------------------------------- panel

export const confirmSchema = z.object({
  id: z.uuid(),
  date: isoDate,
  time,
  durationMinutes: z.coerce.number().int().min(15, "Mínimo 15 minutos").max(480, "Máximo 8 horas"),
  notify: checkbox,
});

export const decisionSchema = z.object({
  id: z.uuid(),
  message: optionalText(1000),
  notify: checkbox,
});

export const manualAppointmentSchema = z.object({
  customerId: z.uuid({ error: "Elige el cliente" }),
  vehicleId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => v || null),
  date: isoDate,
  time,
  durationMinutes: z.coerce.number().int().min(15).max(480),
  notes: optionalText(5000),
  notify: checkbox,
});

export const notesSchema = z.object({ id: z.uuid(), notes: optionalText(5000) });

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  requested: "Solicitud",
  confirmed: "Confirmada",
  rejected: "Rechazada",
  canceled: "Cancelada",
  completed: "Realizada",
  no_show: "No se presentó",
};

export const APPOINTMENT_SOURCE_LABELS: Record<string, string> = {
  reminder_link: "Desde un aviso",
  booking_page: "Página de citas",
  manual: "Creada en la empresa",
  api: "API",
};

export const APPOINTMENT_FILTERS = {
  solicitudes: ["requested"],
  proximas: ["confirmed"],
  historial: ["completed", "no_show", "rejected", "canceled"],
} as const;
export type AppointmentFilter = keyof typeof APPOINTMENT_FILTERS;

export function isAppointmentFilter(v: string | undefined): v is AppointmentFilter {
  return v !== undefined && Object.hasOwn(APPOINTMENT_FILTERS, v);
}
