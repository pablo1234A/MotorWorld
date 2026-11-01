import { evaluate, type Condition } from "./conditions";
import { isValidCompanyTaxId, isValidPersonTaxId, normalizeTaxId } from "@/lib/validation/spanish-id";

/**
 * Cuestionario de Legalito.
 * Definición declarativa compartida por el cliente (formulario) y el servidor
 * (validación). Cualquier cambio incompatible en ids o valores debe
 * acompañarse de un incremento de QUESTIONNAIRE_VERSION y de una revisión de
 * las plantillas que dependan de él.
 */
export const QUESTIONNAIRE_VERSION = 1;

export type StepId = "negocio" | "titular" | "contacto" | "actividad" | "datos" | "cookies" | "servicios";

export interface Step {
  id: StepId;
  title: string;
  description: string;
}

export const STEPS: Step[] = [
  { id: "negocio", title: "Tu negocio", description: "Cuéntanos qué tipo de negocio tienes para hacerte solo las preguntas que te corresponden." },
  { id: "titular", title: "Titular de la web", description: "Los datos identificativos que deben aparecer en tu aviso legal." },
  { id: "contacto", title: "Contacto y web", description: "Cómo pueden contactar contigo los usuarios de tu web." },
  { id: "actividad", title: "Actividad", description: "A qué te dedicas y cómo vendes." },
  { id: "datos", title: "Datos personales", description: "Qué datos de tus usuarios recoges y para qué." },
  { id: "cookies", title: "Analítica y cookies", description: "Herramientas que instalan cookies o tecnologías similares en tu web." },
  { id: "servicios", title: "Servicios externos", description: "Proveedores que tratan datos por cuenta de tu negocio." },
];

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface RepeaterField {
  id: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export type QuestionType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "tel"
  | "radio"
  | "select"
  | "multiselect"
  | "boolean"
  | "tax_id"
  | "postal_code"
  | "repeater";

export interface Advisory {
  when: Condition;
  tone: "info" | "warning";
  text: string;
}

export interface Question {
  id: string;
  step: StepId;
  type: QuestionType;
  label: string;
  /** Etiquetas alternativas según respuestas previas (la primera que cumpla). */
  labelWhen?: { when: Condition; label: string }[];
  help?: string;
  placeholder?: string;
  required?: boolean;
  options?: Option[];
  /** Valor exclusivo en multiselección (p. ej. "ninguno"). */
  exclusiveOption?: string;
  showIf?: Condition;
  maxLength?: number;
  fields?: RepeaterField[];
  maxItems?: number;
  advisories?: Advisory[];
  autocomplete?: string;
}

export type Answers = Record<string, unknown>;

const isCompany: Condition = { eq: ["owner_type", "persona_juridica"] };
const isEcommerce: Condition = { eq: ["business_type", "tienda_online"] };
const collectsData: Condition = { all: [{ nonEmpty: "data_collection" }, { not: { includes: ["data_collection", "ninguno"] } }] };

export const QUESTIONS: Question[] = [
  // ---------------------------------------------------------------- negocio
  {
    id: "business_type",
    step: "negocio",
    type: "radio",
    label: "¿Qué tipo de negocio tienes?",
    required: true,
    options: [
      { value: "autonomo_web", label: "Autónomo o freelance", hint: "Web para presentar tus servicios" },
      { value: "profesional", label: "Profesional independiente", hint: "Consultoría, diseño, psicología, abogacía…" },
      { value: "pequena_empresa", label: "Pequeña empresa", hint: "Sociedad con web corporativa" },
      { value: "negocio_local", label: "Negocio local", hint: "Restaurante, peluquería, taller, tienda física…" },
      { value: "tienda_online", label: "Tienda online", hint: "Vendes productos o servicios por internet" },
      { value: "asociacion", label: "Asociación o entidad sin ánimo de lucro", hint: "ONG, club deportivo, federación, fundación…" },
      { value: "otro", label: "Otro tipo de web", hint: "Blog con publicidad, academia, proyecto personal con actividad económica…" },
    ],
  },
  {
    id: "owner_type",
    step: "negocio",
    type: "radio",
    label: "¿Quién es el titular de la web?",
    required: true,
    options: [
      { value: "persona_fisica", label: "Una persona física", hint: "Autónomo o particular, con NIF/NIE" },
      { value: "persona_juridica", label: "Una sociedad o entidad", hint: "S.L., S.A., cooperativa, asociación…" },
    ],
  },

  // ---------------------------------------------------------------- titular
  {
    id: "legal_name",
    step: "titular",
    type: "text",
    label: "Nombre y apellidos del titular",
    labelWhen: [{ when: isCompany, label: "Razón social" }],
    placeholder: "Tal como figura en tu NIF",
    required: true,
    maxLength: 200,
    autocomplete: "name",
  },
  {
    id: "trade_name",
    step: "titular",
    type: "text",
    label: "Nombre comercial",
    help: "El nombre con el que te conocen tus clientes, si es distinto.",
    maxLength: 200,
    autocomplete: "organization",
  },
  {
    id: "nif",
    step: "titular",
    type: "tax_id",
    label: "NIF o NIE",
    labelWhen: [{ when: isCompany, label: "NIF de la entidad" }],
    placeholder: "12345678Z",
    required: true,
  },
  {
    id: "address_line",
    step: "titular",
    type: "text",
    label: "Domicilio",
    placeholder: "Calle, número, piso",
    required: true,
    maxLength: 250,
    autocomplete: "street-address",
  },
  { id: "postal_code", step: "titular", type: "postal_code", label: "Código postal", required: true, autocomplete: "postal-code" },
  { id: "city", step: "titular", type: "text", label: "Municipio", required: true, maxLength: 120, autocomplete: "address-level2" },
  { id: "province", step: "titular", type: "text", label: "Provincia", required: true, maxLength: 120, autocomplete: "address-level1" },
  {
    id: "registry_data",
    step: "titular",
    type: "text",
    label: "Datos de inscripción registral",
    help: "Para sociedades mercantiles: registro, tomo, folio, hoja e inscripción. Si tu entidad no está obligada a inscribirse, indica el registro que corresponda o escribe «No aplica».",
    placeholder: "Registro Mercantil de Madrid, Tomo 1234, Folio 56, Hoja M-78901",
    required: true,
    maxLength: 300,
    showIf: isCompany,
  },
  {
    id: "regulated_profession",
    step: "titular",
    type: "boolean",
    label: "¿Ejerces una profesión regulada?",
    help: "Por ejemplo: abogacía, psicología, arquitectura, fisioterapia, ingeniería colegiada…",
    required: true,
    showIf: { in: ["business_type", ["autonomo_web", "profesional", "pequena_empresa"]] },
  },
  {
    id: "professional_college",
    step: "titular",
    type: "text",
    label: "Colegio profesional",
    placeholder: "Ilustre Colegio de la Abogacía de Madrid",
    required: true,
    maxLength: 200,
    showIf: { truthy: "regulated_profession" },
  },
  {
    id: "collegiate_number",
    step: "titular",
    type: "text",
    label: "Número de colegiado",
    required: true,
    maxLength: 40,
    showIf: { truthy: "regulated_profession" },
  },
  {
    id: "professional_title",
    step: "titular",
    type: "text",
    label: "Título académico y Estado que lo expidió",
    placeholder: "Grado en Psicología, expedido en España",
    required: true,
    maxLength: 200,
    showIf: { truthy: "regulated_profession" },
  },

  // ---------------------------------------------------------------- contacto
  {
    id: "contact_email",
    step: "contacto",
    type: "email",
    label: "Email de contacto público",
    help: "Aparecerá en tus documentos para que los usuarios puedan contactarte.",
    required: true,
    autocomplete: "email",
  },
  { id: "phone", step: "contacto", type: "tel", label: "Teléfono de contacto", maxLength: 30, autocomplete: "tel" },
  {
    id: "website_url",
    step: "contacto",
    type: "url",
    label: "Dirección de tu página web",
    placeholder: "https://www.tunegocio.es",
    required: true,
    autocomplete: "url",
  },

  // ---------------------------------------------------------------- actividad
  {
    id: "activity_description",
    step: "actividad",
    type: "textarea",
    label: "Describe brevemente tu actividad",
    placeholder: "Diseño gráfico y desarrollo de páginas web para pequeños negocios.",
    required: true,
    maxLength: 500,
  },
  {
    id: "sells_to",
    step: "actividad",
    type: "radio",
    label: "¿A quién vendes?",
    required: true,
    showIf: isEcommerce,
    options: [
      { value: "consumidores", label: "A consumidores particulares" },
      { value: "empresas", label: "Solo a empresas y profesionales" },
      { value: "ambos", label: "A ambos" },
    ],
  },
  {
    id: "ships_goods",
    step: "actividad",
    type: "boolean",
    label: "¿Envías productos físicos?",
    required: true,
    showIf: isEcommerce,
  },

  // ---------------------------------------------------------------- datos
  {
    id: "data_collection",
    step: "datos",
    type: "multiselect",
    label: "¿Cómo recoges datos personales en tu web?",
    help: "Marca todas las opciones que correspondan.",
    required: true,
    exclusiveOption: "ninguno",
    options: [
      { value: "contacto", label: "Formulario de contacto o email" },
      { value: "newsletter", label: "Suscripción a newsletter" },
      { value: "cuentas", label: "Registro de usuarios o área de clientes" },
      { value: "pedidos", label: "Pedidos o compras" },
      { value: "reservas", label: "Reservas o citas" },
      { value: "empleo", label: "Envío de currículums" },
      { value: "comentarios", label: "Comentarios o reseñas" },
      { value: "redes", label: "Perfiles en redes sociales", hint: "Instagram, Facebook, LinkedIn, TikTok…" },
      { value: "ninguno", label: "No recojo datos personales" },
    ],
    advisories: [
      {
        when: { all: [{ eq: ["business_type", "tienda_online"] }, { not: { includes: ["data_collection", "pedidos"] } }] },
        tone: "warning",
        text: "Si tienes una tienda online, normalmente recoges datos al tramitar pedidos. Revisa si debes marcar «Pedidos o compras».",
      },
    ],
  },
  {
    id: "newsletter_provider",
    step: "datos",
    type: "text",
    label: "¿Con qué herramienta envías la newsletter?",
    placeholder: "Mailchimp, Brevo, MailerLite…",
    required: true,
    maxLength: 100,
    showIf: { includes: ["data_collection", "newsletter"] },
  },
  {
    id: "special_categories",
    step: "datos",
    type: "boolean",
    label: "¿Tratas datos de salud u otras categorías especiales de datos?",
    help: "Salud, origen étnico, ideología, religión, orientación sexual, datos genéticos o biométricos.",
    required: true,
    showIf: collectsData,
    advisories: [
      {
        when: { truthy: "special_categories" },
        tone: "warning",
        text: "Tratar categorías especiales de datos exige garantías reforzadas. Tu política incluirá un apartado específico, pero te recomendamos revisarla con un profesional.",
      },
    ],
  },
  {
    id: "minors",
    step: "datos",
    type: "boolean",
    label: "¿Tu web o servicio se dirige a menores de 14 años?",
    required: true,
    showIf: collectsData,
    advisories: [
      {
        when: { truthy: "minors" },
        tone: "warning",
        text: "Si tratas datos de menores de 14 años necesitas el consentimiento de sus padres o tutores. Te recomendamos asesoramiento profesional.",
      },
    ],
  },
  {
    id: "has_dpo",
    step: "datos",
    type: "boolean",
    label: "¿Has designado un Delegado de Protección de Datos (DPO)?",
    help: "Solo es obligatorio en determinados casos. Si no sabes qué es, probablemente no lo tienes.",
    required: true,
    showIf: collectsData,
  },
  {
    id: "dpo_contact",
    step: "datos",
    type: "email",
    label: "Email de contacto del DPO",
    required: true,
    showIf: { truthy: "has_dpo" },
  },

  // ---------------------------------------------------------------- cookies
  {
    id: "analytics_tool",
    step: "cookies",
    type: "radio",
    label: "¿Usas alguna herramienta de analítica web?",
    required: true,
    options: [
      { value: "ninguna", label: "No uso analítica" },
      { value: "google_analytics", label: "Google Analytics" },
      { value: "matomo", label: "Matomo" },
      { value: "plausible", label: "Plausible", hint: "No utiliza cookies" },
      { value: "otra", label: "Otra herramienta" },
    ],
  },
  {
    id: "analytics_other_name",
    step: "cookies",
    type: "text",
    label: "Nombre de la herramienta de analítica",
    required: true,
    maxLength: 100,
    showIf: { eq: ["analytics_tool", "otra"] },
  },
  {
    id: "advertising",
    step: "cookies",
    type: "multiselect",
    label: "¿Usas publicidad o píxeles de seguimiento?",
    required: true,
    exclusiveOption: "ninguna",
    options: [
      { value: "google_ads", label: "Google Ads" },
      { value: "meta_pixel", label: "Píxel de Meta (Facebook / Instagram)" },
      { value: "tiktok_pixel", label: "Píxel de TikTok" },
      { value: "linkedin_insight", label: "LinkedIn Insight Tag" },
      { value: "ninguna", label: "No uso publicidad ni píxeles" },
    ],
  },
  {
    id: "embeds",
    step: "cookies",
    type: "multiselect",
    label: "¿Integras contenido o servicios de terceros?",
    required: true,
    exclusiveOption: "ninguno",
    options: [
      { value: "youtube", label: "Vídeos de YouTube" },
      { value: "vimeo", label: "Vídeos de Vimeo" },
      { value: "google_maps", label: "Mapas de Google Maps" },
      { value: "recaptcha", label: "Google reCAPTCHA" },
      { value: "chat", label: "Chat o WhatsApp en la web" },
      { value: "ninguno", label: "Ninguno" },
    ],
  },
  {
    id: "extra_cookies",
    step: "cookies",
    type: "repeater",
    label: "Otras cookies que conozcas",
    help: "Si un escaneo de tu web muestra cookies adicionales, añádelas aquí.",
    maxItems: 20,
    fields: [
      { id: "name", label: "Nombre", required: true, maxLength: 80, placeholder: "_ejemplo" },
      { id: "provider", label: "Proveedor", required: true, maxLength: 80 },
      { id: "purpose", label: "Finalidad", required: true, maxLength: 200 },
      { id: "duration", label: "Duración", required: true, maxLength: 40, placeholder: "1 año" },
    ],
  },
  {
    id: "has_cmp",
    step: "cookies",
    type: "boolean",
    label: "¿Tienes instalado un banner o gestor de consentimiento de cookies?",
    help: "Herramientas como Cookiebot, CookieYes, Complianz o similares.",
    required: true,
    showIf: {
      any: [
        { in: ["analytics_tool", ["google_analytics", "matomo", "otra"]] },
        { all: [{ nonEmpty: "advertising" }, { not: { includes: ["advertising", "ninguna"] } }] },
        { any: [{ includes: ["embeds", "youtube"] }, { includes: ["embeds", "vimeo"] }, { includes: ["embeds", "google_maps"] }, { includes: ["embeds", "chat"] }] },
      ],
    },
    advisories: [
      {
        when: { falsy: "has_cmp" },
        tone: "warning",
        text: "Usas cookies que requieren consentimiento. La política de cookies no basta: necesitas un sistema que solicite y registre el consentimiento antes de instalarlas.",
      },
    ],
  },
  {
    id: "cmp_name",
    step: "cookies",
    type: "text",
    label: "¿Qué herramienta de consentimiento usas?",
    required: true,
    maxLength: 100,
    showIf: { truthy: "has_cmp" },
  },

  // ---------------------------------------------------------------- servicios
  {
    id: "hosting_provider",
    step: "servicios",
    type: "text",
    label: "¿Dónde está alojada tu web?",
    placeholder: "Hostinger, SiteGround, Raiola, Webempresa…",
    required: true,
    maxLength: 100,
  },
  {
    id: "email_provider",
    step: "servicios",
    type: "select",
    label: "¿Qué servicio de correo electrónico usas?",
    required: true,
    options: [
      { value: "google_workspace", label: "Google Workspace / Gmail" },
      { value: "microsoft_365", label: "Microsoft 365 / Outlook" },
      { value: "hosting", label: "El correo de mi proveedor de hosting" },
      { value: "otro", label: "Otro" },
    ],
  },
  {
    id: "payment_providers",
    step: "servicios",
    type: "multiselect",
    label: "¿Qué pasarelas de pago usas en la web?",
    required: true,
    exclusiveOption: "ninguna",
    showIf: { any: [isEcommerce, { includes: ["data_collection", "pedidos"] }, { includes: ["data_collection", "reservas"] }] },
    options: [
      { value: "stripe", label: "Stripe" },
      { value: "paypal", label: "PayPal" },
      { value: "redsys", label: "Redsys (TPV virtual de tu banco)" },
      { value: "otra", label: "Otra" },
      { value: "ninguna", label: "No cobro online" },
    ],
  },
  {
    id: "shipping_providers",
    step: "servicios",
    type: "text",
    label: "¿Con qué empresas de transporte envías?",
    placeholder: "Correos, SEUR, MRW…",
    required: true,
    maxLength: 200,
    showIf: { truthy: "ships_goods" },
  },
  {
    id: "other_processors",
    step: "servicios",
    type: "repeater",
    label: "Otros proveedores que tratan datos de tus usuarios",
    help: "Por ejemplo: CRM, herramienta de facturación o de reservas.",
    maxItems: 15,
    fields: [
      { id: "name", label: "Proveedor", required: true, maxLength: 100 },
      { id: "purpose", label: "Para qué lo usas", required: true, maxLength: 200 },
    ],
  },
];

const QUESTION_INDEX = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return QUESTION_INDEX.get(id);
}

export function isVisible(question: Question, answers: Answers): boolean {
  return evaluate(question.showIf, answers);
}

export function visibleQuestions(answers: Answers, step?: StepId): Question[] {
  return QUESTIONS.filter((q) => (!step || q.step === step) && isVisible(q, answers));
}

export function questionLabel(question: Question, answers: Answers): string {
  return question.labelWhen?.find((l) => evaluate(l.when, answers))?.label ?? question.label;
}

export function activeAdvisories(answers: Answers): { questionId: string; tone: Advisory["tone"]; text: string }[] {
  return visibleQuestions(answers).flatMap((q) =>
    (q.advisories ?? [])
      .filter((a) => q.id in answers && evaluate(a.when, answers))
      .map((a) => ({ questionId: q.id, tone: a.tone, text: a.text })),
  );
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeUrl(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  /** Respuestas limpias: solo preguntas visibles, normalizadas. */
  cleaned: Answers;
}

function validateQuestion(q: Question, raw: unknown, answers: Answers): { error?: string; value?: unknown } {
  const empty =
    raw === undefined ||
    raw === null ||
    (typeof raw === "string" && raw.trim() === "") ||
    (Array.isArray(raw) && raw.length === 0);

  if (empty) {
    if (q.required) return { error: q.type === "boolean" ? "Selecciona una opción." : "Este campo es obligatorio." };
    return {};
  }

  switch (q.type) {
    case "text":
    case "textarea":
    case "tel": {
      if (typeof raw !== "string") return { error: "Valor no válido." };
      const v = raw.trim().replace(/\s+/g, q.type === "textarea" ? " " : " ");
      if (q.maxLength && v.length > q.maxLength) return { error: `Máximo ${q.maxLength} caracteres.` };
      if (q.type === "tel" && !/^\+?[0-9 ()-]{6,30}$/.test(v)) return { error: "Introduce un teléfono válido." };
      return { value: v };
    }
    case "email": {
      if (typeof raw !== "string") return { error: "Valor no válido." };
      const v = raw.trim().toLowerCase();
      if (!EMAIL_RE.test(v) || v.length > 254) return { error: "Introduce un email válido." };
      return { value: v };
    }
    case "url": {
      if (typeof raw !== "string") return { error: "Valor no válido." };
      const v = normalizeUrl(raw.trim());
      if (!v || v.length > 300) return { error: "Introduce una dirección web válida, por ejemplo https://www.tunegocio.es" };
      return { value: v };
    }
    case "postal_code": {
      const v = String(raw).trim();
      if (!/^(0[1-9]|[1-4][0-9]|5[0-2])[0-9]{3}$/.test(v)) return { error: "Introduce un código postal español válido." };
      return { value: v };
    }
    case "tax_id": {
      if (typeof raw !== "string") return { error: "Valor no válido." };
      const v = normalizeTaxId(raw);
      const company = answers.owner_type === "persona_juridica";
      const ok = company ? isValidCompanyTaxId(v) : isValidPersonTaxId(v);
      if (!ok)
        return {
          error: company
            ? "El NIF de la entidad no es válido. Revisa la letra inicial y el dígito de control."
            : "El NIF o NIE no es válido. Revisa la letra de control.",
        };
      return { value: v };
    }
    case "radio":
    case "select": {
      if (typeof raw !== "string" || !q.options?.some((o) => o.value === raw)) return { error: "Selecciona una opción válida." };
      return { value: raw };
    }
    case "boolean": {
      if (raw === true || raw === "true") return { value: true };
      if (raw === false || raw === "false") return { value: false };
      return { error: "Selecciona una opción." };
    }
    case "multiselect": {
      if (!Array.isArray(raw)) return { error: "Valor no válido." };
      const allowed = new Set(q.options?.map((o) => o.value));
      let values = Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && allowed.has(v))));
      if (q.exclusiveOption && values.includes(q.exclusiveOption) && values.length > 1) {
        return { error: "Has marcado una opción incompatible con las demás." };
      }
      if (values.length === 0 && q.required) return { error: "Selecciona al menos una opción." };
      values = q.options!.map((o) => o.value).filter((v) => values.includes(v));
      return { value: values };
    }
    case "repeater": {
      if (!Array.isArray(raw)) return { error: "Valor no válido." };
      if (q.maxItems && raw.length > q.maxItems) return { error: `Máximo ${q.maxItems} elementos.` };
      const items: Record<string, string>[] = [];
      for (const [i, item] of raw.entries()) {
        if (!item || typeof item !== "object") return { error: `Elemento ${i + 1} no válido.` };
        const out: Record<string, string> = {};
        for (const f of q.fields ?? []) {
          const val = (item as Record<string, unknown>)[f.id];
          const s = typeof val === "string" ? val.trim() : "";
          if (!s && f.required) return { error: `Completa «${f.label}» en el elemento ${i + 1}.` };
          if (f.maxLength && s.length > f.maxLength) return { error: `«${f.label}» admite como máximo ${f.maxLength} caracteres.` };
          out[f.id] = s;
        }
        items.push(out);
      }
      return { value: items };
    }
  }
}

/**
 * Valida las respuestas. Solo se validan y conservan las preguntas visibles:
 * las respuestas de ramas ocultas se descartan para no arrastrar datos obsoletos.
 * Con `step` se valida únicamente ese paso (validación incremental del formulario).
 */
export function validateAnswers(input: Answers, options: { step?: StepId } = {}): ValidationResult {
  const errors: Record<string, string> = {};
  const cleaned: Answers = {};

  // Se evalúa la visibilidad sobre respuestas progresivamente limpiadas para que
  // una respuesta inválida no active ramas que no corresponden.
  for (const q of QUESTIONS) {
    if (!evaluate(q.showIf, cleaned)) continue;
    const { error, value } = validateQuestion(q, input[q.id], cleaned);
    if (error) {
      if (!options.step || q.step === options.step) errors[q.id] = error;
      continue;
    }
    if (value !== undefined) cleaned[q.id] = value;
  }

  return { valid: Object.keys(errors).length === 0, errors, cleaned };
}

/** Progreso aproximado: preguntas obligatorias visibles respondidas correctamente. */
export function progress(answers: Answers): { answered: number; total: number; percent: number } {
  const { cleaned } = validateAnswers(answers);
  const required = QUESTIONS.filter((q) => q.required && evaluate(q.showIf, cleaned));
  const answered = required.filter((q) => q.id in cleaned).length;
  const total = required.length;
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) };
}

/** Primer paso con errores o pendiente; útil para continuar más tarde. */
export function firstIncompleteStep(answers: Answers): StepId | null {
  const { errors } = validateAnswers(answers);
  for (const step of STEPS) {
    if (QUESTIONS.some((q) => q.step === step.id && errors[q.id])) return step.id;
  }
  return null;
}

/** Sanitiza un objeto arbitrario recibido del cliente a la forma de Answers. */
export function coerceAnswers(input: unknown): Answers {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Answers = {};
  for (const q of QUESTIONS) {
    const v = (input as Record<string, unknown>)[q.id];
    if (v !== undefined) out[q.id] = v;
  }
  return out;
}
