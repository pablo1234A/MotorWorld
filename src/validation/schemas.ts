import { z } from "zod";
import { parseLocaleNumber } from "@/domain/categories";
import { CONDITION_CODES, CURRENCIES, LANGUAGES, LENGTHS, LISTING_STATUSES, TONES } from "@/domain/product";
import { EXPORT_FORMATS, PAID_PLAN_CODES } from "@/domain/plans";
import { isValidMappingTarget } from "@/domain/csv/import";

/**
 * Esquemas Zod compartidos por formularios (cliente) y Route Handlers (servidor).
 * El servidor valida SIEMPRE, con independencia de la validación del navegador.
 */

const trimmed = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const optionalText = (max: number) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), trimmed(max).nullable().optional()).transform((value) => value ?? null);
const money = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : parseLocaleNumber(value) ?? Number.NaN),
  z.number({ error: "Introduce un importe válido" }).min(0, "No puede ser negativo").max(9_999_999_999, "Importe demasiado alto").nullable(),
);
const uuid = z.uuid({ error: "Identificador no válido" });
const nullableUuid = z.preprocess((value) => (value === "" || value === undefined ? null : value), uuid.nullable());

// --- Autenticación -----------------------------------------------------------
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Introduce un correo electrónico válido" }).max(320));
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar los 72 caracteres")
  .regex(/[a-zA-Z]/, "Incluye al menos una letra")
  .regex(/[0-9]/, "Incluye al menos un número");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Introduce tu nombre").max(120, "Máximo 120 caracteres"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: "Debes aceptar las condiciones y la política de privacidad" }),
  })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Las contraseñas no coinciden" });

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Introduce tu contraseña").max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Las contraseñas no coinciden" });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Introduce tu contraseña actual").max(200), password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Las contraseñas no coinciden" });

export const profileSchema = z.object({ fullName: z.string().trim().min(2, "Introduce tu nombre").max(120, "Máximo 120 caracteres") });
export const workspaceSchema = z.object({ name: z.string().trim().min(2, "Introduce un nombre").max(120, "Máximo 120 caracteres") });
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Introduce tu contraseña").max(200),
  confirmation: z.literal("ELIMINAR", { error: 'Escribe "ELIMINAR" para confirmar' }),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Introduce tu nombre").max(120),
  email: emailSchema,
  subject: z.string().trim().min(3, "Indica un asunto").max(160),
  message: z.string().trim().min(10, "Escribe al menos 10 caracteres").max(4000, "Máximo 4000 caracteres"),
  // Campo trampa anti-bots: debe llegar vacío.
  website: z.string().max(0).optional(),
});

// --- Productos ---------------------------------------------------------------
const attributeValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const productSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200, "Máximo 200 caracteres"),
    description: trimmed(10000).default(""),
    categoryId: nullableUuid.default(null),
    brand: optionalText(120),
    model: optionalText(120),
    price: money.default(null),
    currency: z.enum(CURRENCIES, { error: "Moneda no admitida" }).default("EUR"),
    costPrice: money.default(null),
    condition: z.enum(CONDITION_CODES, { error: "Estado no válido" }).default("good"),
    conditionCustom: optionalText(120),
    sku: optionalText(80),
    location: optionalText(160),
    features: z.array(z.string().trim().min(1).max(200)).max(30, "Máximo 30 características").default([]),
    defects: trimmed(3000).default(""),
    attributes: z
      .record(z.string().max(60), attributeValue)
      .refine((value) => Object.keys(value).length <= 60, "Demasiados atributos")
      .default({}),
  })
  .refine((data) => data.condition !== "custom" || Boolean(data.conditionCustom), {
    path: ["conditionCustom"],
    message: "Describe el estado personalizado",
  });
export type ProductInput = z.output<typeof productSchema>;
export type ProductFormValues = z.input<typeof productSchema>;

const pageParam = z.coerce.number().int().min(1).max(100000).default(1);
const pageSizeParam = z.coerce.number().int().min(1).max(100).default(20);
const searchParam = z.string().trim().max(120).optional();

export const productListQuerySchema = z.object({
  q: searchParam,
  category: z.preprocess((value) => value || undefined, uuid.optional()),
  condition: z.preprocess((value) => value || undefined, z.enum(CONDITION_CODES).optional()),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  sort: z.enum(["created_desc", "created_asc", "updated_desc", "name_asc", "name_desc", "price_asc", "price_desc"]).default("created_desc"),
  page: pageParam,
  pageSize: pageSizeParam,
});
export type ProductListQuery = z.output<typeof productListQuerySchema>;

const idList = z.array(uuid).min(1, "Selecciona al menos un elemento").max(200, "Máximo 200 elementos por operación");

export const productBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), ids: idList }),
  z.object({ action: z.literal("restore"), ids: idList }),
  z.object({ action: z.literal("delete"), ids: idList }),
  z.object({
    action: z.literal("update"),
    ids: idList,
    fields: z
      .object({
        categoryId: uuid.optional(),
        condition: z.enum(CONDITION_CODES).exclude(["custom"]).optional(),
        brand: z.string().trim().min(1).max(120).optional(),
        location: z.string().trim().min(1).max(160).optional(),
        currency: z.enum(CURRENCIES).optional(),
      })
      .refine((fields) => Object.values(fields).some((value) => value !== undefined), "Indica al menos un campo que modificar"),
  }),
]);

// --- Generación --------------------------------------------------------------
export const generationOptionsSchema = z.object({
  platform: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40).default("generic"),
  templateId: nullableUuid.default(null),
  tone: z.enum(TONES).optional(),
  length: z.enum(LENGTHS).optional(),
  language: z.enum(LANGUAGES).optional(),
  titleVariant: z.number().int().min(0).max(50).default(0),
  variation: z.number().int().min(0).max(1000).default(0),
});

export const generateSchema = z.object({
  productId: uuid,
  operation: z.enum(["generate", "regenerate", "tone", "shorten", "expand", "improve_title"]).default("generate"),
  options: generationOptionsSchema.default({ platform: "generic", templateId: null, titleVariant: 0, variation: 0 }),
  // Clave generada por el cliente por cada pulsación: un reintento técnico no consume dos veces.
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/, "Clave de idempotencia no válida"),
});
export type GenerateInput = z.output<typeof generateSchema>;

// --- Anuncios ----------------------------------------------------------------
const stringList = (maxItems: number, maxLength: number) => z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([]);

export const listingContentSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(300, "Máximo 300 caracteres"),
  description: z.string().max(20000, "Máximo 20.000 caracteres").default(""),
  shortDescription: z.string().max(600).default(""),
  highlights: stringList(30, 300),
  sellingPoints: stringList(10, 300),
  keywords: stringList(30, 60),
  conditionInfo: z.string().max(2000).default(""),
  cta: z.string().max(300).default(""),
});

export const listingCreateSchema = listingContentSchema.extend({
  productId: uuid,
  platform: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40).default("generic"),
  templateId: nullableUuid.default(null),
  tone: z.enum(TONES).default("professional"),
  language: z.enum(LANGUAGES).default("es"),
  status: z.enum(LISTING_STATUSES).default("draft"),
  generationMethod: z.enum(["template", "ai", "manual"]).default("manual"),
});
export type ListingCreateInput = z.output<typeof listingCreateSchema>;

export const listingUpdateSchema = listingContentSchema.partial().extend({
  status: z.enum(LISTING_STATUSES).optional(),
  tone: z.enum(TONES).optional(),
  language: z.enum(LANGUAGES).optional(),
  generationMethod: z.enum(["template", "ai", "manual"]).optional(),
});
export type ListingUpdateInput = z.output<typeof listingUpdateSchema>;

export const listingAdaptSchema = z.object({
  platform: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40),
  templateId: nullableUuid.default(null),
});

export const listingListQuerySchema = z.object({
  q: searchParam,
  status: z.preprocess((value) => value || undefined, z.enum(LISTING_STATUSES).optional()),
  platform: z.preprocess((value) => value || undefined, z.string().regex(/^[a-z][a-z0-9_]*$/).max(40).optional()),
  product: z.preprocess((value) => value || undefined, uuid.optional()),
  favorites: z.enum(["1", "0"]).default("0"),
  sort: z.enum(["created_desc", "created_asc", "updated_desc", "title_asc"]).default("created_desc"),
  page: pageParam,
  pageSize: pageSizeParam,
});
export type ListingListQuery = z.output<typeof listingListQuerySchema>;

export const listingExportSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  ids: z.preprocess((value) => (typeof value === "string" && value ? value.split(",") : undefined), z.array(uuid).max(500).optional()),
  status: z.preprocess((value) => value || undefined, z.enum(LISTING_STATUSES).optional()),
  platform: z.preprocess((value) => value || undefined, z.string().regex(/^[a-z][a-z0-9_]*$/).max(40).optional()),
});

// --- Plantillas --------------------------------------------------------------
export const templateConfigurationSchema = z.object({
  language: z.enum(LANGUAGES).optional(),
  titleMaxLength: z.coerce.number().int().min(20, "Mínimo 20").max(300, "Máximo 300").optional(),
  descriptionMaxLength: z.coerce.number().int().min(100, "Mínimo 100").max(20000, "Máximo 20.000").optional(),
  descriptionFormat: z.enum(["plain", "html"]).optional(),
  titleVariant: z.coerce.number().int().min(0).max(4).optional(),
  includePrice: z.boolean().optional(),
  includeCta: z.boolean().optional(),
  includeLocation: z.boolean().optional(),
  maxKeywords: z.coerce.number().int().min(0).max(30).optional(),
  hashtags: z.boolean().optional(),
  defaultTone: z.enum(TONES).optional(),
  defaultLength: z.enum(LENGTHS).optional(),
  customIntro: z.string().trim().max(300).optional(),
  customCta: z.string().trim().max(300).optional(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Introduce un nombre").max(80, "Máximo 80 caracteres"),
  platform: z.string().regex(/^[a-z][a-z0-9_]*$/, "Plataforma no válida").max(40),
  categoryId: nullableUuid.default(null),
  configuration: templateConfigurationSchema.default({}),
  isActive: z.boolean().default(true),
});
export type TemplateInput = z.output<typeof templateSchema>;

// --- Categorías personalizadas ----------------------------------------------
export const customCategorySchema = z.object({
  name: z.string().trim().min(2, "Introduce un nombre").max(80, "Máximo 80 caracteres"),
  parentId: nullableUuid.default(null),
});

// --- Importación y trabajos masivos -----------------------------------------
const mappingSchema = z
  .record(z.string().max(120), z.string().max(70))
  .refine((mapping) => Object.keys(mapping).length <= 60, "Demasiadas columnas")
  .refine((mapping) => Object.values(mapping).every(isValidMappingTarget), "El mapeo contiene destinos no válidos")
  .refine((mapping) => Object.values(mapping).includes("name"), "Asigna una columna al nombre del producto");

export const importValidateSchema = z.object({
  importId: z.string().regex(/^[0-9a-f-]{36}$/, "Importación no válida"),
  mapping: mappingSchema,
  defaults: z.object({
    condition: z.enum(CONDITION_CODES).exclude(["custom"]).default("good"),
    currency: z.enum(CURRENCIES).default("EUR"),
  }),
});

export const jobCreateSchema = importValidateSchema.extend({
  filename: z.string().trim().max(255).default("importacion.csv"),
  options: generationOptionsSchema.omit({ titleVariant: true, variation: true }).default({ platform: "generic", templateId: null }),
});

export const jobListQuerySchema = z.object({ page: pageParam, pageSize: pageSizeParam });

// --- Facturación y administración -------------------------------------------
export const checkoutSchema = z.object({ plan: z.enum(PAID_PLAN_CODES) });

export const adminUserActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable"), reason: z.string().trim().min(10, "Indica la causa (mínimo 10 caracteres)").max(500) }),
  z.object({ action: z.literal("enable") }),
]);
export const adminWorkspacePlanSchema = z.object({
  planCode: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40),
  reason: z.string().trim().min(5, "Indica el motivo").max(300),
});
export const adminPlanSchema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.coerce.number().min(0).max(100000),
  monthlyListingLimit: z.coerce.number().int().min(0).max(10_000_000),
  monthlyBulkLimit: z.coerce.number().int().min(0).max(10_000_000),
  maxProducts: z.coerce.number().int().min(1).max(100_000_000),
  maxTemplates: z.coerce.number().int().min(0).max(100000),
  maxBulkRows: z.coerce.number().int().min(0).max(5000),
  maxImagesPerProduct: z.coerce.number().int().min(1).max(20),
  isActive: z.boolean(),
});
export const adminListQuerySchema = z.object({ q: searchParam, page: pageParam, pageSize: pageSizeParam });
