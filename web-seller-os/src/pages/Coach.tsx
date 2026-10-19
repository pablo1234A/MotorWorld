import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Dumbbell, GraduationCap, Lightbulb, MessageSquare, RotateCcw, Send, Sparkles, Swords, Target, X } from 'lucide-react';
import { useStore } from '../data/store';
import { Bar, Ring } from '../components/ui';
import { trainingForDay } from '../content/coach';
import { OBJECTIONS } from '../content/objections';
import { DIMENSIONS, DIM_LABEL, OBJECTION_TEXT, PERSONAS, closingLine, evaluate, modelAnswer, nextObjection, transition, type Evaluation, type Persona } from '../lib/roleplay';
import { today } from '../lib/dates';
import { lowerFirst, money } from '../lib/format';
import { toast } from '../lib/bus';

export default function Coach({ sub }: { sub?: string }) {
  return sub === 'roleplay' ? <Roleplay /> : <Training />;
}

function Training() {
  const { state, actions } = useStore();
  const t = today();
  const tr = trainingForDay(t);
  const obj = OBJECTIONS.find((o) => o.id === tr.objectionId)!;
  const [pick, setPick] = useState<number | null>(null);
  const done = !!state.coach.trainingsDone[t];
  const recent = state.coach.roleplays.slice(0, 5);
  const avg = recent.length ? Math.round(recent.reduce((s, r) => s + r.score, 0) / recent.length) : null;
  const streakDays = Object.keys(state.coach.trainingsDone).length;

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Sales coach</div>
          <h1 className="h1 mt-4">Entrenamiento de hoy</h1>
          <p className="muted">5 minutos al día. Una técnica, una objeción, una práctica.</p>
        </div>
        <a href="#/coach/roleplay" className="btn btn-primary btn-lg">
          <Swords /> Modo roleplay
        </a>
      </div>

      <div className="grid g3 keep mb-16">
        <div className="card tight kpi">
          <span className="kpi-label">Entrenamientos</span>
          <span className="kpi-value" style={{ fontSize: 22 }}>{streakDays}</span>
        </div>
        <div className="card tight kpi">
          <span className="kpi-label">Roleplays</span>
          <span className="kpi-value" style={{ fontSize: 22 }}>{state.coach.roleplays.length}</span>
        </div>
        <div className="card tight kpi">
          <span className="kpi-label">Nota media (5 últ.)</span>
          <span className="kpi-value" style={{ fontSize: 22 }}>{avg ?? '—'}</span>
        </div>
      </div>

      <div className="col gap-16 stagger">
        <section className="card" style={{ ['--i' as string]: 0 }}>
          <div className="row gap-6 eyebrow">
            <Lightbulb size={14} /> 1 · Técnica
          </div>
          <div className="h2 mt-8">{tr.technique.name}</div>
          <p className="mt-8">{tr.technique.what}</p>
          <p className="muted mt-8 small">
            <b className="strong">Cómo:</b> {tr.technique.how}
          </p>
          <div className="card tight mt-12" style={{ background: 'var(--surface)' }}>
            <span className="small">{tr.technique.example}</span>
          </div>
        </section>

        <section className="card" style={{ ['--i' as string]: 1 }}>
          <div className="row gap-6 eyebrow">
            <MessageSquare size={14} /> 2 · Objeción del día
          </div>
          <div className="h2 mt-8">{obj.phrase}</div>
          <p className="muted small mt-8">{obj.meaning}</p>
          <div className="eyebrow mt-16 mb-8">Respuesta recomendada</div>
          <p style={{ lineHeight: 1.6 }}>"{obj.response.replace('{ticket}', money(state.profile.avgPrice / 6))}"</p>
          <a className="btn btn-ghost btn-sm mt-12" href={`#/objections/${obj.id}`}>
            Ver objeción completa <ArrowRight />
          </a>
        </section>

        <section className="card" style={{ ['--i' as string]: 2 }}>
          <div className="row gap-6 eyebrow">
            <Dumbbell size={14} /> 3 · Ejercicio práctico
          </div>
          <p className="mt-8">{tr.exercise}</p>
        </section>

        <section className="card" style={{ ['--i' as string]: 3 }}>
          <div className="row gap-6 eyebrow">
            <Target size={14} /> 4 · Mini simulación
          </div>
          <p className="h3 mt-8">{tr.simulation.situation}</p>
          <div className="col gap-6 mt-12">
            {tr.simulation.options.map((o, i) => {
              const isBest = i === tr.simulation.best;
              const chosen = pick === i;
              return (
                <button
                  key={i}
                  disabled={pick != null}
                  onClick={() => setPick(i)}
                  className="card tight hover"
                  style={{
                    textAlign: 'left',
                    cursor: pick == null ? 'pointer' : 'default',
                    borderColor: pick != null && isBest ? 'color-mix(in srgb, var(--green) 50%, transparent)' : chosen ? 'color-mix(in srgb, var(--red) 50%, transparent)' : undefined,
                    background: pick != null && isBest ? 'color-mix(in srgb, var(--green) 8%, transparent)' : undefined,
                  }}
                >
                  <div className="row row-top gap-12">
                    <span className="mono tiny dim" style={{ paddingTop: 2 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="small grow">{o}</span>
                    {pick != null && isBest && <CheckCircle2 size={18} style={{ color: 'var(--green)' }} />}
                    {chosen && !isBest && <X size={18} style={{ color: 'var(--red)' }} />}
                  </div>
                </button>
              );
            })}
          </div>
          {pick != null && (
            <div className="mt-16" style={{ animation: 'rise 360ms var(--ease-out) both' }}>
              <div className="small strong" style={{ color: pick === tr.simulation.best ? 'var(--green)' : 'var(--orange)' }}>
                {pick === tr.simulation.best ? '¡Correcto!' : `La mejor es la ${String.fromCharCode(65 + tr.simulation.best)}.`}
              </div>
              <p className="small muted mt-4">{tr.simulation.why}</p>
            </div>
          )}
        </section>

        <section className="card glow" style={{ ['--i' as string]: 4 }}>
          <div className="row between row-wrap gap-12">
            <div>
              <div className="h3">{done ? 'Entrenamiento completado ✅' : '¿Has terminado el entrenamiento?'}</div>
              <div className="small muted">{done ? 'Vuelve mañana para uno nuevo. Mientras, practica un roleplay.' : 'Marca como hecho y gana +15 XP.'}</div>
            </div>
            {done ? (
              <a href="#/coach/roleplay" className="btn">
                <Swords /> Roleplay
              </a>
            ) : (
              <button
                className="btn btn-primary"
                disabled={pick == null}
                onClick={() => {
                  actions.completeTraining();
                  toast('Entrenamiento completado');
                }}
                data-tip={pick == null ? 'Responde la mini simulación primero' : undefined}
              >
                <Check /> Completar
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────── ROLEPLAY ─────────────────────────── */

interface Msg {
  who: 'owner' | 'me' | 'coach';
  text: string;
  evaluation?: Evaluation;
  objection?: string;
}

const ROUNDS = 3;

function Roleplay() {
  const { state, actions } = useStore();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [firstObj, setFirstObj] = useState<string>('random');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [used, setUsed] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [typing, setTyping] = useState(false);
  const [finished, setFinished] = useState<Evaluation | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, typing]);

  const start = (p: Persona) => {
    const keys = Object.keys(OBJECTION_TEXT);
    const o = firstObj === 'random' ? keys[Math.floor(Math.random() * keys.length)] : firstObj;
    setPersona(p);
    setUsed([o]);
    setCurrent(o);
    setFinished(null);
    setMsgs([{ who: 'owner', text: `${p.opener} ${OBJECTION_TEXT[o]}`, objection: o }]);
  };

  const send = () => {
    const text = answer.trim();
    if (!text || !persona || typing) return;
    const ev = evaluate(text, current);
    const mine: Msg = { who: 'me', text, evaluation: ev, objection: current };
    const round = msgs.filter((m) => m.who === 'me').length + 1;
    setMsgs((m) => [...m, mine]);
    setAnswer('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      if (round >= ROUNDS) {
        const all = [...msgs, mine].filter((m) => m.evaluation).map((m) => m.evaluation!);
        const breakdown = Object.fromEntries(DIMENSIONS.map((d) => [d, Math.round(all.reduce((s, e) => s + e.breakdown[d], 0) / all.length)])) as Evaluation['breakdown'];
        const score = Math.round(all.reduce((s, e) => s + e.score, 0) / all.length);
        const tips = Array.from(new Set(all.flatMap((e) => e.tips))).slice(0, 4);
        const strengths = Array.from(new Set(all.flatMap((e) => e.strengths))).slice(0, 3);
        const final = { score, breakdown, tips, strengths };
        setMsgs((m) => [...m, { who: 'owner', text: closingLine(score) }]);
        setFinished(final);
        actions.saveRoleplay({ scenario: `${persona.business} · ${used.map((u) => OBJECTION_TEXT[u]).join(' / ')}`, score, breakdown });
      } else {
        const next = nextObjection(used, ev.score);
        setUsed((u) => [...u, next]);
        setCurrent(next);
        setMsgs((m) => [...m, { who: 'owner', text: (() => {
          const tr = transition(ev.score, round + persona.id.length);
          return `${tr} ${/[,:]$/.test(tr) ? lowerFirst(OBJECTION_TEXT[next]) : OBJECTION_TEXT[next]}`;
        })(), objection: next }]);
      }
    }, 900 + Math.random() * 500);
  };

  if (!persona) {
    return (
      <div className="page page-narrow">
        <a href="#/coach" className="btn btn-ghost btn-sm mb-16">
          ← Sales Coach
        </a>
        <div className="page-head">
          <div>
            <div className="eyebrow">Roleplay</div>
            <h1 className="h1 mt-4">Véndele una web a un propietario</h1>
            <p className="muted">Él pone objeciones. Tú respondes por escrito. {ROUNDS} rondas y te evalúo de 0 a 100 en seis dimensiones.</p>
          </div>
        </div>
        <div className="card mb-16">
          <div className="label mb-8">Primera objeción</div>
          <div className="chips">
            <button className={`chip ${firstObj === 'random' ? 'on' : ''}`} onClick={() => setFirstObj('random')}>
              <Sparkles /> Aleatoria
            </button>
            {Object.entries(OBJECTION_TEXT).map(([k, v]) => (
              <button key={k} className={`chip ${firstObj === k ? 'on' : ''}`} onClick={() => setFirstObj(k)}>
                "{v}"
              </button>
            ))}
          </div>
        </div>
        <div className="eyebrow mb-12">Elige al propietario</div>
        <div className="grid g2">
          {PERSONAS.map((p) => (
            <button key={p.id} className="card hover" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => start(p)}>
              <div className="row gap-12">
                <div className="avatar">{p.owner[0]}</div>
                <div className="grow">
                  <div className="strong">{p.owner}</div>
                  <div className="tiny dim">{p.business}</div>
                </div>
                <span className="badge">{p.mood}</span>
              </div>
              <p className="small muted mt-12">{p.context}</p>
            </button>
          ))}
        </div>
        {state.coach.roleplays.length > 0 && (
          <div className="card mt-24">
            <div className="h3 mb-12">Historial</div>
            <div className="list">
              {state.coach.roleplays.slice(0, 8).map((r) => (
                <div key={r.id} className="list-row">
                  <span className="mono strong" style={{ width: 34, color: r.score >= 70 ? 'var(--green)' : r.score >= 45 ? 'var(--orange)' : 'var(--red)' }}>
                    {r.score}
                  </span>
                  <span className="small grow trunc">{r.scenario}</span>
                  <span className="tiny dim">{r.at.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const round = msgs.filter((m) => m.who === 'me').length;
  return (
    <div className="page page-narrow">
      <div className="row between mb-16">
        <button className="btn btn-ghost btn-sm" onClick={() => setPersona(null)}>
          ← Salir
        </button>
        <div className="row gap-12">
          <span className="small dim">
            Ronda {Math.min(round + (finished ? 0 : 1), ROUNDS)}/{ROUNDS}
          </span>
          <div style={{ width: 80 }}>
            <Bar value={round} max={ROUNDS} className="thin" />
          </div>
        </div>
      </div>

      <div className="card tight row gap-12 mb-16">
        <div className="avatar">{persona.owner[0]}</div>
        <div className="grow">
          <div className="strong small">
            {persona.owner} · {persona.business}
          </div>
          <div className="tiny dim">{persona.context}</div>
        </div>
      </div>

      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className="col" style={{ gap: 8 }}>
            <div className={`bubble ${m.who === 'me' ? 'me' : 'owner'}`}>{m.text}</div>
            {m.evaluation && (
              <div className="row gap-6" style={{ alignSelf: 'flex-end' }}>
                <span className={`badge ${m.evaluation.score >= 70 ? 'ok' : m.evaluation.score >= 45 ? 'warm' : 'hot'}`}>{m.evaluation.score}/100</span>
                {m.evaluation.tips[0] && <span className="tiny dim" style={{ maxWidth: 380, textAlign: 'right' }}>{m.evaluation.tips[0]}</span>}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="bubble owner typing">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {finished ? (
        <div className="card glow mt-24" style={{ animation: 'rise 480ms var(--ease-out) both' }}>
          <div className="row gap-24 row-wrap">
            <Ring value={finished.score} size={120} color={finished.score >= 70 ? 'var(--green)' : finished.score >= 45 ? 'var(--orange)' : 'var(--red)'}>
              <div className="h1 num">{finished.score}</div>
              <div className="tiny dim">/100</div>
            </Ring>
            <div className="grow" style={{ minWidth: 220 }}>
              <div className="h2">{finished.score >= 80 ? 'Excelente. Así se cierra.' : finished.score >= 65 ? 'Buen trabajo, vas por buen camino.' : finished.score >= 45 ? 'Correcto, pero hay margen claro.' : 'Toca practicar. Vamos a por ello.'}</div>
              <div className="col gap-6 mt-12">
                {DIMENSIONS.map((d) => (
                  <div key={d} className="row gap-12 small">
                    <span style={{ width: 170 }} className="muted">
                      {DIM_LABEL[d]}
                    </span>
                    <div className="grow">
                      <Bar value={finished.breakdown[d]} max={100} className="thin" color={finished.breakdown[d] >= 70 ? 'var(--green)' : finished.breakdown[d] >= 45 ? 'var(--orange)' : 'var(--red)'} />
                    </div>
                    <span className="mono tiny" style={{ width: 26, textAlign: 'right' }}>
                      {finished.breakdown[d]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {finished.strengths.length > 0 && (
            <div className="mt-24">
              <div className="eyebrow mb-8" style={{ color: 'var(--green)' }}>
                Lo que haces bien
              </div>
              {finished.strengths.map((s) => (
                <div key={s} className="row row-top gap-6 small mt-4">
                  <Check size={14} style={{ color: 'var(--green)', marginTop: 3, flex: 'none' }} /> {s}
                </div>
              ))}
            </div>
          )}
          {finished.tips.length > 0 && (
            <div className="mt-16">
              <div className="eyebrow mb-8" style={{ color: 'var(--orange)' }}>
                Cómo mejorar
              </div>
              {finished.tips.map((s) => (
                <div key={s} className="row row-top gap-6 small mt-4">
                  <ArrowRight size={14} style={{ color: 'var(--orange)', marginTop: 3, flex: 'none' }} /> {s}
                </div>
              ))}
            </div>
          )}
          <div className="mt-16">
            <div className="eyebrow mb-8">Respuesta modelo a "{OBJECTION_TEXT[used[0]]}"</div>
            <p className="small muted" style={{ lineHeight: 1.6 }}>
              "{modelAnswer(used[0], money(state.profile.avgPrice / 6))}"
            </p>
          </div>
          <div className="row gap-6 mt-24 row-wrap">
            <button className="btn btn-primary" onClick={() => start(persona)}>
              <RotateCcw /> Repetir
            </button>
            <button className="btn" onClick={() => setPersona(null)}>
              Otro propietario
            </button>
            <a className="btn btn-ghost" href="#/objections">
              <GraduationCap /> Estudiar objeciones
            </a>
          </div>
        </div>
      ) : (
        <form
          className="card tight mt-24 glass sticky-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            className="textarea"
            style={{ border: 'none', background: 'none', boxShadow: 'none', minHeight: 70, padding: 4 }}
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={`Responde a ${persona.owner} como lo harías en la vida real…`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="row between">
            <span className="tiny dim hide-mobile">
              <kbd>↵</kbd> enviar · <kbd>⇧↵</kbd> salto de línea
            </span>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!answer.trim() || typing}>
              <Send /> Responder
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
