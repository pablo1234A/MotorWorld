import { useState } from 'react';
import { AlertTriangle, Cpu, Package } from 'lucide-react';
import { useSnapshot } from '../components/Shell';
import { LaunchButton } from '../components/Launch';
import { ActivityFeed, TaskSheet, Timeline } from '../components/blocks';
import { AgentMark, Empty, Loading, PageHead, Panel, Status } from '../components/ui';
import { Link, useRouter } from '../lib/router';
import { mediaUrl } from '../lib/api';
import { ago, WORKFLOW_LABEL } from '../lib/format';

export function ControlCenter() {
  const { snap } = useSnapshot();
  const { navigate } = useRouter();
  const [task, setTask] = useState<string | null>(null);
  if (!snap) return <Loading rows={8} />;

  const t = snap.tasks;
  const working = snap.agents.filter((a) => ['WORKING', 'REVIEWING'].includes(a.state.status)).length;
  const activeTasks = (t.RUNNING ?? 0) + (t.ASSIGNED ?? 0) + (t.WAITING_REVIEW ?? 0) + (t.PENDING ?? 0) + (t.REVISION_REQUIRED ?? 0);
  const videos = snap.performance.videos;
  const delivered = snap.deliveries.byStatus.DELIVERED ?? 0;
  const errors = snap.errors.failed + snap.errors.blocked;

  return (
    <>
      <PageHead title="Control Center" sub="Qué está pasando ahora mismo en tu empresa." actions={<LaunchButton />} />

      {!snap.activeProduct && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <Package />
          <div className="grow">
            <b>Todavía no hay PRODUCTO ACTIVO.</b> Los agentes trabajan alrededor del producto activo: créalo en el Product Center, actívalo y dile a ATLAS qué quieres conseguir.
          </div>
          <Link to="/products" className="btn sm" aria-current={undefined}>Ir al Product Center</Link>
        </div>
      )}
      {!snap.llmConnected && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <Cpu />
          <div className="grow">
            <b>INTEGRATION_REQUIRED · Claude no conectado.</b> Los agentes funcionan con el motor heurístico local (reglas sobre los datos del producto). Todo lo que producen queda etiquetado como <span className="mono">local-heuristic</span>. Añade <span className="mono">ANTHROPIC_API_KEY</span> en el servidor para razonamiento real.
          </div>
        </div>
      )}

      <div className="instrument" role="list">
        <div role="listitem"><Link to="/office" aria-current={undefined}><div className="k">Agentes activos</div><div className="v">{working}<span className="faint">/{snap.agents.length}</span></div><div className="s">{snap.busyAgents.join(' · ') || 'nadie ejecutando'}</div></Link></div>
        <div role="listitem"><Link to="/work" aria-current={undefined}><div className="k">Tareas activas</div><div className="v">{activeTasks}</div><div className="s">{t.RUNNING ?? 0} en ejecución · {t.COMPLETED ?? 0} hechas</div></Link></div>
        <div role="listitem"><Link to={snap.activeProduct ? `/products/${snap.activeProduct.id}` : '/products'} aria-current={undefined}><div className="k">Producto activo</div><div className="v ellipsis" style={{ fontFamily: 'var(--font)', fontSize: 16, paddingTop: 5 }}>{snap.activeProduct?.name ?? '—'}</div><div className="s">{snap.activeProduct?.marginPct != null ? `margen ${snap.activeProduct.marginPct}%` : 'sin datos de margen'}</div></Link></div>
        <div role="listitem"><Link to="/deliveries" aria-current={undefined}><div className="k">Vídeos</div><div className="v">{videos.total}</div><div className="s">{videos.reviewed} revisados por LUNA</div></Link></div>
        <div role="listitem"><Link to="/deliveries" aria-current={undefined}><div className="k">Entregas</div><div className="v">{delivered}</div><div className="s">{(snap.deliveries.byStatus.PROCESSING ?? 0) + (snap.deliveries.byStatus.WAITING_QA ?? 0)} en proceso</div></Link></div>
        <div role="listitem"><Link to="/approvals" aria-current={undefined}><div className="k">Aprobaciones</div><div className="v" style={snap.approvals.pending ? { color: 'var(--appr)' } : undefined}>{snap.approvals.pending}</div><div className="s">requieren tu decisión</div></Link></div>
        <div role="listitem"><Link to="/work?status=FAILED" aria-current={undefined}><div className="k">Errores</div><div className="v" style={errors ? { color: 'var(--err)' } : undefined}>{errors}</div><div className="s">{snap.errors.failed} fallidas · {snap.errors.blocked} bloqueadas</div></Link></div>
        <div role="listitem"><Link to="/logs" aria-current={undefined}><div className="k">Rendimiento QA</div><div className="v">{videos.avgScore ?? '—'}</div><div className="s">score medio · {videos.approvedFirstPass} a la primera</div></Link></div>
      </div>

      <div className="grid-dash">
        <Panel title="What is happening now?" actions={<span className="pill tone-ok pulse"><span className="dot" />En directo</span>} flush>
          {snap.activity.length ? (
            <div style={{ maxHeight: 640, overflowY: 'auto' }}>
              <ActivityFeed items={snap.activity} onTask={setTask} />
            </div>
          ) : (
            <Empty title="La oficina está en silencio">Activa un producto y pide algo a ATLAS: cada decisión, tarea, mensaje y error aparecerá aquí en tiempo real.</Empty>
          )}
        </Panel>

        <div className="stack gap-16">
          <Panel title="Workflows en curso" actions={<Link to="/work" className="btn ghost sm" aria-current={undefined}>Ver todo</Link>}>
            {snap.activeWorkflows.length ? (
              <div className="stack gap-16">
                {snap.activeWorkflows.slice(0, 5).map((w) => (
                  <div key={w.id} className="stack gap-8">
                    <div className="row gap-8">
                      <span className="chip">{WORKFLOW_LABEL[w.type] ?? w.type}</span>
                      <b className="ellipsis grow" style={{ fontWeight: 550 }}>{w.title}</b>
                      <Status value={w.status} />
                    </div>
                    <Timeline steps={w.timeline} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">Ningún workflow activo. Usa “Lanzar trabajo” o habla con ATLAS.</p>
            )}
          </Panel>

          <Panel title="Equipo" actions={<Link to="/office" className="btn ghost sm" aria-current={undefined}>Oficina</Link>} flush>
            <table className="table fixed">
              <colgroup><col style={{ width: 48 }} /><col /><col style={{ width: 150 }} /></colgroup>
              <tbody>
                {snap.agents.map((a) => (
                  <tr key={a.id} className="click" onClick={() => navigate(`/agents/${a.id}`)}>
                    <td><AgentMark id={a.id} size={26} status={a.state.status} /></td>
                    <td>
                      <b style={{ fontWeight: 600, letterSpacing: '0.03em' }}>{a.name}</b>
                      <div className="xs faint ellipsis">{a.currentTask?.title ?? a.state.statusNote ?? a.title}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}><Status value={a.state.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {(snap.errors.recent.length > 0 || snap.errors.agentsInError.length > 0) && (
            <Panel title="Errores recientes" actions={<AlertTriangle size={16} color="var(--err)" />} flush>
              <ActivityFeed items={snap.errors.recent.slice(0, 5)} onTask={setTask} />
            </Panel>
          )}

          <Panel title="Últimas entregas" actions={<Link to="/deliveries" className="btn ghost sm" aria-current={undefined}>Delivery Center</Link>}>
            {snap.deliveries.latest.length ? (
              <div className="row gap-12" style={{ overflowX: 'auto' }}>
                {snap.deliveries.latest.map((d) => (
                  <Link key={d.id} to={`/deliveries?video=${d.videoId}`} aria-current={undefined} style={{ textDecoration: 'none', width: 92, flex: 'none' }}>
                    <div style={{ aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden', background: '#0a0b0c', border: '1px solid var(--line)' }}>
                      {d.posterAsset && <img src={mediaUrl(d.posterAsset)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div className="xs" style={{ marginTop: 6 }}><Status value={d.status} /></div>
                    <div className="xs faint" style={{ marginTop: 4 }}>{ago(d.updatedAt)}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted small">Los vídeos terminados aparecerán aquí.</p>
            )}
          </Panel>

          <Panel title="Rendimiento por familia de hook" flush>
            {snap.performance.hooksByFamily.length ? (
              <table className="table">
                <thead><tr><th>Familia</th><th>Vídeos</th><th>Score QA medio</th></tr></thead>
                <tbody>
                  {snap.performance.hooksByFamily.map((f) => (
                    <tr key={f.family}><td>{f.family}</td><td className="mono">{f.videos}</td><td className="mono">{f.avgScore ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small" style={{ padding: 16 }}>Fuente: QA interno de LUNA. Sin datos todavía — no se muestran cifras inventadas.</p>
            )}
          </Panel>
        </div>
      </div>
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}
