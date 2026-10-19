import { useMemo, useState } from 'react';
import { CheckSquare, Plus } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { CheckBox, Empty, Seg } from '../components/ui';
import { KIND_COLOR } from '../components/forms';
import { KIND_LABEL, type AgendaItem } from '../data/types';
import { addDays, relDay, today } from '../lib/dates';
import { toast } from '../lib/bus';

type Filter = 'pending' | 'done' | 'all';

export default function Tasks() {
  const { state, actions } = useStore();
  const ui = useUI();
  const [filter, setFilter] = useState<Filter>('pending');
  const [quick, setQuick] = useState('');
  const t = today();

  const groups = useMemo(() => {
    const items = state.items.filter((i) => (filter === 'pending' ? i.status === 'pendiente' : filter === 'done' ? i.status === 'hecho' : i.status !== 'cancelado'));
    const prio = { alta: 0, media: 1, baja: 2 };
    const sort = (a: AgendaItem, b: AgendaItem) => ((a.date ?? '') + (a.time ?? '') < (b.date ?? '') + (b.time ?? '') ? -1 : 1) || prio[a.priority] - prio[b.priority];
    if (filter === 'done') return [{ label: 'Completadas', items: items.sort((a, b) => ((a.doneAt ?? '') < (b.doneAt ?? '') ? 1 : -1)).slice(0, 100), tone: '' }];
    return [
      { label: 'Atrasadas', items: items.filter((i) => i.date && i.date < t && i.status === 'pendiente').sort(sort), tone: 'var(--red)' },
      { label: 'Hoy', items: items.filter((i) => i.date === t).sort(sort), tone: 'var(--accent)' },
      { label: 'Mañana', items: items.filter((i) => i.date === addDays(t, 1)).sort(sort), tone: '' },
      { label: 'Próximamente', items: items.filter((i) => i.date && i.date > addDays(t, 1)).sort(sort), tone: '' },
      { label: 'Sin fecha', items: items.filter((i) => !i.date).sort(sort), tone: '' },
      ...(filter === 'all' ? [] : []),
    ].filter((g) => g.items.length);
  }, [state.items, filter, t]);

  const addQuick = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    const lower = title.toLowerCase();
    const date = /\bmañana\b/.test(lower) ? addDays(t, 1) : /\bsin fecha\b/.test(lower) ? null : t;
    const priority = /!|\burgente\b/.test(lower) ? 'alta' : 'media';
    const kind = /^llamar|llamada/.test(lower) ? 'llamada' : /reuni/.test(lower) ? 'reunion' : /seguimiento/.test(lower) ? 'seguimiento' : 'tarea';
    actions.addItem({ title: title.replace(/\s*!$/, ''), date, priority, kind });
    setQuick('');
    toast('Tarea añadida');
  };

  const total = state.items.filter((i) => i.status === 'pendiente').length;

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="h1">Tareas</h1>
          <p className="muted">{total ? `${total} pendientes` : 'Nada pendiente'}</p>
        </div>
        <div className="row gap-6">
          <Seg
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'pending', label: 'Pendientes' },
              { value: 'done', label: 'Hechas' },
              { value: 'all', label: 'Todas' },
            ]}
          />
          <button className="btn btn-primary btn-icon" onClick={() => ui.newItem({ kind: 'tarea' })} aria-label="Nueva tarea" data-tip="Nueva tarea (T)">
            <Plus />
          </button>
        </div>
      </div>

      <form onSubmit={addQuick} className="card tight row gap-12 mb-24">
        <Plus size={18} className="dim" style={{ color: 'var(--text-3)' }} />
        <input className="grow" style={{ background: 'none', border: 'none', outline: 'none', fontSize: 15, height: 32 }} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder='Añade una tarea rápida… ("Llamar a Pepe mañana", "Enviar propuesta !")' />
        {quick && (
          <button className="btn btn-sm btn-primary" type="submit">
            Añadir
          </button>
        )}
      </form>

      {groups.length === 0 ? (
        <div className="card">
          <Empty icon={<CheckSquare />} title={filter === 'done' ? 'Aún no has completado tareas' : 'Bandeja limpia'}>
            {filter === 'done' ? 'Las tareas que completes aparecerán aquí.' : 'No tienes tareas pendientes. Las llamadas y reuniones que crees en el calendario también aparecerán aquí.'}
          </Empty>
        </div>
      ) : (
        <div className="col gap-24">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="row gap-6 mb-8">
                <span className="eyebrow" style={{ color: g.tone || undefined }}>
                  {g.label}
                </span>
                <span className="tiny dim">{g.items.length}</span>
              </div>
              <div className="card" style={{ padding: '4px 16px' }}>
                <div className="list">
                  {g.items.map((i) => {
                    const p = state.prospects.find((x) => x.id === i.prospectId);
                    const done = i.status === 'hecho';
                    return (
                      <div key={i.id} className="list-row clickable" onClick={() => ui.editItem(i)}>
                        <CheckBox
                          on={done}
                          onClick={() => {
                            actions.toggleItem(i.id);
                            if (!done) toast(`Hecho: ${i.title}`, 'ok', { label: 'Deshacer', run: () => actions.toggleItem(i.id) });
                          }}
                        />
                        <div className="grow">
                          <div className={`trunc ${done ? 'done-text' : ''}`}>{i.title}</div>
                          <div className="row gap-6 tiny dim mt-4">
                            <span className="kind-dot" style={{ background: KIND_COLOR[i.kind], width: 6, height: 6 }} />
                            {KIND_LABEL[i.kind]}
                            {p && <span>· {p.business}</span>}
                            {g.label !== 'Hoy' && i.date && <span>· {relDay(i.date)}</span>}
                          </div>
                        </div>
                        {i.priority === 'alta' && !done && <span className="badge hot">Alta</span>}
                        {i.time && <span className="mono small dim">{i.time}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
