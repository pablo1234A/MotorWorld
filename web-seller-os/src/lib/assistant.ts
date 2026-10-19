import type { AppState } from '../data/types';
import { STAGE_LABEL } from '../data/types';
import { ACTIVE, MIN_SAMPLE, atRisk, computeStats, followUpBuckets, mainProblem, nextActions, probabilityOf, prospectScore, valueOf } from './insights';
import { countGoals, periodRange, streak } from './progress';
import { money, normalize, plural } from './format';
import { BENCHMARK } from '../data/defaults';
import { daysAgo, startOfMonth, today } from './dates';

export interface AssistantReply {
  text: string;
  prospects?: string[];
  links?: { label: string; href: string }[];
}

export const SUGGESTIONS = [
  '¿Qué debería hacer ahora?',
  '¿A quién debería contactar hoy?',
  '¿Qué clientes están a punto de perderse?',
  '¿Qué leads tienen mayor potencial?',
  '¿A quién debería hacer seguimiento?',
  '¿Cuántas llamadas necesito para una venta?',
  '¿Qué estoy haciendo mal?',
  '¿Cómo voy este mes?',
];

const any = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function ask(question: string, state: AppState): AssistantReply {
  const q = normalize(question);
  const name = state.profile.name || '';

  if (state.prospects.length === 0 && !any(q, ['mes', 'objetivo', 'racha'])) {
    return {
      text: `Todavía no tengo datos con los que trabajar${name ? `, ${name}` : ''}. Tu CRM está vacío.\n\nEl primer paso es siempre el mismo: **añade 10 negocios** a los que te gustaría vender. Busca ${state.profile.targetSectors[0]?.toLowerCase() || 'negocios locales'} en Google Maps${state.profile.market ? ` en ${state.profile.market}` : ''}, prioriza los que no tienen web o la tienen antigua.`,
      links: [{ label: 'Ir a Prospección', href: '#/prospecting?add=1' }],
    };
  }

  // ¿Qué hago ahora?
  if (any(q, ['ahora', 'que hago', 'que deberia hacer', 'por donde empiezo', 'siguiente paso'])) {
    const a = nextActions(state);
    if (!a.length) return { text: 'Lo tienes todo al día. Buen momento para entrenar una objeción o añadir prospectos nuevos.', links: [{ label: 'Sales Coach', href: '#/coach' }] };
    const [first, ...rest] = a;
    return {
      text: `${first.emoji} **${first.title}**\n${first.detail}${rest.length ? `\n\nDespués:\n${rest.slice(0, 3).map((r) => `• ${r.title}`).join('\n')}` : ''}`,
      links: [{ label: first.cta, href: first.href }],
      prospects: first.prospectId ? [first.prospectId] : undefined,
    };
  }

  // Perderse / riesgo
  if (any(q, ['perder', 'perdiendo', 'enfri', 'riesgo', 'frio'])) {
    const r = atRisk(state).slice(0, 5);
    if (!r.length) return { text: 'Ningún lead activo está en riesgo ahora mismo. Todos tienen contacto reciente y seguimiento programado. 👌' };
    return {
      text: `Estos ${plural(r.length, 'lead se está', 'leads se están')} enfriando:\n\n${r
        .map((x) => `• **${x.p.business}** — ${STAGE_LABEL[x.p.stage]}, ${x.since} días sin contacto${x.overdue ? `, seguimiento atrasado ${x.overdue} días` : ''}${x.p.nextFollowUp ? '' : ', sin seguimiento programado'}`)
        .join('\n')}\n\nEmpieza por el primero: es el que más dinero tiene en juego.`,
      prospects: r.map((x) => x.p.id),
    };
  }

  // Seguimiento
  if (any(q, ['seguimiento', 'seguir', 'follow'])) {
    const fu = followUpBuckets(state);
    const list = [...fu.overdue, ...fu.today];
    if (!list.length)
      return {
        text: `No tienes seguimientos pendientes para hoy.${fu.upcoming[0] ? ` El próximo es **${fu.upcoming[0].business}** (${fu.upcoming[0].nextFollowUp}).` : ''}`,
        links: [{ label: 'Follow-up Center', href: '#/followups' }],
      };
    return {
      text: `Tienes ${plural(list.length, 'seguimiento', 'seguimientos')} pendientes (${fu.overdue.length} atrasados, ${fu.today.length} para hoy):\n\n${list
        .slice(0, 6)
        .map((p) => `• **${p.business}** — ${STAGE_LABEL[p.stage]}${p.lastContact ? `, último contacto hace ${daysAgo(p.lastContact)} días` : ''}`)
        .join('\n')}`,
      prospects: list.slice(0, 6).map((p) => p.id),
      links: [{ label: 'Hacerlos ahora', href: '#/followups' }],
    };
  }

  // Potencial
  if (any(q, ['potencial', 'mejores leads', 'mas valor', 'prometedor', 'mejor lead'])) {
    const list = state.prospects
      .filter((p) => p.stage !== 'ganado' && p.stage !== 'perdido')
      .map((p) => ({ p, s: prospectScore(p, state), e: (valueOf(p, state.profile.avgPrice) * probabilityOf(p)) / 100 }))
      .sort((a, b) => b.s + b.e / 50 - (a.s + a.e / 50))
      .slice(0, 5);
    return {
      text: `Tus leads con más potencial:\n\n${list.map((x) => `• **${x.p.business}** — potencial ${x.s}/100 · ${STAGE_LABEL[x.p.stage]} · ${mainProblem(x.p)}`).join('\n')}\n\nCalculo el potencial con el estado de su web, los problemas detectados, el valor estimado, el tamaño y si encaja con tu cliente ideal.`,
      prospects: list.map((x) => x.p.id),
    };
  }

  // Contactar hoy
  if (any(q, ['contactar', 'contacto hoy', 'a quien', 'llamar hoy', 'escribir'])) {
    const fu = followUpBuckets(state);
    const fresh = state.prospects
      .filter((p) => (p.stage === 'nuevo' || p.stage === 'investigando') && (p.phone || p.instagram || p.email))
      .sort((a, b) => prospectScore(b, state) - prospectScore(a, state));
    const goal = state.goals.daily.contactos;
    const done = countGoals(state.activities, today(), today()).contactos;
    const parts: string[] = [];
    if (fu.overdue.length + fu.today.length) parts.push(`**Primero, seguimientos** (${fu.overdue.length + fu.today.length}): ${[...fu.overdue, ...fu.today].slice(0, 4).map((p) => p.business).join(', ')}.`);
    if (fresh.length) parts.push(`**Después, primeros contactos**:\n${fresh.slice(0, 5).map((p) => `• ${p.business} — ${mainProblem(p)} (potencial ${prospectScore(p, state)})`).join('\n')}`);
    else parts.push('No tienes prospectos nuevos con datos de contacto. Añade el teléfono o Instagram a los que tienes, o busca negocios nuevos.');
    if (goal) parts.push(`Llevas ${done}/${goal} contactos hoy.`);
    return { text: parts.join('\n\n'), prospects: [...fu.overdue, ...fu.today, ...fresh].slice(0, 6).map((p) => p.id) };
  }

  // Ratio llamadas / contactos por venta
  if (any(q, ['cuantas llamadas', 'cuantos contactos', 'necesito para', 'por venta', 'ratio'])) {
    const s = computeStats(state, '0000-01-01');
    if (s.contactsPerSale == null) {
      const bench = Math.ceil(1 / (BENCHMARK.replyRate * BENCHMARK.meetingRate * BENCHMARK.closeRate));
      return {
        text: `**Necesitamos más datos.** Llevas ${s.allOutreach} primeros contactos y ${s.allWon} ventas; necesito al menos ${MIN_SAMPLE} contactos y 1 venta para calcular tu ratio real.\n\nComo referencia orientativa (no son tus datos): con un 20% de respuesta, 40% de reuniones y 30% de cierre, harían falta unos **${bench} contactos por venta**.`,
      };
    }
    return {
      text: `Según tus datos reales: necesitas **${s.contactsPerSale.toFixed(0)} primeros contactos por venta**${s.callsPerSale ? ` y unas **${s.callsPerSale.toFixed(0)} llamadas**` : ''}.\n\nPara tu objetivo de ${money(state.profile.monthlyRevenueGoal)} (≈${Math.ceil(state.profile.monthlyRevenueGoal / Math.max(1, s.avgTicket ?? state.profile.avgPrice))} ventas) eso son unos **${Math.ceil((state.profile.monthlyRevenueGoal / Math.max(1, s.avgTicket ?? state.profile.avgPrice)) * s.contactsPerSale)} contactos al mes**.`,
    };
  }

  // Qué hago mal
  if (any(q, ['mal', 'mejorar', 'fallo', 'error', 'diagnost', 'por que no vendo'])) {
    const s = computeStats(state, '0000-01-01');
    const issues: string[] = [];
    if (s.outreach < MIN_SAMPLE)
      issues.push(`**Volumen**: llevas ${s.outreach} primeros contactos en total. Con menos de ${MIN_SAMPLE} no se puede diagnosticar nada más: el problema número uno ahora es contactar más.`);
    else {
      if (s.replyRate != null && s.replyRate < 12)
        issues.push(`**Primer mensaje**: solo te responde el ${s.replyRate.toFixed(0)}%. Personaliza más (menciona algo concreto de su negocio), acorta a 3 líneas y termina con una pregunta fácil.`);
      if (s.meetingRate != null && s.meetingRate < 30)
        issues.push(`**De respuesta a reunión**: conviertes el ${s.meetingRate.toFixed(0)}% de respuestas en reuniones. Propón siempre día y hora concretos en lugar de "cuando te venga bien".`);
      if (s.closeRate != null && s.closeRate < 20)
        issues.push(`**Cierre**: cierras el ${s.closeRate.toFixed(0)}% de las reuniones. Haz más preguntas de necesidad antes de presentar precio y usa el anclaje de tres opciones.`);
      const noFu = state.prospects.filter((p) => p.stage === 'contactado' && p.sequenceStep === 0 && (daysAgo(p.firstContact) ?? 0) > 4).length;
      if (noFu >= 3) issues.push(`**Seguimiento**: ${noFu} leads recibieron un solo mensaje y nunca un seguimiento. La mayoría de ventas llegan entre el 2º y el 4º contacto.`);
    }
    const st = streak(state.activities, state.settings.workDays);
    if (st.count === 0) issues.push('**Constancia**: no tienes racha activa. Vender es un juego de volumen diario; mejor 5 contactos todos los días que 25 un solo día.');
    const lost = state.prospects.filter((p) => p.stage === 'perdido' && p.lostReason);
    if (lost.length >= 3) {
      const reasons = new Map<string, number>();
      lost.forEach((p) => reasons.set(p.lostReason, (reasons.get(p.lostReason) ?? 0) + 1));
      const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
      issues.push(`**Motivo de pérdida más frecuente**: "${top[0]}" (${top[1]} veces). Entrena esa objeción en el Sales Coach.`);
    }
    if (!issues.length) issues.push('Con los datos actuales no veo un cuello de botella claro. Tus ratios están dentro de lo razonable: la palanca ahora es el volumen.');
    return { text: issues.join('\n\n'), links: [{ label: 'Ver Analytics', href: '#/analytics' }] };
  }

  // Cómo voy / mes / objetivo
  if (any(q, ['como voy', 'mes', 'objetivo', 'progreso', 'ventas', 'dinero', 'ingres'])) {
    const s = computeStats(state, startOfMonth(today()));
    const goal = state.profile.monthlyRevenueGoal;
    const pct = goal ? Math.round((s.revenue / goal) * 100) : 0;
    const [from, to] = periodRange('monthly');
    const g = countGoals(state.activities, from, to);
    const open = state.prospects.filter((p) => ACTIVE.includes(p.stage));
    return {
      text: `**Este mes**: ${money(s.revenue)} de ${money(goal)} (${pct}%) · ${plural(s.won, 'venta', 'ventas')}.\n\nActividad: ${g.contactos} contactos, ${g.reuniones} reuniones, ${g.propuestas} propuestas.\n\nPipeline activo: ${plural(open.length, 'lead', 'leads')} · ${money(s.weightedPipeline)} ponderado por probabilidad.${goal > s.revenue ? `\n\nTe faltan ${money(goal - s.revenue)}. ${s.weightedPipeline >= goal - s.revenue ? 'Tu pipeline podría cubrirlo si cierras lo que tienes: céntrate en propuestas y negociaciones.' : 'Tu pipeline no basta para cubrirlo: necesitas más prospectos nuevos esta semana.'}` : '\n\n🎉 ¡Objetivo cumplido!'}`,
      links: [{ label: 'Ver objetivos', href: '#/goals' }],
    };
  }

  // Búsqueda de un prospecto por nombre
  const hit = state.prospects.find((p) => p.business && q.includes(normalize(p.business)));
  if (hit) {
    return {
      text: `**${hit.business}** · ${STAGE_LABEL[hit.stage]}\nProbabilidad ${probabilityOf(hit)}% · ${money(valueOf(hit, state.profile.avgPrice))}\nÚltimo contacto: ${hit.lastContact ? `hace ${daysAgo(hit.lastContact)} días` : 'nunca'} · Próximo seguimiento: ${hit.nextFollowUp ?? 'sin programar'}\nProblema principal: ${mainProblem(hit)}`,
      prospects: [hit.id],
    };
  }

  return {
    text: 'Puedo ayudarte con preguntas sobre tus datos. Prueba con alguna de estas:',
    links: SUGGESTIONS.slice(0, 4).map((s) => ({ label: s, href: `#ask:${s}` })),
  };
}
