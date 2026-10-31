// Definición comercial de los planes. Es la fuente de verdad que se sincroniza
// con la tabla `plans` (prisma/seed.ts) y con Stripe (scripts/stripe-setup.ts).
// Los precios son finales para el cliente: IVA (21 %) incluido.

export type PlanCodeT = "STARTER" | "PRO" | "BUSINESS";

export type PlanFeatures = {
  campaigns: boolean;
  advancedStats: boolean;
  fullStats: boolean; // exportación CSV y desglose completo
  multipleTemplates: boolean;
  sendWindow: boolean; // ventanas horarias de envío
  serviceFilters: boolean; // reglas por servicio
  apiAccess: boolean; // API REST + webhooks entrantes
  customerTags: boolean; // gestión avanzada de clientes (etiquetas, exportación)
};

export type PlanDefinition = {
  code: PlanCodeT;
  name: string;
  priceCents: number;
  vatRateBps: number;
  monthlyEmailLimit: number;
  maxTemplates: number | null;
  maxAutomationRules: number;
  sortOrder: number;
  tagline: string;
  highlights: string[];
  features: PlanFeatures;
};

export const PLANS: PlanDefinition[] = [
  {
    code: "STARTER",
    name: "Starter",
    priceCents: 1500,
    vatRateBps: 2100,
    monthlyEmailLimit: 30,
    maxTemplates: 1,
    maxAutomationRules: 1,
    sortOrder: 1,
    tagline: "Para empezar a pedir reseñas sin esfuerzo.",
    highlights: [
      "Hasta 30 correos al mes",
      "Conexión de Gmail u Outlook",
      "Personalización de mensajes",
      "Envío automatizado",
      "Panel de estadísticas",
      "Historial de envíos",
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
    },
  },
  {
    code: "PRO",
    name: "Pro",
    priceCents: 3299,
    vatRateBps: 2100,
    monthlyEmailLimit: 70,
    maxTemplates: 10,
    maxAutomationRules: 3,
    sortOrder: 2,
    tagline: "Más capacidad y control para negocios en crecimiento.",
    highlights: [
      "Hasta 70 correos al mes",
      "Todo lo de Starter",
      "Plantillas personalizadas (hasta 10)",
      "Estadísticas avanzadas",
      "Gestión de campañas",
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
    },
  },
  {
    code: "BUSINESS",
    name: "Business",
    priceCents: 6997,
    vatRateBps: 2100,
    monthlyEmailLimit: 200,
    maxTemplates: null,
    maxAutomationRules: 20,
    sortOrder: 3,
    tagline: "Máxima capacidad y automatización avanzada.",
    highlights: [
      "Hasta 200 correos al mes",
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
    },
  },
];

export const planByCode = (code: string) => PLANS.find((p) => p.code === code);
