import type { Answers } from "./questionnaire";
import { COOKIE_CATALOG, COOKIE_KIND_LABEL, TOOL_LABELS, type CookieEntry } from "./cookie-catalog";

/**
 * Contexto documental: transforma respuestas validadas en datos y banderas
 * listas para que las plantillas las usen mediante variables `{{ruta}}` y
 * condiciones. Aquí no se redacta texto jurídico: solo datos y etiquetas.
 */
export interface DocumentContext {
  owner: {
    type: "persona_fisica" | "persona_juridica";
    is_company: boolean;
    legal_name: string;
    trade_name: string;
    display_name: string;
    nif: string;
    address_full: string;
    registry_data: string;
  };
  contact: { email: string; phone: string; website: string; domain: string };
  business: {
    type: string;
    type_label: string;
    activity: string;
    is_ecommerce: boolean;
    sells_to_consumers: boolean;
    ships_goods: boolean;
  };
  professional: { regulated: boolean; college: string; number: string; title: string };
  data: {
    collects_any: boolean;
    contact_form: boolean;
    newsletter: boolean;
    newsletter_provider: string;
    accounts: boolean;
    orders: boolean;
    bookings: boolean;
    job_applications: boolean;
    comments: boolean;
    special_categories: boolean;
    minors: boolean;
    has_dpo: boolean;
    dpo_contact: string;
  };
  cookies: {
    analytics_tool: string;
    analytics_label: string;
    uses_analytics: boolean;
    uses_analytics_cookies: boolean;
    uses_advertising: boolean;
    advertising_labels: string;
    uses_embeds: boolean;
    embeds_labels: string;
    has_chat: boolean;
    has_nonessential: boolean;
    has_cmp: boolean;
    cmp_name: string;
    list: { name: string; provider: string; purpose: string; duration: string; kind: string }[];
    has_third_party: boolean;
  };
  processors: { name: string; purpose: string }[];
  international_transfers: boolean;
  meta: { generated_date: string };
}

const BUSINESS_LABELS: Record<string, string> = {
  autonomo_web: "autónomo",
  profesional: "profesional independiente",
  pequena_empresa: "empresa",
  negocio_local: "negocio local",
  tienda_online: "tienda online",
};

const EMAIL_PROVIDER: Record<string, { name: string; transfer: boolean }> = {
  google_workspace: { name: "Google (Google Workspace)", transfer: true },
  microsoft_365: { name: "Microsoft (Microsoft 365)", transfer: true },
  hosting: { name: "Proveedor de alojamiento web", transfer: false },
  otro: { name: "Proveedor de correo electrónico", transfer: false },
};

const PAYMENT_PROVIDER: Record<string, { name: string; transfer: boolean }> = {
  stripe: { name: "Stripe", transfer: true },
  paypal: { name: "PayPal", transfer: true },
  redsys: { name: "Redsys y la entidad bancaria del TPV", transfer: false },
  otra: { name: "Pasarela de pago", transfer: false },
};

const US_KEYWORDS = /(mailchimp|hubspot|salesforce|google|microsoft|amazon|aws|shopify|squarespace|wix|calendly|zoom|meta|facebook)/i;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown) => v === true;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function formatDateEs(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(date);
}

/** Construye el contexto a partir de respuestas YA validadas (`validateAnswers().cleaned`). */
export function buildContext(a: Answers, now: Date = new Date()): DocumentContext {
  const isCompany = a.owner_type === "persona_juridica";
  const legalName = str(a.legal_name);
  const tradeName = str(a.trade_name);
  const website = str(a.website_url);
  let domain = "";
  try {
    domain = website ? new URL(website).hostname.replace(/^www\./, "") : "";
  } catch {
    domain = "";
  }

  const collection = arr(a.data_collection);
  const has = (v: string) => collection.includes(v);
  const collectsAny = collection.length > 0 && !has("ninguno");

  // ---- Cookies
  const analyticsTool = str(a.analytics_tool) || "ninguna";
  const advertising = arr(a.advertising).filter((v) => v !== "ninguna");
  const embeds = arr(a.embeds).filter((v) => v !== "ninguno");
  const cookieList: CookieEntry[] = [];
  const hasCmp = bool(a.has_cmp);
  const cmpName = str(a.cmp_name);

  if (hasCmp) {
    cookieList.push({
      name: "Cookie de consentimiento",
      provider: cmpName || "Herramienta de consentimiento",
      purpose: "Recordar tus preferencias sobre cookies",
      duration: "Según la herramienta",
      kind: "tecnica",
      thirdParty: false,
    });
  }
  if (bool(a.business_type === "tienda_online") || has("cuentas") || has("pedidos")) {
    cookieList.push({
      name: "Cookies de sesión",
      provider: "Propia",
      purpose: "Mantener la sesión iniciada y el carrito de compra",
      duration: "Sesión",
      kind: "tecnica",
      thirdParty: false,
    });
  }
  if (COOKIE_CATALOG[analyticsTool]) cookieList.push(...COOKIE_CATALOG[analyticsTool]);
  for (const tool of [...advertising, ...embeds]) {
    if (COOKIE_CATALOG[tool]) cookieList.push(...COOKIE_CATALOG[tool]);
  }
  for (const extra of (Array.isArray(a.extra_cookies) ? a.extra_cookies : []) as Record<string, string>[]) {
    cookieList.push({
      name: extra.name,
      provider: extra.provider,
      purpose: extra.purpose,
      duration: extra.duration,
      kind: "tecnica",
      thirdParty: extra.provider.toLowerCase() !== "propia",
    });
  }
  // Las cookies añadidas por el usuario se marcan como "Por clasificar" para no presumir su naturaleza.
  const extraCount = Array.isArray(a.extra_cookies) ? a.extra_cookies.length : 0;
  const list = cookieList.map((c, i) => ({
    name: c.name,
    provider: c.provider,
    purpose: c.purpose,
    duration: c.duration,
    kind: i >= cookieList.length - extraCount ? "Por clasificar" : COOKIE_KIND_LABEL[c.kind],
  }));

  const usesAnalytics = analyticsTool !== "ninguna";
  const usesAnalyticsCookies = ["google_analytics", "matomo", "otra"].includes(analyticsTool);
  const cookieEmbeds = embeds.filter((e) => ["youtube", "vimeo", "google_maps", "chat"].includes(e));
  const hasNonEssential = usesAnalyticsCookies || advertising.length > 0 || cookieEmbeds.length > 0 || extraCount > 0;

  // ---- Encargados y destinatarios
  const processors: { name: string; purpose: string }[] = [];
  let transfers = false;
  const hosting = str(a.hosting_provider);
  if (hosting) {
    processors.push({ name: hosting, purpose: "Alojamiento de la página web" });
    if (US_KEYWORDS.test(hosting)) transfers = true;
  }
  const email = EMAIL_PROVIDER[str(a.email_provider)];
  if (email) {
    processors.push({ name: email.name, purpose: "Servicio de correo electrónico" });
    transfers ||= email.transfer;
  }
  if (has("newsletter") && str(a.newsletter_provider)) {
    processors.push({ name: str(a.newsletter_provider), purpose: "Envío de comunicaciones por email (newsletter)" });
    if (US_KEYWORDS.test(str(a.newsletter_provider))) transfers = true;
  }
  for (const p of arr(a.payment_providers)) {
    const pp = PAYMENT_PROVIDER[p];
    if (!pp) continue;
    processors.push({ name: pp.name, purpose: "Gestión de pagos" });
    transfers ||= pp.transfer;
  }
  if (bool(a.ships_goods) && str(a.shipping_providers)) {
    processors.push({ name: str(a.shipping_providers), purpose: "Envío y entrega de pedidos" });
  }
  if (usesAnalytics) {
    const label = analyticsTool === "otra" ? str(a.analytics_other_name) : TOOL_LABELS[analyticsTool];
    processors.push({ name: label, purpose: "Análisis estadístico del uso de la web" });
    if (analyticsTool === "google_analytics") transfers = true;
  }
  for (const p of (Array.isArray(a.other_processors) ? a.other_processors : []) as Record<string, string>[]) {
    processors.push({ name: p.name, purpose: p.purpose });
    if (US_KEYWORDS.test(p.name)) transfers = true;
  }
  if (advertising.length > 0 || embeds.some((e) => ["youtube", "google_maps", "recaptcha"].includes(e))) transfers = true;

  const professionalRegulated = bool(a.regulated_profession);

  return {
    owner: {
      type: isCompany ? "persona_juridica" : "persona_fisica",
      is_company: isCompany,
      legal_name: legalName,
      trade_name: tradeName,
      display_name: tradeName || legalName,
      nif: str(a.nif),
      address_full: [str(a.address_line), `${str(a.postal_code)} ${str(a.city)}`.trim(), str(a.province)]
        .filter(Boolean)
        .join(", "),
      registry_data: str(a.registry_data),
    },
    contact: { email: str(a.contact_email), phone: str(a.phone), website, domain },
    business: {
      type: str(a.business_type),
      type_label: BUSINESS_LABELS[str(a.business_type)] ?? "negocio",
      activity: str(a.activity_description),
      is_ecommerce: a.business_type === "tienda_online",
      sells_to_consumers: a.business_type === "tienda_online" && a.sells_to !== "empresas",
      ships_goods: bool(a.ships_goods),
    },
    professional: {
      regulated: professionalRegulated,
      college: professionalRegulated ? str(a.professional_college) : "",
      number: professionalRegulated ? str(a.collegiate_number) : "",
      title: professionalRegulated ? str(a.professional_title) : "",
    },
    data: {
      collects_any: collectsAny,
      contact_form: has("contacto"),
      newsletter: has("newsletter"),
      newsletter_provider: str(a.newsletter_provider),
      accounts: has("cuentas"),
      orders: has("pedidos"),
      bookings: has("reservas"),
      job_applications: has("empleo"),
      comments: has("comentarios"),
      special_categories: collectsAny && bool(a.special_categories),
      minors: collectsAny && bool(a.minors),
      has_dpo: collectsAny && bool(a.has_dpo),
      dpo_contact: str(a.dpo_contact),
    },
    cookies: {
      analytics_tool: analyticsTool,
      analytics_label: analyticsTool === "otra" ? str(a.analytics_other_name) : (TOOL_LABELS[analyticsTool] ?? ""),
      uses_analytics: usesAnalytics,
      uses_analytics_cookies: usesAnalyticsCookies,
      uses_advertising: advertising.length > 0,
      advertising_labels: joinEs(advertising.map((t) => TOOL_LABELS[t] ?? t)),
      uses_embeds: embeds.length > 0,
      embeds_labels: joinEs(embeds.map((t) => TOOL_LABELS[t] ?? t)),
      has_chat: embeds.includes("chat"),
      has_nonessential: hasNonEssential,
      has_cmp: hasCmp,
      cmp_name: cmpName,
      list,
      has_third_party: cookieList.some((c) => c.thirdParty),
    },
    processors,
    international_transfers: transfers,
    meta: { generated_date: formatDateEs(now) },
  };
}
