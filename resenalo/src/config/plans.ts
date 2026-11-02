// Definición comercial de los planes. Es la fuente de verdad que se sincroniza
// con la tabla `plans` (prisma/seed.ts) y con Stripe (scripts/stripe-setup.ts).
// Los precios son finales para el cliente: IVA (21 %) incluido.

export type PlanCodeT = "STARTER" | "PRO" | "BUSINESS";
export type Interval = "month" | "year";

export type PlanFeatures = {
  campaigns: boolean;
  advancedStats: boolean;
  fullStats: boolean; // exportación CSV y desglose completo
  multipleTemplates: boolean;
  sendWindow: boolean; // ventanas horarias de envío
  serviceFilters: boolean; // reglas por servicio
  apiAccess: boolean; // API REST + webhooks entrantes
  customerTags: boolean; // gestión avanzada de clientes (etiquetas, exportación)
  reminders: boolean; // un recordatorio si no se abrió el enlace
  sms: boolean; // canal SMS
  reviewReplies: boolean; // responder reseñas de Google desde el panel
};

export type PlanDefinition = {
  code: PlanCodeT;
  name: string;
  priceCents: number; // mensual, IVA incluido
  annualPriceCents: number; // anual, IVA incluido (2 meses gratis)
  vatRateBps: number;
  monthlyEmailLimit: number;
  monthlySmsLimit: number;
  maxTemplates: number | null;
  maxAutomationRules: number;
  sortOrder: number;
  tagline: string;
  highlights: string[];
  features: PlanFeatures;
};

/** Días de prueba gratuita (una sola vez por negocio) y cupo durante la prueba. */
export const TRIAL_DAYS = 14;
export const TRIAL_EMAIL_CAP = 50;
export const TRIAL_SMS_CAP = 10;

export const PLANS: PlanDefinition[] = [
  {
    code: "STARTER",
    name: "Starter",
    priceCents: 1500,
    annualPriceCents: 15000,
    vatRateBps: 2100,
    monthlyEmailLimit: 100,
    monthlySmsLimit: 0,
    maxTemplates: 1,
    maxAutomationRules: 1,
    sortOrder: 1,
    tagline: "Para empezar a pedir reseñas sin esfuerzo.",
    highlights: [
      "Hasta 100 correos al mes",
      "Conexión de Gmail u Outlook",
      "Personalización de mensajes",
      "Envío automatizado",
      "Reseñas de Google y valoración media en el panel",
      "Kit QR para el mostrador",
      "Estadísticas e historial de envíos",
    ],
    features: {
      campaigns: false,
      advancedStats: false,
      fullStats: false,
      multipleTemplates: false,
      sendWindow: false,
      serviceFilters: false,
      apiAccess: false,
      customerTags: false,
      reminders: false,
      sms: false,
      reviewReplies: false,
    },
  },
  {
    code: "PRO",
    name: "Pro",
    priceCents: 3299,
    annualPriceCents: 32990,
    vatRateBps: 2100,
    monthlyEmailLimit: 300,
    monthlySmsLimit: 50,
    maxTemplates: 10,
    maxAutomationRules: 3,
    sortOrder: 2,
    tagline: "Más canales y control para negocios en crecimiento.",
    highlights: [
      "Hasta 300 correos y 50 SMS al mes",
      "SMS desde tu propio móvil Android, con tu número",
      "Todo lo de Starter",
      "Recordatorio automático si no abren el enlace",
      "Responde a tus reseñas de Google desde el panel",
      "Plantillas personalizadas (hasta 10) y campañas",
      "Estadísticas avanzadas",
      "API y webhooks para integraciones",
    ],
    features: {
      campaigns: true,
      advancedStats: true,
      fullStats: false,
      multipleTemplates: true,
      sendWindow: false,
      serviceFilters: true,
      apiAccess: true,
      customerTags: false,
      reminders: true,
      sms: true,
      reviewReplies: true,
    },
  },
  {
    code: "BUSINESS",
    name: "Business",
    priceCents: 6997,
    annualPriceCents: 69970,
    vatRateBps: 2100,
    monthlyEmailLimit: 1000,
    monthlySmsLimit: 200,
    maxTemplates: null,
    maxAutomationRules: 20,
    sortOrder: 3,
    tagline: "Máxima capacidad y automatización avanzada.",
    highlights: [
      "Hasta 1.000 correos y 200 SMS al mes",
      "Todo lo de Pro",
      "Automatizaciones avanzadas (ventanas horarias, reglas por servicio)",
      "Estadísticas completas y exportación",
      "Gestión avanzada de clientes (etiquetas, exportación)",
      "Plantillas ilimitadas",
    ],
    features: {
      campaigns: true,
      advancedStats: true,
      fullStats: true,
      multipleTemplates: true,
      sendWindow: true,
      serviceFilters: true,
      apiAccess: true,
      customerTags: true,
      reminders: true,
      sms: true,
      reviewReplies: true,
    },
  },
];

export const planByCode = (code: string) => PLANS.find((p) => p.code === code);
