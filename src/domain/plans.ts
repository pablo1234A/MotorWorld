/** Lógica comercial de planes. Los valores reales viven en la tabla `plans` (configurables). */

export const PLAN_CODES = ["free", "starter", "pro", "business"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export const PAID_PLAN_CODES = ["starter", "pro", "business"] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];

export const EXPORT_FORMATS = ["txt", "csv", "json", "shopify_csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  txt: "Texto (.txt)",
  csv: "CSV",
  json: "JSON",
  shopify_csv: "CSV de productos para Shopify",
};

export type PlanFeatures = {
  maxProducts: number | null;
  maxTemplates: number | null;
  maxBulkRows: number;
  maxImagesPerProduct: number;
  exportFormats: ExportFormat[];
  teamReady: boolean;
};

export type UsageState = {
  planCode: string;
  planName: string;
  features: PlanFeatures;
  monthlyListingLimit: number;
  monthlyBulkLimit: number;
  used: number;
  bulkUsed: number;
  remaining: number;
  bulkRemaining: number;
  periodStart: string;
  periodEnd: string;
};

const toInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

export function parsePlanFeatures(raw: unknown): PlanFeatures {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const formats = Array.isArray(source.export_formats)
    ? source.export_formats.filter((format): format is ExportFormat => (EXPORT_FORMATS as readonly string[]).includes(String(format)))
    : [];
  return {
    maxProducts: source.max_products === undefined || source.max_products === null ? null : toInt(source.max_products, 0),
    maxTemplates: source.max_templates === undefined || source.max_templates === null ? null : toInt(source.max_templates, 0),
    maxBulkRows: toInt(source.max_bulk_rows, 0),
    maxImagesPerProduct: Math.max(1, toInt(source.max_images_per_product, 3)),
    exportFormats: formats.length > 0 ? formats : ["txt"],
    teamReady: source.team_ready === true,
  };
}

/** Convierte el JSON devuelto por las funciones SQL de consumo en un objeto tipado. */
export function parseUsageState(raw: unknown): UsageState {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const limit = Math.max(0, toInt(source.monthly_listing_limit, 0));
  const bulkLimit = Math.max(0, toInt(source.monthly_bulk_limit, 0));
  const used = Math.max(0, toInt(source.used, 0));
  const bulkUsed = Math.max(0, toInt(source.bulk_used, 0));
  return {
    planCode: String(source.plan_code ?? "free"),
    planName: String(source.plan_name ?? "Free"),
    features: parsePlanFeatures(source.features),
    monthlyListingLimit: limit,
    monthlyBulkLimit: bulkLimit,
    used,
    bulkUsed,
    remaining: Math.max(0, limit - used),
    bulkRemaining: Math.max(0, Math.min(bulkLimit - bulkUsed, limit - used)),
    periodStart: String(source.period_start ?? ""),
    periodEnd: String(source.period_end ?? ""),
  };
}

export function usagePercent(state: Pick<UsageState, "used" | "monthlyListingLimit">): number {
  if (state.monthlyListingLimit <= 0) return 100;
  return Math.min(100, Math.round((state.used / state.monthlyListingLimit) * 100));
}

export function canUseBulk(state: UsageState): boolean {
  return state.monthlyBulkLimit > 0 && state.features.maxBulkRows > 0;
}

export function canExport(state: UsageState, format: ExportFormat): boolean {
  return state.features.exportFormats.includes(format);
}

/** Comprueba si una operación de `quantity` generaciones cabe en el periodo actual. */
export function checkQuota(state: UsageState, quantity: number, bulk: boolean): { allowed: true } | { allowed: false; reason: "plan_required" | "bulk_limit" | "monthly_limit" | "too_many_rows" } {
  if (bulk) {
    if (!canUseBulk(state)) return { allowed: false, reason: "plan_required" };
    if (quantity > state.features.maxBulkRows) return { allowed: false, reason: "too_many_rows" };
    if (state.bulkUsed + quantity > state.monthlyBulkLimit) return { allowed: false, reason: "bulk_limit" };
  }
  if (state.used + quantity > state.monthlyListingLimit) return { allowed: false, reason: "monthly_limit" };
  return { allowed: true };
}

export const QUOTA_MESSAGES: Record<string, string> = {
  plan_required: "La generación masiva está disponible a partir del plan Pro.",
  bulk_limit: "Este archivo supera las generaciones masivas disponibles este mes en tu plan.",
  monthly_limit: "Has alcanzado el límite mensual de generaciones de tu plan.",
  too_many_rows: "El archivo supera el número máximo de filas por importación de tu plan.",
  too_many_active_jobs: "Ya tienes 3 trabajos en curso. Espera a que termine alguno antes de lanzar otro.",
  job_not_retryable: "Este trabajo todavía no ha terminado.",
  nothing_to_retry: "No hay elementos fallidos que reintentar.",
};

/** Estados de suscripción que dan acceso al plan contratado. */
export function subscriptionGrantsAccess(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
