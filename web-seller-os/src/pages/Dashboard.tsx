import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckSquare, Euro, Flame, Percent, Plus, Repeat, Trophy, Users, Zap } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { AnimatedNumber, Bar, BlockBar, CheckBox, NeedsData, Ring } from '../components/ui';
import { MiniBars } from '../components/charts';
import { KIND_COLOR, StagePill } from '../components/forms';
import { addDays, fmtLongDay, greeting, parseDay, startOfMonth, today, WEEKDAYS_SHORT } from '../lib/dates';
import { computeStats, followUpBuckets, itemsOn, nextActions } from '../lib/insights';
import { activeDays, countGoals, dailyMission, levelFor, periodRange, streak, totalXp } from '../lib/progress';
import { money, plural } from '../lib/format';
import { navigate } from '../lib/router';
import { GOAL_LABEL, type GoalSet } from '../data/types';

export default function Dashboard() {
  const { state, actions } = useStore();
  const ui = useUI();
  const t = today();
  const [skip, setSkip] = useState(0);
  const acts = useMemo(() => nextActions(state), [state]);
  const top = acts[skip % Math.max(1, acts.length)];
  const fu = followUpBuckets(state);
  const todayItems = itemsOn(state, t);
  const pendingProspects = state.prospects.filter((p) => p.stage === 'nuevo' || p.stage === 'investigando').length;
  const meetingsToday = todayItems.filter((i) => (i.kind === 'reunion' || i.kind === 'demo') && i.status !== 'cancelado');
  const tasksDone = todayItems.filter((i) => i.status === 'hecho').length;
  const month = computeStats(state, startOfMonth(t));
  const all = computeStats(state, '0000-01-01');
  const st = streak(state.activities, state.settings.workDays);
  const lvl = levelFor(totalXp(state));
  const mission = dailyMission(state);
  const missionDone = mission.filter((m) => m.done >= m.target).length;
  const goalDay = countGoals(state.activities, t, t);
  const [wf, wt] = periodRange('weekly');
  const goalWeek = countGoals(state.activities, wf, wt);
  const days = activeDays(state.activities);
  const name = state.profile.name.split(' ')[0];

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(t, i - 6);
    const n = state.activities.filter((a) => a.day === d && (a.type === 'outreach' || a.type === 'followup')).length;
    return { label: WEEKDAYS_SHORT[(parseDay(d).getDay() + 6) % 7], value: n, tip: `${n} contactos` };
  });

  // Agenda unificada de hoy: eventos/tareas + seguimientos del CRM
  const fuToday = [...fu.overdue, ...fu.today];

  const goalKeys = (['contactos', 'llamadas', 'mensajes', 'auditorias', 'reuniones', 'propuestas', 'cierres'] as (keyof GoalSet)[]).filter((k) => state.goals.daily[k] > 0);
  const weekKeys = (['contactos', 'reuniones', 'propuestas', 'cierres'] as (keyof GoalSet)[]).filter((k) => state.goals.weekly[k] > 0);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <div className="date">{fmtLongDay(t)}</div>
          <h1 className="display">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="lead mt-8">Esto es lo que tienes que hacer hoy.</p>
        </div>
        <div className="row gap-12">
          <a href="#/goals" className="card tight hover row gap-12" style={{ padding: '10px 14px' }} data-tip={st.doneToday ? 'Racha asegurada hoy' : 'Haz una acción comercial real hoy para mantenerla'}>
            <span className={`streak-flame ${st.count ? '' : 'off'}`}>🔥</span>
            <div>
              <div className="h3 num">{plural(st.count, 'día', 'días')}</div>
              <div className="tiny dim">{st.doneToday ? 'Racha asegurada' : st.count ? 'Mantenla hoy' : 'Sin racha'}</div>
            </div>
          </a>
          <a href="#/goals" className="card tight hover hide-mobile" style={{ padding: '10px 14px', minWidth: 170 }}>
            <div className="row between">
              <span className="small strong">Nv {lvl.level} · {lvl.name}</span>
            </div>
            <Bar value={lvl.progress} max={1} className="thin mt-8" />
            <div className="tiny dim mt-4 num">{lvl.next ? `${lvl.xp} / ${lvl.next.xp} XP` : `${lvl.xp} XP · nivel máximo`}</div>
          </a>
        </div>
      </section>

      {/* PRIORIDAD #1 */}
      {top && (
        <section className="card glow priority-card stagger" style={{ ['--i' as string]: 0 }}>
          <div className="row between">
            <span className="badge accent">
              <Zap size={12} /> PRIORIDAD #1
            </span>
            {acts.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSkip((s) => s + 1)}>
                Ver otra
              </button>
            )}
          </div>
          <div className="row row-top gap-16 mt-16" key={top.id} style={{ animation: 'rise 420ms var(--ease-out) both' }}>
            <span className="p-emoji">{top.emoji}</span>
            <div className="grow">
              <div className="p-title">{top.title}</div>
              <div className="p-detail">{top.detail}</div>
              <div className="row row-wrap gap-12 mt-20">
                <button className="btn btn-primary btn-lg" onClick={() => navigate(top.href)}>
                  HACER AHORA <ArrowRight />
                </button>
                {acts[1] && skip === 0 && <span className="small dim hide-mobile">Después: {acts[1].title}</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* KPIs de hoy */}
      <section className="grid g4 keep mt-16 stagger">
        <a href="#/followups" className="card hover kpi" style={{ ['--i' as string]: 1 }}>
          <span className="kpi-label">
            <Repeat /> Seguimientos
          </span>
          <span className="kpi-value">
            <AnimatedNumber value={fu.overdue.length + fu.today.length} />
          </span>
          <span className="kpi-sub">{fu.overdue.length ? <span style={{ color: 'var(--red)' }}>{fu.overdue.length} atrasados</span> : 'Al día'}</span>
        </a>
        <a href="#/prospecting" className="card hover kpi" style={{ ['--i' as string]: 2 }}>
          <span className="kpi-label">
            <Users /> Prospectos pendientes
          </span>
          <span className="kpi-value">
            <AnimatedNumber value={pendingProspects} />
          </span>
          <span className="kpi-sub">sin contactar todavía</span>
        </a>
        <a href="#/calendar" className="card hover kpi" style={{ ['--i' as string]: 3 }}>
          <span className="kpi-label">
            <CalendarDays /> Reuniones hoy
          </span>
          <span className="kpi-value">
            <AnimatedNumber value={meetingsToday.length} />
          </span>
          <span className="kpi-sub trunc">{meetingsToday[0] ? `${meetingsToday[0].time ?? ''} ${meetingsToday[0].title}` : 'Ninguna programada'}</span>
        </a>
        <a href="#/tasks" className="card hover kpi" style={{ ['--i' as string]: 4 }}>
          <span className="kpi-label">
            <CheckSquare /> Tareas de hoy
          </span>
          <span className="kpi-value num">
            {tasksDone}
            <span className="dim" style={{ fontSize: 18 }}>
              /{todayItems.length}
            </span>
          </span>
          <Bar value={tasksDone} max={todayItems.length || 1} className="thin" />
        </a>
      </section>

      <section className="grid mt-16" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }} data-stack>
        {/* Agenda de hoy */}
        <div className="card">
          <div className="card-head">
            <div className="h3">Hoy</div>
            <div className="row gap-4">
              <button className="btn btn-ghost btn-sm" onClick={() => ui.newItem({ kind: 'tarea' })}>
                <Plus /> Tarea
              </button>
              <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => ui.newItem({ kind: 'llamada', time: '10:00' })}>
                <Plus /> Evento
              </button>
            </div>
          </div>
          {todayItems.length === 0 && fuToday.length === 0 ? (
            <div className="empty" style={{ padding: '28px 12px' }}>
              <p>No tienes nada programado hoy. Usa la prioridad #1 o crea tu primera tarea.</p>
            </div>
          ) : (
            <div className="list">
              {todayItems.map((i) => {
                const p = state.prospects.find((x) => x.id === i.prospectId);
                return (
                  <div key={i.id} className="list-row clickable" onClick={() => ui.editItem(i)}>
                    <CheckBox on={i.status === 'hecho'} onClick={() => actions.toggleItem(i.id)} />
                    <span className="kind-dot" style={{ background: KIND_COLOR[i.kind] }} />
                    <div className="grow">
                      <div className={`trunc ${i.status === 'hecho' ? 'done-text' : ''}`}>{i.title}</div>
                      {p && <div className="tiny dim trunc">{p.business}</div>}
                    </div>
                    {i.priority === 'alta' && i.status !== 'hecho' && <span className="badge hot">Alta</span>}
                    <span className="mono small dim">{i.time ?? ''}</span>
                  </div>
                );
              })}
              {fuToday.map((p) => (
                <div key={p.id} className="list-row clickable" onClick={() => navigate(`#/prospects/${p.id}`)}>
                  <button
                    className="check"
                    aria-label={`Registrar seguimiento a ${p.business}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ui.logTouch(p);
                    }}
                  />
                  <span className="kind-dot" style={{ background: KIND_COLOR.seguimiento }} />
                  <div className="grow">
                    <div className="trunc">Seguimiento · {p.business}</div>
                    <div className="tiny dim">{p.nextFollowUp! < t ? <span style={{ color: 'var(--red)' }}>Atrasado</span> : 'Hoy'}</div>
                  </div>
                  <StagePill stage={p.stage} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Misión diaria */}
        <div className="card">
          <div className="card-head">
            <div className="h3">🎯 Tu misión</div>
            <span className="badge accent num">
              {missionDone}/{mission.length}
            </span>
          </div>
          {mission.map((m) => {
            const done = m.done >= m.target;
            return (
              <div key={m.id} className={`mission-item ${done ? 'done' : ''}`}>
                <span className="m-emoji">{done ? '✅' : m.emoji}</span>
                <div className="grow">
                  <div className={`small ${done ? 'dim' : ''}`}>{m.label}</div>
                  <Bar value={m.done} max={m.target} className="thin mt-4" />
                </div>
                <span className="mono tiny dim">
                  {Math.min(m.done, m.target)}/{m.target}
                </span>
              </div>
            );
          })}
          <div className="tiny dim mt-8">Completa cada misión para ganar XP extra.</div>
        </div>
      </section>

      {/* Objetivos */}
      <section className="grid g2 mt-16">
        <div className="card">
          <div className="card-head">
            <div className="h3">Objetivo diario</div>
            <a href="#/goals" className="btn btn-ghost btn-sm">
              Editar
            </a>
          </div>
          {goalKeys.length === 0 ? (
            <p className="muted small">Sin objetivos diarios. Configúralos en Objetivos.</p>
          ) : (
            <div className="col gap-12">
              {goalKeys.map((k) => (
                <div key={k} className="row gap-12">
                  <span className="small" style={{ width: 92 }}>
                    {GOAL_LABEL[k]}
                  </span>
                  <BlockBar value={goalDay[k]} max={state.goals.daily[k]} />
                  <span className="mono small dim grow" style={{ textAlign: 'right' }}>
                    {goalDay[k]}/{state.goals.daily[k]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <div className="h3">Objetivo semanal</div>
            <span className="tiny dim">Lun–Dom</span>
          </div>
          {weekKeys.length === 0 ? (
            <p className="muted small">Sin objetivos semanales.</p>
          ) : (
            <div className="col gap-16">
              {weekKeys.map((k) => (
                <div key={k}>
                  <div className="row between small" style={{ marginBottom: 6 }}>
                    <span>{GOAL_LABEL[k]}</span>
                    <span className="mono dim">
                      {goalWeek[k]}/{state.goals.weekly[k]}
                    </span>
                  </div>
                  <Bar value={goalWeek[k]} max={state.goals.weekly[k]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Resultados */}
      <section className="grid g4 keep mt-16">
        <div className="card kpi span2" style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <Ring value={month.revenue} max={state.profile.monthlyRevenueGoal} size={96} stroke={8}>
            <div className="small strong num">{state.profile.monthlyRevenueGoal ? Math.round((month.revenue / state.profile.monthlyRevenueGoal) * 100) : 0}%</div>
          </Ring>
          <div className="grow">
            <span className="kpi-label">
              <Euro /> Ventas del mes
            </span>
            <div className="kpi-value mt-4">
              <AnimatedNumber value={month.revenue} format={(n) => money(n)} />
            </div>
            <div className="kpi-sub">
              de {money(state.profile.monthlyRevenueGoal)} · {plural(month.won, 'venta', 'ventas')}
            </div>
          </div>
        </div>
        <div className="card kpi">
          <span className="kpi-label">
            <Percent /> Conversión
          </span>
          {all.conversion == null ? (
            <div className="kpi-empty">
              <NeedsData />
              <div className="tiny mt-4">{all.outreach}/10 contactos</div>
            </div>
          ) : (
            <>
              <span className="kpi-value">
                <AnimatedNumber value={all.conversion} format={(n) => `${n.toFixed(1)}%`} />
              </span>
              <span className="kpi-sub">contacto → venta</span>
            </>
          )}
        </div>
        <div className="card kpi">
          <span className="kpi-label">
            <Trophy /> Clientes cerrados
          </span>
          <span className="kpi-value">
            <AnimatedNumber value={all.won} />
          </span>
          <span className="kpi-sub">
            <AnimatedNumber value={all.revenue} format={(n) => money(n)} /> generados
          </span>
        </div>
      </section>

      <section className="grid g2 mt-16">
        <div className="card">
          <div className="card-head">
            <div className="h3">
              <Flame /> Racha
            </div>
            <span className="tiny dim">Mejor: {plural(st.best, 'día', 'días')}</span>
          </div>
          <div className="row gap-16">
            <span className={`streak-flame ${st.count ? '' : 'off'}`} style={{ fontSize: 40 }}>
              🔥
            </span>
            <div>
              <div className="h1 num">{plural(st.count, 'día consecutivo', 'días consecutivos')}</div>
              <div className="small dim">Solo cuentan acciones comerciales reales: contactos, seguimientos, auditorías, reuniones, propuestas y ventas.</div>
            </div>
          </div>
          <div className="days-dots mt-20">
            {Array.from({ length: 14 }, (_, i) => {
              const d = addDays(t, i - 13);
              return <span key={d} className={days.has(d) ? 'on' : ''} data-tip={d} />;
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="h3">Contactos · últimos 7 días</div>
            <a href="#/analytics" className="btn btn-ghost btn-sm">
              Analytics
            </a>
          </div>
          <MiniBars data={last7} height={90} />
        </div>
      </section>
    </div>
  );
}
