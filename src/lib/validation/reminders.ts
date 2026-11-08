import { z } from "zod";

import { isValidIsoDate } from "@/lib/dates";

/**
 * Configuración de avisos de una sucursal (compartido cliente/servidor). La
 * base de datos vuelve a imponer las mismas reglas (CHECK y trigger de
 * branch_settings, ADR-022).
 */

export const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida (HH:MM)");

/** "30, 7" → [30, 7]: de 1 a 5 valores distintos entre 0 y 365, de mayor a menor. */
export const offsetsSchema = z
  .string()
  .trim()
  .min(1, "Indica al menos un aviso")
  .transform((v, ctx) => {
    const parts = v.split(/[\s,;]+/).filter(Boolean);
    const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) {
      ctx.addIssue({
        code: "custom",
        message: "Cada aviso debe ser un número de días entre 0 y 365",
      });
      return z.NEVER;
    }
    const unique = [...new Set(nums)].sort((a, b) => b - a);
    if (unique.length !== nums.length) {
      ctx.addIssue({ code: "custom", message: "Hay días repetidos" });
      return z.NEVER;
    }
    if (unique.length > 5) {
      ctx.addIssue({
        code: "custom",
        message: "Como máximo 5 avisos por revisión",
      });
      return z.NEVER;
    }
    return unique;
  });

const weekdays = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[1-7]$/, "Día no válido")
          .transform(Number),
      )
      .min(1, "Elige al menos un día de envío")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine(
    (v) => v === null || z.email().safeParse(v).success,
    "Correo no válido",
  );

export const reminderSettingsSchema = z
  .object({
    branchId: z.uuid(),
    remindersEnabled: checkbox,
    offsets: offsetsSchema,
    sendWindowStart: time,
    sendWindowEnd: time,
    "weekdays[]": weekdays,
    defaultIntervalMonths: z.coerce
      .number({ error: "Indica un número de meses" })
      .int("Sin decimales")
      .min(1, "Mínimo 1 mes")
      .max(60, "Máximo 60 meses"),
    defaultIntervalKm: z.coerce
      .number({ error: "Indica un número de kilómetros" })
      .int("Sin decimales")
      .min(1000, "Mínimo 1.000 km")
      .max(100_000, "Máximo 100.000 km"),
    kmRemindersEnabled: checkbox,
    kmOffsetBefore: z.coerce
      .number({ error: "Indica un número de kilómetros" })
      .int("Sin decimales")
      .min(0, "No puede ser negativo")
      .max(10_000, "Máximo 10.000 km"),
    replyToEmail: optionalEmail,
  })
  .refine((v) => v.sendWindowEnd > v.sendWindowStart, {
    path: ["sendWindowEnd"],
    message: "La hora de fin debe ser posterior a la de inicio",
  })
  .transform(({ "weekdays[]": sendWeekdays, ...rest }) => ({
    ...rest,
    sendWeekdays,
  }));

export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;

export const blackoutSchema = z.object({
  branchId: z.uuid(),
  day: z.string().trim().refine(isValidIsoDate, "Fecha no válida"),
  reason: z
    .string()
    .trim()
    .max(120, "Máximo 120 caracteres")
    .optional()
    .transform((v) => (v ? v : null)),
});

export const blackoutRemoveSchema = blackoutSchema.pick({
  branchId: true,
  day: true,
});

// ----------------------------------------------------------- panel de avisos

export const REMINDER_STATUS_LABELS: Record<string, string> = {
  scheduled: "Programado",
  processing: "Enviando",
  retrying: "Reintentando",
  sent: "Enviado",
  delivered: "Entregado",
  bounced: "Rebotado",
  complained: "Marcado como spam",
  failed: "Fallido",
  skipped: "No enviado",
  canceled: "Cancelado",
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  no_email: "El cliente no tiene correo",
  opted_out: "El cliente se dio de baja",
  suppressed: "Dirección bloqueada (rebote o queja)",
  quota_exceeded: "Límite mensual de correos alcanzado",
  subscription_inactive: "Suscripción inactiva",
  feature_unavailable: "No incluido en el plan",
  superseded: "La fecha de vencimiento cambió",
  reminders_disabled: "Avisos desactivados",
  vehicle_inactive: "Vehículo dado de baja o borrado",
  installation_inactive:
    "Instalación inactiva, borrada o sin equipos pendientes",
  canceled_by_user: "Cancelado por la empresa",
};

/** Filtros del panel: grupos de estados comprensibles para la empresa. */
export const REMINDER_FILTERS = {
  pendientes: ["scheduled", "processing", "retrying"],
  enviados: ["sent", "delivered"],
  problemas: ["failed", "bounced", "complained"],
  no_enviados: ["skipped", "canceled"],
} as const;
export type ReminderFilter = keyof typeof REMINDER_FILTERS;

export const REMINDER_FILTER_LABELS: Record<ReminderFilter, string> = {
  pendientes: "Pendientes",
  enviados: "Enviados",
  problemas: "Con problemas",
  no_enviados: "No enviados",
};

export function isReminderFilter(v: string | undefined): v is ReminderFilter {
  return v !== undefined && Object.hasOwn(REMINDER_FILTERS, v);
}
