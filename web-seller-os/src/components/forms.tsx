import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Field, Modal, confirmDialog } from './ui';
import { useStore } from '../data/store';
import type { AgendaItem, Channel, Prospect, Stage } from '../data/types';
import {
  CHANNEL_LABEL,
  ITEM_KINDS,
  KIND_LABEL,
  PRIORITY_LABEL,
  SIZE_LABEL,
  SOURCE_LABEL,
  STAGES,
  STAGE_LABEL,
  WEB_STATUS_LABEL,
} from '../data/types';
import { SECTORS } from '../data/defaults';
import { today } from '../lib/dates';
import { toast } from '../lib/bus';

export const KIND_COLOR: Record<string, string> = {
  llamada: 'var(--blue)',
  reunion: 'var(--pink)',
  seguimiento: 'var(--orange)',
  tarea: 'var(--text-2)',
  demo: 'var(--violet)',
  entrega: 'var(--green)',
  recordatorio: 'var(--yellow)',
};

export function StagePill({ stage, onClick }: { stage: Stage; onClick?: () => void }) {
  if (onClick)
    return (
      <button className={`stage-pill st-${stage}`} onClick={onClick}>
        {STAGE_LABEL[stage]}
      </button>
    );
  return <span className={`stage-pill st-${stage}`}>{STAGE_LABEL[stage]}</span>;
}

/* ───────── Prospecto ───────── */
export function ProspectModal({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Partial<Prospect>; onSaved?: (p: Prospect) => void }) {
  const { state, actions } = useStore();
  const editing = !!initial?.id;
  const blank: Partial<Prospect> = { business: '', contactName: '', phone: '', email: '', instagram: '', website: '', city: state.profile.market, sector: state.profile.targetSectors[0] ?? '', size: '', webStatus: 'desconocido', source: 'google_maps', stage: 'nuevo', value: 0, notes: '' };
  const [f, setF] = useState<Partial<Prospect>>(blank);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ ...blank, ...(initial ?? {}) });
      setMore(!!initial?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = <K extends keyof Prospect>(k: K, v: Prospect[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = () => {
    if (!f.business?.trim()) return toast('Añade al menos el nombre del negocio', 'warn');
    if (editing) {
      const { stage, ...rest } = f;
      actions.updateProspect(initial!.id!, rest);
      if (stage && stage !== state.prospects.find((p) => p.id === initial!.id)?.stage) actions.setStage(initial!.id!, stage);
      toast('Prospecto actualizado');
      onClose();
    } else {
      const p = actions.addProspect({ ...f, business: f.business.trim(), value: Number(f.value) || 0 });
      toast(`${p.business} añadido`);
      onSaved?.(p);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar prospecto' : 'Nuevo prospecto'}
      subtitle={editing ? undefined : 'Solo el nombre es obligatorio. Completa el resto cuando lo investigues.'}
      wide
      footer={
        <>
          {!more && (
            <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => setMore(true)}>
              Más campos
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save}>
            {editing ? 'Guardar' : 'Añadir prospecto'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid g2"
      >
        <Field label="Negocio *">
          <input className="input" autoFocus value={f.business ?? ''} onChange={(e) => set('business', e.target.value)} placeholder="Restaurante La Brasa" />
        </Field>
        <Field label="Sector">
          <input className="input" list="sectors" value={f.sector ?? ''} onChange={(e) => set('sector', e.target.value)} placeholder="Restaurante" />
          <datalist id="sectors">
            {SECTORS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Ciudad">
          <input className="input" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Madrid" />
        </Field>
        <Field label="Web actual">
          <input className="input" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="labrasa.es (vacío si no tiene)" inputMode="url" />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="600 000 000" inputMode="tel" />
        </Field>
        <Field label="Instagram">
          <input className="input" value={f.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="@labrasa" />
        </Field>
        <Field label="Estado de su web">
          <select className="select" value={f.webStatus} onChange={(e) => set('webStatus', e.target.value as Prospect['webStatus'])}>
            {Object.entries(WEB_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuente">
          <select className="select" value={f.source} onChange={(e) => set('source', e.target.value as Prospect['source'])}>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {more && (
          <>
            <Field label="Persona de contacto">
              <input className="input" value={f.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} placeholder="Carmen López" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="hola@labrasa.es" />
            </Field>
            <Field label="Tamaño">
              <select className="select" value={f.size} onChange={(e) => set('size', e.target.value as Prospect['size'])}>
                <option value="">Sin definir</option>
                {Object.entries(SIZE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select className="select" value={f.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor potencial (€)" help={`Si lo dejas en 0 se usa tu precio medio (${state.profile.avgPrice} €).`}>
              <input className="input" type="number" min={0} step={50} value={f.value || ''} onChange={(e) => set('value', Number(e.target.value))} placeholder={String(state.profile.avgPrice)} />
            </Field>
            <Field label="Probabilidad de cierre (%)" help="Vacío = automática según la etapa.">
              <input className="input" type="number" min={0} max={100} value={f.probability ?? ''} onChange={(e) => set('probability', e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))))} placeholder="auto" />
            </Field>
            <Field label="Notas" className="span2">
              <textarea className="textarea" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Lo que sepas del negocio, del dueño, horarios para llamar…" />
            </Field>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ───────── Evento / tarea ───────── */
export function ItemModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<AgendaItem> }) {
  const { state, actions } = useStore();
  const editing = !!initial?.id;
  const [f, setF] = useState<Partial<AgendaItem>>({});
  useEffect(() => {
    if (open) setF({ kind: 'tarea', title: '', date: today(), time: null, duration: 30, prospectId: null, notes: '', priority: 'media', status: 'pendiente', ...(initial ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = <K extends keyof AgendaItem>(k: K, v: AgendaItem[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = () => {
    let title = f.title?.trim();
    const p = state.prospects.find((x) => x.id === f.prospectId);
    if (!title && p) title = `${KIND_LABEL[f.kind as AgendaItem['kind']]} · ${p.business}`;
    if (!title) return toast('Ponle un título', 'warn');
    if (editing) {
      const id = initial!.id!;
      const was = initial!.status;
      // el cambio a/desde "hecho" pasa por toggleItem para registrar (o deshacer) la actividad real
      actions.updateItem(id, { ...f, title, status: was === 'hecho' || f.status === 'hecho' ? was : f.status });
      if ((f.status === 'hecho') !== (was === 'hecho')) {
        actions.toggleItem(id);
        if (f.status === 'cancelado') actions.updateItem(id, { status: 'cancelado' });
      }
      toast('Guardado');
    } else {
      actions.addItem({ ...f, title });
      toast(f.date ? `${KIND_LABEL[f.kind as AgendaItem['kind']]} creada para ${f.date === today() ? 'hoy' : f.date}` : 'Tarea creada');
    }
    onClose();
  };
  const remove = async () => {
    if (await confirmDialog({ title: '¿Eliminar este elemento?', confirm: 'Eliminar', danger: true })) {
      actions.deleteItem(initial!.id!);
      onClose();
    }
  };

  const sorted = [...state.prospects].filter((p) => p.stage !== 'perdido').sort((a, b) => a.business.localeCompare(b.business));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar' : 'Nuevo evento o tarea'}
      footer={
        <>
          {editing && (
            <button className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>
              <Trash2 /> Eliminar
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save}>
            {editing ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="col gap-16"
      >
        <div className="chips">
          {ITEM_KINDS.map((k) => (
            <button type="button" key={k} className={`chip ${f.kind === k ? 'on' : ''}`} onClick={() => set('kind', k)}>
              <span className="kind-dot" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <Field label="Título">
          <input className="input" autoFocus value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder={f.prospectId ? 'Opcional: se usará el nombre del cliente' : 'Llamar a…'} />
        </Field>
        <div className="grid g3">
          <Field label="Fecha">
            <input className="input" type="date" value={f.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
          </Field>
          <Field label="Hora">
            <input className="input" type="time" value={f.time ?? ''} onChange={(e) => set('time', e.target.value || null)} />
          </Field>
          <Field label="Duración">
            <select className="select" value={f.duration} onChange={(e) => set('duration', Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid g3">
          <Field label="Cliente" className="span2">
            <select className="select" value={f.prospectId ?? ''} onChange={(e) => set('prospectId', e.target.value || null)}>
              <option value="">Sin cliente</option>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.business}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value as AgendaItem['priority'])}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {editing && (
          <Field label="Estado">
            <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as AgendaItem['status'])}>
              <option value="pendiente">Pendiente</option>
              <option value="hecho">Hecho</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </Field>
        )}
        <Field label="Notas">
          <textarea className="textarea" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Objetivo de la llamada, qué preparar…" style={{ minHeight: 70 }} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ───────── Registrar contacto ───────── */
export function TouchModal({ prospect, onClose }: { prospect: Prospect | null; onClose: () => void }) {
  const { state, actions } = useStore();
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (prospect) {
      setNote('');
      setChannel(prospect.phone ? 'whatsapp' : prospect.instagram ? 'instagram' : prospect.email ? 'email' : 'llamada');
    }
  }, [prospect]);
  if (!prospect) return null;
  const first = !prospect.firstContact;
  const seq = state.settings.sequence;
  const submit = (replied: boolean) => {
    actions.logTouch(prospect.id, channel, note);
    if (replied) actions.logReply(prospect.id, 'Respondió');
    toast(first ? `Primer contacto con ${prospect.business} registrado` : `Seguimiento a ${prospect.business} registrado`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={first ? 'Registrar primer contacto' : 'Registrar seguimiento'}
      subtitle={`${prospect.business}${first ? ` · se programará la secuencia: día ${seq.slice(1).join(', día ')}` : ''}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          {!first && (
            <button className="btn" onClick={() => submit(true)}>
              Contactado y respondió
            </button>
          )}
          <button className="btn btn-primary" onClick={() => submit(false)}>
            Registrar
          </button>
        </>
      }
    >
      <div className="col gap-16">
        <div>
          <div className="label mb-8">Canal</div>
          <div className="chips">
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
              <button key={c} className={`chip ${channel === c ? 'on' : ''}`} onClick={() => setChannel(c)}>
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Nota (opcional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué dijiste o qué pasó" onKeyDown={(e) => e.key === 'Enter' && submit(false)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ───────── Ganado / perdido ───────── */
export function CloseModal({ prospect, mode, onClose }: { prospect: Prospect | null; mode: 'ganado' | 'perdido'; onClose: () => void }) {
  const { state, actions } = useStore();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (prospect) {
      setAmount(prospect.value || state.profile.avgPrice);
      setReason(prospect.lostReason || '');
    }
  }, [prospect, state.profile.avgPrice]);
  if (!prospect) return null;
  const REASONS = ['Precio', 'No responde', 'Ya tiene proveedor', 'No es el momento', 'Lo hace un conocido', 'No le ve valor', 'Otro'];
  const save = () => {
    if (mode === 'ganado') {
      actions.setStage(prospect.id, 'ganado', { amount: Number(amount) || 0 });
      toast(`¡Venta cerrada con ${prospect.business}! 🎉`);
    } else {
      actions.setStage(prospect.id, 'perdido', { reason });
      toast(`${prospect.business} marcado como perdido`, 'info');
    }
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'ganado' ? '¡Venta cerrada!' : 'Marcar como perdido'}
      subtitle={prospect.business}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className={`btn ${mode === 'ganado' ? 'btn-primary' : 'btn-danger'}`} onClick={save}>
            {mode === 'ganado' ? 'Registrar venta' : 'Marcar perdido'}
          </button>
        </>
      }
    >
      {mode === 'ganado' ? (
        <Field label="Importe cerrado (€)" help="Se usará para tus ingresos y ticket medio reales.">
          <input className="input input-lg" type="number" min={0} step={50} autoFocus value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
      ) : (
        <div className="col gap-12">
          <div className="label">¿Por qué se ha perdido? Aprender de esto es lo que te hace mejor.</div>
          <div className="chips">
            {REASONS.map((r) => (
              <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
