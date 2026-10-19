import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useStore } from '../data/store';
import { AnimatedNumber, Empty, NeedsData, Seg } from '../components/ui';
import { AreaChart, HBars } from '../components/charts';
import { MIN_SAMPLE, PERIOD_LABEL, computeStats, periodFrom, type Period } from '../lib/insights';
import { money, pct, fmtNum } from '../lib/format';
import { SOURCE_LABEL, type LeadSource } from '../data/types';

export default function Analytics() {
  const { state } = useStore();
  const [period, setPeriod] = useState<Period>('30');
  const from = periodFrom(period, state);
  const s = computeStats(state, from);

  if (state.activities.length === 0) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="h1">Analytics</h1>
        </div>
        <div className="card">
          <Empty icon={<BarChart3 />} title="Necesitamos más datos" action={<a className="btn btn-primary" href="#/prospecting?add=1">Empezar a prospectar</a>}>
            Aquí verás tus métricas reales en cuanto registres actividad: prospectos, contactos, respuestas, reuniones y ventas. Nunca mostramos números inventados.
          </Empty>
        </div>
      </div>
    );
  }

  const funnel = [
    { label: 'Leads', value: s.leads },
    { label: 'Contactados', value: s.outreach },
    { label: 'Respuestas', value: s.replies },
    { label: 'Reuniones', value: s.meetings },
    { label: 'Propuestas', value: s.proposals },
    { label: 'Ventas', value: s.won },
  ];
  const fmax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Analytics</h1>
          <p className="muted">Tus números reales. Las métricas con poca muestra se marcan hasta tener datos suficientes.</p>
        </div>
        <Seg value={period} onChange={setPeriod} options={(['today', '7', '30', '90', 'all'] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
      </div>

      <div className="grid g4 keep">
        <Kpi label="Leads generados" value={s.leads} />
        <Kpi label="Contactos realizados" value={s.outreach + s.followups} sub={`${s.outreach} primeros · ${s.followups} seguimientos`} />
        <Kpi label="Respuestas" value={s.replies} sub={s.replyRate != null ? `${pct(s.replyRate)} tasa de respuesta` : undefined} />
        <Kpi label="Reuniones" value={s.meetings} sub={s.meetingRate != null ? `${pct(s.meetingRate)} de las respuestas` : undefined} />
        <Kpi label="Propuestas" value={s.proposals} />
        <Kpi label="Ventas" value={s.won} sub={s.closeRate != null ? `${pct(s.closeRate)} de las reuniones` : undefined} />
        <Kpi label="Tasa de conversión" value={s.conversion} fmt={(n) => `${n.toFixed(1)}%`} sub="contacto → venta" need={`Mín. ${MIN_SAMPLE} contactos (${s.outreach})`} />
        <Kpi label="Ticket medio" value={s.avgTicket} fmt={money} need="Necesita al menos 1 venta" />
        <Kpi label="Ingresos" value={s.revenue} fmt={money} />
        <Kpi label="Ingresos potenciales" value={s.weightedPipeline} fmt={money} sub={`${money(s.pipelineValue)} en pipeline sin ponderar`} />
        <Kpi label="Tiempo medio hasta cerrar" value={s.avgDaysToClose} fmt={(n) => `${n.toFixed(0)} días`} need="Necesita al menos 1 venta" />
        <Kpi label="Contactos por venta" value={s.contactsPerSale} fmt={(n) => n.toFixed(0)} sub="histórico" need={`Mín. ${MIN_SAMPLE} contactos y 1 venta`} />
      </div>

      <div className="card mt-16">
        <div className="card-head">
          <div className="h3">Actividad</div>
          <div className="row gap-12 tiny">
            <span className="row gap-6">
              <span className="kind-dot" style={{ background: 'var(--accent)' }} /> Contactos
            </span>
            <span className="row gap-6">
              <span className="kind-dot" style={{ background: 'var(--violet)' }} /> Respuestas
            </span>
            <span className="row gap-6">
              <span className="kind-dot" style={{ background: 'var(--green)' }} /> Ventas
            </span>
          </div>
        </div>
        {s.series.length < 2 ? (
          <p className="muted small">Selecciona un periodo más largo para ver la evolución.</p>
        ) : (
          <AreaChart
            data={s.series}
            series={[
              { key: 'contacts', label: 'Contactos', color: 'var(--accent)' },
              { key: 'replies', label: 'Respuestas', color: 'var(--violet)' },
              { key: 'wins', label: 'Ventas', color: 'var(--green)' },
            ]}
          />
        )}
      </div>

      <div className="grid g2 mt-16">
        <div className="card">
          <div className="h3 mb-16">Embudo de ventas</div>
          <div className="col gap-12">
            {funnel.map((f, i) => (
              <div key={f.label} className="funnel-row">
                <span className="small muted">{f.label}</span>
                <div className="funnel-bar">
                  <i style={{ width: `${Math.max(f.value ? 3 : 0, (f.value / fmax) * 100)}%`, opacity: 1 - i * 0.1 }} />
                </div>
                <span className="mono small" style={{ textAlign: 'right' }}>
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="h3 mb-16">Fuente de los leads</div>
          {s.sources.length === 0 ? (
            <p className="muted small">Sin leads nuevos en este periodo.</p>
          ) : (
            <HBars data={s.sources.map(([k, v]) => ({ label: SOURCE_LABEL[k as LeadSource] ?? k, value: v.leads, sub: v.won ? `${v.won} ganados` : undefined }))} />
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, ok = true, fmt = (n: number) => fmtNum(n), need }: { label: string; value: number | null; sub?: string; ok?: boolean; fmt?: (n: number) => string; need?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      {value == null || !ok ? (
        <div className="kpi-empty">
          <NeedsData />
          {need && <div className="tiny mt-4">{need}</div>}
        </div>
      ) : (
        <>
          <span className="kpi-value">
            <AnimatedNumber value={value} format={fmt} />
          </span>
          {sub && <span className="kpi-sub">{sub}</span>}
        </>
      )}
    </div>
  );
}
