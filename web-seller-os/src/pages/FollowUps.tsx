import { useState } from 'react';
import { Check, Clock, MessageCircle, MessageSquareText, Plus, Repeat, Settings2, X } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Empty, Modal } from '../components/ui';
import { StagePill } from '../components/forms';
import type { Prospect } from '../data/types';
import { addDays, diffDays, relDay, today } from '../lib/dates';
import { followUpBuckets, sequenceLabel } from '../lib/insights';
import { generateMessages } from '../lib/messages';
import { navigate } from '../lib/router';
import { waLink } from '../lib/format';
import { toast } from '../lib/bus';

export default function FollowUps() {
  const { state } = useStore();
  const fu = followUpBuckets(state);
  const [editSeq, setEditSeq] = useState(false);
  const total = fu.overdue.length + fu.today.length;
  const noFollowUp = state.prospects.filter((p) => ['contactado', 'respondio', 'reunion', 'propuesta', 'negociacion'].includes(p.stage) && !p.nextFollowUp);

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <div className="eyebrow">Follow-up center</div>
          <h1 className="h1 mt-4">{total ? `${total} seguimientos por hacer` : 'Seguimientos al día'}</h1>
          <p className="muted">La mayoría de ventas llegan entre el 2º y el 5º contacto. Aquí no se escapa ninguno.</p>
        </div>
        <button className="btn" onClick={() => setEditSeq(true)}>
          <Settings2 /> Secuencia: día {state.settings.sequence.join(' → ')}
        </button>
      </div>

      {state.prospects.length === 0 ? (
        <div className="card">
          <Empty icon={<Repeat />} title="Sin seguimientos todavía" action={<a className="btn btn-primary" href="#/prospecting?add=1"><Plus /> Añadir prospectos</a>}>
            Cuando registres el primer contacto con un prospecto, la secuencia de seguimiento se programa sola.
          </Empty>
        </div>
      ) : (
        <div className="col gap-24">
          <Bucket title="🔴 Atrasados" list={fu.overdue} tone="var(--red)" empty="Ningún seguimiento atrasado. Así se hace." />
          <Bucket title="🟠 Para hoy" list={fu.today} tone="var(--orange)" empty="Nada para hoy." />
          <Bucket title="🟢 Próximos" list={fu.upcoming.slice(0, 30)} tone="var(--green)" empty="No hay seguimientos programados." upcoming />
          {noFollowUp.length > 0 && (
            <section>
              <div className="eyebrow mb-8">⚪ Activos sin seguimiento programado</div>
              <div className="card" style={{ padding: '4px 16px' }}>
                <div className="list">
                  {noFollowUp.map((p) => (
                    <div key={p.id} className="list-row clickable" onClick={() => navigate(`#/prospects/${p.id}`)}>
                      <div className="grow">
                        <div className="strong trunc">{p.business}</div>
                        <div className="tiny dim">Último contacto {relDay(p.lastContact).toLowerCase()}</div>
                      </div>
                      <StagePill stage={p.stage} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
      {editSeq && <SequenceModal onClose={() => setEditSeq(false)} />}
    </div>
  );
}

function Bucket({ title, list, tone, empty, upcoming }: { title: string; list: Prospect[]; tone: string; empty: string; upcoming?: boolean }) {
  return (
    <section>
      <div className="row gap-6 mb-8">
        <span className="eyebrow" style={{ color: tone }}>
          {title}
        </span>
        <span className="tiny dim">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="card tight small dim">{empty}</div>
      ) : (
        <div className="col gap-6">
          {list.map((p) => (
            <FollowRow key={p.id} p={p} upcoming={upcoming} />
          ))}
        </div>
      )}
    </section>
  );
}

function FollowRow({ p, upcoming }: { p: Prospect; upcoming?: boolean }) {
  const { state, actions } = useStore();
  const ui = useUI();
  const t = today();
  const late = p.nextFollowUp! < t ? diffDays(p.nextFollowUp!, t) : 0;
  const msg = generateMessages({ channel: 'seguimiento', goal: 'abrir', business: p.business, sector: p.sector, city: p.city, problem: p.problems[0] ?? '', owner: p.contactName, me: state.profile.name })[0].body;
  const snooze = (n: number) => {
    actions.setNextFollowUp(p.id, addDays(t, n));
    toast(`${p.business} pospuesto ${n === 1 ? 'a mañana' : `${n} días`}`, 'info');
  };
  return (
    <div className="card tight hover">
      <div className="row gap-12 row-wrap">
        <div className="grow" style={{ minWidth: 200, cursor: 'pointer' }} onClick={() => navigate(`#/prospects/${p.id}`)}>
          <div className="row gap-6">
            <span className="strong trunc">{p.business}</span>
            <StagePill stage={p.stage} />
          </div>
          <div className="tiny dim mt-4">
            {sequenceLabel(p, state.settings.sequence)} · último contacto {relDay(p.lastContact).toLowerCase()}
            {late > 0 && <span style={{ color: 'var(--red)' }}> · {late} {late === 1 ? 'día' : 'días'} de retraso</span>}
            {upcoming && <span> · {relDay(p.nextFollowUp)}</span>}
          </div>
        </div>
        <div className="row gap-4">
          {!upcoming && p.phone && (
            <a className="btn btn-sm btn-icon" href={waLink(p.phone, msg)} target="_blank" rel="noreferrer" data-tip="WhatsApp con mensaje">
              <MessageCircle />
            </a>
          )}
          <a className="btn btn-sm btn-icon" href={`#/messages?prospect=${p.id}&channel=seguimiento`} data-tip="Generar mensaje">
            <MessageSquareText />
          </a>
          <button className="btn btn-sm btn-icon" onClick={() => snooze(upcoming ? 7 : 1)} data-tip={upcoming ? 'Posponer 7 días' : 'Posponer a mañana'}>
            <Clock />
          </button>
          <button className="btn btn-sm btn-icon" onClick={() => ui.closeDeal(p, 'perdido')} data-tip="Marcar perdido">
            <X />
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => ui.logTouch(p)}>
            <Check /> Hecho
          </button>
        </div>
      </div>
    </div>
  );
}

function SequenceModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useStore();
  const [seq, setSeq] = useState<number[]>(state.settings.sequence);
  const valid = seq.every((d, i) => i === 0 || d > seq[i - 1]);
  const labels = ['Primer contacto', 'Seguimiento', 'Segundo seguimiento', 'Tercer seguimiento', 'Cuarto seguimiento', 'Quinto seguimiento'];
  return (
    <Modal
      open
      onClose={onClose}
      title="Secuencia de seguimiento"
      subtitle="Días desde el primer contacto. Se aplica a los próximos seguimientos que registres."
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setSeq([0, 2, 5, 10])} style={{ marginRight: 'auto' }}>
            Restablecer
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              actions.updateSettings({ sequence: seq });
              toast('Secuencia guardada');
              onClose();
            }}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="col gap-12">
        {seq.map((d, i) => (
          <div key={i} className="row gap-12">
            <span className="mono small dim" style={{ width: 24 }}>
              {i + 1}
            </span>
            <span className="grow small">{i === seq.length - 1 && i > 0 ? 'Último seguimiento' : labels[i]}</span>
            <span className="small dim">Día</span>
            <input className="input" type="number" min={0} style={{ width: 80 }} value={d} disabled={i === 0} onChange={(e) => setSeq(seq.map((x, j) => (j === i ? Math.max(0, Number(e.target.value)) : x)))} />
            {i > 1 ? (
              <button className="icon-btn" onClick={() => setSeq(seq.filter((_, j) => j !== i))} aria-label="Quitar paso">
                <X size={16} />
              </button>
            ) : (
              <span style={{ width: 34 }} />
            )}
          </div>
        ))}
        {seq.length < 6 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSeq([...seq, seq[seq.length - 1] + 5])}>
            <Plus /> Añadir paso
          </button>
        )}
        {!valid && <div className="small" style={{ color: 'var(--red)' }}>Cada paso debe ser posterior al anterior.</div>}
      </div>
    </Modal>
  );
}
