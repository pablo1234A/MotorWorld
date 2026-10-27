import { useMemo, useState } from 'react';
import { Ban } from 'lucide-react';
import { LaunchButton } from '../components/Launch';
import { MessageList, TaskSheet, Timeline } from '../components/blocks';
import { AgentName, Empty, Loading, PageHead, Panel, Sheet, Status, Tabs, useAction } from '../components/ui';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { useRouter } from '../lib/router';
import { ago, dateTime, WORKFLOW_LABEL } from '../lib/format';
import type { Message, Task, TimelineStep, WorkflowRun } from '../lib/types';

const STATUSES = ['PENDING', 'ASSIGNED', 'RUNNING', 'WAITING_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'COMPLETED', 'BLOCKED', 'FAILED'];

function WorkflowSheet({ id, onClose, onTask }: { id: string | null; onClose: () => void; onTask: (id: string) => void }) {
  const { data: run } = useResource<WorkflowRun & { timeline: TimelineStep[]; tasks: Task[]; messages: Message[]; children: WorkflowRun[] }>(id ? `/api/workflows/${id}` : null);
  const { busy, run: act } = useAction();
  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      wide
      title={run ? run.title : 'Workflow'}
      actions={run && ['RUNNING', 'WAITING_APPROVAL'].includes(run.status) ? (
        <button className="btn danger sm" disabled={busy} onClick={() => window.confirm('¿Cancelar este workflow? Las tareas pendientes se detendrán.') && act(() => api.post(`/api/workflows/${run.id}/cancel`), 'Workflow cancelado')}>
          <Ban /> Cancelar
        </button>
      ) : null}
    >
      {!run ? (
        <Loading />
      ) : (
        <div className="stack gap-16">
          <div className="row gap-8 wrap">
            <span className="chip">{WORKFLOW_LABEL[run.type] ?? run.type}</span>
            <Status value={run.status} />
            {run.cycle > 0 && <span className="chip">ciclo de revisión {run.cycle}</span>}
            <span className="small faint">creado {dateTime(run.createdAt)}</span>
          </div>
          {run.error && <div className="banner err">{run.error}</div>}
          {typeof run.context.summary === 'string' && <div className="banner">{run.context.summary}</div>}
          <Timeline steps={run.timeline} />
          {run.children.length > 0 && (
            <Panel title="Workflows lanzados por este objetivo" flush>
              <table className="table"><tbody>{run.children.map((c) => <tr key={c.id}><td>{c.title}</td><td className="small muted">{WORKFLOW_LABEL[c.type]}</td><td style={{ textAlign: 'right' }}><Status value={c.status} /></td></tr>)}</tbody></table>
            </Panel>
          )}
          <Panel title={`Tareas (${run.tasks.length})`} flush>
            <table className="table">
              <tbody>
                {[...run.tasks].reverse().map((t) => (
                  <tr key={t.id} className="click" onClick={() => onTask(t.id)}>
                    <td><AgentName id={t.agentId} /></td>
                    <td style={{ maxWidth: 320 }}><div className="ellipsis">{t.title}</div><div className="xs faint ellipsis">{t.result?.summary ?? t.error ?? ''}</div></td>
                    <td style={{ textAlign: 'right' }}><Status value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Comunicación del workflow" flush>
            {run.messages.length ? <MessageList items={[...run.messages].reverse()} /> : <p className="muted small" style={{ padding: 16 }}>Sin mensajes.</p>}
          </Panel>
        </div>
      )}
    </Sheet>
  );
}

export function Work() {
  const { path } = useRouter();
  const initialStatus = new URLSearchParams(path.split('?')[1] ?? '').get('status') ?? '';
  const [tab, setTab] = useState<'workflows' | 'tasks'>(initialStatus ? 'tasks' : 'workflows');
  const [status, setStatus] = useState(initialStatus);
  const [agent, setAgent] = useState('');
  const [task, setTask] = useState<string | null>(null);
  const [wf, setWf] = useState<string | null>(null);
  const { data: runs } = useResource<WorkflowRun[]>('/api/workflows');
  const { data: tasks } = useResource<Task[]>('/api/tasks');
  const filtered = useMemo(() => (tasks ?? []).filter((t) => (!status || t.status === status) && (!agent || t.agentId === agent)), [tasks, status, agent]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, (tasks ?? []).filter((t) => t.status === s).length])), [tasks]);

  return (
    <>
      <PageHead title="Workflows y tareas" sub="Task Engine real: cola con prioridades, dependencias, reintentos, deadlines, supervisión y registro completo." actions={<LaunchButton />} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'workflows', label: 'Workflows', count: runs?.length }, { id: 'tasks', label: 'Tareas', count: tasks?.length }]} />
      {tab === 'workflows' ? (
        !runs ? <Loading /> : runs.length === 0 ? (
          <Panel><Empty title="Sin workflows todavía">Habla con ATLAS o pulsa “Lanzar trabajo”. Cada objetivo se convierte en workflows con tareas reales.</Empty></Panel>
        ) : (
          <Panel flush>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Workflow</th><th>Tipo</th><th>Paso actual</th><th>Estado</th><th>Creado</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="click" onClick={() => setWf(r.id)}>
                      <td style={{ maxWidth: 360 }}><div className="ellipsis" style={{ fontWeight: 550 }}>{r.title}</div>{r.parentRunId && <div className="xs faint">parte de un objetivo de ATLAS</div>}</td>
                      <td className="small muted nowrap">{WORKFLOW_LABEL[r.type] ?? r.type}</td>
                      <td className="small mono">{r.currentStep ?? '—'}{r.cycle ? ` · rev ${r.cycle}` : ''}</td>
                      <td><Status value={r.status} /></td>
                      <td className="xs faint nowrap">{ago(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )
      ) : (
        <>
          <div className="row gap-6 wrap" style={{ marginBottom: 14 }}>
            <button className={`btn sm ${!status ? 'primary' : ''}`} onClick={() => setStatus('')}>Todas</button>
            {STATUSES.map((s) => (
              <button key={s} className={`btn sm ${status === s ? 'primary' : ''}`} onClick={() => setStatus(s)}>
                {s.replace(/_/g, ' ')} <span className="mono xs" style={{ opacity: 0.7 }}>{counts[s]}</span>
              </button>
            ))}
            <span className="spacer" />
            <select className="select" style={{ width: 160 }} value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filtrar por agente">
              <option value="">Todos los agentes</option>
              {['ATLAS', 'ALEX', 'NOVA', 'NEO', 'REX', 'MAX', 'LUNA', 'EVA', 'NOAH', 'IRIS'].map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          {!tasks ? <Loading /> : filtered.length === 0 ? (
            <Panel><Empty title="No hay tareas con este filtro" /></Panel>
          ) : (
            <Panel flush>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Agente</th><th>Tarea</th><th>Prioridad</th><th>Supervisor</th><th>Intentos</th><th>Deadline</th><th>Estado</th></tr></thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="click" onClick={() => setTask(t.id)}>
                        <td><AgentName id={t.agentId} /></td>
                        <td style={{ maxWidth: 380 }}><div className="ellipsis">{t.title}</div><div className="xs faint ellipsis">{t.error ?? t.result?.summary ?? t.type}</div></td>
                        <td className="small">{t.priority}</td>
                        <td className="small muted">{t.supervisorId ?? '—'}</td>
                        <td className="mono small">{t.attempts}/{t.maxAttempts}</td>
                        <td className="xs faint nowrap">{dateTime(t.deadline)}</td>
                        <td><Status value={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
      <WorkflowSheet id={wf} onClose={() => setWf(null)} onTask={setTask} />
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}
