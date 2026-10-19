import type { AgendaItem, AppState, Prospect, Stage } from '../data/types';
import { STAGE_LABEL, STAGE_PROBABILITY } from '../data/types';
import { addDays, daysAgo, diffDays, minutesOf, nowTime, today } from './dates';
import { countGoals } from './progress';
import { money, plural } from './format';
import { problemLabel } from '../content/problems';

export const ACTIVE: Stage[] = ['contactado', 'respondio', 'reunion', 'propuesta', 'negociacion'];
export const OPEN: Stage[] = ['nuevo', 'investigando', ...ACTIVE];

export function probabilityOf(p: Prospect) {
  return p.probability ?? STAGE_PROBABILITY[p.stage];
}

export function valueOf(p: Prospect, avgPrice: number) {
  return p.value > 0 ? p.value : avgPrice;
}

/* ───────────────────────── Potencial del prospecto ───────────────────────── */

export function prospectScore(p: Prospect, state: AppState): number {
  let s = 0;
  s += { sin_web: 28, antigua: 28, mejorable: 18, moderna: 4, desconocido: 12 }[p.webStatus];
  s += Math.min(24, p.problems.length * 5);
  const v = valueOf(p, state.profile.avgPrice);
  s += Math.min(18, (v / Math.max(1, state.profile.avgPrice)) * 12);
  s += p.size ? { micro: 6, pequeno: 14, mediano: 16, grande: 10 }[p.size] : 7;
  if (state.profile.targetSectors.some((t) => t && p.sector && t.toLowerCase() === p.sector.toLowerCase())) s += 8;
  if (state.profile.market && p.city && p.city.toLowerCase().includes(state.profile.market.toLowerCase())) s += 4;
  if (p.phone || p.instagram || p.email) s += 4;
  return Math.round(Math.min(100, s));
}

export type Reco = { label: string; tone: 'hot' | 'warm' | 'cold' | 'info' };

export function recommendation(p: Prospect, state: AppState): Reco {
  const score = prospectScore(p, state);
  if (p.stage === 'ganado') return { label: 'CLIENTE', tone: 'info' };
  if (p.stage === 'perdido') return { label: 'PERDIDO', tone: 'cold' };
  if (p.nextFollowUp && p.nextFollowUp <= today()) return { label: 'SEGUIMIENTO HOY', tone: 'hot' };
  if (p.stage === 'nuevo' || p.stage === 'investigando') {
    if (!p.phone && !p.instagram && !p.email) return { label: 'BUSCAR CONTACTO', tone: 'info' };
    if (p.webStatus === 'desconocido' && p.problems.length === 0) return { label: 'AUDITAR PRIMERO', tone: 'info' };
    if (score >= 60) return { label: 'CONTACTAR HOY', tone: 'hot' };
    if (score >= 40) return { label: 'ESTA SEMANA', tone: 'warm' };
    return { label: 'BAJA PRIORIDAD', tone: 'cold' };
  }
  return { label: STAGE_LABEL[p.stage].toUpperCase(), tone: 'warm' };
}

export function priorityLabel(score: number) {
  return score >= 60 ? 'Alta' : score >= 40 ? 'Media' : 'Baja';
}

export function mainProblem(p: Prospect): string {
  if (p.problems.length) return problemLabel(p.problems[0]);
  if (p.webStatus === 'sin_web') return 'No tiene web';
  if (p.webStatus === 'antigua') return 'Web antigua';
  return 'Sin analizar';
}

/* ───────────────────────── Seguimientos ───────────────────────── */

export function followUpBuckets(state: AppState) {
  const t = today();
  const open = state.prospects.filter((p) => OPEN.includes(p.stage) && p.nextFollowUp);
  const by = (a: Prospect, b: Prospect) => (a.nextFollowUp! < b.nextFollowUp! ? -1 : 1);
  return {
    overdue: open.filter((p) => p.nextFollowUp! < t).sort(by),
    today: open.filter((p) => p.nextFollowUp === t).sort((a, b) => probabilityOf(b) - probabilityOf(a)),
    upcoming: open.filter((p) => p.nextFollowUp! > t).sort(by),
  };
}

export function sequenceLabel(p: Prospect, seq: number[]) {
  if (p.sequenceStep < 0) return 'Sin iniciar';
  if (p.stage !== 'contactado') return STAGE_LABEL[p.stage];
  const step = p.sequenceStep;
  if (step === 0) return 'Primer contacto';
  if (step >= seq.length - 1) return 'Último seguimiento';
  return `Seguimiento ${step}`;
}

/* ───────────────────────── Agenda ───────────────────────── */

export function itemsOn(state: AppState, day: string) {
  return state.items
    .filter((i) => i.date === day && i.status !== 'cancelado')
    .sort((a, b) => (a.time ?? '99') < (b.time ?? '99') ? -1 : 1);
}

export function overdueItems(state: AppState) {
  const t = today();
  return state.items.filter((i) => i.status === 'pendiente' && i.date && i.date < t);
}

export const isMeeting = (i: AgendaItem) => i.kind === 'reunion' || i.kind === 'demo' || i.kind === 'llamada';

/* ───────────────────────── Acción prioritaria ───────────────────────── */

export interface NextAction {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
  score: number;
  prospectId?: string;
}

export function nextActions(state: AppState): NextAction[] {
  const t = today();
  const now = minutesOf(nowTime());
  const out: NextAction[] = [];
  const pName = (id: string | null) => state.prospects.find((p) => p.id === id)?.business;

  // 1. Reunión o llamada inminente
  for (const it of itemsOn(state, t)) {
    if (it.status !== 'pendiente' || !it.time || !isMeeting(it)) continue;
    const mins = minutesOf(it.time) - now;
    if (mins >= -15 && mins <= 90) {
      const who = pName(it.prospectId);
      out.push({
        id: 'meet-' + it.id,
        emoji: '📅',
        title: mins <= 0 ? `${it.title} empieza ahora` : `Prepara: ${it.title} en ${mins} min`,
        detail: who ? `Repasa la ficha de ${who}: problemas detectados y argumentos de venta.` : 'Revisa tus notas y define el siguiente paso que quieres conseguir.',
        cta: who ? 'Abrir ficha' : 'Ver agenda',
        href: it.prospectId ? `#/prospects/${it.prospectId}` : '#/calendar',
        score: 100 - Math.max(0, mins) / 3,
        prospectId: it.prospectId ?? undefined,
      });
    }
  }

  // 2. Propuestas sin respuesta (las más cercanas al dinero)
  const proposals = state.prospects
    .filter((p) => (p.stage === 'propuesta' || p.stage === 'negociacion') && (daysAgo(p.lastContact) ?? 0) >= 3)
    .sort((a, b) => probabilityOf(b) * valueOf(b, state.profile.avgPrice) - probabilityOf(a) * valueOf(a, state.profile.avgPrice));
  if (proposals[0]) {
    const p = proposals[0];
    out.push({
      id: 'prop-' + p.id,
      emoji: '💰',
      title: `Llama a ${p.business}`,
      detail: `Le enviaste la propuesta hace ${daysAgo(p.lastContact)} días y tiene una probabilidad de cierre del ${probabilityOf(p)}% (${money(valueOf(p, state.profile.avgPrice))}).`,
      cta: 'Hacerlo',
      href: `#/prospects/${p.id}?touch=1`,
      score: 88 + probabilityOf(p) / 20,
      prospectId: p.id,
    });
  }

  // 3. Respondieron y no hay reunión
  const replied = state.prospects.filter((p) => p.stage === 'respondio').sort((a, b) => (a.lastContact ?? '') < (b.lastContact ?? '') ? -1 : 1);
  if (replied[0]) {
    const p = replied[0];
    out.push({
      id: 'reply-' + p.id,
      emoji: '💬',
      title: `Propón una reunión a ${p.business}`,
      detail: `Respondió${p.lastContact ? ` ${daysAgo(p.lastContact) === 0 ? 'hoy' : `hace ${daysAgo(p.lastContact)} días`}` : ''}. Un lead que responde se enfría en 48 h: convierte la conversación en una cita.`,
      cta: 'Hacerlo',
      href: `#/messages?prospect=${p.id}&channel=whatsapp&goal=reunion`,
      score: 84,
      prospectId: p.id,
    });
  }

  // 4. Seguimientos atrasados
  const fu = followUpBuckets(state);
  if (fu.overdue.length) {
    const oldest = fu.overdue[0];
    const d = diffDays(oldest.nextFollowUp!, t);
    out.push({
      id: 'overdue',
      emoji: '🔥',
      title: `Tienes ${plural(fu.overdue.length, 'seguimiento atrasado', 'seguimientos atrasados')}`,
      detail:
        fu.overdue.length === 1
          ? `${oldest.business} lleva ${plural(d, 'día', 'días')} esperando tu seguimiento. Cada día que pasa baja la probabilidad de respuesta.`
          : `El más antiguo, ${oldest.business}, lleva ${plural(d, 'día', 'días')} de retraso. Despáchalos en bloque: 2 minutos por lead.`,
      cta: 'Hacer ahora',
      href: '#/followups',
      score: 82 + Math.min(6, fu.overdue.length),
    });
  }

  // 5. Tareas atrasadas de prioridad alta
  const od = overdueItems(state).filter((i) => i.priority === 'alta');
  if (od.length) {
    out.push({
      id: 'od-items',
      emoji: '⏰',
      title: od.length === 1 ? `Atrasado: ${od[0].title}` : `${od.length} tareas importantes atrasadas`,
      detail: 'Resuélvelas o reprográmalas con fecha realista. Una agenda limpia es una cabeza limpia.',
      cta: 'Ver tareas',
      href: '#/tasks',
      score: 78,
    });
  }

  // 6. Seguimientos de hoy
  if (fu.today.length) {
    out.push({
      id: 'today-fu',
      emoji: '🟠',
      title: `${plural(fu.today.length, 'seguimiento', 'seguimientos')} para hoy`,
      detail: `Empieza por ${fu.today[0].business} (${STAGE_LABEL[fu.today[0].stage].toLowerCase()}).`,
      cta: 'Empezar',
      href: '#/followups',
      score: 75,
    });
  }

  // 7. Tareas de hoy pendientes
  const todayItems = itemsOn(state, t).filter((i) => i.status === 'pendiente' && !(i.time && isMeeting(i)));
  if (todayItems.length) {
    const top = [...todayItems].sort((a, b) => ({ alta: 0, media: 1, baja: 2 })[a.priority] - ({ alta: 0, media: 1, baja: 2 })[b.priority])[0];
    out.push({
      id: 'today-items',
      emoji: '✅',
      title: top.title,
      detail: todayItems.length > 1 ? `Y ${plural(todayItems.length - 1, 'tarea más', 'tareas más')} para hoy.` : 'Es tu única tarea pendiente de hoy.',
      cta: 'Ver tareas',
      href: '#/tasks',
      score: top.priority === 'alta' ? 74 : 62,
    });
  }

  // 8. Contactar nuevos si no se ha cumplido el objetivo diario
  const done = countGoals(state.activities, t, t).contactos;
  const goal = state.goals.daily.contactos;
  const fresh = state.prospects
    .filter((p) => (p.stage === 'nuevo' || p.stage === 'investigando') && (p.phone || p.instagram || p.email))
    .sort((a, b) => prospectScore(b, state) - prospectScore(a, state));
  if (fresh.length && (goal === 0 || done < goal)) {
    const p = fresh[0];
    const left = goal > 0 ? goal - done : null;
    out.push({
      id: 'contact-' + p.id,
      emoji: '📞',
      title: `Contacta a ${p.business}`,
      detail: `Es tu prospecto con más potencial (${prospectScore(p, state)}/100)${p.problems.length ? `: ${problemLabel(p.problems[0]).toLowerCase()}` : ''}.${left ? ` Te faltan ${plural(left, 'contacto', 'contactos')} para tu objetivo de hoy.` : ''}`,
      cta: 'Hacerlo',
      href: `#/messages?prospect=${p.id}`,
      score: 60 + (left ?? 0),
      prospectId: p.id,
    });
  }

  // 9. Auditar prospectos sin analizar
  const toAudit = state.prospects.filter((p) => (p.stage === 'nuevo' || p.stage === 'investigando') && p.website && p.auditScore == null);
  if (toAudit.length) {
    out.push({
      id: 'audit-' + toAudit[0].id,
      emoji: '🔍',
      title: `Audita la web de ${toAudit[0].business}`,
      detail: 'Con 5 problemas concretos tu primer mensaje dejará de parecer spam.',
      cta: 'Auditar',
      href: `#/audit?prospect=${toAudit[0].id}`,
      score: 50,
      prospectId: toAudit[0].id,
    });
  }

  // 10. Pipeline vacío → prospectar
  const pipeline = state.prospects.filter((p) => p.stage === 'nuevo' || p.stage === 'investigando').length;
  if (pipeline < 10) {
    out.push({
      id: 'prospect',
      emoji: '🎯',
      title: pipeline === 0 ? 'Encuentra tus primeros 10 negocios' : `Añade ${10 - pipeline} negocios a tu lista`,
      detail: `Sin prospectos no hay ventas. Busca ${state.profile.targetSectors[0]?.toLowerCase() || 'negocios'} en Google Maps${state.profile.market ? ` en ${state.profile.market}` : ''} con web antigua o sin web.`,
      cta: 'Prospectar',
      href: '#/prospecting?add=1',
      score: pipeline === 0 ? 70 : 45,
    });
  }

  // 11. Entrenamiento diario
  if (!state.coach.trainingsDone[t]) {
    out.push({
      id: 'train',
      emoji: '🧠',
      title: 'Entrenamiento de 5 minutos',
      detail: 'Una técnica, una objeción y una mini simulación. Cada día un poco mejor.',
      cta: 'Entrenar',
      href: '#/coach',
      score: 20,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

/* ───────────────────────── Estadísticas ───────────────────────── */

export type Period = 'today' | '7' | '30' | '90' | 'all';
export const PERIOD_LABEL: Record<Period, string> = { today: 'Hoy', '7': '7 días', '30': '30 días', '90': '90 días', all: 'Todo' };

export function periodFrom(period: Period, state: AppState): string {
  const t = today();
  if (period === 'today') return t;
  if (period === 'all') {
    const first = state.activities.reduce((m, a) => (a.day < m ? a.day : m), t);
    return first;
  }
  return addDays(t, -(Number(period) - 1));
}

export const MIN_SAMPLE = 10;

export function computeStats(state: AppState, from: string, to: string = today()) {
  const acts = state.activities.filter((a) => a.day >= from && a.day <= to);
  const c = (type: string) => acts.filter((a) => a.type === type).length;
  const leads = c('prospect_added');
  const outreach = c('outreach');
  const followups = c('followup');
  const replies = c('reply');
  const meetings = c('meeting');
  const proposals = c('proposal');
  const wonActs = acts.filter((a) => a.type === 'won');
  const won = wonActs.length;
  const revenue = wonActs.reduce((s, a) => s + (a.amount ?? 0), 0);
  const conversion = outreach >= MIN_SAMPLE ? (won / outreach) * 100 : null;
  const replyRate = outreach >= MIN_SAMPLE ? (replies / outreach) * 100 : null;
  const meetingRate = replies >= 5 ? (meetings / replies) * 100 : null;
  const closeRate = meetings >= 3 ? (won / meetings) * 100 : null;
  const avgTicket = won > 0 ? revenue / won : null;

  const wonProspects = state.prospects.filter((p) => p.stage === 'ganado' && p.wonAt && p.wonAt >= from && p.wonAt <= to && p.firstContact);
  const avgDaysToClose = wonProspects.length ? wonProspects.reduce((s, p) => s + diffDays(p.firstContact!, p.wonAt!), 0) / wonProspects.length : null;

  const open = state.prospects.filter((p) => ACTIVE.includes(p.stage));
  const pipelineValue = open.reduce((s, p) => s + valueOf(p, state.profile.avgPrice), 0);
  const weightedPipeline = open.reduce((s, p) => s + (valueOf(p, state.profile.avgPrice) * probabilityOf(p)) / 100, 0);

  const createdIn = state.prospects.filter((p) => p.createdAt.slice(0, 10) >= from && p.createdAt.slice(0, 10) <= to);
  const sources = new Map<string, { leads: number; won: number }>();
  for (const p of createdIn) {
    const s = sources.get(p.source) ?? { leads: 0, won: 0 };
    s.leads++;
    if (p.stage === 'ganado') s.won++;
    sources.set(p.source, s);
  }

  // serie diaria
  const days = Math.min(120, Math.max(1, diffDays(from, to) + 1));
  const series: { day: string; contacts: number; wins: number; replies: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(to, -(days - 1 - i));
    const da = acts.filter((a) => a.day === d);
    series.push({
      day: d,
      contacts: da.filter((a) => a.type === 'outreach' || a.type === 'followup').length,
      wins: da.filter((a) => a.type === 'won').length,
      replies: da.filter((a) => a.type === 'reply').length,
    });
  }

  // contactos por venta (histórico)
  const allOutreach = state.activities.filter((a) => a.type === 'outreach').length;
  const allWon = state.activities.filter((a) => a.type === 'won').length;
  const allCalls = state.activities.filter((a) => (a.type === 'outreach' || a.type === 'followup') && a.channel === 'llamada').length;
  const contactsPerSale = allWon > 0 && allOutreach >= MIN_SAMPLE ? allOutreach / allWon : null;
  const callsPerSale = allWon > 0 && allCalls >= 5 ? allCalls / allWon : null;

  return {
    leads,
    outreach,
    followups,
    replies,
    meetings,
    proposals,
    won,
    revenue,
    conversion,
    replyRate,
    meetingRate,
    closeRate,
    avgTicket,
    avgDaysToClose,
    pipelineValue,
    weightedPipeline,
    sources: [...sources.entries()].sort((a, b) => b[1].leads - a[1].leads),
    series,
    contactsPerSale,
    callsPerSale,
    allOutreach,
    allWon,
  };
}

/* ───────────────────────── Riesgo ───────────────────────── */

export function atRisk(state: AppState) {
  return state.prospects
    .filter((p) => ACTIVE.includes(p.stage))
    .map((p) => {
      const since = daysAgo(p.lastContact) ?? 0;
      const overdue = p.nextFollowUp && p.nextFollowUp < today() ? diffDays(p.nextFollowUp, today()) : 0;
      const limit = { contactado: 12, respondio: 3, reunion: 5, propuesta: 6, negociacion: 4 }[p.stage as 'contactado'] ?? 7;
      const risk = since / limit + overdue / 3 + (p.nextFollowUp ? 0 : 0.8);
      return { p, since, overdue, risk };
    })
    .filter((x) => x.risk >= 1)
    .sort((a, b) => b.risk * probabilityOf(b.p) - a.risk * probabilityOf(a.p));
}

/* ───────────────────────── Notificaciones ───────────────────────── */

export interface Notice {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  href: string;
}

export function notifications(state: AppState): Notice[] {
  const t = today();
  const out: Notice[] = [];
  const fu = followUpBuckets(state);
  if (fu.overdue.length)
    out.push({ id: `overdue-${t}-${fu.overdue.length}`, emoji: '🔴', title: `${plural(fu.overdue.length, 'seguimiento atrasado', 'seguimientos atrasados')}`, detail: fu.overdue.slice(0, 3).map((p) => p.business).join(', '), href: '#/followups' });
  if (fu.today.length)
    out.push({ id: `today-${t}-${fu.today.length}`, emoji: '🟠', title: `${plural(fu.today.length, 'seguimiento', 'seguimientos')} para hoy`, detail: fu.today.slice(0, 3).map((p) => p.business).join(', '), href: '#/followups' });
  const now = minutesOf(nowTime());
  for (const it of itemsOn(state, t)) {
    if (it.status !== 'pendiente' || !it.time) continue;
    const m = minutesOf(it.time) - now;
    if (m >= 0 && m <= 120) out.push({ id: `soon-${it.id}`, emoji: '📅', title: `${it.title} a las ${it.time}`, detail: `Empieza en ${m} min`, href: '#/calendar' });
  }
  const od = overdueItems(state);
  if (od.length) out.push({ id: `od-${t}-${od.length}`, emoji: '⏰', title: `${plural(od.length, 'tarea atrasada', 'tareas atrasadas')}`, detail: od.slice(0, 3).map((i) => i.title).join(', '), href: '#/tasks' });
  const risk = atRisk(state).slice(0, 2);
  for (const r of risk) out.push({ id: `risk-${r.p.id}-${t}`, emoji: '⚠️', title: `${r.p.business} se está enfriando`, detail: `${STAGE_LABEL[r.p.stage]} · ${r.since} días sin contacto`, href: `#/prospects/${r.p.id}` });
  return out;
}
