import { useState } from 'react';
import { ArrowLeft, ArrowRight, Ban, Copy, HelpCircle, Search, Swords, Target, MessageSquareQuote, Brain } from 'lucide-react';
import { useStore } from '../data/store';
import { OBJECTIONS } from '../content/objections';
import { matches, money } from '../lib/format';
import { toast } from '../lib/bus';
import { Empty } from '../components/ui';

export default function Objections({ id }: { id?: string }) {
  const [q, setQ] = useState('');
  if (id) return <ObjectionDetail id={id} />;
  const list = OBJECTIONS.filter((o) => matches(`${o.category} ${o.phrase} ${o.meaning}`, q));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Biblioteca de objeciones</h1>
          <p className="muted">Cada "no" tiene un significado real. Aprende a leerlo y a responder sin presión.</p>
        </div>
        <a href="#/coach/roleplay" className="btn">
          <Swords /> Practicar en roleplay
        </a>
      </div>
      <div className="input-icon mb-24" style={{ maxWidth: 420 }}>
        <Search />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar objeción…" />
      </div>
      {list.length === 0 ? (
        <Empty icon={<Search />} title="Sin resultados" />
      ) : (
        <div className="grid g-auto stagger">
          {list.map((o, i) => (
            <a key={o.id} href={`#/objections/${o.id}`} className="card hover" style={{ ['--i' as string]: i }}>
              <div className="eyebrow">{o.category}</div>
              <div className="h2 mt-8">{o.phrase}</div>
              <p className="small muted mt-8" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {o.meaning}
              </p>
              <div className="row gap-6 small mt-16 accent">
                Ver respuesta <ArrowRight size={14} />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectionDetail({ id }: { id: string }) {
  const { state } = useStore();
  const o = OBJECTIONS.find((x) => x.id === id);
  if (!o)
    return (
      <div className="page">
        <Empty icon={<HelpCircle />} title="Objeción no encontrada" action={<a className="btn" href="#/objections">Volver</a>} />
      </div>
    );
  const response = o.response.replace('{ticket}', money(Math.round(state.profile.avgPrice / 6)));
  const idx = OBJECTIONS.indexOf(o);
  const next = OBJECTIONS[(idx + 1) % OBJECTIONS.length];
  return (
    <div className="page page-narrow">
      <a href="#/objections" className="btn btn-ghost btn-sm mb-16">
        <ArrowLeft /> Objeciones
      </a>
      <div className="eyebrow">{o.category}</div>
      <h1 className="display mt-8">{o.phrase}</h1>

      <div className="col gap-16 mt-32 stagger">
        <section className="card" style={{ ['--i' as string]: 0 }}>
          <div className="row gap-6 eyebrow mb-8">
            <Brain size={14} /> Qué significa realmente
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.6 }}>{o.meaning}</p>
        </section>

        <div className="grid g2" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
          <section className="card">
            <div className="row gap-6 eyebrow mb-12" style={{ color: 'var(--red)' }}>
              <Ban size={14} /> Qué NO responder
            </div>
            <ul className="col gap-6" style={{ listStyle: 'none' }}>
              {o.dont.map((d) => (
                <li key={d} className="small muted row row-top gap-6">
                  <span style={{ color: 'var(--red)' }}>✕</span> {d}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <div className="row gap-6 eyebrow mb-12" style={{ color: 'var(--blue)' }}>
              <HelpCircle size={14} /> Qué preguntar
            </div>
            <ul className="col gap-6" style={{ listStyle: 'none' }}>
              {o.ask.map((d) => (
                <li key={d} className="small row row-top gap-6">
                  <span style={{ color: 'var(--blue)' }}>?</span> {d}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="card glow" style={{ ['--i' as string]: 2 }}>
          <div className="row between">
            <div className="row gap-6 eyebrow">
              <MessageSquareQuote size={14} /> Respuesta recomendada
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(response).then(() => toast('Copiado'))}>
              <Copy /> Copiar
            </button>
          </div>
          <p className="mt-12" style={{ fontSize: 17, lineHeight: 1.6, letterSpacing: '-0.01em' }}>
            "{response}"
          </p>
        </section>

        <section className="card" style={{ ['--i' as string]: 3 }}>
          <div className="eyebrow mb-16">Ejemplo de conversación</div>
          <div className="chat">
            {o.conversation.map((c, i) => (
              <div key={i} className={`bubble ${c.who === 'tú' ? 'me' : 'owner'}`} style={{ animationDelay: `${i * 80}ms` }}>
                {c.text}
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ ['--i' as string]: 4 }}>
          <div className="row gap-6 eyebrow mb-8">
            <Target size={14} /> Cómo intentar cerrar
          </div>
          <p>{o.close}</p>
        </section>

        <div className="row between row-wrap gap-12 mt-8">
          <a href="#/coach/roleplay" className="btn btn-primary">
            <Swords /> Practicar esta objeción
          </a>
          <a href={`#/objections/${next.id}`} className="btn btn-ghost">
            Siguiente: {next.category} <ArrowRight />
          </a>
        </div>
      </div>
    </div>
  );
}
