/**
 * Catálogo de planes — espejo tipado de la tabla `public.plans`
 * (supabase/migrations/20261104000200_plans.sql). La base de datos es la
 * fuente de verdad para aplicar límites; este espejo sirve a la web pública
 * (precios) y a la UI. `tests/integration/plans-sync.test.ts` verifica que
 * ambos coinciden. Precios y límites EXACTOS del PDF: no modificar sin
 * autorización.
 */

export const PLAN_CODES = ["pro", "max", "business", "excelencia"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const FEATURES = [
  "import",
  "date_reminders",
  "quotes_pdf",
  "google_calendar",
  "km_reminders",
  "reports",
  "multi_branch",
  "priority_support",
  "onboarding",
  "api",
  "custom_templates",
  "included_domain",
  "account_manager",
] as const;
export type Feature = (typeof FEATURES)[number];

export interface Plan {
  code: PlanCode;
  name: string;
  priceMonthCents: number;
  priceYearCents: number;
  /** null = ilimitado */
  maxCustomers: number | null;
  maxActiveVehicles: number | null;
  monthlyEmails: number;
  maxUsers: number | null;
  maxBranches: number | null;
  features: readonly Feature[];
}

const PRO_FEATURES = ["import", "date_reminders", "quotes_pdf"] as const satisfies readonly Feature[];
const MAX_FEATURES = [...PRO_FEATURES, "google_calendar", "km_reminders", "reports"] as const satisfies readonly Feature[];
const BUSINESS_FEATURES = [...MAX_FEATURES, "multi_branch", "priority_support", "onboarding"] as const satisfies readonly Feature[];
const EXCELENCIA_FEATURES = [
  ...BUSINESS_FEATURES,
  "api",
  "custom_templates",
  "included_domain",
  "account_manager",
] as const satisfies readonly Feature[];

export const PLANS: Readonly<Record<PlanCode, Plan>> = {
  pro: {
    code: "pro",
    name: "Pro",
    priceMonthCents: 3900,
    priceYearCents: 39000,
    maxCustomers: 150,
    maxActiveVehicles: 300,
    monthlyEmails: 500,
    maxUsers: 1,
    maxBranches: 1,
    features: PRO_FEATURES,
  },
  max: {
    code: "max",
    name: "Max",
    priceMonthCents: 7900,
    priceYearCents: 79000,
    maxCustomers: 800,
    maxActiveVehicles: 2000,
    monthlyEmails: 3000,
    maxUsers: 3,
    maxBranches: 1,
    features: MAX_FEATURES,
  },
  business: {
    code: "business",
    name: "Business",
    priceMonthCents: 14900,
    priceYearCents: 149000,
    maxCustomers: null,
    maxActiveVehicles: null,
    monthlyEmails: 15000,
    maxUsers: null,
    maxBranches: 3,
    features: BUSINESS_FEATURES,
  },
  excelencia: {
    code: "excelencia",
    name: "Excelencia",
    priceMonthCents: 24900,
    priceYearCents: 249000,
    maxCustomers: null,
    maxActiveVehicles: null,
    monthlyEmails: 50000,
    maxUsers: null,
    maxBranches: null,
    features: EXCELENCIA_FEATURES,
  },
};

export function planHasFeature(code: PlanCode, feature: Feature): boolean {
  return PLANS[code].features.includes(feature);
}

/** Plan mínimo que incluye una funcionalidad (para mensajes de "mejora tu plan"). */
export function minimumPlanFor(feature: Feature): PlanCode {
  const code = PLAN_CODES.find((c) => planHasFeature(c, feature));
  if (!code) throw new Error(`Ningún plan incluye ${feature}`);
  return code;
}
