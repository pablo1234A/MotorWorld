// Modelo de datos de WEB SELLER OS.
// Todas las fechas se guardan como ISO (YYYY-MM-DD para días, ISO completo para instantes).

export type ID = string;

export const STAGES = [
  'nuevo',
  'investigando',
  'contactado',
  'respondio',
  'reunion',
  'propuesta',
  'negociacion',
  'ganado',
  'perdido',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  nuevo: 'Nuevo',
  investigando: 'Investigando',
  contactado: 'Contactado',
  respondio: 'Respondió',
  reunion: 'Reunión',
  propuesta: 'Propuesta',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

/** Probabilidad de cierre orientativa por etapa (se usa si el usuario no fija una). */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  nuevo: 5,
  investigando: 8,
  contactado: 12,
  respondio: 25,
  reunion: 40,
  propuesta: 55,
  negociacion: 70,
  ganado: 100,
  perdido: 0,
};

export type WebStatus = 'sin_web' | 'antigua' | 'mejorable' | 'moderna' | 'desconocido';
export const WEB_STATUS_LABEL: Record<WebStatus, string> = {
  sin_web: 'Sin web',
  antigua: 'Web antigua',
  mejorable: 'Web mejorable',
  moderna: 'Web moderna',
  desconocido: 'Sin revisar',
};

export type BizSize = 'micro' | 'pequeno' | 'mediano' | 'grande';
export const SIZE_LABEL: Record<BizSize, string> = {
  micro: 'Micro (1-2)',
  pequeno: 'Pequeño (3-9)',
  mediano: 'Mediano (10-49)',
  grande: 'Grande (50+)',
};

export type LeadSource =
  | 'google_maps'
  | 'instagram'
  | 'referido'
  | 'linkedin'
  | 'presencial'
  | 'directorio'
  | 'inbound'
  | 'otro';
export const SOURCE_LABEL: Record<LeadSource, string> = {
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  referido: 'Referido',
  linkedin: 'LinkedIn',
  presencial: 'Presencial',
  directorio: 'Directorio',
  inbound: 'Me contactó',
  otro: 'Otro',
};

export type Channel = 'whatsapp' | 'instagram' | 'email' | 'llamada' | 'presencial';
export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram DM',
  email: 'Email',
  llamada: 'Llamada',
  presencial: 'En persona',
};

export interface Prospect {
  id: ID;
  business: string;
  contactName: string;
  phone: string;
  email: string;
  instagram: string;
  website: string;
  city: string;
  sector: string;
  size: BizSize | '';
  webStatus: WebStatus;
  source: LeadSource;
  stage: Stage;
  firstContact: string | null; // YYYY-MM-DD
  lastContact: string | null; // YYYY-MM-DD
  nextFollowUp: string | null; // YYYY-MM-DD
  /** Índice dentro de la secuencia de seguimiento (0 = primer contacto hecho). */
  sequenceStep: number;
  value: number; // € potencial
  probability: number | null; // null = usar la de la etapa
  notes: string;
  problems: string[]; // ids de WEB_PROBLEMS o texto libre "custom:..."
  needs: string;
  offer: string;
  lostReason: string;
  wonAt: string | null; // YYYY-MM-DD
  wonAmount: number | null;
  auditScore: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const ITEM_KINDS = [
  'llamada',
  'reunion',
  'seguimiento',
  'tarea',
  'demo',
  'entrega',
  'recordatorio',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const KIND_LABEL: Record<ItemKind, string> = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  seguimiento: 'Seguimiento',
  tarea: 'Tarea',
  demo: 'Demo',
  entrega: 'Entrega',
  recordatorio: 'Recordatorio',
};

export type Priority = 'alta' | 'media' | 'baja';
export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

export type ItemStatus = 'pendiente' | 'hecho' | 'cancelado';

/** Elemento de agenda: unifica eventos de calendario y tareas. */
export interface AgendaItem {
  id: ID;
  kind: ItemKind;
  title: string;
  date: string | null; // YYYY-MM-DD (null = tarea sin fecha)
  time: string | null; // HH:mm
  duration: number; // minutos
  prospectId: ID | null;
  notes: string;
  priority: Priority;
  status: ItemStatus;
  doneAt: string | null;
  createdAt: string;
}

export type ActivityType =
  | 'prospect_added'
  | 'outreach' // primer contacto
  | 'followup'
  | 'reply'
  | 'audit'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost'
  | 'task_done'
  | 'training';

/** Registro inmutable de acciones reales. Es la fuente de verdad de estadísticas, racha, XP y objetivos. */
export interface Activity {
  id: ID;
  type: ActivityType;
  at: string; // ISO
  day: string; // YYYY-MM-DD (local)
  prospectId: ID | null;
  channel: Channel | null;
  amount: number | null;
  note: string;
  xp: number;
  /** id del elemento de agenda que la originó (para poder deshacer) */
  ref?: string;
}

export type ResourceKind =
  | 'guion'
  | 'prompt'
  | 'mensaje'
  | 'respuesta'
  | 'tecnica'
  | 'idea'
  | 'ejemplo'
  | 'plantilla'
  | 'nota';
export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  guion: 'Guion',
  prompt: 'Prompt',
  mensaje: 'Mensaje',
  respuesta: 'Respuesta',
  tecnica: 'Técnica',
  idea: 'Idea',
  ejemplo: 'Ejemplo',
  plantilla: 'Plantilla',
  nota: 'Nota',
};

export interface Resource {
  id: ID;
  kind: ResourceKind;
  title: string;
  body: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: ID;
  url: string;
  prospectId: ID | null;
  answers: Record<string, AuditAnswer>;
  score: number;
  psi: PsiSummary | null;
  createdAt: string;
}
export type AuditAnswer = 'ok' | 'regular' | 'mal' | 'na';

export interface PsiSummary {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcp: string | null;
  cls: string | null;
  fetchedAt: string;
}

export interface Goals {
  daily: GoalSet;
  weekly: GoalSet;
  monthly: GoalSet;
}
export interface GoalSet {
  contactos: number;
  llamadas: number;
  mensajes: number;
  auditorias: number;
  reuniones: number;
  propuestas: number;
  cierres: number;
}
export const GOAL_LABEL: Record<keyof GoalSet, string> = {
  contactos: 'Contactos',
  llamadas: 'Llamadas',
  mensajes: 'Mensajes',
  auditorias: 'Auditorías',
  reuniones: 'Reuniones',
  propuestas: 'Propuestas',
  cierres: 'Cierres',
};

export interface Profile {
  name: string;
  monthlyRevenueGoal: number;
  avgPrice: number;
  hoursPerDay: number;
  targetSectors: string[];
  market: string;
}

export interface Settings {
  accent: string;
  sound: boolean;
  reduceMotion: boolean;
  /** Días tras el primer contacto: [0, 2, 5, 10] */
  sequence: number[];
  hourlyRate: number;
  psiKey: string;
  workDays: number[]; // 0=domingo … 6=sábado
}

export interface CoachProgress {
  /** día (YYYY-MM-DD) → completado */
  trainingsDone: Record<string, boolean>;
  roleplays: RoleplayResult[];
}

export interface RoleplayResult {
  id: ID;
  at: string;
  scenario: string;
  score: number;
  breakdown: Record<string, number>;
}

export interface AppState {
  version: number;
  onboarded: boolean;
  profile: Profile;
  settings: Settings;
  goals: Goals;
  prospects: Prospect[];
  items: AgendaItem[];
  activities: Activity[];
  resources: Resource[];
  audits: AuditRecord[];
  coach: CoachProgress;
  readNotifications: string[];
  /** XP extra por completar misiones diarias */
  bonuses: { day: string; id: string; xp: number }[];
}
