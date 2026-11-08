import { z } from "zod";

import { unknownVariables, variablesFor } from "@/lib/email/reminder-email";

/**
 * Plantillas de correo y configuración del remitente (compartido
 * cliente/servidor). La BD vuelve a imponer longitudes y formatos.
 */

export const EDITABLE_TEMPLATE_KINDS = [
  "reminder_maintenance",
  "action_upcoming",
  "booking_received",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_rejected",
  "booking_canceled",
  "service_completed",
  "incident_detected",
  "report_sent",
  // Cuentas que venían de talleres: avisos de vehículos (se siguen enviando si tienen vehículos).
  "reminder_service_date",
  "reminder_service_km",
] as const;
export type EditableTemplateKind = (typeof EDITABLE_TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<EditableTemplateKind, string> = {
  reminder_maintenance: "Recordatorio de mantenimiento (vencimientos)",
  action_upcoming: "Próxima actuación (orden programada)",
  booking_received: "Solicitud de visita recibida",
  booking_confirmed: "Confirmación de visita",
  booking_rescheduled: "Reprogramación de visita",
  booking_rejected: "Solicitud de visita rechazada",
  booking_canceled: "Visita cancelada",
  service_completed: "Finalización del servicio (con el parte)",
  incident_detected: "Incidencia detectada",
  report_sent: "Envío de informes",
  reminder_service_date:
    "Vehículos (etapa anterior): aviso de revisión por fecha",
  reminder_service_km: "Vehículos (etapa anterior): aviso por kilometraje",
};

export const VARIABLE_HELP: Record<string, string> = {
  nombre: "Nombre del cliente",
  instalacion: "Nombre de la instalación",
  direccion: "Dirección de la instalación",
  equipos: "Equipos que vencen (p. ej. «6 extintores y 2 BIE»)",
  fecha_revision: "Fecha del vencimiento",
  fecha_cita: "Día de la visita",
  hora_cita: "Hora de la visita",
  fecha_visita: "Día de la actuación programada",
  hora_visita: "Hora de la actuación (« a las 10:00», o vacío)",
  orden: "Número de la orden de trabajo",
  fecha_servicio: "Día en que se terminó el servicio",
  resumen: "Resumen de resultados del servicio",
  incidencia: "Descripción breve de la incidencia",
  gravedad: "Gravedad de la incidencia",
  equipo: "Equipo afectado (« (equipo EXT-000004)», o vacío)",
  informe: "Nombre del documento enviado",
  modelo: "Vehículos (etapa anterior): marca y modelo",
  matricula: "Vehículos (etapa anterior): matrícula",
  taller: "Nombre de tu empresa",
};

function text(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, `Escribe ${label}`)
    .max(max, `Máximo ${max} caracteres`);
}

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const templateSchema = z
  .object({
    kind: z.enum(EDITABLE_TEMPLATE_KINDS),
    subject: text(200, "el asunto").refine(
      (v) => !/[\r\n]/.test(v),
      "El asunto debe ir en una sola línea",
    ),
    body: text(5000, "el texto"),
    buttonLabel: text(40, "el texto del botón"),
    buttonEnabled: checkbox,
  })
  .superRefine((v, ctx) => {
    // Cada tipo de correo tiene sus variables (los avisos no saben de horas de cita).
    const known = variablesFor(v.kind)
      .map((x) => `{${x}}`)
      .join(", ");
    for (const field of ["subject", "body", "buttonLabel"] as const) {
      const unknown = unknownVariables(v[field], v.kind);
      if (unknown.length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Variable desconocida: {${unknown[0]}}. Puedes usar ${known}.`,
        });
    }
  });
export type TemplateInput = z.infer<typeof templateSchema>;

export const templateKindSchema = z.object({
  kind: z.enum(EDITABLE_TEMPLATE_KINDS),
});

// ------------------------------------------------------------ dominio propio

/** Dominio que el taller controla (p. ej. tallersur.es o correo.tallersur.es). */
export const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253, "Dominio demasiado largo")
    .regex(
      /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      "Escribe solo el dominio, por ejemplo tallersur.es",
    )
    .refine(
      (d) =>
        ![
          "gmail.com",
          "googlemail.com",
          "hotmail.com",
          "hotmail.es",
          "outlook.com",
          "outlook.es",
          "live.com",
          "yahoo.com",
          "yahoo.es",
          "icloud.com",
          "me.com",
          "protonmail.com",
          "proton.me",
          "gmx.com",
          "gmx.es",
        ].includes(d),
      "Ese dominio es de un proveedor de correo gratuito y no se puede verificar. Usa el remitente de RevisaYa con tu dirección de respuesta.",
    ),
  fromLocalPart: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{1,64}$/,
      "Solo letras, números, puntos y guiones (p. ej. avisos)",
    )
    .default("avisos"),
});

export const senderModeSchema = z.object({
  branchId: z.uuid(),
  senderMode: z.enum(["shared", "custom_domain"]),
  sendingDomainId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((v) => (v ? v : null)),
  digestFrequency: z.enum(["off", "daily", "weekly"]),
});

export const DIGEST_LABELS = {
  off: "No enviar",
  daily: "Cada día",
  weekly: "Cada semana (lunes)",
} as const;

export const DOMAIN_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente de verificar",
  verified: "Verificado",
  failed: "La verificación ha fallado",
  temporary_failure: "Fallo temporal al comprobar",
};

export const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  hard_bounce: "Rebote definitivo (la dirección no existe)",
  complaint: "Lo marcó como spam",
  unsubscribe: "Se dio de baja",
  manual: "Bloqueada por el taller",
};

export const manualSuppressionSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Correo no válido")),
});
