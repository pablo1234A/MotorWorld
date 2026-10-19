import type { AppState, GoalSet, Goals, Profile, Prospect, Settings } from './types';
import { uid } from '../lib/format';

export const SCHEMA_VERSION = 1;

export const ACCENTS = [
  { name: 'Lima', value: '#c6f432' },
  { name: 'Violeta', value: '#8b7cff' },
  { name: 'Azul', value: '#4c8dff' },
  { name: 'Esmeralda', value: '#2fd59b' },
  { name: 'Ámbar', value: '#ffb224' },
  { name: 'Coral', value: '#ff6b57' },
  { name: 'Rosa', value: '#ff5fa2' },
  { name: 'Hielo', value: '#e8ecf2' },
];

export const SECTORS = [
  'Restaurante',
  'Cafetería / Bar',
  'Peluquería / Barbería',
  'Estética / Spa',
  'Clínica dental',
  'Fisioterapia',
  'Clínica / Salud',
  'Gimnasio / Fitness',
  'Inmobiliaria',
  'Abogado / Asesoría',
  'Reformas / Construcción',
  'Taller mecánico',
  'Tienda / Retail',
  'Hotel / Alojamiento',
  'Academia / Formación',
  'Fotografía / Eventos',
  'Veterinaria',
  'Otro',
];

export const emptyGoalSet = (): GoalSet => ({
  contactos: 0,
  llamadas: 0,
  mensajes: 0,
  auditorias: 0,
  reuniones: 0,
  propuestas: 0,
  cierres: 0,
});

export const defaultProfile = (): Profile => ({
  name: '',
  monthlyRevenueGoal: 3000,
  avgPrice: 900,
  hoursPerDay: 3,
  targetSectors: [],
  market: '',
});

export const defaultSettings = (): Settings => ({
  accent: ACCENTS[0].value,
  sound: false,
  reduceMotion: false,
  sequence: [0, 2, 5, 10],
  hourlyRate: 35,
  psiKey: '',
  workDays: [1, 2, 3, 4, 5],
});

export const defaultGoals = (): Goals => ({
  daily: emptyGoalSet(),
  weekly: emptyGoalSet(),
  monthly: emptyGoalSet(),
});

export const initialState = (): AppState => ({
  version: SCHEMA_VERSION,
  onboarded: false,
  profile: defaultProfile(),
  settings: defaultSettings(),
  goals: defaultGoals(),
  prospects: [],
  items: [],
  activities: [],
  resources: [],
  audits: [],
  coach: { trainingsDone: {}, roleplays: [] },
  readNotifications: [],
  bonuses: [],
});

/** Asegura que un estado cargado (posiblemente antiguo o importado) tiene todas las claves. */
export function migrate(raw: Partial<AppState> | null): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    version: SCHEMA_VERSION,
    profile: { ...base.profile, ...(raw.profile ?? {}) },
    settings: { ...base.settings, ...(raw.settings ?? {}) },
    goals: {
      daily: { ...base.goals.daily, ...(raw.goals?.daily ?? {}) },
      weekly: { ...base.goals.weekly, ...(raw.goals?.weekly ?? {}) },
      monthly: { ...base.goals.monthly, ...(raw.goals?.monthly ?? {}) },
    },
    prospects: (raw.prospects ?? []).map((p) => ({ ...newProspect(), ...p })),
    items: raw.items ?? [],
    activities: raw.activities ?? [],
    resources: raw.resources ?? [],
    audits: raw.audits ?? [],
    coach: { trainingsDone: {}, roleplays: [], ...(raw.coach ?? {}) },
    readNotifications: raw.readNotifications ?? [],
    bonuses: raw.bonuses ?? [],
  };
}

export function newProspect(partial: Partial<Prospect> = {}): Prospect {
  const now = new Date().toISOString();
  return {
    id: uid(),
    business: '',
    contactName: '',
    phone: '',
    email: '',
    instagram: '',
    website: '',
    city: '',
    sector: '',
    size: '',
    webStatus: 'desconocido',
    source: 'google_maps',
    stage: 'nuevo',
    firstContact: null,
    lastContact: null,
    nextFollowUp: null,
    sequenceStep: -1,
    value: 0,
    probability: null,
    notes: '',
    problems: [],
    needs: '',
    offer: '',
    lostReason: '',
    wonAt: null,
    wonAmount: null,
    auditScore: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/**
 * Plan inicial a partir del onboarding. Usa tasas de conversión de referencia
 * (claramente marcadas como estimación) hasta que haya datos reales.
 */
export const BENCHMARK = {
  replyRate: 0.2, // contacto → respuesta
  meetingRate: 0.4, // respuesta → reunión
  closeRate: 0.3, // reunión → venta
};

export function planFromProfile(p: Profile, workDays: number) {
  const salesNeeded = Math.max(1, Math.ceil(p.monthlyRevenueGoal / Math.max(1, p.avgPrice)));
  const contactsPerSale = Math.ceil(1 / (BENCHMARK.replyRate * BENCHMARK.meetingRate * BENCHMARK.closeRate));
  const contactsMonth = salesNeeded * contactsPerSale;
  const capacity = Math.round(p.hoursPerDay * 8); // ~8 contactos personalizados por hora
  const contactsDay = Math.max(3, Math.min(capacity, Math.ceil(contactsMonth / workDays)));
  const meetingsMonth = Math.ceil(salesNeeded / BENCHMARK.closeRate);
  const days = workDays;
  const weeks = days / 5;
  const goals: Goals = {
    daily: {
      contactos: contactsDay,
      llamadas: Math.max(1, Math.round(contactsDay * 0.3)),
      mensajes: Math.max(1, Math.round(contactsDay * 0.7)),
      auditorias: Math.max(1, Math.round(p.hoursPerDay / 1.5)),
      reuniones: meetingsMonth / days >= 0.5 ? 1 : 0,
      propuestas: 0,
      cierres: 0,
    },
    weekly: {
      contactos: contactsDay * 5,
      llamadas: Math.max(3, Math.round(contactsDay * 0.3) * 5),
      mensajes: Math.max(5, Math.round(contactsDay * 0.7) * 5),
      auditorias: Math.max(3, Math.round(p.hoursPerDay / 1.5) * 5),
      reuniones: Math.max(1, Math.ceil(meetingsMonth / weeks)),
      propuestas: Math.max(1, Math.ceil((salesNeeded * 2) / weeks)),
      cierres: Math.max(1, Math.ceil(salesNeeded / weeks)),
    },
    monthly: {
      contactos: contactsDay * days,
      llamadas: Math.round(contactsDay * 0.3) * days,
      mensajes: Math.round(contactsDay * 0.7) * days,
      auditorias: Math.max(10, Math.round(p.hoursPerDay / 1.5) * days),
      reuniones: meetingsMonth,
      propuestas: salesNeeded * 2,
      cierres: salesNeeded,
    },
  };
  return { salesNeeded, contactsPerSale, contactsMonth, contactsDay, meetingsMonth, capacity, goals };
}

export function newSettings(s?: Partial<Settings>): Settings {
  return { ...defaultSettings(), ...(s ?? {}) };
}
