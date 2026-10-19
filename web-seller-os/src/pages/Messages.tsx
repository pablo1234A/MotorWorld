import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Mail, MessageCircle, RefreshCw, Bookmark, Send } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Field } from '../components/ui';
import { WEB_PROBLEMS } from '../content/problems';
import { MSG_CHANNEL_LABEL, MSG_GOAL_LABEL, generateMessages, type MsgChannel, type MsgGoal, type MsgInput } from '../lib/messages';
import { clearQuery, useRoute } from '../lib/router';
import { igLink, waLink } from '../lib/format';
import { toast } from '../lib/bus';
import { SECTORS } from '../data/defaults';

export default function Messages() {
  const { state, actions } = useStore();
  const ui = useUI();
  const route = useRoute();
  const [prospectId, setProspectId] = useState('');
  const [input, setInput] = useState<MsgInput>({
    channel: 'whatsapp',
    goal: 'abrir',
    business: '',
    sector: state.profile.targetSectors[0] ?? '',
    city: state.profile.market,
    problem: '',
    owner: '',
    me: state.profile.name,
  });
  const [copied, setCopied] = useState<number | null>(null);
  const [seed, setSeed] = useState(0);

  const loadProspect = (id: string) => {
    setProspectId(id);
    const p = state.prospects.find((x) => x.id === id);
    if (!p) return;
    const goal: MsgGoal = p.stage === 'propuesta' || p.stage === 'negociacion' ? 'propuesta' : p.stage === 'respondio' ? 'reunion' : p.firstContact ? 'reactivar' : 'abrir';
    setInput((s) => ({
      ...s,
      business: p.business,
      sector: p.sector || s.sector,
      city: p.city || s.city,
      owner: p.contactName,
      problem: p.problems[0]?.startsWith('custom:') ? p.problems[0].slice(7) : p.problems[0] ?? (p.webStatus === 'sin_web' ? 'no_web' : ''),
      goal,
      channel: p.phone ? 'whatsapp' : p.instagram ? 'instagram' : p.email ? 'email' : s.channel,
    }));
  };

  useEffect(() => {
    const id = route.query.get('prospect');
    const ch = route.query.get('channel') as MsgChannel | null;
    const goal = route.query.get('goal') as MsgGoal | null;
    if (id) loadProspect(id);
    if (ch || goal) setInput((s) => ({ ...s, ...(ch ? { channel: ch } : {}), ...(goal ? { goal } : {}) }));
    if (id || ch || goal) clearQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const msgs = useMemo(() => {
    const list = generateMessages(input);
    // rotar variantes para "Otra versión"
    return list.map((_, i) => list[(i + seed) % list.length]);
  }, [input, seed]);
  const set = <K extends keyof MsgInput>(k: K, v: MsgInput[K]) => setInput((s) => ({ ...s, [k]: v }));
  const prospect = state.prospects.find((p) => p.id === prospectId);
  const showGoal = input.channel !== 'llamada' && input.channel !== 'seguimiento' && input.channel !== 'reunion';

  const copy = (text: string, i: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1600);
    });
  };

  const sendLink = (body: string, subject?: string) => {
    if (!prospect) return null;
    if (input.channel === 'whatsapp' || input.channel === 'seguimiento') return prospect.phone ? waLink(prospect.phone, body) : null;
    if (input.channel === 'instagram') return prospect.instagram ? igLink(prospect.instagram) : null;
    if (input.channel === 'email') return prospect.email ? `mailto:${prospect.email}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(body)}` : null;
    return null;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Generador de mensajes</h1>
          <p className="muted">Breves, naturales y personalizados. Nada de plantillas que huelen a spam.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.3fr)' }} data-stack>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="col gap-16">
            <Field label="Cargar desde el CRM">
              <select className="select" value={prospectId} onChange={(e) => loadProspect(e.target.value)}>
                <option value="">— Escribir a mano —</option>
                {state.prospects
                  .filter((p) => p.stage !== 'ganado' && p.stage !== 'perdido')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.business}
                    </option>
                  ))}
              </select>
            </Field>
            <div>
              <div className="label mb-8">Canal</div>
              <div className="chips">
                {(Object.keys(MSG_CHANNEL_LABEL) as MsgChannel[]).map((c) => (
                  <button key={c} className={`chip ${input.channel === c ? 'on' : ''}`} onClick={() => set('channel', c)}>
                    {MSG_CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            {showGoal && (
              <div>
                <div className="label mb-8">Objetivo</div>
                <div className="chips">
                  {(Object.keys(MSG_GOAL_LABEL) as MsgGoal[]).map((g) => (
                    <button key={g} className={`chip ${input.goal === g ? 'on' : ''}`} onClick={() => set('goal', g)}>
                      {MSG_GOAL_LABEL[g]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid g2">
              <Field label="Negocio">
                <input className="input" value={input.business} onChange={(e) => set('business', e.target.value)} placeholder="Restaurante La Brasa" />
              </Field>
              <Field label="Nombre del propietario">
                <input className="input" value={input.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Carmen" />
              </Field>
              <Field label="Sector">
                <input className="input" list="msg-sectors" value={input.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Restaurante" />
                <datalist id="msg-sectors">
                  {SECTORS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="Ciudad">
                <input className="input" value={input.city} onChange={(e) => set('city', e.target.value)} placeholder="Valencia" />
              </Field>
            </div>
            <Field label="Problema detectado">
              <select className="select" value={WEB_PROBLEMS.some((w) => w.id === input.problem) ? input.problem : input.problem ? '__custom' : ''} onChange={(e) => set('problem', e.target.value === '__custom' ? ' ' : e.target.value)}>
                <option value="">Genérico (sin problema concreto)</option>
                {WEB_PROBLEMS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
                <option value="__custom">Otro (escribir)…</option>
              </select>
            </Field>
            {input.problem && !WEB_PROBLEMS.some((w) => w.id === input.problem) && (
              <input className="input" autoFocus value={input.problem.trimStart()} onChange={(e) => set('problem', e.target.value)} placeholder="Ej. la carta en la web es un PDF que no se lee en móvil" />
            )}
          </div>
        </div>

        <div className="col gap-12">
          <div className="row between">
            <span className="eyebrow">{msgs.length} versiones</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSeed((s) => s + 1)}>
              <RefreshCw /> Otro orden
            </button>
          </div>
          {msgs.map((m, i) => {
            const text = m.subject ? `Asunto: ${m.subject}\n\n${m.body}` : m.body;
            const link = sendLink(m.body, m.subject);
            const words = m.body.split(/\s+/).length;
            return (
              <div key={`${seed}-${i}`} className="card" style={{ animation: `rise 380ms ${i * 60}ms var(--ease-out) both` }}>
                {m.note && <div className="badge violet mb-12">{m.note}</div>}
                {m.subject && (
                  <div className="small mb-8">
                    <span className="dim">Asunto: </span>
                    <span className="strong">{m.subject}</span>
                  </div>
                )}
                <p className="prewrap" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
                  {m.body}
                </p>
                <div className="row row-wrap gap-6 mt-16">
                  <span className="tiny dim grow">{words} palabras{input.channel !== 'llamada' && input.channel !== 'reunion' && words > 60 ? ' · algo largo para un primer mensaje' : ''}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      actions.addResource({ kind: input.channel === 'llamada' ? 'guion' : 'mensaje', title: `${MSG_CHANNEL_LABEL[input.channel]} · ${input.business || input.sector || 'genérico'}`, body: text, tags: [input.channel] });
                      toast('Guardado en Recursos');
                    }}
                  >
                    <Bookmark /> Guardar
                  </button>
                  <button className="btn btn-sm" onClick={() => copy(text, i)}>
                    {copied === i ? <Check /> : <Copy />} {copied === i ? 'Copiado' : 'Copiar'}
                  </button>
                  {link && (
                    <a
                      className="btn btn-sm btn-primary"
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        if (prospect) setTimeout(() => ui.logTouch(prospect), 400);
                      }}
                    >
                      {input.channel === 'email' ? <Mail /> : input.channel === 'instagram' ? <Send /> : <MessageCircle />} Enviar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          <p className="tiny dim">
            Consejo: cambia siempre una frase para que suene a ti. {prospect ? 'Al pulsar "Enviar" te preguntaré si quieres registrar el contacto.' : 'Carga un prospecto del CRM para enviar directamente y registrar el contacto.'}
          </p>
        </div>
      </div>
    </div>
  );
}
