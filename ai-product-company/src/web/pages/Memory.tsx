import { useState } from 'react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { ago } from '../lib/format';
import type { MemoryEntry } from '../lib/types';
import { AgentMark, Empty, Field, Loading, PageHead, Panel, Sheet, Tabs, useAction } from '../components/ui';
import { useSnapshot } from '../components/Shell';

const SCOPES = [
  { id: 'global', label: 'Global', help: 'Decisiones y reglas de toda la empresa (ATLAS las conoce).' },
  { id: 'product', label: 'Product', help: 'Conocimiento sobre un producto concreto.' },
  { id: 'brand', label: 'Brand', help: 'Voz y aprendizajes visuales de la marca del producto.' },
  { id: 'agent', label: 'Agent', help: 'Lecciones propias de cada agente (p. ej. feedback de QA).' },
  { id: 'task', label: 'Task', help: 'Notas de trabajo de una tarea.' },
  { id: 'campaign', label: 'Campaign', help: 'Aprendizajes de campaña.' },
  { id: 'video', label: 'Video', help: 'Historia y feedback de cada vídeo.' },
] as const;

export function Memory() {
  const [scope, setScope] = useState<string>('global');
  const { data } = useResource<MemoryEntry[]>(`/api/memory?scope=${scope}`);
  const { snap } = useSnapshot();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ scope: 'global', scopeId: 'company', kind: 'preference', title: '', content: '', importance: 4 });
  const help = SCOPES.find((s) => s.id === scope)!.help;

  const scopeIdOptions = () => {
    if (form.scope === 'global') return [{ v: 'company', l: 'Empresa' }];
    if (form.scope === 'agent') return (snap?.agents ?? []).map((a) => ({ v: a.id, l: a.id }));
    if (form.scope === 'product' || form.scope === 'brand') return snap?.activeProduct ? [{ v: snap.activeProduct.id, l: snap.activeProduct.name }] : [];
    return [];
  };

  return (
    <>
      <PageHead
        title="Memoria"
        sub="La memoria está separada por ámbitos y nunca se mezcla: cada agente solo recupera los ámbitos que necesita para su función, ligados al producto, campaña o vídeo en curso."
        actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus /> Añadir memoria</button>}
      />
      <Tabs value={scope} onChange={setScope} items={SCOPES.map((s) => ({ id: s.id, label: s.label }))} />
      <p className="muted small" style={{ marginBottom: 14 }}>{help}</p>
      {!data ? <Loading /> : data.length === 0 ? (
        <Panel><Empty icon={<Brain />} title="Sin recuerdos en este ámbito">Los agentes escriben aquí mientras trabajan; tú también puedes dejar instrucciones duraderas.</Empty></Panel>
      ) : (
        <Panel flush>
          {data.map((m) => (
            <div key={m.id} className="feed-item" style={{ gridTemplateColumns: '30px 1fr auto' }}>
              <AgentMark id={m.author} size={26} />
              <div className="t">
                <div className="row gap-6 wrap"><b>{m.title}</b><span className="chip">{m.kind}</span><span className="chip">{m.scope}/{m.scopeId}</span>{m.importance >= 4 && <span className="chip">importancia {m.importance}</span>}</div>
                <p className="muted small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                <span className="xs faint">{m.author} · {ago(m.createdAt)}</span>
              </div>
              <button className="btn ghost sm icon" aria-label="Borrar recuerdo" onClick={() => window.confirm('¿Borrar este recuerdo?') && run(() => api.del(`/api/memory/${m.id}`), 'Recuerdo borrado')}><Trash2 /></button>
            </div>
          ))}
        </Panel>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Añadir memoria">
        <div className="stack gap-12">
          <div className="grid-2">
            <Field label="Ámbito">
              <select className="select" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, scopeId: e.target.value === 'global' ? 'company' : '' })}>
                {SCOPES.filter((s) => ['global', 'product', 'brand', 'agent'].includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Para">
              <select className="select" value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })}>
                <option value="" disabled>Elegir…</option>
                {scopeIdOptions().map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {['preference', 'decision', 'fact', 'insight', 'lesson', 'note'].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Importancia (1-5)">
              <input className="input" type="number" min={1} max={5} value={form.importance} onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Título"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Contenido"><textarea className="textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          <div className="row gap-8"><span className="spacer" />
            <button className="btn primary" disabled={busy || !form.title.trim() || !form.content.trim() || !form.scopeId} onClick={async () => { if (await run(() => api.post('/api/memory', form), 'Guardado en memoria')) { setOpen(false); setScope(form.scope); } }}>Guardar</button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
