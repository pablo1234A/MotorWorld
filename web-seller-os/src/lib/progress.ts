import type { Activity, ActivityType, AppState, GoalSet } from '../data/types';
import { addDays, startOfMonth, startOfWeek, today } from './dates';

export const XP: Record<ActivityType, number> = {
  prospect_added: 3,
  outreach: 10,
  followup: 8,
  reply: 15,
  audit: 12,
  meeting: 30,
  proposal: 40,
  won: 150,
  lost: 4,
  task_done: 3,
  training: 15,
};

export const LEVELS = [
  { level: 1, name: 'Principiante', xp: 0 },
  { level: 2, name: 'Prospectador', xp: 300 },
  { level: 3, name: 'Vendedor', xp: 900 },
  { level: 4, name: 'Closer', xp: 2000 },
  { level: 5, name: 'Sales Pro', xp: 4000 },
  { level: 6, name: 'Elite Seller', xp: 7500 },
  { level: 7, name: 'Master', xp: 12000 },
];

export function totalXp(state: Pick<AppState, 'activities' | 'bonuses'>) {
  return state.activities.reduce((s, a) => s + (a.xp || 0), 0) + state.bonuses.reduce((s, b) => s + b.xp, 0);
}

export function levelFor(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) ?? null;
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { ...cur, next, progress, xp };
}

/** Acciones que cuentan para la racha: trabajo comercial real, no abrir la app ni crear fichas. */
export const STREAK_TYPES: ActivityType[] = ['outreach', 'followup', 'reply', 'audit', 'meeting', 'proposal', 'won'];

export function activeDays(activities: Activity[]): Set<string> {
  const s = new Set<string>();
  for (const a of activities) if (STREAK_TYPES.includes(a.type)) s.add(a.day);
  return s;
}

/**
 * Racha de días consecutivos con trabajo comercial real.
 * Los días no laborables no rompen la racha (ni la suman).
 * Si hoy todavía no hay actividad, la racha sigue viva desde ayer.
 */
export function streak(activities: Activity[], workDays: number[]) {
  const days = activeDays(activities);
  const t = today();
  const doneToday = days.has(t);
  let count = 0;
  let cursor = doneToday ? t : addDays(t, -1);
  for (let i = 0; i < 400; i++) {
    const dow = new Date(cursor + 'T12:00:00').getDay();
    if (days.has(cursor)) count++;
    else if (workDays.includes(dow)) break;
    cursor = addDays(cursor, -1);
  }
  // mejor racha histórica
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev) {
      // ¿hay algún día laborable sin actividad entre prev y d?
      let gap = false;
      let c = addDays(prev, 1);
      while (c < d) {
        const dow = new Date(c + 'T12:00:00').getDay();
        if (workDays.includes(dow)) {
          gap = true;
          break;
        }
        c = addDays(c, 1);
      }
      run = gap ? 1 : run + 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { count, doneToday, best: Math.max(best, count) };
}

/** Cuenta actividades por métrica de objetivo dentro de [from, to]. */
export function countGoals(activities: Activity[], from: string, to: string): GoalSet {
  const r: GoalSet = { contactos: 0, llamadas: 0, mensajes: 0, auditorias: 0, reuniones: 0, propuestas: 0, cierres: 0 };
  for (const a of activities) {
    if (a.day < from || a.day > to) continue;
    switch (a.type) {
      case 'outreach':
      case 'followup':
        r.contactos++;
        if (a.channel === 'llamada') r.llamadas++;
        else if (a.channel !== 'presencial') r.mensajes++;
        break;
      case 'audit':
        r.auditorias++;
        break;
      case 'meeting':
        r.reuniones++;
        break;
      case 'proposal':
        r.propuestas++;
        break;
      case 'won':
        r.cierres++;
        break;
    }
  }
  return r;
}

export function periodRange(period: 'daily' | 'weekly' | 'monthly'): [string, string] {
  const t = today();
  if (period === 'daily') return [t, t];
  if (period === 'weekly') return [startOfWeek(t), addDays(startOfWeek(t), 6)];
  return [startOfMonth(t), t.slice(0, 8) + '31'];
}

export interface Mission {
  id: string;
  emoji: string;
  label: string;
  target: number;
  done: number;
  xp: number;
}

/** Misión del día: se deriva de los objetivos diarios y de lo que realmente has hecho hoy. */
export function dailyMission(state: AppState): Mission[] {
  const t = today();
  const todays = state.activities.filter((a) => a.day === t);
  const g = state.goals.daily;
  const found = todays.filter((a) => a.type === 'prospect_added').length;
  const contacted = todays.filter((a) => a.type === 'outreach' || a.type === 'followup').length;
  const convos = todays.filter((a) => a.type === 'reply').length;
  const meetings = todays.filter((a) => a.type === 'meeting').length;
  const contactTarget = Math.max(3, g.contactos || 5);
  return [
    { id: 'find', emoji: '🎯', label: `Encontrar ${contactTarget * 2} negocios`, target: contactTarget * 2, done: found, xp: 20 },
    { id: 'contact', emoji: '📞', label: `Contactar ${contactTarget}`, target: contactTarget, done: contacted, xp: 40 },
    { id: 'convo', emoji: '💬', label: `Conseguir ${Math.max(1, Math.round(contactTarget * 0.3))} conversaciones`, target: Math.max(1, Math.round(contactTarget * 0.3)), done: convos, xp: 40 },
    { id: 'meeting', emoji: '📅', label: 'Conseguir 1 reunión', target: 1, done: meetings, xp: 60 },
  ];
}
