import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useMetrics } from '../api/queries';
import type { Metrics, MetricsMonth } from '../api/types';
import { Alert, Button, ErrorAlert, PageHeader, Skeleton } from '../components/ui';
import { formatDate, formatMoney, formatNumber } from '../lib/format';
import { usePageTitle } from '../lib/usePageTitle';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  // Mediodía UTC del día 15: el nombre del mes no depende de la zona horaria del navegador.
  const label = new Intl.DateTimeFormat('es-ES', { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, 15, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

interface Cell {
  label: string;
  value: string;
  note?: string;
  to?: string;
}

function Ledger({ title, cells, id }: { title: string; cells: Cell[]; id: string }) {
  return (
    <section aria-labelledby={id} className="stack">
      <h2 id={id} className="section-heading">
        {title}
      </h2>
      <dl className="ledger">
        {cells.map((c) => (
          <div key={c.label} className="ledger__cell">
            <dt>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</dt>
            <dd className="ledger__value">{c.value}</dd>
            {c.note && <dd className="ledger__note">{c.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

function ResponseRate({ r }: { r: Metrics['responseRate'] }) {
  if (r.rate === null) {
    return (
      <p className="small muted">
        Tasa de respuesta tras seguimiento: <span className="strong">sin datos suficientes</span>. Se calcula a partir de {r.minSample} presupuestos con
        seguimiento en el mes; este mes hay {r.quotesWithFollowUp}.
      </p>
    );
  }
  return (
    <p className="small">
      <span className="strong">{Math.round(r.rate * 100)} %</span> de los {r.quotesWithFollowUp} presupuestos con seguimiento este mes recibieron respuesta
      después ({r.respondedAfterFollowUp}).{' '}
      {r.final ? 'Cifra cerrada.' : `Provisional: aún pueden llegar respuestas hasta el ${formatDate(r.finalAfter)}.`}
    </p>
  );
}

function History({ rows, current }: { rows: MetricsMonth[]; current: string }) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="panel__header">
        <div>
          <h2 id="history-title">Últimos seis meses</h2>
          <p>
            Meses naturales en la zona horaria de tu empresa. Respuestas y aceptaciones posteriores a un seguimiento, y los intentos de seguimiento que
            consumieron tu plan.
          </p>
        </div>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Evolución mensual (desplazable)">
        <table className="table">
          <caption className="visually-hidden">Evolución de los últimos seis meses</caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col" className="num">
                Enviados
              </th>
              <th scope="col" className="num">
                Seguimientos
              </th>
              <th scope="col" className="num">
                Respondieron
              </th>
              <th scope="col" className="num">
                Aceptados
              </th>
              <th scope="col" className="num">
                Intentos del plan
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.month} aria-current={h.month === current ? 'true' : undefined}>
                <td className="strong nowrap">{monthLabel(h.month, 'short')}</td>
                <td className="num">{formatNumber(h.quotesSent)}</td>
                <td className="num">{formatNumber(h.followUpsDone)}</td>
                <td className="num">{formatNumber(h.respondedAfterFollowUp)}</td>
                <td className="num">{formatNumber(h.acceptedAfterFollowUp)}</td>
                <td className="num">{formatNumber(h.attemptsCounted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResultsPage() {
  usePageTitle('Resultados');
  const [params, setParams] = useSearchParams();
  const requested = params.get('mes') ?? '';
  const query = useMetrics(MONTH.test(requested) ? requested : '');
  const data = query.data;
  const m = data?.metrics;
  const month = m?.period.month ?? requested;

  const go = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('mes', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title="Resultados"
        description="Qué ha pasado con tus presupuestos y seguimientos, mes a mes. Todas las cifras salen de lo que hay registrado en Presupio."
      />

      <nav className="month-nav" aria-label="Mes">
        <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Mes anterior" disabled={!month || query.isFetching} onClick={() => go(shift(month, -1))}>
          <span className="month-nav__text">Anterior</span>
        </Button>
        <p className="month-nav__label" aria-live="polite">
          {month ? monthLabel(month) : 'Mes actual'}
          {m?.period.inProgress && <span className="pill pill--neutral">En curso</span>}
        </p>
        <Button size="sm" variant="ghost" aria-label="Mes siguiente" disabled={!m || m.period.inProgress || query.isFetching} onClick={() => go(shift(month, 1))}>
          <span className="month-nav__text">Siguiente</span> <ChevronRight aria-hidden="true" />
        </Button>
      </nav>

      {query.isError ? (
        <ErrorAlert error={query.error} title="No se han podido cargar los resultados" onRetry={() => void query.refetch()} />
      ) : !m || !data ? (
        <div className="stack" role="status" aria-label="Cargando resultados">
          <Skeleton height="7rem" />
          <Skeleton height="7rem" />
          <Skeleton height="12rem" />
        </div>
      ) : (
        <div className="stack stack--lg" aria-busy={query.isFetching}>
          {m.period.beforeAccountCreated && <Alert tone="info">Tu cuenta aún no existía en este mes, así que no hay datos.</Alert>}

          <Ledger
            id="recoveries-title"
            title="Recuperaciones"
            cells={[
              {
                label: 'Recuperaciones',
                value: formatNumber(m.recoveries.recorded),
                note: 'Clientes que respondieron tras un seguimiento (no consumen tu plan)',
              },
              {
                label: 'Respondieron tras un seguimiento',
                value: formatNumber(m.outcomes.respondedAfterFollowUp),
                note: `${formatNumber(m.outcomes.respondedAfterAutomaticEmail)} tras un email automático`,
              },
              {
                label: 'Aceptados tras un seguimiento',
                value: formatNumber(m.outcomes.acceptedAfterFollowUp),
                note:
                  m.outcomes.acceptedAfterFollowUp > 0
                    ? `${formatMoney(m.outcomes.acceptedAfterFollowUpAmountCents)} declarados por tu empresa`
                    : 'Ventas confirmadas con evidencia',
              },
              {
                label: 'Respondieron sin seguimiento',
                value: formatNumber(m.outcomes.respondedWithoutFollowUp),
                note: 'No cuentan como recuperación',
              },
            ]}
          />
          <ResponseRate r={m.responseRate} />

          <Ledger
            id="followups-title"
            title="Seguimientos"
            cells={[
              { label: 'Contactos realizados', value: formatNumber(m.followUps.manualContacts), note: 'Llamadas, mensajes y visitas registrados' },
              {
                label: 'Emails automáticos enviados',
                value: formatNumber(m.followUps.automaticSent),
                note: m.followUps.automaticDelivered > 0 ? `${formatNumber(m.followUps.automaticDelivered)} con entrega confirmada` : 'Aceptados por el proveedor',
                to: '/seguimientos?estado=sent',
              },
              {
                label: 'Intentos que consumen tu plan',
                value: formatNumber(m.attempts.counted),
                note: 'Un intento por seguimiento automático enviado, responda o no el cliente',
                to: '/configuracion/plan',
              },
              {
                label: 'Emails que no se pudieron enviar',
                value: formatNumber(m.followUps.automaticFailed),
                note: m.followUps.failedAttempts > 0 ? `${formatNumber(m.followUps.failedAttempts)} intento(s) fallido(s) en total` : 'Sin intentos fallidos',
                to: '/seguimientos?estado=failed',
              },
              {
                label: 'Programados ahora',
                value: formatNumber(m.followUps.automaticScheduledNow + m.followUps.manualPendingNow),
                note:
                  m.followUps.automaticAwaitingApprovalNow > 0
                    ? `${formatNumber(m.followUps.automaticAwaitingApprovalNow)} email(s) esperan aprobación`
                    : 'Emails automáticos y tareas pendientes',
                to: '/seguimientos',
              },
            ]}
          />

          <Ledger
            id="quotes-title"
            title="Presupuestos"
            cells={[
              { label: 'Registrados', value: formatNumber(m.quotes.registered), note: 'Dados de alta este mes' },
              { label: 'Enviados', value: formatNumber(m.quotes.sent), note: 'Con fecha de envío en este mes' },
              { label: 'Pendientes de respuesta', value: formatNumber(m.quotes.pendingNow), note: 'Ahora mismo, de cualquier mes', to: '/presupuestos?estado=sent' },
            ]}
          />

          <Alert tone="info" title="Cómo leer estas cifras">
            Que un cliente responda o acepte después de un seguimiento es una coincidencia en el tiempo, no una prueba de que lo hiciera por el seguimiento. Las
            respuestas y las ventas las registra tu equipo, y el importe de las ventas es el que declara tu empresa.
          </Alert>

          <History rows={data.history} current={m.period.month} />
        </div>
      )}
    </div>
  );
}
