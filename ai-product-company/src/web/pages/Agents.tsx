import { useState } from 'react';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { useSnapshot } from '../components/Shell';
import { ActivityFeed, MessageList, TaskSheet } from '../components/blocks';
import { AgentMark, Empty, Loading, PageHead, Panel, Status, Tabs } from '../components/ui';
import { useResource } from '../lib/live';
import { Link, useRouter } from '../lib/router';
import { ago, dateTime } from '../lib/format';
import type { Activity, AgentSummary, MemoryEntry, Message, Task } from '../lib/types';

interface Skill {
  id: string;
  name: string;
  version: string;
  objective: string;
  methodology: string;
  knowledge: string[];
  process: string[];
  successCriteria: string[];
  commonMistakes: string[];
  constraints: string[];
  scorecard: { criterion: string; weight: number; description: string }[];
  examples: string[];
}

interface AgentFull extends AgentSummary {
  definition: {
    identity: string;
    specialization: string;
    methodology: string[];
    qualityBar: string[];
    limits: string[];
    errorBehavior: string;
    communication: string;
    reviewCapability: string;
    grants: string[];
    productFields: string[];
    memoryScopes: string[];
    scorecard: { criterion: string; description: string }[];
    chatActions: string[];
    effort: string;
  };
  skills: Skill[];
  tools: { id: string; name: string; description: string; grant: string; integration?: string }[];
  taskTypes: { type: string; label: string; description: string; skills: string[]; reviewer: string | null }[];
  memory: MemoryEntry[];
  tasks: Task[];
  errors: Task[];
  communications: Message[];
  log: Activity[];
}

const List = ({ items }: { items: string[] }) => (
  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-2)' }}>
    {items.map((x) => <li key={x} style={{ marginBottom: 4 }}>{x}</li>)}
  </ul>
);

export function SkillView({ s }: { s: Skill }) {
  return (
    <div className="skill">
      <div className="row gap-8"><h3>{s.name}</h3><span className="chip">v{s.version}</span></div>
      <p className="muted small" style={{ marginTop: 4 }}>{s.objective}</p>
      <details style={{ marginTop: 8 }}>
        <summary className="small" style={{ cursor: 'pointer', color: 'var(--text-2)' }}>Metodología, proceso, criterios, errores, restricciones, scorecard y ejemplos</summary>
        <div className="stack gap-12 small" style={{ marginTop: 10 }}>
          <div><b>Metodología.</b> <span className="muted">{s.methodology}</span></div>
          <div><b>Conocimiento</b><List items={s.knowledge} /></div>
          <div><b>Proceso</b><List items={s.process} /></div>
          <div><b>Criterios de éxito</b><List items={s.successCriteria} /></div>
          <div><b>Errores frecuentes</b><List items={s.commonMistakes} /></div>
          <div><b>Restricciones</b><List items={s.constraints} /></div>
          {s.scorecard.length > 0 && <div><b>Scorecard</b><List items={s.scorecard.map((c) => `${c.criterion} (peso ${c.weight}) — ${c.description}`)} /></div>}
          <div><b>Ejemplos</b><List items={s.examples} /></div>
        </div>
      </details>
    </div>
  );
}

/** Everything about one agent: who, mission, state, task, skills, tools, memory, history, score, errors, comms. */
export function AgentDetail({ id }: { id: string }) {
  const { data: a, error } = useResource<AgentFull>(`/api/agents/${id}`);
  const [tab, setTab] = useState<'overview' | 'skills' | 'tools' | 'memory' | 'history' | 'comms' | 'log'>('overview');
  const [task, setTask] = useState<string | null>(null);
  if (error) return <div className="banner err">{error}</div>;
  if (!a) return <Loading rows={8} />;
  const d = a.definition;
  return (
    <div className="stack gap-16">
      <div className="agent-hero">
        <AgentMark id={a.id} size={56} status={a.state.status} />
        <div className="grow">
          <div className="row gap-8 wrap"><h1 style={{ fontSize: 22, letterSpacing: '0.04em' }}>{a.name}</h1><Status value={a.state.status} /></div>
          <div className="muted">{a.title} · reporta a {a.reportsTo === 'OWNER' ? 'ti (propietario)' : a.reportsTo}{a.supervises.length ? ` · supervisa a ${a.supervises.join(', ')}` : ''}</div>
        </div>
      </div>
      <div className="instrument" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div><div className="k">Completadas</div><div className="v">{a.state.tasksCompleted}</div></div>
        <div><div className="k">Fallidas</div><div className="v" style={a.state.tasksFailed ? { color: 'var(--err)' } : undefined}>{a.state.tasksFailed}</div></div>
        <div><div className="k">Score</div><div className="v">{a.state.avgScore ?? '—'}</div><div className="s">media de calidad</div></div>
        <div><div className="k">Última actividad</div><div className="v" style={{ fontSize: 15, paddingTop: 6 }}>{ago(a.state.lastActiveAt)}</div></div>
      </div>
      {a.currentTask && (
        <button className="panel" style={{ padding: 14, textAlign: 'left', cursor: 'pointer' }} onClick={() => setTask(a.currentTask!.id)}>
          <div className="xs faint">Tarea actual</div>
          <div className="row gap-8" style={{ marginTop: 4 }}><b className="grow" style={{ fontWeight: 550 }}>{a.currentTask.title}</b><Status value={a.currentTask.status} /></div>
        </button>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: 'Identidad y misión' },
          { id: 'skills', label: 'Skills', count: a.skills.length },
          { id: 'tools', label: 'Herramientas y permisos', count: a.tools.length },
          { id: 'memory', label: 'Memoria', count: a.memory.length },
          { id: 'history', label: 'Historial', count: a.tasks.length },
          { id: 'comms', label: 'Comunicaciones', count: a.communications.length },
          { id: 'log', label: 'Agent log', count: a.log.length },
        ]}
      />
      {tab === 'overview' && (
        <div className="stack gap-16 small">
          <div><b>Misión.</b> <span className="muted">{a.mission}</span></div>
          <div><b>Identidad.</b> <span className="muted">{d.identity}</span></div>
          <div><b>Especialización.</b> <span className="muted">{d.specialization}</span></div>
          <div><b>Metodología</b><List items={d.methodology} /></div>
          <div><b>Scorecard</b><List items={d.scorecard.map((s) => `${s.criterion} — ${s.description}`)} /></div>
          <div><b>Criterios de calidad</b><List items={d.qualityBar} /></div>
          <div><b>Límites</b><List items={d.limits} /></div>
          <div><b>Comportamiento ante errores.</b> <span className="muted">{d.errorBehavior}</span></div>
          <div><b>Comunicación.</b> <span className="muted">{d.communication}</span></div>
          <div><b>Capacidad de revisión.</b> <span className="muted">{d.reviewCapability}</span></div>
          <div><b>Trabajos que sabe hacer</b><List items={a.taskTypes.map((t) => `${t.label} — ${t.description}${t.reviewer ? ` (supervisa ${t.reviewer})` : ''}`)} /></div>
          <div><b>Contexto de producto que recibe</b><div className="chips" style={{ marginTop: 6 }}>{d.productFields.map((f) => <span key={f} className="chip">{f}</span>)}</div></div>
          <div><b>Memoria accesible</b><div className="chips" style={{ marginTop: 6 }}>{d.memoryScopes.map((f) => <span key={f} className="chip">{f}</span>)}</div></div>
          {a.errors.length > 0 && (
            <div>
              <b style={{ color: '#ffaba2' }}>Errores</b>
              {a.errors.slice(0, 6).map((t) => (
                <button key={t.id} className="row gap-8" style={{ width: '100%', background: 'none', border: 0, padding: '6px 0', cursor: 'pointer', textAlign: 'left' }} onClick={() => setTask(t.id)}>
                  <Status value={t.status} /><span className="ellipsis grow muted">{t.title} — {t.error}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'skills' && <div>{a.skills.map((s) => <SkillView key={s.id} s={s} />)}</div>}
      {tab === 'tools' && (
        <div className="stack gap-16">
          <table className="table">
            <thead><tr><th>Herramienta</th><th>Permiso requerido</th><th>Integración</th></tr></thead>
            <tbody>{a.tools.map((t) => <tr key={t.id}><td><b style={{ fontWeight: 550 }}>{t.name}</b><div className="xs faint">{t.description}</div></td><td><span className="chip">{t.grant}</span></td><td className="small muted">{t.integration ?? '—'}</td></tr>)}</tbody>
          </table>
          <div><b className="small">Permisos concedidos</b><div className="chips" style={{ marginTop: 8 }}>{d.grants.map((g) => <span key={g} className="chip">{g}</span>)}</div></div>
          <p className="xs faint">Sin DELETE ni PUBLISH: las acciones críticas solo pueden solicitarse al Approval Center.</p>
        </div>
      )}
      {tab === 'memory' && (a.memory.length ? (
        <div className="stack">{a.memory.map((m) => <div key={m.id} className="skill small"><div className="row gap-8"><span className="chip">{m.kind}</span><b className="grow">{m.title}</b><span className="xs faint">{m.author} · {ago(m.createdAt)}</span></div><p className="muted" style={{ marginTop: 6 }}>{m.content}</p></div>)}</div>
      ) : <Empty title="Sin memoria propia todavía">Las lecciones de QA, feedback del propietario e instrucciones guardadas para este agente aparecerán aquí.</Empty>)}
      {tab === 'history' && (a.tasks.length ? (
        <table className="table">
          <thead><tr><th>Tarea</th><th>Estado</th><th>Resultado</th><th>Fecha</th></tr></thead>
          <tbody>{a.tasks.map((t) => <tr key={t.id} className="click" onClick={() => setTask(t.id)}><td style={{ maxWidth: 260 }}><div className="ellipsis">{t.title}</div></td><td><Status value={t.status} /></td><td className="small muted" style={{ maxWidth: 280 }}><div className="ellipsis">{t.result?.summary ?? t.error ?? '—'}</div></td><td className="xs faint nowrap">{dateTime(t.createdAt)}</td></tr>)}</tbody>
        </table>
      ) : <Empty title="Sin tareas todavía" />)}
      {tab === 'comms' && (a.communications.length ? <MessageList items={a.communications} /> : <Empty title="Sin comunicaciones" />)}
      {tab === 'log' && (a.log.length ? <ActivityFeed items={a.log} onTask={setTask} /> : <Empty title="Log vacío" />)}
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </div>
  );
}

export function AgentProfile({ id }: { id: string }) {
  const { navigate } = useRouter();
  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 18 }}>
        <Link to="/agents" className="btn ghost sm" aria-current={undefined}><ArrowLeft /> Agentes</Link>
        <span className="spacer" />
        <button className="btn sm" onClick={() => navigate(`/chat/${id}`)}><MessagesSquare /> Hablar con {id}</button>
      </div>
      <AgentDetail id={id} />
    </>
  );
}

const DEPT: Record<string, string> = { executive: 'Dirección', creative: 'Creative', store: 'Store', analytics: 'Analytics' };

export function Agents() {
  const { snap } = useSnapshot();
  const { data: skills } = useResource<Skill[]>('/api/skills', { live: false });
  const { navigate } = useRouter();
  const [tab, setTab] = useState<'org' | 'skills'>('org');
  if (!snap) return <Loading rows={8} />;
  const byDept = ['executive', 'creative', 'store', 'analytics'].map((d) => ({ d, agents: snap.agents.filter((a) => a.department === d) }));
  return (
    <>
      <PageHead title="Agentes y skills" sub="La jerarquía de la empresa: tú → ATLAS → ALEX → supervisores y especialistas. Cada agente carga solo las skills relevantes para cada tarea." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'org', label: 'Organigrama' }, { id: 'skills', label: 'Biblioteca de skills', count: skills?.length }]} />
      {tab === 'org' ? (
        <div className="stack gap-16">
          {byDept.map(({ d, agents }) => (
            <Panel key={d} title={DEPT[d]} flush>
              <table className="table">
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="click" onClick={() => navigate(`/agents/${a.id}`)}>
                      <td style={{ width: 52 }}><AgentMark id={a.id} size={34} status={a.state.status} /></td>
                      <td style={{ width: 230 }}><b style={{ letterSpacing: '0.04em' }}>{a.name}</b><div className="xs faint">{a.title}</div></td>
                      <td className="small muted" style={{ maxWidth: 520 }}><div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.mission}</div></td>
                      <td className="xs faint nowrap">→ {a.reportsTo === 'OWNER' ? 'Propietario' : a.reportsTo}</td>
                      <td style={{ textAlign: 'right' }}><Status value={a.state.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>{skills ? skills.map((s) => <SkillView key={s.id} s={s} />) : <Loading />}</Panel>
      )}
    </>
  );
}
