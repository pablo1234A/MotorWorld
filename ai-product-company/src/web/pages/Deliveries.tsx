import { useState } from 'react';
import { Check, Clapperboard, Download, Eye, Play, RotateCcw, X } from 'lucide-react';
import { api, mediaUrl } from '../lib/api';
import { useResource } from '../lib/live';
import { useRouter } from '../lib/router';
import { ago, clock, dateTime } from '../lib/format';
import type { Delivery, Task } from '../lib/types';
import { AgentName, Empty, Field, Loading, PageHead, Panel, Sheet, Status, Tabs, useAction } from '../components/ui';
import { LaunchButton } from '../components/Launch';

interface QAReview {
  cycle: number;
  verdict: string;
  score: number;
  summary: string;
  criteria: { criterion: string; score: number; max: number; evidence: string }[];
  issues: { what: string; why: string; fix: string; owner: string; severity: string }[];
  technical: { check: string; passed: boolean; detail: string }[];
  engine: string;
  reviewedAt: string;
}

interface DeliveryDetail {
  delivery: Delivery;
  video: {
    id: string;
    title: string;
    status: string;
    hook: string | null;
    score: number | null;
    revisions: number;
    qa: QAReview[];
    blueprint: { concept?: { title: string; angle: string; format: string; whyItWorks: string }; sections?: { section: string; onScreenText: string; durationSec: number }[]; totalDurationSec?: number } | null;
    production: { engine?: string } | null;
    edit: { render?: { engine: string; probe: { durationSec: number; width: number; height: number } } } | null;
    rawAsset: string | null;
    finalAsset: string | null;
  };
  history: { at: string; by: string; event: string; detail?: string }[];
  versions: { id: string; version: number; stage: string; assetId: string | null; notes: string; createdBy: string; createdAt: string }[];
  tasks: Task[];
}

function DeliverySheet({ videoId, onClose }: { videoId: string | null; onClose: () => void }) {
  const { data: d } = useResource<DeliveryDetail>(videoId ? `/api/deliveries/${videoId}` : null);
  const [source, setSource] = useState<'final' | 'raw'>('final');
  const [revOpen, setRevOpen] = useState(false);
  const [target, setTarget] = useState<'NEO' | 'REX' | 'MAX'>('MAX');
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  const v = d?.video;
  const lastQa = v?.qa[v.qa.length - 1];
  const src = v ? (source === 'raw' ? v.rawAsset : v.finalAsset) : null;
  const animatic = v?.production?.engine === 'local-animatic';

  return (
    <Sheet
      open={Boolean(videoId)}
      onClose={onClose}
      wide
      title={v ? v.title : 'Entrega'}
      actions={
        v?.finalAsset ? (
          <a className="btn sm" href={mediaUrl(v.finalAsset, true)} download>
            <Download /> Descargar MP4
          </a>
        ) : null
      }
    >
      {!d || !v ? (
        <Loading rows={8} />
      ) : (
        <div className="stack gap-16">
          <div className="player">
            <div className="stack gap-8">
              {src ? (
                <video key={src} src={mediaUrl(src)} controls playsInline poster={d.delivery.posterAsset ? mediaUrl(d.delivery.posterAsset) : undefined} />
              ) : (
                <div className="dcard" style={{ cursor: 'default' }}><div className="poster"><div className="processing">El vídeo todavía se está produciendo.</div></div></div>
              )}
              {v.rawAsset && v.finalAsset && (
                <div className="row gap-6">
                  <button className={`btn sm grow ${source === 'final' ? 'primary' : ''}`} onClick={() => setSource('final')}>FINAL (MAX)</button>
                  <button className={`btn sm grow ${source === 'raw' ? 'primary' : ''}`} onClick={() => setSource('raw')}>RAW (REX)</button>
                </div>
              )}
              {animatic && <p className="xs faint">Producido con el motor de animática local (ffmpeg). Conecta un motor de generación de vídeo para metraje real.</p>}
            </div>
            <div className="stack gap-16" style={{ minWidth: 0 }}>
              <div className="row gap-8 wrap">
                <Status value={d.delivery.status} />
                {lastQa && <Status value={lastQa.verdict} />}
                <span className="chip">{v.revisions} revisión(es)</span>
              </div>
              <dl className="kv">
                <dt>Hook</dt><dd style={{ fontWeight: 550 }}>{v.hook ?? '—'}</dd>
                <dt>Producto</dt><dd>{d.delivery.productName}</dd>
                <dt>Campaña</dt><dd>{d.delivery.campaignName ?? '—'}</dd>
                <dt>Concepto</dt><dd>{v.blueprint?.concept ? `${v.blueprint.concept.format} · ángulo ${v.blueprint.concept.angle}` : '—'}</dd>
                <dt>Duración</dt><dd className="mono">{v.edit?.render ? `${v.edit.render.probe.durationSec.toFixed(1)} s · ${v.edit.render.probe.width}×${v.edit.render.probe.height}` : '—'}</dd>
                <dt>Creado</dt><dd>{dateTime(d.delivery.createdAt)} · lanzado por {d.delivery.createdBy}</dd>
                <dt>Equipo</dt><dd className="row gap-6 wrap">{['NOVA', 'NEO', 'REX', 'MAX', 'LUNA'].map((a) => <AgentName key={a} id={a} />)}</dd>
              </dl>
              {lastQa && (
                <div>
                  <div className="row gap-8" style={{ marginBottom: 8 }}>
                    <h3 className="grow">QA de LUNA</h3>
                    <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{lastQa.score}<span className="faint" style={{ fontSize: 13 }}>/100</span></span>
                  </div>
                  <p className="small muted" style={{ marginBottom: 10 }}>{lastQa.summary}</p>
                  <div className="stack gap-8">
                    {lastQa.criteria.map((c) => (
                      <div key={c.criterion} title={c.evidence}>
                        <div className="row small"><span className="grow">{c.criterion}</span><span className="mono faint">{c.score}/{c.max}</span></div>
                        <div className="score-bar"><div style={{ width: `${(c.score / c.max) * 100}%`, background: c.score / c.max >= 0.75 ? 'var(--ok)' : c.score / c.max >= 0.5 ? 'var(--wait)' : 'var(--err)' }} /></div>
                        <div className="xs faint" style={{ marginTop: 2 }}>{c.evidence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!revOpen ? (
                <div className="row gap-8">
                  <button className="btn" onClick={() => setRevOpen(true)} disabled={!['DELIVERED', 'APPROVED', 'REJECTED'].includes(d.delivery.status)} title={['DELIVERED', 'APPROVED', 'REJECTED'].includes(d.delivery.status) ? '' : 'Disponible cuando el vídeo esté terminado'}>
                    <RotateCcw /> Solicitar revisión
                  </button>
                </div>
              ) : (
                <div className="panel" style={{ padding: 14 }}>
                  <div className="stack gap-12">
                    <Field label="¿Quién debe corregirlo?" hint="NEO: concepto y estructura · REX: planos y visuales · MAX: ritmo, texto, subtítulos y CTA">
                      <select className="select" value={target} onChange={(e) => setTarget(e.target.value as 'NEO' | 'REX' | 'MAX')}>
                        <option value="MAX">MAX — edición</option><option value="REX">REX — producción</option><option value="NEO">NEO — concepto</option>
                      </select>
                    </Field>
                    <Field label="Qué quieres cambiar">
                      <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: el CTA debe durar más y el ritmo del inicio es lento" />
                    </Field>
                    <div className="row gap-8">
                      <span className="spacer" />
                      <button className="btn ghost" onClick={() => setRevOpen(false)}>Cancelar</button>
                      <button
                        className="btn primary"
                        disabled={busy || note.trim().length < 3}
                        onClick={async () => {
                          if (await run(() => api.post(`/api/deliveries/${v.id}/revision`, { target, note }), `Revisión enviada a ${target}`)) {
                            setRevOpen(false);
                            setNote('');
                          }
                        }}
                      >
                        Enviar a {target}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {lastQa && (lastQa.issues.length > 0 || lastQa.technical.length > 0) && (
            <div className="grid-2">
              <Panel title="Problemas detectados">
                {lastQa.issues.length ? (
                  <div className="stack gap-12">
                    {lastQa.issues.map((i, k) => (
                      <div key={k} className="small">
                        <div className="row gap-6"><Status value={i.severity === 'critical' ? 'ERROR' : i.severity === 'major' ? 'REVISION' : 'PENDING'} label={i.severity} /><b className="grow">{i.what}</b><span className="chip">→ {i.owner}</span></div>
                        <div className="muted" style={{ marginTop: 4 }}>Por qué: {i.why}</div>
                        <div className="muted">Solución: {i.fix}</div>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted small">Ninguno en la última revisión.</p>}
              </Panel>
              <Panel title="Checks técnicos (ffprobe)">
                <div className="stack gap-8">
                  {lastQa.technical.map((t) => (
                    <div key={t.check} className="row gap-8 small">
                      {t.passed ? <Check size={15} color="var(--ok)" /> : <X size={15} color="var(--err)" />}
                      <span className="grow">{t.check}</span>
                      <span className="mono xs faint">{t.detail}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          <div className="grid-2">
            <Panel title="Versiones" flush>
              <table className="table">
                <tbody>
                  {d.versions.map((x) => (
                    <tr key={x.id}>
                      <td className="mono small">v{x.version}</td>
                      <td><span className="chip">{x.stage}</span></td>
                      <td className="small muted">{x.notes}</td>
                      <td>{x.assetId && ['raw', 'final'].includes(x.stage) ? <a className="btn ghost sm" href={mediaUrl(x.assetId, true)}><Download /></a> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Historial" flush>
              <div className="feed">
                {[...d.history].reverse().map((h, i) => (
                  <div className="feed-item" key={i} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                    <AgentName id={h.by} />
                    <div className="t"><Status value={h.event} /> <span className="muted small">{h.detail}</span></div>
                    <time>{clock(h.at)}</time>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          {v.qa.length > 1 && (
            <Panel title="Ciclos de QA" flush>
              <table className="table">
                <tbody>{v.qa.map((q, i) => <tr key={i}><td className="mono small">ciclo {q.cycle}</td><td><Status value={q.verdict} /></td><td className="mono">{q.score}</td><td className="small muted">{q.summary}</td><td className="xs faint">{q.engine}</td></tr>)}</tbody>
              </table>
            </Panel>
          )}
        </div>
      )}
    </Sheet>
  );
}

const FILTERS = ['ALL', 'PROCESSING', 'WAITING_QA', 'REVISION', 'APPROVED', 'DELIVERED'] as const;

export function Deliveries() {
  const { path, navigate } = useRouter();
  const open = new URLSearchParams(path.split('?')[1] ?? '').get('video');
  const { data } = useResource<Delivery[]>('/api/deliveries');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const rows = (data ?? []).filter((d) => filter === 'ALL' || d.status === filter);

  return (
    <>
      <PageHead
        title="Delivery Center"
        sub="Los trabajos terminados de la empresa. Un vídeo está terminado cuando está aquí: no depende de ninguna red social."
        actions={<LaunchButton label="Nuevo vídeo" defaultType="video_pipeline" />}
      />
      <Tabs value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ id: f, label: f === 'ALL' ? 'Todas' : f.replace('_', ' '), count: f === 'ALL' ? data?.length : data?.filter((d) => d.status === f).length }))} />
      {!data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Panel>
          <Empty icon={<Clapperboard />} title={data.length ? 'Nada en este estado' : 'Todavía no hay entregas'}>
            Los vídeos aparecen aquí desde que empieza su producción (PROCESSING) hasta que ALEX los entrega (DELIVERED).
          </Empty>
        </Panel>
      ) : (
        <div className="deliveries">
          {rows.map((d) => (
            <button key={d.id} className="dcard" onClick={() => navigate(`/deliveries?video=${d.videoId}`)} aria-label={`Abrir ${d.title}`}>
              <div className="poster">
                {d.posterAsset ? <img src={mediaUrl(d.posterAsset)} alt="" loading="lazy" /> : <div className="processing">{d.videoStatus.replace('_', ' ')}…</div>}
                <span className="status"><Status value={d.status} /></span>
                {d.score != null && <span className="score">{d.score}</span>}
                {d.finalAsset && <span className="play"><Play /></span>}
              </div>
              <div className="meta">
                <h3>{d.title}</h3>
                <span className="xs faint ellipsis">“{d.hook ?? '…'}”</span>
                <span className="row gap-6 xs faint" style={{ marginTop: 2 }}>
                  <Eye size={12} /> {d.revisions} rev · {ago(d.updatedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      <DeliverySheet videoId={open} onClose={() => navigate('/deliveries')} />
    </>
  );
}
