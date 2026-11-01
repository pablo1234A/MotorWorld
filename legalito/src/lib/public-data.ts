import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_FAQS, type Faq } from "@/content/faqs";

/**
 * Datos públicos cacheados (sin cookies ni sesión): FAQ y planes.
 * Se leen con la clave anónima, sujetos a RLS, y se invalidan por etiqueta
 * desde administración. Si Supabase no está disponible se usan los valores por defecto.
 */
export interface PublicPlan {
  code: string;
  name: string;
  description: string;
  kind: "one_time" | "subscription";
  priceCents: number;
  currency: string;
  interval: "month" | "year" | null;
  features: string[];
  generationsLimit: number | null;
  /** Suscripciones: documentos al mes (null = ilimitados). */
  documentsPerPeriod: number | null;
  includesUpdates: boolean;
}

const SUB_FEATURES = ["Aviso legal, privacidad y cookies", "Descarga en PDF y código HTML", "Nuevas versiones revisadas de las plantillas", "Avisos de cambios relevantes", "Cancela cuando quieras"];

export const DEFAULT_PLANS: PublicPlan[] = [
  {
    code: "one_time_pack",
    name: "Pago único",
    description: "Genera tus tres documentos una vez y descárgalos cuando quieras.",
    kind: "one_time",
    priceCents: 3900,
    currency: "eur",
    interval: null,
    generationsLimit: 3,
    documentsPerPeriod: null,
    includesUpdates: false,
    features: [
      "Aviso legal, política de privacidad y política de cookies",
      "Descarga en PDF y código HTML",
      "Acceso permanente a los documentos comprados",
      "Hasta 3 generaciones para corregir tus datos",
      "Sin actualizaciones futuras incluidas",
    ],
  },
  {
    code: "subscription_basic",
    name: "Básico",
    description: "Para mantener al día los textos legales de una web.",
    kind: "subscription",
    priceCents: 599,
    currency: "eur",
    interval: "month",
    generationsLimit: null,
    documentsPerPeriod: 20,
    includesUpdates: true,
    features: ["Hasta 20 documentos al mes", ...SUB_FEATURES],
  },
  {
    code: "subscription_medium",
    name: "Medium",
    description: "Para negocios que actualizan su web con frecuencia.",
    kind: "subscription",
    priceCents: 999,
    currency: "eur",
    interval: "month",
    generationsLimit: null,
    documentsPerPeriod: 50,
    includesUpdates: true,
    features: ["Hasta 50 documentos al mes", ...SUB_FEATURES],
  },
  {
    code: "subscription_business",
    name: "Business",
    description: "Sin límites para negocios con mucha actividad.",
    kind: "subscription",
    priceCents: 1999,
    currency: "eur",
    interval: "month",
    generationsLimit: null,
    documentsPerPeriod: null,
    includesUpdates: true,
    features: ["Documentos ilimitados", ...SUB_FEATURES],
  },
];

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getPublicFaqs(): Promise<Faq[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("faqs");
  const db = anonClient();
  if (!db) return DEFAULT_FAQS;
  try {
    const { data, error } = await db.from("faqs").select("question, answer, category").eq("published", true).order("sort_order");
    if (error || !data || data.length === 0) return DEFAULT_FAQS;
    return data as Faq[];
  } catch {
    return DEFAULT_FAQS;
  }
}

export async function getPublicPlans(): Promise<PublicPlan[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const db = anonClient();
  if (!db) return DEFAULT_PLANS;
  try {
    const { data, error } = await db.from("products").select("*").eq("active", true).order("sort_order");
    if (error || !data || data.length === 0) return DEFAULT_PLANS;
    return data.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      kind: p.kind,
      priceCents: p.price_cents,
      currency: p.currency,
      interval: p.billing_interval,
      features: Array.isArray(p.features) ? p.features : [],
      generationsLimit: p.generations_limit,
      documentsPerPeriod: p.documents_per_period ?? null,
      includesUpdates: p.includes_updates,
    }));
  } catch {
    return DEFAULT_PLANS;
  }
}
