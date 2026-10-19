import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  ExternalLink,
  Globe,
  Instagram,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  ScanSearch,
  Trash2,
  Trophy,
  X,
  XCircle,
  Lightbulb,
  HelpCircle,
} from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Empty, confirmDialog } from '../components/ui';
import { KIND_COLOR, StagePill } from '../components/forms';
import { CHANNEL_LABEL, KIND_LABEL, STAGES, STAGE_LABEL, SOURCE_LABEL, WEB_STATUS_LABEL, type ActivityType } from '../data/types';
import { WEB_PROBLEMS, buildArguments, problemLabel } from '../content/problems';
import { daysAgo, fmtDay, relDay, today } from '../lib/dates';
import { cleanUrl, displayUrl, igLink, initials, money, waLink } from '../lib/format';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { probabilityOf, prospectScore, recommendation, sequenceLabel, valueOf } from '../lib/insights';
import { toast } from '../lib/bus';

const ACT_LABEL: Record<ActivityType, string> = {
  prospect_added: 'Añadido al CRM',
  outreach: 'Primer contacto',
  followup: 'Seguimiento',
  reply: 'Respondió',
  audit: 'Auditoría web',
  meeting: 'Reunión',
  proposal: 'Propuesta enviada',
  won: 'Venta cerrada',
  lost: 'Perdido',
  task_done: 'Tarea completada',
  training: 'Entrenamiento',
};

export default function ProspectDetail({ id }: { id: string }) {
  const { state, actions } = useStore();
  const ui = useUI();
  const route = useRoute();
  const p = state.prospects.find((x) => x.id === id);
  const [custom, setCustom] = useState('');
  const [notes, setNotes] = useState(p?.notes ?? '');
  const [needs, setNeeds] = useState(p?.needs ?? '');
  const [offer, setOffer] = useState(p?.offer ?? '');

  useEffect(() => {
    setNotes(p?.notes ?? '');
    setNeeds(p?.needs ?? '');
    setOffer(p?.offer ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  // ?touch=1 abre directamente el registro de contacto (desde "Hacerlo")
  useEffect(() => {
    if (p && route.query.get('touch') === '1') {
      clearQuery();
      ui.logTouch(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, route.query]);

  const args = useMemo(() => (p ? buildArguments(p.problems, { negocio: p.business, sector: p.sector, ciudad: p.city || state.profile.market }) : null), [p, state.profile.market]);

  if (!p || !args)
    return (
      <div className="page">
        <Empty icon={<X />} title="Prospecto no encontrado" action={<a className="btn" href="#/prospects">Volver a prospectos</a>}>
          Puede que lo hayas eliminado.
        </Empty>
      </div>
    );

  const timeline = state.activities.filter((a) => a.prospectId === p.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const items = state.items.filter((i) => i.prospectId === p.id).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  const reco = recommendation(p, state);
  const score = prospectScore(p, state);
  const closed = p.stage === 'ganado' || p.stage === 'perdido';
  const idx = STAGES.indexOf(p.stage);

  const toggleProblem = (pid: string) => actions.updateProspect(p.id, { problems: p.problems.includes(pid) ? p.problems.filter((x) => x !== pid) : [...p.problems, pid] });
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    actions.updateProspect(p.id, { problems: [...p.problems, 'custom:' + v] });
    setCustom('');
  };
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast('Copiado al portapapeles'));
  };
  const remove = async () => {
    if (await confirmDialog({ title: `¿Eliminar ${p.business}?`, body: 'Se borrará la ficha. Su historial de actividad se conserva en tus estadísticas.', confirm: 'Eliminar', danger: true })) {
      actions.deleteProspect(p.id);
      navigate('#/prospects');
      toast('Prospecto eliminado', 'info');
    }
  };
  const setStage = (s: (typeof STAGES)[number]) => {
    if (s === p.stage) return;
    if (s === 'ganado' || s === 'perdido') return ui.closeDeal(p, s);
    const before = new Set(state.activities.map((a) => a.id));
    actions.setStage(p.id, s);
    toast(`Estado: ${STAGE_LABEL[s]}`, 'ok', { label: 'Deshacer', run: () => actions.undoProspectChange(p, before) });
  };

  return (
    <div className="page">
      <div className="row between mb-16">
        <button className="btn btn-ghost btn-sm" onClick={() => (history.length > 1 ? history.back() : navigate('#/prospects'))}>
          <ArrowLeft /> Volver
        </button>
        <div className="row gap-4">
          <button className="btn btn-ghost btn-sm" onClick={() => ui.editProspect(p)}>
            <Pencil /> <span className="hide-mobile">Editar</span>
          </button>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={remove} aria-label="Eliminar">
            <Trash2 />
          </button>
        </div>
      </div>

      {/* Cabecera */}
      <div className="row row-top gap-16 row-wrap">
        <div className="avatar lg">{initials(p.business)}</div>
        <div className="grow" style={{ minWidth: 220 }}>
          <div className="row gap-12 row-wrap">
            <h1 className="h1">{p.business}</h1>
            <StagePill stage={p.stage} />
            <span className={`badge ${reco.tone}`}>{reco.label}</span>
          </div>
          <div className="muted mt-4">{[p.contactName, p.sector, p.city, SOURCE_LABEL[p.source]].filter(Boolean).join(' · ')}</div>
          <div className="row row-wrap gap-6 mt-12">
            {p.phone && (
              <>
                <a className="btn btn-sm" href={`tel:${p.phone}`}>
                  <Phone /> {p.phone}
                </a>
                <a className="btn btn-sm" href={waLink(p.phone)} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </>
            )}
            {p.instagram && (
              <a className="btn btn-sm" href={igLink(p.instagram)} target="_blank" rel="noreferrer">
                <Instagram /> {p.instagram.startsWith('@') ? p.instagram : '@' + p.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}
              </a>
            )}
            {p.email && (
              <a className="btn btn-sm" href={`mailto:${p.email}`}>
                <Mail /> Email
              </a>
            )}
            {p.website && (
              <a className="btn btn-sm" href={cleanUrl(p.website)} target="_blank" rel="noreferrer">
                <Globe /> {displayUrl(p.website)} <ExternalLink />
              </a>
            )}
            {!p.phone && !p.instagram && !p.email && (
              <button className="btn btn-sm" onClick={() => ui.editProspect(p)}>
                <Plus /> Añadir datos de contacto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="card mt-24 tight">
        <div className="stepper" role="tablist" aria-label="Estado del prospecto">
          {STAGES.map((s, i) => (
            <button key={s} className={`st-${s} ${s === p.stage ? 'cur' : i < idx && p.stage !== 'perdido' ? 'past' : ''}`} onClick={() => setStage(s)}>
              <i />
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Acciones rápidas */}
      {!closed && (
        <div className="row row-wrap gap-6 mt-16">
          <button className="btn btn-primary" onClick={() => ui.logTouch(p)}>
            <Phone /> {p.firstContact ? 'Registrar seguimiento' : 'Registrar primer contacto'}
          </button>
          {p.firstContact && STAGES.indexOf(p.stage) < STAGES.indexOf('respondio') && (
            <button
              className="btn"
              onClick={() => {
                actions.logReply(p.id);
                toast(`${p.business} respondió 💬`);
              }}
            >
              <MessageCircle /> Respondió
            </button>
          )}
          <a className="btn" href={`#/messages?prospect=${p.id}`}>
            <MessageSquareText /> Generar mensaje
          </a>
          <button className="btn" onClick={() => ui.newItem({ kind: 'llamada', prospectId: p.id, time: '10:00', title: `Llamada · ${p.business}` })}>
            <CalendarPlus /> Agendar
          </button>
          <a className="btn" href={`#/audit?prospect=${p.id}`}>
            <ScanSearch /> Auditar web
          </a>
          <span className="grow" />
          <button className="btn btn-ghost" onClick={() => ui.closeDeal(p, 'perdido')}>
            <XCircle /> Perdido
          </button>
          <button className="btn" style={{ color: 'var(--green)' }} onClick={() => ui.closeDeal(p, 'ganado')}>
            <Trophy /> Ganado
          </button>
        </div>
      )}

      <div className="grid mt-24" style={{ gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)' }} data-stack>
        <div className="col gap-16">
          {/* Por qué debería comprarme */}
          <div className="card glow">
            <div className="eyebrow">¿Por qué este negocio debería comprarme una web?</div>
            {args.why ? (
              <p className="mt-12" style={{ fontSize: 16, lineHeight: 1.6 }}>
                {args.why}
              </p>
            ) : (
              <p className="muted mt-12">Marca abajo los problemas que hayas detectado en su web y aquí aparecerá el argumento central de venta, personalizado para {p.business}.</p>
            )}
          </div>

          {/* Problemas detectados */}
          <div className="card">
            <div className="card-head">
              <div className="h3">Problemas detectados</div>
              <span className="tiny dim">{p.problems.length} marcados</span>
            </div>
            <div className="chips">
              {WEB_PROBLEMS.filter((w) => w.id !== 'no_web' || p.webStatus === 'sin_web' || p.problems.includes('no_web')).map((w) => (
                <button key={w.id} className={`chip ${p.problems.includes(w.id) ? 'on' : ''}`} onClick={() => toggleProblem(w.id)}>
                  {w.label}
                </button>
              ))}
              {p.problems
                .filter((x) => x.startsWith('custom:'))
                .map((x) => (
                  <button key={x} className="chip on" onClick={() => toggleProblem(x)} data-tip="Quitar">
                    {problemLabel(x)} <X />
                  </button>
                ))}
            </div>
            <form
              className="row gap-6 mt-12"
              onSubmit={(e) => {
                e.preventDefault();
                addCustom();
              }}
            >
              <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Otro problema que hayas visto…" />
              <button className="btn" type="submit" disabled={!custom.trim()}>
                Añadir
              </button>
            </form>
          </div>

          {/* Argumentos de venta */}
          <div className="card">
            <div className="card-head">
              <div className="h3">Argumentos de venta</div>
              {args.args.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => copy(args.args.map((a) => `• ${a.text}`).join('\n\n'))}>
                  <Copy /> Copiar todos
                </button>
              )}
            </div>
            {args.args.length === 0 ? (
              <p className="muted small">Se generan automáticamente a partir de los problemas detectados. Ordenados por impacto en sus ventas.</p>
            ) : (
              <div className="col gap-16">
                {args.args.map((a, i) => (
                  <div key={a.id} className="row row-top gap-12" style={{ animation: `rise 400ms ${i * 50}ms var(--ease-out) both` }}>
                    <span className="mono tiny dim" style={{ paddingTop: 3, width: 18 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="grow">
                      <div className="small strong">{a.label}</div>
                      <p className="mt-4" style={{ lineHeight: 1.6 }}>
                        "{a.text}"
                      </p>
                      <div className="row row-top gap-6 mt-8 small muted">
                        <HelpCircle size={14} style={{ flex: 'none', marginTop: 3 }} /> <span>Pregunta: {a.question}</span>
                      </div>
                      <div className="row row-top gap-6 mt-4 small muted">
                        <Lightbulb size={14} style={{ flex: 'none', marginTop: 3 }} /> <span>Solución: {a.fix}</span>
                      </div>
                    </div>
                    <button className="icon-btn" onClick={() => copy(a.text)} aria-label="Copiar argumento">
                      <Copy size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Necesidades / oferta / notas */}
          <div className="card">
            <div className="grid g2">
              <div className="field">
                <span className="label">Necesidades</span>
                <textarea className="textarea" value={needs} onChange={(e) => setNeeds(e.target.value)} onBlur={() => needs !== p.needs && actions.updateProspect(p.id, { needs })} placeholder="Qué quiere conseguir el cliente…" />
              </div>
              <div className="field">
                <span className="label">Oferta propuesta</span>
                <textarea className="textarea" value={offer} onChange={(e) => setOffer(e.target.value)} onBlur={() => offer !== p.offer && actions.updateProspect(p.id, { offer })} placeholder="Web 5 páginas + reservas · 1.200 €" />
              </div>
            </div>
            <div className="field mt-16">
              <span className="label">Notas</span>
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== p.notes && actions.updateProspect(p.id, { notes })} placeholder="Todo lo que sepas: horarios, quién decide, cómo habla…" />
            </div>
            <div className="tiny dim mt-8">Se guarda automáticamente.</div>
          </div>
        </div>

        <div className="col gap-16">
          {/* Datos clave */}
          <div className="card">
            <div className="grid g2 keep">
              <div className="kpi">
                <span className="kpi-label">Valor</span>
                <span className="kpi-value" style={{ fontSize: 22 }}>
                  {money(p.stage === 'ganado' ? p.wonAmount : valueOf(p, state.profile.avgPrice))}
                </span>
                {!p.value && p.stage !== 'ganado' && <span className="tiny dim">estimado (precio medio)</span>}
              </div>
              <div className="kpi">
                <span className="kpi-label">Probabilidad</span>
                <span className="kpi-value" style={{ fontSize: 22 }}>
                  {probabilityOf(p)}%
                </span>
                {p.probability == null && <span className="tiny dim">según etapa</span>}
              </div>
              <div className="kpi">
                <span className="kpi-label">Potencial</span>
                <span className="kpi-value" style={{ fontSize: 22 }}>
                  {score}
                  <span className="dim" style={{ fontSize: 14 }}>
                    /100
                  </span>
                </span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Web</span>
                <span className="small strong mt-4">{p.auditScore != null ? `${p.auditScore}/100` : WEB_STATUS_LABEL[p.webStatus]}</span>
              </div>
            </div>
            <hr className="sep" />
            <div className="col gap-6 small">
              <Row k="Primer contacto" v={fmtDay(p.firstContact)} />
              <Row k="Último contacto" v={p.lastContact ? `${fmtDay(p.lastContact)} · ${relDay(p.lastContact).toLowerCase()}` : '—'} />
              <Row k="Secuencia" v={sequenceLabel(p, state.settings.sequence)} />
              <div className="row between">
                <span className="dim">Próximo seguimiento</span>
                {closed ? (
                  <span>—</span>
                ) : (
                  <input
                    type="date"
                    className="input"
                    style={{ width: 160, height: 32, fontSize: 13, color: p.nextFollowUp && p.nextFollowUp < today() ? 'var(--red)' : undefined }}
                    value={p.nextFollowUp ?? ''}
                    onChange={(e) => actions.setNextFollowUp(p.id, e.target.value || null)}
                  />
                )}
              </div>
              {p.stage === 'perdido' && p.lostReason && <Row k="Motivo" v={p.lostReason} />}
              {p.stage === 'ganado' && <Row k="Cerrado" v={fmtDay(p.wonAt)} />}
              {p.firstContact && p.stage === 'ganado' && p.wonAt && <Row k="Días hasta cerrar" v={String(Math.max(0, (daysAgo(p.firstContact) ?? 0) - (daysAgo(p.wonAt) ?? 0)))} />}
            </div>
          </div>

          {/* Agenda del cliente */}
          <div className="card">
            <div className="card-head">
              <div className="h3">Agenda</div>
              <button className="btn btn-ghost btn-sm" onClick={() => ui.newItem({ kind: 'reunion', prospectId: p.id, time: '10:00' })}>
                <Plus /> Nuevo
              </button>
            </div>
            {items.length === 0 ? (
              <p className="small dim">Sin eventos. Agenda la próxima llamada o reunión para no perder el hilo.</p>
            ) : (
              <div className="list">
                {items.slice(0, 6).map((i) => (
                  <div key={i.id} className="list-row clickable" onClick={() => ui.editItem(i)}>
                    <span className="kind-dot" style={{ background: KIND_COLOR[i.kind] }} />
                    <div className="grow">
                      <div className={`small trunc ${i.status === 'hecho' ? 'done-text' : ''}`}>{i.title}</div>
                      <div className="tiny dim">
                        {KIND_LABEL[i.kind]} · {relDay(i.date)} {i.time ?? ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historial */}
          <div className="card">
            <div className="card-head">
              <div className="h3">Historial</div>
              <span className="tiny dim">{timeline.length}</span>
            </div>
            {timeline.length === 0 ? (
              <p className="small dim">Todavía no hay actividad.</p>
            ) : (
              <div className="col" style={{ gap: 0 }}>
                {timeline.slice(0, 20).map((a) => (
                  <div key={a.id} className="row row-top gap-12" style={{ padding: '8px 0' }}>
                    <span className="kind-dot" style={{ marginTop: 6, background: a.type === 'won' ? 'var(--green)' : a.type === 'lost' ? 'var(--red)' : 'var(--accent)' }} />
                    <div className="grow">
                      <div className="small">
                        {ACT_LABEL[a.type]}
                        {a.channel ? ` · ${CHANNEL_LABEL[a.channel]}` : ''}
                        {a.amount ? ` · ${money(a.amount)}` : ''}
                      </div>
                      {a.note && <div className="tiny muted">{a.note}</div>}
                      <div className="tiny dim">{relDay(a.day)}</div>
                    </div>
                    <button
                      className="icon-btn"
                      style={{ width: 26, height: 26 }}
                      aria-label="Eliminar registro"
                      data-tip="Eliminar registro"
                      onClick={async () => {
                        if (await confirmDialog({ title: '¿Eliminar este registro?', body: 'Se descontará de tus estadísticas y XP.', confirm: 'Eliminar', danger: true })) actions.deleteActivity(a.id);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row between">
      <span className="dim">{k}</span>
      <span>{v}</span>
    </div>
  );
}
