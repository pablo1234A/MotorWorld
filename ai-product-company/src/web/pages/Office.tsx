import { useEffect, useRef, useState } from 'react';
import { CheckCheck, MessagesSquare, UserRound } from 'lucide-react';
import { useSnapshot } from '../components/Shell';
import { AgentMark, AGENT_COLOR, Loading, PageHead, Panel, Sheet, Status } from '../components/ui';
import { MessageList } from '../components/blocks';
import { useLive } from '../lib/live';
import { mediaUrl } from '../lib/api';
import { useRouter } from '../lib/router';
import type { AgentSummary } from '../lib/types';
import { AgentDetail } from './Agents';

const W = 1200;
const H = 760;

/** Where each workstation sits on the floor plan (plan coordinates). */
const SEAT: Record<string, [number, number]> = {
  ATLAS: [135, 175],
  ALEX: [340, 175],
  NOVA: [560, 140],
  NEO: [775, 140],
  REX: [560, 340],
  MAX: [775, 340],
  LUNA: [1068, 170],
  EVA: [165, 612],
  NOAH: [395, 612],
  IRIS: [712, 612],
  OWNER: [225, 395],
};

const ZONES = [
  { x: 36, y: 34, name: 'Executive Suite', sub: 'ATLAS · ALEX' },
  { x: 446, y: 34, name: 'Creative Studio', sub: 'NOVA · NEO · REX · MAX' },
  { x: 966, y: 34, name: 'QA Room', sub: 'LUNA' },
  { x: 36, y: 486, name: 'Commerce Lab', sub: 'EVA · NOAH' },
  { x: 576, y: 486, name: 'Data Room', sub: 'IRIS' },
  { x: 876, y: 486, name: 'Delivery Bay', sub: 'vídeos entregados' },
  { x: 36, y: 316, name: 'Lobby', sub: 'línea directa del propietario' },
];

interface Packet {
  id: string;
  from: string;
  to: string;
  color: string;
}

function FloorPlan({ agents }: { agents: AgentSummary[] }) {
  const working = new Set(agents.filter((a) => ['WORKING', 'REVIEWING'].includes(a.state.status)).map((a) => a.id));
  // Door swing: quarter arc (architectural symbol).
  const door = (x: number, y: number, r: number, rot: number) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={`M0 0 L${r} 0 A${r} ${r} 0 0 1 0 ${r}`} fill="none" stroke="rgba(237,230,218,0.16)" strokeWidth="1.2" />
    </g>
  );
  const desk = (id: string, w = 190, h = 142) => {
    const [x, y] = SEAT[id];
    return (
      <g key={id}>
        <circle cx={x} cy={y + 8} r={128} fill={`url(#glow-${id})`} style={{ opacity: working.has(id) ? 1 : 0, transition: 'opacity 900ms cubic-bezier(.16,1,.3,1)' }} />
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={14} fill="#121417" stroke="rgba(237,230,218,0.07)" />
        <rect x={x - 22} y={y + h / 2 + 8} width={44} height={22} rx={9} fill="#16191c" stroke="rgba(237,230,218,0.08)" />
      </g>
    );
  };
  return (
    <svg className="plan" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <pattern id="tiles" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="rgba(237,230,218,0.028)" strokeWidth="1" />
        </pattern>
        {Object.keys(AGENT_COLOR).map((id) => (
          <radialGradient key={id} id={`glow-${id}`}>
            <stop offset="0%" stopColor={AGENT_COLOR[id]} stopOpacity="0.22" />
            <stop offset="70%" stopColor={AGENT_COLOR[id]} stopOpacity="0.02" />
            <stop offset="100%" stopColor={AGENT_COLOR[id]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect x="20" y="20" width="1160" height="720" fill="#0d0e10" />
      <rect x="20" y="20" width="1160" height="720" fill="url(#tiles)" />
      {/* Delivery bay screens base */}
      <rect x="892" y="530" width="270" height="190" rx="10" fill="#0f1113" stroke="rgba(237,230,218,0.06)" />
      {Object.keys(SEAT).filter((k) => k !== 'OWNER').map((id) => desk(id))}
      {/* Owner line */}
      <circle cx={SEAT.OWNER[0]} cy={SEAT.OWNER[1]} r="34" fill="none" stroke="rgba(233,196,106,0.25)" strokeDasharray="3 5" />
      <path d={`M${SEAT.OWNER[0]} ${SEAT.OWNER[1] - 34} L${SEAT.ATLAS[0] + 40} ${SEAT.ATLAS[1] + 80}`} stroke="rgba(233,196,106,0.18)" strokeDasharray="2 6" />
      {/* Walls */}
      <g fill="none" stroke="#2b3036" strokeWidth="7" strokeLinecap="square">
        <rect x="20" y="20" width="1160" height="720" />
        <path d="M20 300H150 M220 300H430 M430 20V120 M430 200V470 M20 470H170 M240 470H860 M940 470H1180 M560 470V560 M560 640V740 M860 470V560 M860 640V740" />
      </g>
      {/* Glass partitions */}
      <g stroke="rgba(237,230,218,0.2)" strokeWidth="1.5">
        <path d="M250 28V292 M254 28V292" />
        <path d="M950 28V292 M954 28V292 M954 292H1172 M954 296H1172" />
        <path d="M280 478V732 M284 478V732" />
      </g>
      {door(150, 300, 70, 0)}
      {door(430, 120, 80, 90)}
      {door(170, 470, 70, 0)}
      {door(860, 470, 80, 0)}
      {door(560, 560, 80, 90)}
      {door(860, 560, 80, 90)}
      {door(954, 292, 60, -90)}
    </svg>
  );
}

function Packets({ packets }: { packets: Packet[] }) {
  return (
    <svg className="packets" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {packets.map((p) => {
        const [x1, y1] = SEAT[p.from];
        const [x2, y2] = SEAT[p.to];
        const mx = (x1 + x2) / 2;
        const my = Math.min(y1, y2) - 60;
        const d = `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
        return (
          <g key={p.id}>
            <path d={d} fill="none" stroke={p.color} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 6">
              <animate attributeName="stroke-opacity" values="0;0.55;0.55;0" dur="1.7s" fill="freeze" />
            </path>
            <circle r="5" fill={p.color}>
              <animateMotion dur="1.3s" path={d} fill="freeze" keySplines="0.16 1 0.3 1" keyTimes="0;1" calcMode="spline" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="1.6s" fill="freeze" />
            </circle>
            <circle r="12" fill={p.color} opacity="0.18">
              <animateMotion dur="1.3s" path={d} fill="freeze" keySplines="0.16 1 0.3 1" keyTimes="0;1" calcMode="spline" />
              <animate attributeName="opacity" values="0.25;0.25;0" keyTimes="0;0.85;1" dur="1.6s" fill="freeze" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function Station({ a, onOpen, positioned = true }: { a: AgentSummary; onOpen: (id: string) => void; positioned?: boolean }) {
  const [x, y] = SEAT[a.id];
  const screen =
    a.currentTask?.title ??
    (a.state.status === 'WAITING' ? 'En cola: esperando dependencias' : a.state.status === 'APPROVAL_REQUIRED' ? 'Esperando tu aprobación' : a.state.status === 'ERROR' ? a.state.statusNote ?? 'Error' : a.state.statusNote ?? 'Sin tareas asignadas');
  return (
    <button
      className="station"
      data-status={a.state.status}
      style={{ ['--c' as string]: a.color, ...(positioned ? { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` } : {}) }}
      onClick={() => onOpen(a.id)}
      aria-label={`${a.name}, ${a.title}, estado ${a.state.status}`}
    >
      <div className="screen">
        <div className="line">{screen}</div>
        <div className="bar" />
      </div>
      <div className="who">
        <AgentMark id={a.id} size={26} status={a.state.status} />
        <div className="stack" style={{ minWidth: 0 }}>
          <span className="name">{a.name}</span>
          <span className="role ellipsis">{a.title}</span>
        </div>
      </div>
      <div className="state row gap-6">
        <Status value={a.state.status} />
        <span className="xs faint mono row gap-4" title="Tareas completadas"><CheckCheck size={12} />{a.state.tasksCompleted}</span>
      </div>
    </button>
  );
}

export function Office() {
  const { snap } = useSnapshot();
  const { subscribe } = useLive();
  const { navigate } = useRouter();
  const [packets, setPackets] = useState<Packet[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(
    () =>
      subscribe((e) => {
        let from = '';
        let to = '';
        if (e.type === 'MESSAGE_SENT') {
          from = String(e.payload.from);
          to = String(e.payload.to);
        } else if (e.type === 'CHAT_MESSAGE') {
          from = String(e.payload.from);
          to = String(e.payload.to);
        } else return;
        if (!SEAT[from] || !SEAT[to] || from === to) return;
        const id = `p${counter.current++}`;
        setPackets((ps) => [...ps.slice(-24), { id, from, to, color: AGENT_COLOR[from] ?? '#E9C46A' }]);
        window.setTimeout(() => setPackets((ps) => ps.filter((p) => p.id !== id)), 1800);
      }),
    [subscribe],
  );

  if (!snap) return <Loading rows={8} />;
  const latest = snap.deliveries.latest.filter((d) => d.posterAsset).slice(0, 3);

  return (
    <>
      <PageHead
        title="Oficina"
        sub="Cada puesto muestra en directo la tarea del agente. Los mensajes entre agentes cruzan la planta en tiempo real. Pulsa un puesto para ver su ficha completa."
      />
      <div className="office-wrap">
        <div className="stack gap-12" style={{ minWidth: 0 }}>
          <div className="floor-scroll">
            <div className="floor">
              <FloorPlan agents={snap.agents} />
              {ZONES.map((z) => (
                <div key={z.name} className="zone-label" style={{ left: `${(z.x / W) * 100}%`, top: `${(z.y / H) * 100}%` }}>
                  {z.name}
                  <span>{z.sub}</span>
                </div>
              ))}
              <div
                className="station owner"
                style={{ left: `${(SEAT.OWNER[0] / W) * 100}%`, top: `${(SEAT.OWNER[1] / H) * 100}%`, width: 'auto', minWidth: 0, padding: '8px 12px', ['--c' as string]: '#E9C46A' }}
              >
                <div className="row gap-8">
                  <span className="agent-mark" style={{ ['--c' as string]: '#E9C46A', ['--s' as string]: '26px' }}>
                    <UserRound size={13} />
                  </span>
                  <div className="stack">
                    <span className="name">TÚ</span>
                    <span className="role">Propietario</span>
                  </div>
                  <button className="btn sm" onClick={() => navigate('/chat/ATLAS')} aria-label="Hablar con ATLAS">
                    <MessagesSquare />
                  </button>
                </div>
              </div>
              {latest.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/deliveries?video=${d.videoId}`)}
                  aria-label={`Ver entrega ${d.title}`}
                  style={{ position: 'absolute', left: `${((905 + i * 88) / W) * 100}%`, top: `${(545 / H) * 100}%`, width: `${(76 / W) * 100}%`, aspectRatio: '9/16', padding: 0, border: '1px solid rgba(237,230,218,0.14)', borderRadius: 6, overflow: 'hidden', background: '#000', cursor: 'pointer' }}
                >
                  <img src={mediaUrl(d.posterAsset)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
              {snap.agents.map((a) => (
                <Station key={a.id} a={a} onOpen={setOpen} />
              ))}
              <Packets packets={packets} />
            </div>
          </div>
          <div className="roster">
            {snap.agents.map((a) => (
              <Station key={a.id} a={a} onOpen={setOpen} positioned={false} />
            ))}
          </div>
        </div>
        <Panel title="Comunicación interna" actions={<span className="pill tone-ok pulse"><span className="dot" />Live</span>} flush>
          <div style={{ maxHeight: 'min(70vh, 720px)', overflowY: 'auto' }}>
            {snap.messages.length ? <MessageList items={snap.messages} /> : <p className="muted small" style={{ padding: 16 }}>Los mensajes entre agentes aparecerán aquí.</p>}
          </div>
        </Panel>
      </div>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open ?? ''} wide actions={open ? <button className="btn sm" onClick={() => navigate(`/chat/${open}`)}><MessagesSquare /> Hablar con {open}</button> : null}>
        {open && <AgentDetail id={open} />}
      </Sheet>
    </>
  );
}
