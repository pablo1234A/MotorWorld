import { useEffect, useMemo, useState } from 'react';
import { Columns3, List, Plus, Search, Users, Download } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Empty, Seg } from '../components/ui';
import { StagePill } from '../components/forms';
import { STAGES, STAGE_LABEL, type Prospect, type Stage } from '../data/types';
import { daysAgo, relDay, today } from '../lib/dates';
import { initials, matches, money } from '../lib/format';
import { navigate } from '../lib/router';
import { mainProblem, probabilityOf, valueOf } from '../lib/insights';
import { toast } from '../lib/bus';

type View = 'kanban' | 'list';

function loadView(): View {
  try {
    return (localStorage.getItem('wso:prospects-view') as View) || (window.innerWidth < 760 ? 'list' : 'kanban');
  } catch {
    return 'kanban';
  }
}

export default function Prospects() {
  const { state, actions } = useStore();
  const ui = useUI();
  const [view, setView] = useState<View>(loadView);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<Stage | 'open' | 'all'>('open');
  const [sector, setSector] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('wso:prospects-view', view);
    } catch {
      /* noop */
    }
  }, [view]);

  const sectors = useMemo(() => Array.from(new Set(state.prospects.map((p) => p.sector).filter(Boolean))).sort(), [state.prospects]);
  const filtered = useMemo(
    () =>
      state.prospects.filter(
        (p) =>
          matches(`${p.business} ${p.contactName} ${p.city} ${p.sector} ${p.phone} ${p.instagram}`, q) &&
          (!sector || p.sector === sector) &&
          (view === 'kanban' || stage === 'all' || (stage === 'open' ? p.stage !== 'ganado' && p.stage !== 'perdido' : p.stage === stage)),
      ),
    [state.prospects, q, sector, stage, view],
  );

  const drop = (s: Stage) => {
    const p = state.prospects.find((x) => x.id === dragId);
    setDragId(null);
    setOver(null);
    if (!p || p.stage === s) return;
    if (s === 'ganado' || s === 'perdido') return ui.closeDeal(p, s);
    const before = new Set(state.activities.map((a) => a.id));
    actions.setStage(p.id, s);
    toast(`${p.business} → ${STAGE_LABEL[s]}`, 'ok', {
      label: 'Deshacer',
      run: () => actions.undoProspectChange(p, before),
    });
  };

  const exportCsv = () => {
    const cols: (keyof Prospect)[] = ['business', 'contactName', 'phone', 'email', 'instagram', 'website', 'city', 'sector', 'stage', 'firstContact', 'lastContact', 'nextFollowUp', 'value', 'notes'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...state.prospects.map((p) => cols.map((c) => esc(p[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `prospectos-${today()}.csv`;
    a.click();
  };

  return (
    <div className="page" style={{ maxWidth: view === 'kanban' ? 'none' : undefined }}>
      <div className="page-head">
        <div>
          <h1 className="h1">Prospectos</h1>
          <p className="muted">
            {state.prospects.length} en tu CRM · {money(state.prospects.filter((p) => !['ganado', 'perdido', 'nuevo', 'investigando'].includes(p.stage)).reduce((s, p) => s + valueOf(p, state.profile.avgPrice), 0))} en pipeline activo
          </p>
        </div>
        <div className="row gap-6">
          <Seg
            value={view}
            onChange={setView}
            options={[
              { value: 'kanban', label: <><Columns3 /> <span className="hide-mobile">Pipeline</span></> },
              { value: 'list', label: <><List /> <span className="hide-mobile">Lista</span></> },
            ]}
          />
          {state.prospects.length > 0 && (
            <button className="btn btn-icon hide-mobile" onClick={exportCsv} data-tip="Exportar CSV">
              <Download />
            </button>
          )}
          <button className="btn btn-primary" onClick={() => ui.newProspect()}>
            <Plus /> Nuevo
          </button>
        </div>
      </div>

      {state.prospects.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Users />}
            title="Tu CRM está vacío"
            action={
              <div className="row gap-6 row-wrap" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => ui.newProspect()}>
                  <Plus /> Añadir prospecto
                </button>
                <a className="btn" href="#/prospecting?add=1">
                  Añadir varios a la vez
                </a>
              </div>
            }
          >
            Añade los negocios a los que quieres vender. Empieza por 10: con eso ya tienes trabajo para hoy.
          </Empty>
        </div>
      ) : (
        <>
          <div className="row row-wrap gap-6 mb-16">
            <div className="input-icon grow" style={{ minWidth: 200, maxWidth: 360 }}>
              <Search />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio, ciudad, teléfono…" />
            </div>
            {sectors.length > 1 && (
              <select className="select" style={{ width: 'auto' }} value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">Todos los sectores</option>
                {sectors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            {view === 'list' && (
              <select className="select" style={{ width: 'auto' }} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                <option value="open">Abiertos</option>
                <option value="all">Todos</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {view === 'kanban' ? (
            <div className="kanban">
              {STAGES.map((s) => {
                const col = filtered.filter((p) => p.stage === s);
                const sum = col.reduce((a, p) => a + (s === 'ganado' ? p.wonAmount ?? 0 : valueOf(p, state.profile.avgPrice)), 0);
                return (
                  <div
                    key={s}
                    className={`kcol st-${s} ${over === s ? 'over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(s);
                    }}
                    onDragLeave={() => setOver((o) => (o === s ? null : o))}
                    onDrop={() => drop(s)}
                  >
                    <div className="kcol-head">
                      <span className="stage-pill">{STAGE_LABEL[s]}</span>
                      <span className="dim">{col.length}</span>
                      <span className="sum">{col.length ? money(sum) : ''}</span>
                    </div>
                    {col.map((p) => (
                      <KCard key={p.id} p={p} dragging={dragId === p.id} onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)} />
                    ))}
                    {col.length === 0 && <div className="tiny dim" style={{ padding: '18px 8px', textAlign: 'center' }}>Arrastra aquí</div>}
                  </div>
                );
              })}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <Empty icon={<Search />} title="Sin resultados">
                Prueba con otros filtros.
              </Empty>
            </div>
          ) : (
            <div className="card flush" style={{ padding: '4px 20px' }}>
              <div className="table-wrap hide-mobile">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Negocio</th>
                      <th>Estado</th>
                      <th>Problema</th>
                      <th>Último contacto</th>
                      <th>Próximo seguimiento</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} onClick={() => navigate(`#/prospects/${p.id}`)}>
                        <td>
                          <div className="row gap-12">
                            <div className="avatar">{initials(p.business)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="strong trunc">{p.business}</div>
                              <div className="tiny dim">{[p.sector, p.city].filter(Boolean).join(' · ') || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StagePill stage={p.stage} />
                        </td>
                        <td className="small muted">{mainProblem(p)}</td>
                        <td className="small muted">{p.lastContact ? relDay(p.lastContact) : '—'}</td>
                        <td className="small">
                          {p.nextFollowUp ? <span style={{ color: p.nextFollowUp < today() ? 'var(--red)' : p.nextFollowUp === today() ? 'var(--orange)' : undefined }}>{relDay(p.nextFollowUp)}</span> : <span className="dim">—</span>}
                        </td>
                        <td className="mono small" style={{ textAlign: 'right' }}>
                          {money(p.stage === 'ganado' ? p.wonAmount : valueOf(p, state.profile.avgPrice))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="list hide-desktop">
                {filtered.map((p) => (
                  <div key={p.id} className="list-row clickable" onClick={() => navigate(`#/prospects/${p.id}`)}>
                    <div className="avatar">{initials(p.business)}</div>
                    <div className="grow">
                      <div className="strong trunc">{p.business}</div>
                      <div className="tiny dim trunc">
                        {mainProblem(p)}
                        {p.nextFollowUp ? ` · seguimiento ${relDay(p.nextFollowUp).toLowerCase()}` : ''}
                      </div>
                    </div>
                    <StagePill stage={p.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KCard({ p, dragging, onDragStart, onDragEnd }: { p: Prospect; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const { state } = useStore();
  const overdue = p.nextFollowUp && p.nextFollowUp < today();
  const since = daysAgo(p.lastContact);
  return (
    <a
      href={`#/prospects/${p.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`kcard ${dragging ? 'dragging' : ''}`}
    >
      <div className="row between gap-6">
        <div className="strong small trunc">{p.business}</div>
        {p.stage !== 'ganado' && p.stage !== 'perdido' && <span className="tiny mono dim">{probabilityOf(p)}%</span>}
      </div>
      <div className="tiny dim trunc mt-4">{[p.sector, p.city].filter(Boolean).join(' · ') || 'Sin datos'}</div>
      <div className="row between mt-12">
        <span className="tiny muted trunc">{mainProblem(p)}</span>
        <span className="tiny mono">{money(p.stage === 'ganado' ? p.wonAmount : valueOf(p, state.profile.avgPrice))}</span>
      </div>
      {(p.nextFollowUp || since != null) && p.stage !== 'ganado' && p.stage !== 'perdido' && (
        <div className="tiny mt-8" style={{ color: overdue ? 'var(--red)' : 'var(--text-3)' }}>
          {p.nextFollowUp ? `↻ ${relDay(p.nextFollowUp)}` : `Último contacto: ${relDay(p.lastContact)}`}
        </div>
      )}
    </a>
  );
}
