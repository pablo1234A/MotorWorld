import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Send } from 'lucide-react';
import { useStore } from '../data/store';
import { SUGGESTIONS, ask, type AssistantReply } from '../lib/assistant';
import { navigate } from '../lib/router';
import { StagePill } from '../components/forms';
import { initials } from '../lib/format';

interface Turn {
  who: 'me' | 'ai';
  text: string;
  reply?: AssistantReply;
}

/** Negritas **x** → <b> sin usar HTML crudo. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

export default function Assistant() {
  const { state } = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [turns, typing]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || typing) return;
    setTurns((s) => [...s, { who: 'me', text: t }]);
    setQ('');
    setTyping(true);
    setTimeout(() => {
      const reply = ask(t, state);
      setTurns((s) => [...s, { who: 'ai', text: reply.text, reply }]);
      setTyping(false);
    }, 450);
  };

  const name = state.profile.name.split(' ')[0];

  return (
    <div className="page page-narrow" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 60px)' }}>
      <div className="page-head">
        <div>
          <h1 className="h1">My Sales AI</h1>
          <p className="muted">Tu asistente conoce tu CRM, tu agenda y tus estadísticas. Responde solo con tus datos reales.</p>
        </div>
      </div>

      <div className="chat grow">
        {turns.length === 0 && (
          <div className="card glow" style={{ animation: 'rise 420ms var(--ease-out) both' }}>
            <div className="row gap-12">
              <div className="avatar" style={{ background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>
                <Bot size={16} />
              </div>
              <div>
                <div className="h3">Hola{name ? `, ${name}` : ''}. ¿En qué te ayudo?</div>
                <div className="small muted">
                  Analizo {state.prospects.length} prospectos, {state.items.filter((i) => i.status === 'pendiente').length} tareas pendientes y {state.activities.length} acciones registradas.
                </div>
              </div>
            </div>
            <div className="chips mt-16">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.who === 'me' ? 'me' : 'ai'}`}>
            <Rich text={t.text} />
            {t.reply?.prospects && t.reply.prospects.length > 0 && (
              <div className="col gap-4 mt-12" style={{ whiteSpace: 'normal' }}>
                {t.reply.prospects
                  .map((id) => state.prospects.find((p) => p.id === id))
                  .filter(Boolean)
                  .map((p) => (
                    <button key={p!.id} className="row gap-12 card tight hover" style={{ textAlign: 'left', padding: '8px 10px' }} onClick={() => navigate(`#/prospects/${p!.id}`)}>
                      <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>
                        {initials(p!.business)}
                      </div>
                      <span className="small grow trunc">{p!.business}</span>
                      <StagePill stage={p!.stage} />
                    </button>
                  ))}
              </div>
            )}
            {t.reply?.links && t.reply.links.length > 0 && (
              <div className="row row-wrap gap-6 mt-12" style={{ whiteSpace: 'normal' }}>
                {t.reply.links.map((l) =>
                  l.href.startsWith('#ask:') ? (
                    <button key={l.href} className="chip" onClick={() => send(l.href.slice(5))}>
                      {l.label}
                    </button>
                  ) : (
                    <button key={l.href} className="btn btn-sm btn-primary" onClick={() => navigate(l.href)}>
                      {l.label} <ArrowRight />
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="bubble ai typing">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>

      {turns.length > 0 && (
        <div className="chips mt-16" style={{ flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="card tight row gap-12 mt-12 glass sticky-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input className="grow" style={{ background: 'none', border: 'none', outline: 'none', fontSize: 15, height: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta sobre tus clientes, ventas o qué hacer…" />
        <button className="btn btn-primary btn-icon" type="submit" disabled={!q.trim() || typing} aria-label="Enviar">
          <Send />
        </button>
      </form>
    </div>
  );
}
