import { useEffect, useMemo, useState } from 'react';
import { Crosshair, ExternalLink, ListPlus, MapPin, MessageSquareText, Plus, ScanSearch } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Empty, Modal } from '../components/ui';
import { StagePill } from '../components/forms';
import { SECTORS } from '../data/defaults';
import { SIZE_LABEL, STAGES, STAGE_LABEL, WEB_STATUS_LABEL, type BizSize, type Prospect, type Stage, type WebStatus } from '../data/types';
import { mainProblem, priorityLabel, prospectScore, recommendation } from '../lib/insights';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { toast } from '../lib/bus';

export default function Prospecting() {
  const { state } = useStore();
  const ui = useUI();
  const route = useRoute();
  const [bulk, setBulk] = useState(false);
  const [f, setF] = useState({ sector: '', city: '', size: '' as BizSize | '', web: '' as WebStatus | '', potential: '', stage: 'early' as Stage | 'early' | 'all' });

  useEffect(() => {
    if (route.query.get('add') === '1') {
      clearQuery();
      setBulk(true);
    }
  }, [route.query]);

  const sectors = useMemo(() => Array.from(new Set(state.prospects.map((p) => p.sector).filter(Boolean))).sort(), [state.prospects]);
  const cities = useMemo(() => Array.from(new Set(state.prospects.map((p) => p.city).filter(Boolean))).sort(), [state.prospects]);

  const list = useMemo(
    () =>
      state.prospects
        .map((p) => ({ p, score: prospectScore(p, state), reco: recommendation(p, state) }))
        .filter(({ p, score }) => {
          if (f.sector && p.sector !== f.sector) return false;
          if (f.city && p.city !== f.city) return false;
          if (f.size && p.size !== f.size) return false;
          if (f.web && p.webStatus !== f.web) return false;
          if (f.potential && priorityLabel(score) !== f.potential) return false;
          if (f.stage === 'early') return p.stage === 'nuevo' || p.stage === 'investigando';
          if (f.stage !== 'all' && p.stage !== f.stage) return false;
          return true;
        })
        .sort((a, b) => (b.reco.tone === 'hot' ? 1 : 0) - (a.reco.tone === 'hot' ? 1 : 0) || b.score - a.score),
    [state, f],
  );

  const hotCount = list.filter((x) => x.reco.label === 'CONTACTAR HOY').length;
  const searchSectors = state.profile.targetSectors.length ? state.profile.targetSectors : ['Restaurante', 'Peluquería', 'Clínica dental'];
  const city = state.profile.market || '';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Prospecting</h1>
          <p className="muted">Organiza los negocios a los que quieres vender y ataca primero los de mayor potencial.</p>
        </div>
        <div className="row gap-6">
          <button className="btn" onClick={() => setBulk(true)}>
            <ListPlus /> Añadir varios
          </button>
          <button className="btn btn-primary" onClick={() => ui.newProspect({ stage: 'nuevo' })}>
            <Plus /> Añadir
          </button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-head">
          <div className="h3">
            <MapPin /> Dónde buscar hoy
          </div>
          <span className="tiny dim">Abre Google Maps con la búsqueda lista</span>
        </div>
        <div className="chips">
          {searchSectors.slice(0, 6).map((s) => (
            <a key={s} className="chip" href={`https://www.google.com/maps/search/${encodeURIComponent(`${s} ${city}`.trim())}`} target="_blank" rel="noreferrer">
              {s}
              {city ? ` en ${city}` : ''} <ExternalLink />
            </a>
          ))}
        </div>
        <p className="tiny dim mt-12">Busca fichas con pocas fotos, sin web o con web antigua, y buenas reseñas: tienen clientes pero no los aprovechan online.</p>
      </div>

      <div className="row row-wrap gap-6 mb-16">
        <select className="select" style={{ width: 'auto' }} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}>
          <option value="early">Por contactar</option>
          <option value="all">Todos los estados</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>
          <option value="">Sector</option>
          {sectors.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
          <option value="">Ciudad</option>
          {cities.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.size} onChange={(e) => setF({ ...f, size: e.target.value as BizSize })}>
          <option value="">Tamaño</option>
          {Object.entries(SIZE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.web} onChange={(e) => setF({ ...f, web: e.target.value as WebStatus })}>
          <option value="">Web</option>
          {Object.entries(WEB_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={f.potential} onChange={(e) => setF({ ...f, potential: e.target.value })}>
          <option value="">Potencial</option>
          <option>Alta</option>
          <option>Media</option>
          <option>Baja</option>
        </select>
      </div>

      {state.prospects.length === 0 ? (
        <div className="card">
          <Empty icon={<Crosshair />} title="Empieza tu lista de oportunidades" action={<button className="btn btn-primary" onClick={() => setBulk(true)}><ListPlus /> Añadir negocios</button>}>
            Pega una lista de negocios (uno por línea) y la app calculará su potencial y te dirá a quién contactar primero.
          </Empty>
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <Empty icon={<Crosshair />} title="Ninguna oportunidad con estos filtros">
            {f.stage === 'early' ? 'Has contactado a todos tus prospectos. Añade negocios nuevos para seguir.' : 'Prueba a quitar algún filtro.'}
          </Empty>
        </div>
      ) : (
        <>
          {hotCount > 0 && (
            <div className="small muted mb-12">
              <b className="strong accent">{hotCount}</b> {hotCount === 1 ? 'oportunidad lista' : 'oportunidades listas'} para contactar hoy.
            </div>
          )}
          <div className="card flush" style={{ padding: '4px 20px' }}>
            <div className="table-wrap hide-mobile">
              <table className="table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Problema</th>
                    <th>Potencial</th>
                    <th>Prioridad</th>
                    <th>Recomendación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ p, score, reco }) => (
                    <tr key={p.id} onClick={() => navigate(`#/prospects/${p.id}`)}>
                      <td>
                        <div className="strong">{p.business}</div>
                        <div className="tiny dim">{[p.sector, p.city, p.size ? SIZE_LABEL[p.size] : ''].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="small muted">{mainProblem(p)}</td>
                      <td>
                        <div className="row gap-6">
                          <div className="bar thin" style={{ width: 60 }}>
                            <i style={{ width: `${score}%` }} />
                          </div>
                          <span className="mono tiny">{score}</span>
                        </div>
                      </td>
                      <td className="small">{priorityLabel(score)}</td>
                      <td>
                        <span className={`badge ${reco.tone}`}>{reco.label}</span>
                      </td>
                      <td>
                        <OppActions p={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="list hide-desktop">
              {list.map(({ p, score, reco }) => (
                <div key={p.id} className="list-row clickable" onClick={() => navigate(`#/prospects/${p.id}`)} style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row between gap-6">
                      <span className="strong trunc">{p.business}</span>
                      <span className="mono tiny dim">{score}</span>
                    </div>
                    <div className="tiny dim mt-4">{mainProblem(p)}</div>
                    <div className="row gap-6 mt-8">
                      <span className={`badge ${reco.tone}`}>{reco.label}</span>
                      {f.stage !== 'early' && <StagePill stage={p.stage} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
    </div>
  );
}

function OppActions({ p }: { p: Prospect }) {
  return (
    <div className="row gap-4" onClick={(e) => e.stopPropagation()}>
      {p.website && (
        <a className="btn btn-sm btn-icon btn-ghost" href={`#/audit?prospect=${p.id}`} data-tip="Auditar">
          <ScanSearch />
        </a>
      )}
      <a className="btn btn-sm btn-icon btn-ghost" href={`#/messages?prospect=${p.id}`} data-tip="Generar mensaje">
        <MessageSquareText />
      </a>
    </div>
  );
}

/** Alta masiva: un negocio por línea. Formato flexible: "Nombre, ciudad, teléfono, web, @instagram". */
function BulkAdd({ onClose }: { onClose: () => void }) {
  const { state, actions } = useStore();
  const [text, setText] = useState('');
  const [sector, setSector] = useState(state.profile.targetSectors[0] ?? '');
  const [city, setCity] = useState(state.profile.market);
  const [web, setWeb] = useState<WebStatus>('desconocido');

  const parsed = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t|]/).map((x) => x.trim()).filter(Boolean);
      const out: Partial<Prospect> = { business: parts[0], sector, city, webStatus: web, source: 'google_maps' };
      for (const part of parts.slice(1)) {
        if (/^@/.test(part) || /instagram\.com/.test(part)) out.instagram = part;
        else if (/@/.test(part)) out.email = part;
        else if (/^[+\d][\d\s-]{6,}$/.test(part)) out.phone = part;
        else if (/\.[a-z]{2,}/i.test(part)) out.website = part;
        else out.city = part;
      }
      return out;
    });
  const dupes = parsed.filter((p) => state.prospects.some((x) => x.business.toLowerCase() === p.business?.toLowerCase()));

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Añadir varios negocios"
      subtitle="Uno por línea. Opcional: separa con comas ciudad, teléfono, web o @instagram."
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!parsed.length}
            onClick={() => {
              const fresh = parsed.filter((p) => !dupes.includes(p));
              const n = actions.addProspects(fresh);
              toast(`${n} ${n === 1 ? 'negocio añadido' : 'negocios añadidos'}${dupes.length ? ` · ${dupes.length} duplicados omitidos` : ''}`);
              onClose();
            }}
          >
            Añadir {parsed.length - dupes.length || ''}
          </button>
        </>
      }
    >
      <textarea
        className="textarea mono"
        style={{ minHeight: 180, fontSize: 13 }}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Restaurante La Brasa, 600123123, labrasa.es\nBarbería Javi Cuts, @javicuts\nClínica Sonríe, Valencia, clinicasonrie.com'}
      />
      <div className="grid g3 mt-16">
        <label className="field">
          <span className="label">Sector para todos</span>
          <input className="input" list="bulk-sectors" value={sector} onChange={(e) => setSector(e.target.value)} />
          <datalist id="bulk-sectors">
            {SECTORS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span className="label">Ciudad por defecto</span>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Estado de la web</span>
          <select className="select" value={web} onChange={(e) => setWeb(e.target.value as WebStatus)}>
            {Object.entries(WEB_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {parsed.length > 0 && (
        <div className="small muted mt-12">
          {parsed.length} detectados{dupes.length ? ` · ${dupes.length} ya existen y se omitirán` : ''}
        </div>
      )}
    </Modal>
  );
}
