import { z } from "zod";

import { OPERATOR_PERMISSIONS } from "@/lib/permissions";

/**
 * Esquemas compartidos cliente/servidor. El servidor SIEMPRE vuelve a validar.
 * La política de contraseñas coincide con la configuración de Supabase Auth
 * (≥ 10 caracteres, minúsculas, mayúsculas y números).
 */

export const emailSchema = z
  .string({ error: "Indica tu correo electrónico" })
  .trim()
  .toLowerCase()
  .max(254, "El correo es demasiado largo")
  .pipe(z.email("Correo electrónico no válido"));

export const passwordSchema = z
  .string({ error: "Indica una contraseña" })
  .min(10, "Mínimo 10 caracteres")
  .max(72, "Máximo 72 caracteres")
  .refine((v) => /[a-z]/.test(v), "Debe incluir una minúscula")
  .refine((v) => /[A-Z]/.test(v), "Debe incluir una mayúscula")
  .refine((v) => /[0-9]/.test(v), "Debe incluir un número");

const nameSchema = (label: string, max: number) =>
  z.string({ error: `Indica tu ${label}` }).trim().min(1, `Indica tu ${label}`).max(max, `Máximo ${max} caracteres`);

export const signUpSchema = z
  .object({
    firstName: nameSchema("nombre", 80),
    lastName: nameSchema("apellido", 120),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    next: z.string().optional(),
    // refine (no literal): así no corta las demás validaciones y se ven todos los errores a la vez.
    acceptTerms: z.unknown().refine((v) => v === "on", "Tienes que aceptar los términos y la política de privacidad"),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Las contraseñas no coinciden",
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Indica tu contraseña").max(200),
  next: z.string().optional(),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Las contraseñas no coinciden",
  });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Indica tu contraseña actual").max(200), password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "Las contraseñas no coinciden" })
  .refine((d) => d.password !== d.currentPassword, { path: ["password"], message: "La nueva contraseña debe ser distinta" });

export const profileSchema = z.object({
  firstName: nameSchema("nombre", 80),
  lastName: nameSchema("apellido", 120),
});

// ------------------------------------------------------------ organizaciones
export const SUPPORTED_TIMEZONES = ["Europe/Madrid", "Atlantic/Canary"] as const;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/, "Solo minúsculas, números y guiones (3 a 50 caracteres)");

export const createOrganizationSchema = z.object({
  tradeName: z.string().trim().min(2, "Indica el nombre del taller").max(120, "Máximo 120 caracteres"),
  slug: z.union([z.literal(""), slugSchema]).optional(),
  timezone: z.enum(SUPPORTED_TIMEZONES, { error: "Zona horaria no válida" }).default("Europe/Madrid"),
  acceptDpa: z.unknown().refine((v) => v === "on", "Tienes que aceptar el contrato de encargo del tratamiento"),
});

// ------------------------------------------------------------------ miembros
const permissionsField = z
  .array(z.enum(OPERATOR_PERMISSIONS))
  .or(z.enum(OPERATOR_PERMISSIONS).transform((p) => [p]))
  .optional()
  .default([]);

const branchIdsField = z
  .array(z.uuid())
  .or(z.uuid().transform((id) => [id]))
  .optional()
  .default([]);

const memberAccess = {
  role: z.enum(["admin", "operator"], { error: "Rol no válido" }),
  permissions: permissionsField,
  branchScope: z.enum(["all", "selected"]).default("all"),
  branchIds: branchIdsField,
};

function refineAccess<T extends { role: string; permissions: string[]; branchScope: string; branchIds: string[] }>(
  d: T,
  ctx: z.RefinementCtx,
) {
  if (d.branchScope === "selected" && d.branchIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Elige al menos un taller" });
  }
}

export const inviteSchema = z
  .object({ email: emailSchema, ...memberAccess })
  .superRefine(refineAccess)
  .transform((d) => ({ ...d, permissions: d.role === "admin" ? [] : d.permissions, branchIds: d.branchScope === "all" ? [] : d.branchIds }));

export const updateMemberSchema = z
  .object({ memberId: z.uuid(), ...memberAccess })
  .superRefine(refineAccess)
  .transform((d) => ({ ...d, permissions: d.role === "admin" ? [] : d.permissions, branchIds: d.branchScope === "all" ? [] : d.branchIds }));

export type InviteInput = z.infer<typeof inviteSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
