import { useState } from 'react';
import { ActivityFeed, MessageList, TaskSheet } from '../components/blocks';
import { Empty, Loading, PageHead, Panel, Tabs } from '../components/ui';
import { useResource } from '../lib/live';
import { clock } from '../lib/format';
import type { Activity, Message } from '../lib/types';

export function Logs() {
  const [tab, setTab] = useState<'activity' | 'comms' | 'events'>('activity');
  const [kind, setKind] = useState('');
  const [agent, setAgent] = useState('');
  const [type, setType] = useState('');
  const [task, setTask] = useState<string | null>(null);
  const q = new URLSearchParams({ ...(agent ? { agent } : {}), ...(kind ? { kind } : {}) }).toString();
  const activity = useResource<Activity[]>(tab === 'activity' ? `/api/activity?${q}` : null);
  const comms = useResource<Message[]>(tab === 'comms' ? `/api/messages${agent ? `?agent=${agent}` : ''}` : null);
  const events = useResource<{ types: string[]; events: { id: number; type: string; payload: Record<string, unknown>; createdAt: string }[] }>(tab === 'events' ? `/api/events${type ? `?type=${type}` : ''}` : null);

  const agentFilter = (
    <select className="select" style={{ width: 170 }} value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agente">
      <option value="">Todos los agentes</option>
      {['ATLAS', 'ALEX', 'NOVA', 'NEO', 'REX', 'MAX', 'LUNA', 'EVA', 'NOAH', 'IRIS'].map((a) => <option key={a}>{a}</option>)}
    </select>
  );

  return (
    <>
      <PageHead title="Logs y comunicación" sub="ACTIVITY LOG y AGENT LOG (filtra por agente), la comunicación interna entre agentes y el bus de eventos que alimenta las automatizaciones." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'activity', label: 'Activity log' }, { id: 'comms', label: 'Comunicación interna' }, { id: 'events', label: 'Eventos' }]} />
      {tab === 'activity' && (
        <>
          <div className="row gap-8 wrap" style={{ marginBottom: 14 }}>
            {agentFilter}
            <select className="select" style={{ width: 170 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
              <option value="">Todo</option><option value="action">Acciones</option><option value="decision">Decisiones</option><option value="communication">Comunicación</option><option value="error">Errores</option><option value="owner">Propietario</option>
            </select>
          </div>
          <Panel flush>{!activity.data ? <Loading /> : activity.data.length ? <ActivityFeed items={activity.data} onTask={setTask} /> : <Empty title="Sin registros" />}</Panel>
        </>
      )}
      {tab === 'comms' && (
        <>
          <div className="row gap-8" style={{ marginBottom: 14 }}>{agentFilter}</div>
          <Panel flush>{!comms.data ? <Loading /> : comms.data.length ? <MessageList items={comms.data} /> : <Empty title="Sin mensajes" />}</Panel>
        </>
      )}
      {tab === 'events' && (
        <>
          <div className="row gap-8" style={{ marginBottom: 14 }}>
            <select className="select" style={{ width: 260 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de evento">
              <option value="">Todos los eventos</option>
              {(events.data?.types ?? []).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Panel flush>
            {!events.data ? <Loading /> : events.data.events.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Evento</th><th>Datos</th><th>Hora</th></tr></thead>
                  <tbody>
                    {events.data.events.map((e) => (
                      <tr key={e.id}>
                        <td className="mono xs faint">{e.id}</td>
                        <td><span className="chip">{e.type}</span></td>
                        <td className="mono xs muted" style={{ maxWidth: 560 }}><div className="ellipsis">{JSON.stringify(e.payload)}</div></td>
                        <td className="mono xs faint nowrap">{clock(e.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="Sin eventos" />}
          </Panel>
        </>
      )}
      <TaskSheet id={task} onClose={() => setTask(null)} />
    </>
  );
}
