import { useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { AgentName, Empty, Loading, PageHead, Panel, useAction } from '../components/ui';

interface Report {
  id: string;
  date: string;
  engine: string;
  createdAt: string;
  narrative: { bluf: string; importantDecisions: string[]; opportunities: string[]; blockers: string[]; recommendations: string[]; tomorrow: string[] };
  data: {
    agentsActive: string[];
    workDone: { agentId: string; title: string; summary: string | null }[];
    tasks: { completed: number; pending: number; blocked: number; failed: number };
    errors: { agentId: string | null; action: string; error: string | null }[];
    videos: { created: number; approved: number; rejected: number; revision: number; delivered: number };
    hooksCreated: number;
    conceptsCreated: number;
    store: { problemsFound: number; approvedForApplication: number; awaitingApproval: number; applied: number };
    approvals: { pending: number; resolvedToday: number };
    llmCalls: number;
  };
}

const Bullets = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => (
  <section>
    <h3 style={{ marginBottom: 6 }}>{title}</h3>
    {items.length ? <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul> : <p className="muted small">{empty}</p>}
  </section>
);

function ReportView({ r }: { r: Report }) {
  const d = r.data;
  const n = r.narrative;
  const day = new Date(`${r.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <article className="panel" style={{ padding: 24 }}>
      <header className="row gap-12 wrap" style={{ marginBottom: 18 }}>
        <div className="grow">
          <div className="xs faint mono">{r.date}</div>
          <h2 style={{ fontSize: 20, marginTop: 2 }}>DAILY COMPANY REPORT · <span style={{ textTransform: 'capitalize' }}>{day}</span></h2>
        </div>
        <span className="chip">{r.engine}</span>
      </header>
      <p style={{ fontSize: 15, marginBottom: 20, maxWidth: '75ch' }}><b>BLUF.</b> {n.bluf}</p>
      <div className="instrument" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 20 }}>
        <div><div className="k">Agentes activos</div><div className="v">{d.agentsActive.length}</div></div>
        <div><div className="k">Tareas</div><div className="v">{d.tasks.completed}</div><div className="s">{d.tasks.pending} pend. · {d.tasks.blocked} bloq. · {d.tasks.failed} fall.</div></div>
        <div><div className="k">Vídeos</div><div className="v">{d.videos.created}</div><div className="s">{d.videos.approved} aprob. · {d.videos.revision} rev. · {d.videos.rejected} rech.</div></div>
        <div><div className="k">Hooks · conceptos</div><div className="v">{d.hooksCreated}</div><div className="s">{d.conceptsCreated} conceptos</div></div>
        <div><div className="k">Tienda</div><div className="v">{d.store.problemsFound}</div><div className="s">{d.store.approvedForApplication} validados · {d.store.awaitingApproval} esperan aprobación</div></div>
      </div>
      <div className="grid-2" style={{ gap: 24 }}>
        <Bullets title="Decisiones importantes" items={n.importantDecisions} empty="Ninguna registrada." />
        <Bullets title="Oportunidades" items={n.opportunities} empty="Ninguna identificada." />
        <Bullets title="Bloqueos" items={n.blockers} empty="Sin bloqueos." />
        <Bullets title="Recomendaciones" items={n.recommendations} empty="—" />
        <Bullets title="Prioridades para mañana" items={n.tomorrow} empty="—" />
        <section>
          <h3 style={{ marginBottom: 6 }}>Errores ({d.errors.length})</h3>
          {d.errors.length ? d.errors.slice(0, 8).map((e, i) => <div key={i} className="small muted" style={{ marginBottom: 4 }}>{e.agentId ?? 'SYSTEM'}: {e.error ?? e.action}</div>) : <p className="muted small">Sin errores.</p>}
        </section>
      </div>
      <div className="divider" />
      <h3 style={{ marginBottom: 10 }}>Trabajo realizado</h3>
      {d.workDone.length ? (
        <table className="table">
          <tbody>{d.workDone.map((w, i) => <tr key={i}><td style={{ width: 110 }}><AgentName id={w.agentId} /></td><td className="small">{w.title}</td><td className="small muted">{w.summary}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted small">Sin tareas completadas este día.</p>}
      <p className="xs faint" style={{ marginTop: 14 }}>Todas las cifras proceden de los registros del sistema ({d.llmCalls} llamadas al LLM ese día). Agentes activos: {d.agentsActive.join(', ') || '—'}.</p>
    </article>
  );
}

export function Reports() {
  const { data } = useResource<Report[]>('/api/reports');
  const [sel, setSel] = useState<string | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (!sel && data?.length) setSel(data[0].date);
  }, [data, sel]);
  const report = data?.find((r) => r.date === sel);
  return (
    <>
      <PageHead
        title="Daily Reports"
        sub="ATLAS genera el DAILY COMPANY REPORT automáticamente cada día a la hora configurada. Las cifras salen de los hechos registrados; la parte ejecutiva la redacta ATLAS."
        actions={<button className="btn primary" disabled={busy} onClick={() => run(() => api.post('/api/reports/generate'), 'ATLAS está preparando el informe de hoy')}><RefreshCw /> Generar informe de hoy</button>}
      />
      {!data ? <Loading /> : data.length === 0 ? (
        <Panel><Empty icon={<FileText />} title="Aún no hay informes">Pulsa “Generar informe de hoy” o espera al informe automático.</Empty></Panel>
      ) : (
        <div className="stack gap-16">
          <div className="row gap-6 wrap">{data.map((r) => <button key={r.date} className={`btn sm ${r.date === sel ? 'primary' : ''}`} onClick={() => setSel(r.date)}><span className="mono">{r.date}</span></button>)}</div>
          {report && <ReportView r={report} />}
        </div>
      )}
    </>
  );
}
