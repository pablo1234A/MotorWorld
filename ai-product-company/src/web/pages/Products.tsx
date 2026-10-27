import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Package, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { api, mediaUrl } from '../lib/api';
import { useResource } from '../lib/live';
import { Link, useRouter } from '../lib/router';
import { money } from '../lib/format';
import type { MemoryEntry, Product } from '../lib/types';
import { AgentMark, Empty, Field, Loading, PageHead, Panel, Status, Tabs, toast, useAction } from '../components/ui';

export function Products() {
  const { data, loading } = useResource<Product[]>('/api/products');
  return (
    <>
      <PageHead
        title="Product Center"
        sub="Todo el sistema trabaja alrededor del PRODUCTO ACTIVO. Cuanto más completo el perfil, mejor trabajan los agentes: lo que falte lo marcarán como hipótesis, nunca lo inventarán."
        actions={<Link to="/products/new" className="btn primary" aria-current={undefined}><Plus /> Nuevo producto</Link>}
      />
      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <Panel>
          <Empty icon={<Package />} title="Aún no hay productos">
            Crea tu primer producto con su información clave (dolores, deseos, objeciones, tono de marca…) y actívalo. Desde ese momento todos los agentes trabajarán con él.
            <div style={{ marginTop: 14 }}><Link to="/products/new" className="btn primary" aria-current={undefined}><Plus /> Crear producto</Link></div>
          </Empty>
        </Panel>
      ) : (
        <div className="product-grid">
          {data.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="panel pcard" aria-current={undefined}>
              {p.images[0] ? <img className="thumb" src={mediaUrl(p.images[0].id)} alt="" /> : <span className="thumb"><Package size={22} /></span>}
              <div className="stack gap-4 grow">
                <div className="row gap-8">
                  <b className="ellipsis grow" style={{ fontWeight: 600 }}>{p.name}</b>
                  {p.isActive && <span className="pill tone-ivory">Activo</span>}
                </div>
                <div className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || 'Sin descripción'}</div>
                <div className="row gap-8 xs faint" style={{ marginTop: 4 }}>
                  <span className="mono">{money(p.price, p.currency)}</span>
                  {p.marginPct != null && <span className="mono">· margen {p.marginPct}%</span>}
                  <span className="spacer" />
                  <Status value={p.status === 'ready' ? 'APPROVED' : p.status === 'archived' ? 'CANCELLED' : 'PENDING'} label={p.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

type Form = Omit<Product, 'id' | 'isActive' | 'margin' | 'marginPct' | 'images' | 'videos' | 'campaigns' | 'createdAt' | 'updatedAt'>;
const EMPTY: Form = {
  name: '', description: '', price: null, cost: null, currency: 'EUR', features: [], benefits: [], problemSolved: '', targetAudience: '', buyerPersona: '',
  customerDesires: [], customerPains: [], objections: [], competitors: [], competitiveAdvantages: [], differentiators: [], brandTone: '', visualStyle: '', cta: '',
  storeUrl: '', additionalInfo: '', notes: '', status: 'draft',
};

function ListEditor({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...value, draft.trim()]);
    setDraft('');
  };
  return (
    <div className="list-editor">
      {value.map((v, i) => (
        <div className="item" key={i}>
          <input className="input" value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="btn ghost icon" aria-label="Quitar" onClick={() => onChange(value.filter((_, j) => j !== i))}><X /></button>
        </div>
      ))}
      <div className="item">
        <input className="input" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn icon" aria-label="Añadir" onClick={add} disabled={!draft.trim()}><Plus /></button>
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <header><h2>{title}</h2><p>{sub}</p></header>
      <div className="form-grid">{children}</div>
    </section>
  );
}

export function ProductEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const { navigate } = useRouter();
  const { data: product, reload } = useResource<Product & { memory: MemoryEntry[] }>(isNew ? null : `/api/products/${id}`, { live: false });
  const [form, setForm] = useState<Form>(EMPTY);
  const [tab, setTab] = useState<'profile' | 'assets' | 'context' | 'memory'>('profile');
  const { busy, run } = useAction();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      const { id: _i, isActive: _a, margin: _m, marginPct: _p, images: _im, videos: _v, campaigns: _c, createdAt: _cr, updatedAt: _u, memory: _me, ...rest } = product;
      setForm(rest);
    }
  }, [product]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof Form, label: string, opts: { area?: boolean; full?: boolean; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} hint={opts.hint} className={opts.full || opts.area ? 'full' : ''}>
      {opts.area ? (
        <textarea className="textarea" value={String(form[k] ?? '')} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input className="input" value={String(form[k] ?? '')} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      )}
    </Field>
  );
  const list = (k: keyof Form, label: string, placeholder: string, hint?: string) => (
    <Field label={label} hint={hint} className="full">
      <ListEditor value={form[k] as string[]} onChange={(v) => set(k, v as never)} placeholder={placeholder} />
    </Field>
  );
  const margin = form.price != null && form.cost != null ? form.price - form.cost : null;

  const save = async () => {
    const res = await run(() => (isNew ? api.post<Product>('/api/products', form) : api.put<Product>(`/api/products/${id}`, form)), 'Producto guardado');
    if (res && isNew) navigate(`/products/${res.id}`);
    if (res && !isNew) reload();
  };

  if (!isNew && !product) return <Loading rows={10} />;

  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 14 }}>
        <Link to="/products" className="btn ghost sm" aria-current={undefined}><ArrowLeft /> Product Center</Link>
      </div>
      <PageHead
        title={isNew ? 'Nuevo producto' : form.name || 'Producto'}
        sub={product?.isActive ? 'Este es el PRODUCTO ACTIVO: todos los agentes trabajan con él ahora mismo.' : isNew ? 'Completa el perfil; podrás activarlo al guardarlo.' : 'Producto inactivo. Actívalo para que la empresa trabaje con él.'}
        actions={
          !isNew && product ? (
            <>
              {product.isActive ? (
                <button className="btn" disabled={busy} onClick={() => run(() => api.post(`/api/products/${id}/deactivate`), 'Producto desactivado').then(reload)}><Power /> Desactivar</button>
              ) : (
                <button className="btn ok" disabled={busy} onClick={() => run(() => api.post(`/api/products/${id}/activate`), 'PRODUCTO ACTIVO: todos los agentes han sido informados').then(reload)}><Power /> Activar producto</button>
              )}
              <button
                className="btn danger icon"
                aria-label="Eliminar producto"
                disabled={busy || product.isActive}
                title={product.isActive ? 'Desactívalo antes de eliminarlo' : 'Eliminar'}
                onClick={async () => {
                  if (!window.confirm(`¿Eliminar "${product.name}" y sus archivos? Esta acción es irreversible.`)) return;
                  if (await run(() => api.del(`/api/products/${id}`), 'Producto eliminado')) navigate('/products');
                }}
              >
                <Trash2 />
              </button>
            </>
          ) : null
        }
      />
      {!isNew && (
        <Tabs value={tab} onChange={setTab} items={[{ id: 'profile', label: 'Perfil' }, { id: 'assets', label: 'Imágenes y vídeos', count: (product?.images.length ?? 0) + (product?.videos.length ?? 0) }, { id: 'context', label: 'Qué recibe cada agente' }, { id: 'memory', label: 'Product memory', count: product?.memory.length }]} />
      )}

      {tab === 'profile' && (
        <>
          <Section title="Básico" sub="Nombre, estado y descripción.">
            {text('name', 'Nombre')}
            <Field label="Estado">
              <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="draft">Borrador</option><option value="ready">Listo</option><option value="paused">Pausado</option><option value="archived">Archivado</option>
              </select>
            </Field>
            {text('description', 'Descripción', { area: true })}
          </Section>
          <Section title="Economía" sub="Precio, coste y margen. EVA lo usa para ofertas; nadie inventa precios.">
            <Field label="Precio"><input className="input" type="number" min={0} step="0.01" value={form.price ?? ''} onChange={(e) => set('price', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="Coste"><input className="input" type="number" min={0} step="0.01" value={form.cost ?? ''} onChange={(e) => set('cost', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="Moneda"><input className="input" value={form.currency} maxLength={8} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></Field>
            <Field label="Margen (calculado)"><div className="input mono" style={{ display: 'flex', alignItems: 'center' }}>{margin != null ? `${money(margin, form.currency || 'EUR')} · ${form.price ? Math.round((margin / form.price) * 1000) / 10 : 0}%` : '—'}</div></Field>
          </Section>
          <Section title="Producto" sub="Qué es, qué hace y por qué es distinto.">
            {list('features', 'Características', 'Añadir característica')}
            {list('benefits', 'Beneficios', 'Añadir beneficio (resultado para el cliente)')}
            {text('problemSolved', 'Problema que resuelve', { area: true })}
            {list('competitiveAdvantages', 'Ventajas competitivas', 'Añadir ventaja')}
            {list('differentiators', 'Diferenciadores', 'Añadir diferenciador', 'Lo que se ve imposible o sorprendente en cámara')}
          </Section>
          <Section title="Cliente" sub="El corazón de los hooks y del CRO.">
            {text('targetAudience', 'Público objetivo', { full: true })}
            {text('buyerPersona', 'Buyer persona', { area: true })}
            {list('customerPains', 'Dolores del cliente', 'Añadir dolor')}
            {list('customerDesires', 'Deseos del cliente', 'Añadir deseo')}
            {list('objections', 'Objeciones', 'Añadir objeción')}
          </Section>
          <Section title="Mercado" sub="Competidores conocidos (solo los que tú indiques).">
            {list('competitors', 'Competidores', 'Añadir competidor')}
          </Section>
          <Section title="Marca" sub="Tono, estilo visual y CTA que usarán vídeos y tienda.">
            {text('brandTone', 'Tono de marca')}
            {text('cta', 'CTA')}
            {text('visualStyle', 'Estilo visual', { area: true })}
          </Section>
          <Section title="Tienda e información extra" sub="EVA analiza la URL pública de la página de producto.">
            {text('storeUrl', 'URL de la tienda / página de producto', { full: true, placeholder: 'https://tu-tienda.com/products/…' })}
            {text('additionalInfo', 'Información adicional', { area: true })}
            {text('notes', 'Notas internas', { area: true })}
          </Section>
          <div className="sticky-actions">
            <button className="btn primary" onClick={save} disabled={busy || !form.name.trim()}><Save /> {busy ? 'Guardando…' : 'Guardar producto'}</button>
          </div>
        </>
      )}

      {tab === 'assets' && product && (
        <Panel title="Material del producto">
          <p className="muted small" style={{ marginBottom: 14 }}>REX usa la primera imagen en la producción (push-in sobre el producto real). PNG, JPG, WEBP, MP4, MOV o WEBM.</p>
          <div className="assets">
            {[...product.images, ...product.videos].map((a) => (
              <div key={a.id} className="asset">
                {a.kind === 'image' ? <img src={mediaUrl(a.id)} alt={a.originalName} /> : <video src={mediaUrl(a.id)} muted />}
                <button className="btn sm icon danger" aria-label="Eliminar archivo" onClick={() => run(() => api.del(`/api/products/${id}/assets/${a.id}`), 'Archivo eliminado').then(reload)}><X /></button>
              </div>
            ))}
            <button className="dropzone" onClick={() => fileRef.current?.click()} disabled={busy}>
              <span className="stack gap-4" style={{ alignItems: 'center' }}><ImagePlus size={18} />{busy ? 'Subiendo…' : 'Subir archivos'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length && (await run(() => api.upload(`/api/products/${id}/assets`, files)))) {
                  toast(`${files.length} archivo(s) subido(s)`);
                  reload();
                }
              }}
            />
          </div>
        </Panel>
      )}

      {tab === 'context' && product && <ContextPreview id={id} />}

      {tab === 'memory' && product && (
        <Panel title="Product memory" flush>
          {product.memory.length ? (
            product.memory.map((m) => (
              <div key={m.id} className="feed-item" style={{ gridTemplateColumns: '30px 1fr' }}>
                <AgentMark id={m.author} size={26} />
                <div className="t"><b>{m.title}</b> <span className="chip">{m.kind}</span><p className="muted small" style={{ marginTop: 4 }}>{m.content}</p></div>
              </div>
            ))
          ) : (
            <Empty title="Sin memoria de producto todavía">Los insights de NOVA, las creatividades aprobadas y los análisis de IRIS se guardan aquí.</Empty>
          )}
        </Panel>
      )}
    </>
  );
}

function ContextPreview({ id }: { id: string }) {
  const { data } = useResource<{ agentId: string; fields: string[]; missing: string[]; text: string }[]>(`/api/products/${id}/context`, { live: false });
  const [agent, setAgent] = useState('NOVA');
  if (!data) return <Loading />;
  const cur = data.find((d) => d.agentId === agent)!;
  return (
    <Panel title="Product context propagation">
      <p className="muted small" style={{ marginBottom: 14 }}>Cada agente recibe automáticamente solo la información necesaria para su función. Esto es exactamente lo que verá en su próxima tarea.</p>
      <div className="row gap-6 wrap" style={{ marginBottom: 14 }}>
        {data.map((d) => (
          <button key={d.agentId} className={`btn sm ${agent === d.agentId ? 'primary' : ''}`} onClick={() => setAgent(d.agentId)}>
            {d.agentId}
            {d.missing.length > 0 && <span className="mono xs" style={{ opacity: 0.7 }}>· {d.missing.length} vacíos</span>}
          </button>
        ))}
      </div>
      <pre className="json" style={{ maxHeight: 520 }}>{cur.text}</pre>
    </Panel>
  );
}
