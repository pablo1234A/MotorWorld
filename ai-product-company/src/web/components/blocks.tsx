import type React from 'react';
import { AlertTriangle, ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { clock, dateTime } from '../lib/format';
import type { Activity, Message, Task, TimelineStep } from '../lib/types';
import { AgentMark, AgentName, Json, Loading, Sheet, Status, useAction } from './ui';

/** Workflow step timeline (done / running / revision / failed). */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="steps">
      {steps.map((s) => {
        const cls =
          s.status === 'COMPLETED' ? 'done' : ['RUNNING', 'ASSIGNED', 'WAITING_REVIEW', 'APPROVED'].includes(s.status) ? 'run' : s.status === 'FAILED' || s.status === 'BLOCKED' ? 'fail' : s.status === 'REVISION_REQUIRED' || (s.status === 'PENDING' && s.attempts > 1) ? 'rev' : '';
        return (
          <div key={s.key} className={`step ${cls}`} title={`${s.label} · ${s.status}${s.attempts > 1 ? ` · ${s.attempts} intentos` : ''}`}>
            <div className="node">{cls === 'done' && <Check />}{cls === 'fail' && <X style={{ color: 'var(--err)' }} />}</div>
            <div className="lbl">{s.label}</div>
            <div className="who">{s.agent}{s.attempts > 1 ? ` ×${s.attempts}` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { action: 'Acción', communication: 'Mensaje', decision: 'Decisión', error: 'Error', owner: 'Propietario', system: 'Sistema' };

/** "What is happening now?" — the activity log as a live feed. */
export function ActivityFeed({ items, onTask }: { items: Activity[]; onTask?: (id: string) => void }) {
  return (
    <div className="feed">
      {items.map((a) => (
        <div
          className={`feed-item ${a.taskId && onTask ? 'click' : ''}`}
          key={a.id}
          {...(a.taskId && onTask ? { role: 'button', tabIndex: 0, title: 'Ver tarea', onClick: () => onTask(a.taskId!), onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onTask(a.taskId!) } : {})}
        >
          {a.agentId ? <AgentMark id={a.agentId} size={28} /> : <span className="agent-mark" style={{ ['--s' as string]: '28px' }}>YO</span>}
          <div className="t">
            <span className={a.kind === 'error' ? '' : 'muted'} style={a.kind === 'error' ? { color: '#ffaba2' } : undefined}>
              {a.agentId && <b style={{ color: 'var(--text)' }}>{a.agentId} </b>}
              {a.action}
            </span>
            {a.result && <div className="xs faint" style={{ marginTop: 2 }}>{a.result}</div>}
            {a.error && <div className="xs" style={{ color: '#ffaba2', marginTop: 2 }}>{a.error}</div>}
          </div>
          <time title={KIND_LABEL[a.kind] ?? a.kind}>{clock(a.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

export function MessageList({ items }: { items: Message[] }) {
  return (
    <div className="feed">
      {items.map((m) => (
        <div className="feed-item" key={m.id} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          <span className="row gap-4 nowrap">
            <AgentMark id={m.fromId} size={24} />
            <ArrowRight size={13} className="faint" />
            <AgentMark id={m.toId} size={24} />
          </span>
          <div className="t">
            <span className="xs faint">{m.fromId} → {m.toId} · {m.kind}</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
          <time>{clock(m.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

/** Full task record: status, review, logs, input/output, errors — with a manual retry. */
export function TaskSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: t } = useResource<Task & { logs: { id: number; level: string; message: string; createdAt: string }[] }>(id ? `/api/tasks/${id}` : null);
  const { busy, run } = useAction();
  return (
    <Sheet open={Boolean(id)} onClose={onClose} title={t ? t.title : 'Tarea'} wide>
      {!t ? (
        <Loading />
      ) : (
        <div className="stack gap-16">
          <div className="row gap-8 wrap">
            <Status value={t.status} />
            <AgentName id={t.agentId} />
            {t.supervisorId && <span className="small faint">supervisa {t.supervisorId}</span>}
            <span className="chip">{t.type}</span>
            {t.engine && <span className="chip">{t.engine}</span>}
            <span className="spacer" />
            {(t.status === 'FAILED' || t.status === 'BLOCKED') && (
              <button className="btn" disabled={busy} onClick={() => run(() => api.post(`/api/tasks/${t.id}/retry`), 'Tarea reencolada')}>
                <RotateCcw /> Reintentar
              </button>
            )}
          </div>
          {t.error && (
            <div className="banner err">
              <AlertTriangle />
              <div>{t.error}</div>
            </div>
          )}
          <dl className="kv">
            <dt>Descripción</dt><dd>{t.description}</dd>
            <dt>Prioridad</dt><dd>{t.priority}</dd>
            <dt>Intentos</dt><dd className="mono">{t.attempts}/{t.maxAttempts}{t.revision ? ` · revisión ${t.revision}` : ''}</dd>
            <dt>Creada</dt><dd>{dateTime(t.createdAt)} por {t.createdBy}</dd>
            <dt>Deadline</dt><dd>{dateTime(t.deadline)}</dd>
            <dt>Completada</dt><dd>{dateTime(t.completedAt)}</dd>
            <dt>Dependencias</dt><dd className="mono xs">{t.dependsOn.join(', ') || '—'}</dd>
            {t.result?.summary && (<><dt>Resultado</dt><dd>{t.result.summary}</dd></>)}
          </dl>
          {t.review.length > 0 && (
            <section>
              <h3 style={{ marginBottom: 8 }}>Supervisión</h3>
              {t.review.map((r, i) => (
                <div key={i} className="small" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <Status value={r.passed ? 'APPROVED' : 'REVISION_REQUIRED'} /> <span className="muted">por {r.reviewer} · {clock(r.at)}</span>
                  {r.issues.map((x) => <div key={x} className="muted" style={{ marginTop: 4 }}>— {x}</div>)}
                </div>
              ))}
            </section>
          )}
          <section>
            <h3 style={{ marginBottom: 8 }}>Logs</h3>
            <div className="json" style={{ maxHeight: 260 }}>
              {t.logs.map((l) => `${clock(l.createdAt)}  ${l.level.toUpperCase().padEnd(5)} ${l.message}`).join('\n')}
            </div>
          </section>
          {t.result?.output != null && (
            <section>
              <h3 style={{ marginBottom: 8 }}>Salida del agente</h3>
              <Json value={t.result.output} />
            </section>
          )}
          <section>
            <h3 style={{ marginBottom: 8 }}>Entrada</h3>
            <Json value={t.input} />
          </section>
        </div>
      )}
    </Sheet>
  );
}
