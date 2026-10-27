import { useEffect, useRef, useState } from 'react';
import { ArrowUp, IdCard } from 'lucide-react';
import { useSnapshot } from '../components/Shell';
import { AgentMark, Loading, Status, toastError } from '../components/ui';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { useRouter } from '../lib/router';
import { clock } from '../lib/format';
import type { Message } from '../lib/types';

const SUGGESTIONS: Record<string, string[]> = {
  ATLAS: ['Atlas, quiero vender más este producto.', '¿Qué está haciendo la empresa ahora mismo?', 'Genera el informe diario.', 'Recuerda: el tono de marca nunca usa tecnicismos.'],
  ALEX: ['¿Qué tareas están bloqueadas?', 'Lanza 2 vídeos con ángulo deseo.'],
  EVA: ['Audita la página de producto.', '¿Qué problema de conversión ves primero?'],
  IRIS: ['Analiza el rendimiento con los datos disponibles.'],
};

export function Chat({ agent }: { agent: string }) {
  const { snap } = useSnapshot();
  const { navigate } = useRouter();
  const { data: history, setData } = useResource<Message[]>(`/api/chat/${agent}`);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const current = snap?.agents.find((a) => a.id === agent);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [history?.length, sending]);

  const send = async (message: string) => {
    if (!message.trim() || sending) return;
    setSending(true);
    setText('');
    const optimistic: Message = { id: `tmp${Date.now()}`, channel: 'chat', fromId: 'OWNER', toId: agent, conversationId: null, taskId: null, workflowRunId: null, kind: 'chat', content: message, data: null, createdAt: new Date().toISOString() };
    setData((h) => [...(h ?? []), optimistic]);
    try {
      await api.post(`/api/chat/${agent}`, { message });
      setData(await api.get<Message[]>(`/api/chat/${agent}`));
    } catch (e) {
      toastError((e as Error).message);
      setText(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat">
      <nav className="chat-list" aria-label="Agentes">
        {(snap?.agents ?? []).map((a) => (
          <button key={a.id} aria-current={a.id === agent} onClick={() => navigate(`/chat/${a.id}`)}>
            <AgentMark id={a.id} size={30} status={a.state.status} />
            <span className="stack chat-sub" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13, letterSpacing: '0.04em' }}>{a.name}</b>
              <span className="xs faint ellipsis">{a.title}</span>
            </span>
          </button>
        ))}
      </nav>
      <section className="chat-main">
        <header className="chat-head">
          <AgentMark id={agent} size={34} status={current?.state.status} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row gap-8"><h2 style={{ letterSpacing: '0.04em' }}>{agent} CHAT</h2>{current && <Status value={current.state.status} />}</div>
            <div className="xs faint ellipsis">{current?.title}{current?.currentTask ? ` · trabajando en: ${current.currentTask.title}` : ''}</div>
          </div>
          <button className="btn ghost sm" onClick={() => navigate(`/agents/${agent}`)}><IdCard /> Ficha</button>
        </header>
        <div className="chat-log" ref={logRef}>
          {!history ? (
            <Loading />
          ) : history.length === 0 ? (
            <div className="empty">
              <AgentMark id={agent} size={44} />
              <h3>Habla directamente con {agent}</h3>
              <p>{agent === 'ATLAS' ? 'ATLAS es tu CEO: dile qué quieres conseguir y activará a toda la empresa. Mantiene el contexto de la conversación.' : `${agent} conoce el producto activo y su propio trabajo. Mantiene el contexto de esta conversación.`}</p>
            </div>
          ) : (
            history.map((m) => {
              const me = m.fromId === 'OWNER';
              return (
                <div key={m.id} className={`msg ${me ? 'me' : ''}`}>
                  {!me && <AgentMark id={m.fromId} size={30} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="bubble">{m.content}</div>
                    <div className="meta" style={{ textAlign: me ? 'right' : 'left' }}>
                      {clock(m.createdAt)}
                      {m.data?.engine && !me ? ` · ${m.data.engine}` : ''}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {sending && (
            <div className="msg">
              <AgentMark id={agent} size={30} />
              <div className="bubble typing" aria-label={`${agent} está pensando`}><i /><i /><i /></div>
            </div>
          )}
        </div>
        {history && history.length < 3 && (
          <div className="suggestions">
            {(SUGGESTIONS[agent] ?? ['¿En qué estás trabajando?', '¿Qué necesitas del propietario?']).map((s) => (
              <button key={s} onClick={() => send(s)} disabled={sending}>{s}</button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            className="textarea"
            placeholder={`Escribe a ${agent}…`}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            aria-label={`Mensaje para ${agent}`}
          />
          <button className="btn primary icon" type="submit" disabled={!text.trim() || sending} aria-label="Enviar" style={{ height: 44, width: 44 }}>
            <ArrowUp />
          </button>
        </form>
      </section>
    </div>
  );
}
