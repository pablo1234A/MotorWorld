import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Copy, Plus, Search, Star, Trash2, PackagePlus } from 'lucide-react';
import { useStore } from '../data/store';
import { Empty, Field, Modal, confirmDialog } from '../components/ui';
import { RESOURCE_LABEL, type Resource, type ResourceKind } from '../data/types';
import { matches } from '../lib/format';
import { clearQuery, useRoute } from '../lib/router';
import { toast } from '../lib/bus';
import { STARTER_RESOURCES } from '../content/starterResources';

export default function Resources() {
  const { state, actions } = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ResourceKind | 'fav' | ''>('');
  const [editing, setEditing] = useState<Partial<Resource> | null>(null);

  useEffect(() => {
    const id = route.query.get('open');
    if (id) {
      const r = state.resources.find((x) => x.id === id);
      if (r) setEditing(r);
      clearQuery();
    }
  }, [route.query, state.resources]);

  const list = useMemo(
    () =>
      state.resources
        .filter((r) => (kind === 'fav' ? r.favorite : !kind || r.kind === kind) && matches(`${r.title} ${r.body} ${r.tags.join(' ')}`, q))
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (a.updatedAt < b.updatedAt ? 1 : -1)),
    [state.resources, kind, q],
  );
  const kinds = Object.keys(RESOURCE_LABEL) as ResourceKind[];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Recursos</h1>
          <p className="muted">Tu biblioteca de guiones, mensajes, prompts, técnicas e ideas que funcionan.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ kind: 'nota' })}>
          <Plus /> Nuevo recurso
        </button>
      </div>

      {state.resources.length === 0 ? (
        <div className="card">
          <Empty
            icon={<BookOpen />}
            title="Tu biblioteca está vacía"
            action={
              <div className="row gap-6 row-wrap" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setEditing({ kind: 'guion' })}>
                  <Plus /> Crear el primero
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    actions.addResources(STARTER_RESOURCES);
                    toast(`${STARTER_RESOURCES.length} plantillas importadas`);
                  }}
                >
                  <PackagePlus /> Importar pack inicial ({STARTER_RESOURCES.length})
                </button>
              </div>
            }
          >
            Guarda aquí lo que te funciona. También puedes guardar mensajes directamente desde el generador.
          </Empty>
        </div>
      ) : (
        <>
          <div className="row row-wrap gap-6 mb-16">
            <div className="input-icon grow" style={{ minWidth: 200, maxWidth: 360 }}>
              <Search />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en recursos…" />
            </div>
          </div>
          <div className="chips mb-24">
            <button className={`chip ${kind === '' ? 'on' : ''}`} onClick={() => setKind('')}>
              Todos
            </button>
            <button className={`chip ${kind === 'fav' ? 'on' : ''}`} onClick={() => setKind('fav')}>
              <Star /> Favoritos
            </button>
            {kinds
              .filter((k) => state.resources.some((r) => r.kind === k))
              .map((k) => (
                <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                  {RESOURCE_LABEL[k]}
                </button>
              ))}
          </div>
          {list.length === 0 ? (
            <Empty icon={<Search />} title="Sin resultados" />
          ) : (
            <div className="grid g-auto stagger" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {list.map((r, i) => (
                <div key={r.id} className="card hover" style={{ ['--i' as string]: Math.min(i, 12), cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => setEditing(r)}>
                  <div className="row between">
                    <span className="badge">{RESOURCE_LABEL[r.kind]}</span>
                    <div className="row gap-4">
                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28 }}
                        aria-label="Copiar"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(r.body).then(() => toast('Copiado'));
                        }}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28, color: r.favorite ? 'var(--yellow)' : undefined }}
                        aria-label={r.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.updateResource(r.id, { favorite: !r.favorite });
                        }}
                      >
                        <Star size={15} fill={r.favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                  <div className="h3 mt-12">{r.title || 'Sin título'}</div>
                  <p className="small muted mt-8 prewrap" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {r.body}
                  </p>
                  {r.tags.length > 0 && (
                    <div className="row gap-4 row-wrap mt-12" style={{ marginTop: 'auto', paddingTop: 12 }}>
                      {r.tags.map((t) => (
                        <span key={t} className="tiny dim">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {editing && <ResourceModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ResourceModal({ initial, onClose }: { initial: Partial<Resource>; onClose: () => void }) {
  const { actions } = useStore();
  const [r, setR] = useState<Partial<Resource>>({ kind: 'nota', title: '', body: '', tags: [], ...initial });
  const [tags, setTags] = useState((initial.tags ?? []).join(', '));
  const editing = !!initial.id;
  const save = () => {
    if (!r.title?.trim() && !r.body?.trim()) return toast('Escribe algo', 'warn');
    const data = { ...r, title: r.title?.trim() || r.body!.slice(0, 40), tags: tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) };
    if (editing) actions.updateResource(initial.id!, data);
    else actions.addResource(data);
    toast('Guardado');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={editing ? 'Editar recurso' : 'Nuevo recurso'}
      footer={
        <>
          {editing && (
            <button
              className="btn btn-ghost btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (await confirmDialog({ title: '¿Eliminar recurso?', confirm: 'Eliminar', danger: true })) {
                  actions.deleteResource(initial.id!);
                  onClose();
                }
              }}
            >
              <Trash2 /> Eliminar
            </button>
          )}
          {editing && (
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(r.body ?? '').then(() => toast('Copiado'))}>
              <Copy /> Copiar
            </button>
          )}
          <button className="btn btn-primary" onClick={save}>
            Guardar
          </button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="chips">
          {(Object.keys(RESOURCE_LABEL) as ResourceKind[]).map((k) => (
            <button key={k} className={`chip ${r.kind === k ? 'on' : ''}`} onClick={() => setR({ ...r, kind: k })}>
              {RESOURCE_LABEL[k]}
            </button>
          ))}
        </div>
        <Field label="Título">
          <input className="input" autoFocus={!editing} value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} />
        </Field>
        <Field label="Contenido">
          <textarea className="textarea" style={{ minHeight: 220 }} value={r.body} onChange={(e) => setR({ ...r, body: e.target.value })} />
        </Field>
        <Field label="Etiquetas" help="Separadas por comas">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="llamada, restaurantes" />
        </Field>
      </div>
    </Modal>
  );
}
