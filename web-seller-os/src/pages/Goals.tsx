import { useState } from 'react';
import { Pencil, Wand2 } from 'lucide-react';
import { useStore } from '../data/store';
import { Bar, BlockBar, Modal, Seg } from '../components/ui';
import { GOAL_LABEL, type GoalSet, type Goals as GoalsT } from '../data/types';
import { LEVELS, XP, countGoals, dailyMission, levelFor, periodRange, streak, totalXp } from '../lib/progress';
import { planFromProfile } from '../data/defaults';
import { money, plural, fmtNum } from '../lib/format';
import { toast } from '../lib/bus';
import { computeStats } from '../lib/insights';
import { startOfMonth, today } from '../lib/dates';

type P = 'daily' | 'weekly' | 'monthly';
const P_LABEL: Record<P, string> = { daily: 'Hoy', weekly: 'Esta semana', monthly: 'Este mes' };
const KEYS = Object.keys(GOAL_LABEL) as (keyof GoalSet)[];

export default function Goals() {
  const { state } = useStore();
  const [period, setPeriod] = useState<P>('daily');
  const [edit, setEdit] = useState(false);
  const [from, to] = periodRange(period);
  const done = countGoals(state.activities, from, to);
  const goals = state.goals[period];
  const keys = KEYS.filter((k) => goals[k] > 0);
  const xp = totalXp(state);
  const lvl = levelFor(xp);
  const st = streak(state.activities, state.settings.workDays);
  const mission = dailyMission(state);
  const month = computeStats(state, startOfMonth(today()));
  const totalPct = keys.length ? Math.round((keys.reduce((s, k) => s + Math.min(1, done[k] / goals[k]), 0) / keys.length) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Objetivos y progreso</h1>
          <p className="muted">Lo que se mide, mejora. Solo cuentan acciones reales registradas.</p>
        </div>
        <div className="row gap-6">
          <Seg value={period} onChange={setPeriod} options={(Object.keys(P_LABEL) as P[]).map((p) => ({ value: p, label: P_LABEL[p] }))} />
          <button className="btn" onClick={() => setEdit(true)}>
            <Pencil /> Editar
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }} data-stack>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head">
            <div className="h3">{P_LABEL[period]}</div>
            <span className="badge accent num">{totalPct}% completado</span>
          </div>
          {keys.length === 0 ? (
            <p className="muted small">No hay objetivos para este periodo. Pulsa Editar para definirlos.</p>
          ) : (
            <div className="col gap-20">
              {keys.map((k) => {
                const pct = Math.round(Math.min(1, done[k] / goals[k]) * 100);
                return (
                  <div key={k}>
                    <div className="row between mb-8">
                      <span className="eyebrow" style={{ color: 'var(--text-2)' }}>
                        {GOAL_LABEL[k]}
                      </span>
                      <span className="mono small">
                        {done[k]}/{goals[k]}
                      </span>
                    </div>
                    <div className="row gap-12">
                      <BlockBar value={done[k]} max={goals[k]} blocks={20} />
                      <span className="mono small" style={{ color: pct >= 100 ? 'var(--accent)' : 'var(--text-3)' }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {period === 'monthly' && (
            <div className="mt-24">
              <div className="row between small mb-8">
                <span className="eyebrow" style={{ color: 'var(--text-2)' }}>
                  Facturación
                </span>
                <span className="mono">
                  {money(month.revenue)} / {money(state.profile.monthlyRevenueGoal)}
                </span>
              </div>
              <Bar value={month.revenue} max={state.profile.monthlyRevenueGoal} className="thick" />
            </div>
          )}
        </div>

        <div className="col gap-16">
          <div className="card glow">
            <div className="eyebrow">Nivel {lvl.level}</div>
            <div className="h1 mt-4">{lvl.name}</div>
            <Bar value={lvl.progress} max={1} className="mt-16" />
            <div className="row between tiny dim mt-8 num">
              <span>{fmtNum(xp)} XP</span>
              <span>{lvl.next ? `${fmtNum(lvl.next.xp - xp)} XP para ${lvl.next.name}` : 'Nivel máximo'}</span>
            </div>
            <div className="col gap-4 mt-16">
              {LEVELS.map((l) => (
                <div key={l.level} className="row gap-12 small" style={{ opacity: l.level <= lvl.level ? 1 : 0.4 }}>
                  <span className="mono tiny" style={{ width: 16 }}>
                    {l.level}
                  </span>
                  <span className="grow">{l.name}</span>
                  <span className="mono tiny dim">{fmtNum(l.xp)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row gap-12">
              <span className={`streak-flame ${st.count ? '' : 'off'}`}>🔥</span>
              <div className="grow">
                <div className="h2 num">{plural(st.count, 'día consecutivo', 'días consecutivos')}</div>
                <div className="tiny dim">Mejor racha: {plural(st.best, 'día', 'días')}</div>
              </div>
            </div>
            <p className="small muted mt-12">
              La racha solo avanza si haces al menos una acción comercial real en un día laborable. Abrir la app o crear fichas no cuenta.
            </p>
          </div>

          <div className="card">
            <div className="h3 mb-12">🎯 Misión de hoy</div>
            {mission.map((m) => (
              <div key={m.id} className="row gap-12 small" style={{ padding: '6px 0' }}>
                <span>{m.done >= m.target ? '✅' : m.emoji}</span>
                <span className={`grow ${m.done >= m.target ? 'dim' : ''}`}>{m.label}</span>
                <span className="mono tiny dim">+{m.xp} XP</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="h3 mb-12">Cómo se gana XP</div>
            <div className="col gap-4 small">
              {(
                [
                  ['won', 'Venta cerrada'],
                  ['proposal', 'Propuesta enviada'],
                  ['meeting', 'Reunión conseguida'],
                  ['reply', 'Respuesta conseguida'],
                  ['training', 'Entrenamiento'],
                  ['audit', 'Auditoría'],
                  ['outreach', 'Primer contacto'],
                  ['followup', 'Seguimiento'],
                ] as [keyof typeof XP, string][]
              ).map(([k, l]) => (
                <div key={k} className="row between">
                  <span className="muted">{l}</span>
                  <span className="mono accent">+{XP[k]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {edit && <EditGoals onClose={() => setEdit(false)} />}
    </div>
  );
}

function EditGoals({ onClose }: { onClose: () => void }) {
  const { state, actions } = useStore();
  const [g, setG] = useState<GoalsT>(JSON.parse(JSON.stringify(state.goals)));
  const [rev, setRev] = useState(state.profile.monthlyRevenueGoal);
  const set = (p: P, k: keyof GoalSet, v: number) => setG((s) => ({ ...s, [p]: { ...s[p], [k]: Math.max(0, v) } }));
  const auto = () => {
    const plan = planFromProfile({ ...state.profile, monthlyRevenueGoal: rev }, Math.round((state.settings.workDays.length / 7) * 30));
    setG(plan.goals);
    toast('Objetivos recalculados a partir de tu objetivo de facturación', 'info');
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Editar objetivos"
      footer={
        <>
          <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={auto}>
            <Wand2 /> Recalcular automáticamente
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              actions.updateGoals(g);
              actions.updateProfile({ monthlyRevenueGoal: rev });
              toast('Objetivos guardados');
              onClose();
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <label className="field mb-16">
        <span className="label">Objetivo de facturación mensual (€)</span>
        <input className="input" type="number" min={0} step={100} value={rev} onChange={(e) => setRev(Number(e.target.value))} />
      </label>
      <div className="table-wrap" style={{ margin: 0, padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Diario</th>
              <th>Semanal</th>
              <th>Mensual</th>
            </tr>
          </thead>
          <tbody>
            {KEYS.map((k) => (
              <tr key={k} style={{ cursor: 'default' }}>
                <td className="small">{GOAL_LABEL[k]}</td>
                {(['daily', 'weekly', 'monthly'] as P[]).map((p) => (
                  <td key={p}>
                    <input className="input" type="number" min={0} style={{ width: 80, height: 34 }} value={g[p][k]} onChange={(e) => set(p, k, Number(e.target.value))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny dim mt-12">Pon 0 en lo que no quieras medir.</p>
    </Modal>
  );
}
