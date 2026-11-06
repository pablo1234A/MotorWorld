import { z } from "zod";

import { TEMPLATE_VARIABLES, unknownVariables } from "@/lib/email/reminder-email";

/**
 * Plantillas de correo y configuración del remitente (compartido
 * cliente/servidor). La BD vuelve a imponer longitudes y formatos.
 */

export const EDITABLE_TEMPLATE_KINDS = ["reminder_service_date", "reminder_service_km"] as const;
export type EditableTemplateKind = (typeof EDITABLE_TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<EditableTemplateKind, string> = {
  reminder_service_date: "Aviso de revisión por fecha",
  reminder_service_km: "Aviso de revisión por kilometraje",
};

export const VARIABLE_HELP: Record<(typeof TEMPLATE_VARIABLES)[number], string> = {
  nombre: "Nombre del cliente",
  modelo: "Marca y modelo del vehículo",
  matricula: "Matrícula",
  fecha_revision: "Fecha de la próxima revisión",
  taller: "Nombre del taller",
};

const known = TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(", ");

function withVariables(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, `Escribe ${label}`)
    .max(max, `Máximo ${max} caracteres`)
    .superRefine((v, ctx) => {
      const unknown = unknownVariables(v);
      if (unknown.length) {
        ctx.addIssue({ code: "custom", message: `Variable desconocida: {${unknown[0]}}. Puedes usar ${known}.` });
      }
    });
}

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const templateSchema = z.object({
  kind: z.enum(EDITABLE_TEMPLATE_KINDS),
  subject: withVariables(200, "el asunto").refine((v) => !/[\r\n]/.test(v), "El asunto debe ir en una sola línea"),
  body: withVariables(5000, "el texto"),
  buttonLabel: withVariables(40, "el texto del botón"),
  buttonEnabled: checkbox,
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const templateKindSchema = z.object({ kind: z.enum(EDITABLE_TEMPLATE_KINDS) });

// ------------------------------------------------------------ dominio propio

/** Dominio que el taller controla (p. ej. tallersur.es o correo.tallersur.es). */
export const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253, "Dominio demasiado largo")
    .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Escribe solo el dominio, por ejemplo tallersur.es")
    .refine(
      (d) => !["gmail.com", "googlemail.com", "hotmail.com", "hotmail.es", "outlook.com", "outlook.es", "live.com", "yahoo.com", "yahoo.es", "icloud.com", "me.com", "protonmail.com", "proton.me", "gmx.com", "gmx.es"].includes(d),
      "Ese dominio es de un proveedor de correo gratuito y no se puede verificar. Usa el remitente de RevisaYa con tu dirección de respuesta.",
    ),
  fromLocalPart: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{1,64}$/, "Solo letras, números, puntos y guiones (p. ej. avisos)")
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

export const DIGEST_LABELS = { off: "No enviar", daily: "Cada día", weekly: "Cada semana (lunes)" } as const;

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
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Correo no válido")),
});
