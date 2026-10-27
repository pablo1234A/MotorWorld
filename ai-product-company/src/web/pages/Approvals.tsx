import { useState } from 'react';
import { Check, MessageSquareWarning, ShieldCheck, X } from 'lucide-react';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import { Link } from '../lib/router';
import { ago, dateTime } from '../lib/format';
import type { Approval } from '../lib/types';
import { AgentName, Empty, Field, Loading, PageHead, Panel, Status, Tabs, useAction } from '../components/ui';

const KIND: Record<string, string> = {
  store_change: 'Cambio de tienda',
  video_max_revisions: 'Vídeo: máximo de revisiones',
  strategic_objective: 'Decisión estratégica',
  integration_action: 'Acción en servicio externo',
};

function ApprovalItem({ a }: { a: Approval }) {
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<'NEO' | 'REX' | 'MAX'>('MAX');
  const { busy, run } = useAction();
  const decide = (decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES') =>
    run(() => api.post(`/api/approvals/${a.id}/resolve`, { decision, note, target: a.kind === 'video_max_revisions' ? target : undefined }), decision === 'APPROVE' ? 'Aprobado' : decision === 'REJECT' ? 'Rechazado' : 'Cambios solicitados');
  return (
    <Panel>
      <div className="stack gap-12">
        <div className="row gap-8 wrap">
          <Status value={a.risk} label={`${a.risk} risk`} />
          <span className="chip">{KIND[a.kind] ?? a.kind}</span>
          <span className="small faint">solicitado por</span>
          <AgentName id={a.requestedBy} />
          <span className="spacer" />
          <span className="xs faint">{ago(a.createdAt)}</span>
        </div>
        <h3 style={{ fontSize: 16 }}>{a.title}</h3>
        <p className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{a.description}</p>
        {a.kind === 'video_max_revisions' && typeof a.payload.videoId === 'string' && (
          <Link to={`/deliveries?video=${a.payload.videoId}`} className="btn sm" aria-current={undefined} style={{ alignSelf: 'flex-start' }}>Ver el vídeo antes de decidir</Link>
        )}
        {a.status === 'PENDING' ? (
          <>
            <div className={a.kind === 'video_max_revisions' ? 'grid-2' : ''}>
              <Field label="Nota para el equipo (opcional)">
                <textarea className="textarea" style={{ minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instrucciones o motivo de tu decisión" />
              </Field>
              {a.kind === 'video_max_revisions' && (
                <Field label="Si pides cambios, ¿quién corrige?">
                  <select className="select" value={target} onChange={(e) => setTarget(e.target.value as 'NEO' | 'REX' | 'MAX')}>
                    <option value="MAX">MAX — edición</option><option value="REX">REX — producción</option><option value="NEO">NEO — concepto</option>
                  </select>
                </Field>
              )}
            </div>
            <div className="row gap-8 wrap">
              <button className="btn ok" disabled={busy} onClick={() => decide('APPROVE')}><Check /> Approve</button>
              <button className="btn danger" disabled={busy} onClick={() => decide('REJECT')}><X /> Reject</button>
              <button className="btn" disabled={busy || (a.kind !== 'store_change' && !note.trim())} title={!note.trim() ? 'Escribe qué cambios quieres' : ''} onClick={() => decide('REQUEST_CHANGES')}>
                <MessageSquareWarning /> Request changes
              </button>
              {a.kind === 'store_change' && <span className="xs faint">Aprobar no aplica el cambio en la tienda hasta conectar un adaptador de escritura (INTEGRATION_REQUIRED).</span>}
            </div>
          </>
        ) : (
          <div className="row gap-8 small">
            <Status value={a.status} /> <span className="muted">{dateTime(a.resolvedAt)}{a.ownerNote ? ` — “${a.ownerNote}”` : ''}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function Approvals() {
  const { data } = useResource<Approval[]>('/api/approvals');
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const pending = (data ?? []).filter((a) => a.status === 'PENDING');
  const resolved = (data ?? []).filter((a) => a.status !== 'PENDING');
  const list = tab === 'pending' ? pending : resolved;
  return (
    <>
      <PageHead title="Approval Center" sub="REQUIRES YOUR APPROVAL — cambios importantes de tienda, acciones críticas, decisiones estratégicas y acciones irreversibles. Ningún agente puede ejecutarlas sin ti." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'pending', label: 'Pendientes', count: pending.length }, { id: 'resolved', label: 'Resueltas', count: resolved.length }]} />
      {!data ? <Loading /> : list.length === 0 ? (
        <Panel><Empty icon={<ShieldCheck />} title={tab === 'pending' ? 'Nada requiere tu aprobación' : 'Sin decisiones todavía'}>NOAH envía aquí los cambios HIGH RISK, ALEX los vídeos que agotan sus revisiones y ATLAS las decisiones estratégicas.</Empty></Panel>
      ) : (
        <div className="stack gap-16">{list.map((a) => <ApprovalItem key={a.id} a={a} />)}</div>
      )}
    </>
  );
}
