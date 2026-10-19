import { useMemo, useRef, useState } from 'react';
import { fmtDay } from '../lib/dates';

interface Series {
  key: string;
  label: string;
  color: string;
}

/** Gráfico de área/línea con tooltip. Datos: [{ day, [key]: number }] */
export function AreaChart({ data, series, height = 220 }: { data: Record<string, number | string>[]; series: Series[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { t: 12, r: 8, b: 26, l: 30 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const niceMax = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (data.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)] as const);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
        return { s, line, area };
      }),
    [data, series, niceMax],
  );
  const ticks = niceMax <= 2 ? [0, niceMax] : [0, niceMax / 2, niceMax];
  const labelEvery = Math.ceil(data.length / 7);

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const rel = ((cx - rect.left) / rect.width) * W;
    const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseMove={onMove} onTouchMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" strokeDasharray={t === 0 ? '' : '3 4'} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-4)" fontFamily="var(--mono)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {paths.map(({ s, area, line }) => (
          <g key={s.key}>
            <path d={area} fill={`url(#g-${s.key})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-4)">
              {fmtDay(String(d.day))}
            </text>
          ) : null,
        )}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.15)" vectorEffect="non-scaling-stroke" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r="4" fill="var(--bg)" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tip glass" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
          <div className="dim tiny">{fmtDay(String(data[hover].day), { weekday: true })}</div>
          {series.map((s) => (
            <div key={s.key} className="row gap-6">
              <span className="kind-dot" style={{ background: s.color }} />
              {s.label}: <b className="num">{data[hover][s.key]}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras verticales simples (p. ej. actividad últimos 7 días). */
export function MiniBars({ data, height = 64, highlightLast = true }: { data: { label: string; value: number; tip?: string }[]; height?: number; highlightLast?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: height + 20 }}>
      {data.map((d, i) => (
        <div key={i} data-tip={d.tip ?? `${d.value}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <div
            style={{
              width: '100%',
              maxWidth: 28,
              height: Math.max(3, (d.value / max) * height),
              borderRadius: 6,
              background: highlightLast && i === data.length - 1 ? 'var(--accent)' : d.value ? 'var(--surface-3)' : 'var(--surface-2)',
              transition: 'height 800ms var(--ease-out)',
            }}
          />
          <span className="tiny dim">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Lista de barras horizontales. */
export function HBars({ data, format = (n: number) => String(n) }: { data: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="col gap-12">
      {data.map((d) => (
        <div key={d.label}>
          <div className="row between small mb-8" style={{ marginBottom: 6 }}>
            <span>{d.label}</span>
            <span className="mono dim">
              {format(d.value)}
              {d.sub ? ` · ${d.sub}` : ''}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
