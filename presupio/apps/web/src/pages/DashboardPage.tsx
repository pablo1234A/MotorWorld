import { ArrowRight, CalendarClock, ClipboardList, FilePlus2, FileText, History } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { useFollowUps, usePendingQuotes, useRecentActivity, useSettings, useSummary, useUsage } from '../api/queries';
import type { Delivery } from '../api/types';
import { useSession } from '../auth/session';
import { BAND_LABEL, bandDescription, bandOf, bandRules, PortfolioMap, type Band } from '../components/PortfolioMap';
import { Alert, buttonClass, EmptyState, ErrorAlert, Panel, Skeleton, SkeletonRows } from '../components/ui';
import { daysSince, formatDateTime, formatMoney, formatNumber, formatRelative, formatShortDate } from '../lib/format';
import { describeActivity, FOLLOW_UP_CHANNEL_LABEL } from '../lib/labels';
import { usePageTitle } from '../lib/usePageTitle';

function Ledger() {
  const summary = useSummary();
  if (summary.isError) return <ErrorAlert error={summary.error} title="No se ha podido cargar el estado de la cartera" onRetry={() => void summary.refetch()} />;
  const s = summary.data?.summary;
  const total = s ? Object.values(s.byStatus).reduce((a, b) => a + b, 0) : 0;
  const cells = [
    { label: 'Presupuestos registrados', value: s ? formatNumber(total) : null, note: 'Sin contar los archivados', to: '/presupuestos' },
    { label: 'Pendientes de respuesta', value: s ? formatNumber(s.byStatus.sent) : null, note: 'Enviados y sin contestar', to: '/presupuestos?estado=sent' },
    {
      label: 'Seguimientos realizados',
      value: s ? formatNumber(s.followUps.completed) : null,
      note: 'Contactos registrados y emails enviados',
      to: '/seguimientos?estado=completed',
    },
    {
      label: 'Recuperaciones',
      value: s ? formatNumber(s.reactivated) : null,
      note: 'Respondieron en los 30 días siguientes a un seguimiento',
    },
    {
      label: 'Ventas tras seguimiento',
      value: s ? formatNumber(s.recoveredSales) : null,
      note: s && s.recoveredSales > 0 ? `${formatMoney(s.recoveredAmountCents)} declarados por tu empresa` : 'Aceptadas con evidencia documentada',
    },
  ] as Array<{ label: string; value: string | null; note: string; to?: string }>;
  return (
    <section aria-labelledby="ledger-title" className="ledger-section">
      <h2 id="ledger-title" className="visually-hidden">
        Estado de la cartera
      </h2>
      <dl className="ledger" aria-busy={summary.isPending}>
        {cells.map((c) => (
          <div key={c.label} className="ledger__cell">
            <dt>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</dt>
            <dd className="ledger__value">{c.value ?? <Skeleton width="3rem" height="1.75rem" />}</dd>
            <dd className="ledger__note">{c.note}</dd>
          </div>
        ))}
      </dl>
      <p className="ledger-section__more">
        <Link to="/resultados">
          Resultados mes a mes <ArrowRight aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

/** Aviso del límite de intentos de seguimiento del plan (desde el 80 %). */
function UsageNotice() {
  const usage = useUsage();
  const r = usage.data?.usage.attempts;
  if (!r || (r.level !== 'warning' && r.level !== 'reached')) return null;
  return (
    <Alert
      tone="warning"
      title={r.level === 'reached' ? 'Has usado todos los intentos de seguimiento de tu plan' : `Llevas ${r.used} de ${r.limit} intentos de seguimiento este periodo`}
      action={<Link to="/configuracion/plan">Ver consumo</Link>}
    >
      {r.level === 'reached'
        ? 'El envío automático está en pausa hasta el próximo periodo. Puedes seguir registrando respuestas y trabajando a mano.'
        : `Al llegar a ${r.limit}, el envío automático se pondrá en pausa hasta el próximo periodo.`}
    </Alert>
  );
}

function PortfolioPanel() {
  const pending = usePendingQuotes();
  const settings = useSettings();
  const rules = useMemo(() => (settings.data ? bandRules(settings.data.settings) : null), [settings.data]);

  const stats = useMemo(() => {
    const items = pending.data?.items ?? [];
    const now = new Date();
    const byBand: Record<Band, { count: number; cents: number }> = {
      fresh: { count: 0, cents: 0 },
      due: { count: 0, cents: 0 },
      cold: { count: 0, cents: 0 },
    };
    let withoutAmount = 0;
    for (const q of items) {
      if (!q.sentAt) continue;
      if (!q.amountCents) withoutAmount++;
      if (!rules) continue;
      const b = byBand[bandOf(daysSince(q.sentAt, now), rules)];
      b.count++;
      b.cents += q.amountCents ?? 0;
    }
    return { byBand, withoutAmount, total: items.length };
  }, [pending.data, rules]);

  const error = pending.error ?? settings.error;
  return (
    <Panel
      title="Plano de la cartera pendiente"
      description="Cada parcela es un presupuesto enviado sin respuesta. Su tamaño es el importe; su color, el tiempo que lleva esperando según tus reglas de seguimiento."
      actions={
        <Link to="/configuracion/seguimiento" className={buttonClass('ghost', 'sm')}>
          Ajustar reglas
        </Link>
      }
    >
      {error ? (
        <ErrorAlert error={error} title="No se ha podido cargar el plano" onRetry={() => void Promise.all([pending.refetch(), settings.refetch()])} />
      ) : pending.isPending || !rules ? (
        <div className="plano plano--loading" role="status" aria-label="Cargando el plano">
          <Skeleton height="100%" />
        </div>
      ) : stats.total === 0 ? (
        <EmptyState icon={FileText} title="No hay presupuestos pendientes de respuesta">
          Cuando registres un presupuesto enviado, aparecerá aquí como una parcela hasta que el cliente conteste.
        </EmptyState>
      ) : (
        <div className="stack">
          {stats.total - stats.withoutAmount > 0 ? (
            <PortfolioMap quotes={pending.data?.items ?? []} rules={rules} />
          ) : (
            <Alert tone="info">Ninguno de tus presupuestos pendientes tiene importe, así que no se pueden dibujar en el plano.</Alert>
          )}
          <ul className="plano-legend" aria-label="Leyenda del plano">
            {(Object.keys(BAND_LABEL) as Band[]).map((band) => (
              <li key={band}>
                <span className={`plano-legend__swatch parcel--${band}`} aria-hidden="true" />
                <span>
                  <span className="strong">{BAND_LABEL[band]}</span>{' '}
                  <span className="num">
                    · {stats.byBand[band].count} · {formatMoney(stats.byBand[band].cents)}
                  </span>
                  <span className="plano-legend__desc">{bandDescription(band, rules)}</span>
                </span>
              </li>
            ))}
          </ul>
          {(stats.withoutAmount > 0 || pending.data?.nextCursor) && (
            <p className="small muted">
              {stats.withoutAmount > 0 && `${stats.withoutAmount} presupuesto(s) pendiente(s) sin importe no aparecen en el plano. `}
              {pending.data?.nextCursor && 'Se muestran los 100 presupuestos pendientes más recientes. '}
              <Link to="/presupuestos?estado=sent">Ver todos los pendientes</Link>
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function UpcomingFollowUps() {
  const followUps = useFollowUps({ status: 'pending' });
  const items = useMemo(() => {
    const list = followUps.data?.pages.flatMap((p) => p.items) ?? [];
    return [...list]
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))
      .slice(0, 6);
  }, [followUps.data]);
  const now = Date.now();

  return (
    <Panel
      title="Próximos seguimientos"
      flush
      actions={
        <Link to="/seguimientos" className={buttonClass('ghost', 'sm')}>
          Ver todos <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {followUps.isPending ? (
        <SkeletonRows rows={4} />
      ) : followUps.isError ? (
        <div className="panel__body">
          <ErrorAlert error={followUps.error} onRetry={() => void followUps.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nada programado">
          Desde la ficha de un presupuesto puedes programar la próxima llamada, email o visita.
        </EmptyState>
      ) : (
        <ul className="rows">
          {items.map((f) => {
            const overdue = f.dueAt && new Date(f.dueAt).getTime() < now;
            return (
              <li key={f.id}>
                <Link to={`/presupuestos/${f.quoteId}`} className="row">
                  <div className="row__main">
                    <p className="row__title">{f.title}</p>
                    <p className="row__meta">
                      <span>{f.contact.fullName}</span>
                      <span>{FOLLOW_UP_CHANNEL_LABEL[f.channel]}</span>
                    </p>
                  </div>
                  {f.dueAt ? (
                    <span className={`pill ${overdue ? 'pill--cold' : 'pill--neutral'}`}>
                      {overdue ? 'Vencido · ' : ''}
                      {formatShortDate(f.dueAt)}
                    </span>
                  ) : (
                    <span className="pill pill--neutral">Sin fecha</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function RecentActivity() {
  const activity = useRecentActivity();
  const items = (activity.data?.items ?? []).filter((e) => e.action !== 'auth.login').slice(0, 7);
  return (
    <Panel title="Actividad reciente" flush>
      {activity.isPending ? (
        <SkeletonRows rows={4} />
      ) : activity.isError ? (
        <div className="panel__body">
          <ErrorAlert error={activity.error} onRetry={() => void activity.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={History} title="Sin actividad todavía">
          Aquí verás quién registra presupuestos, seguimientos y respuestas.
        </EmptyState>
      ) : (
        <ul className="rows">
          {items.map((e) => (
            <li key={e.id} className="row">
              <div className="row__main">
                <p>
                  <span className="strong">{e.actor?.fullName ?? 'Sistema'}</span> {describeActivity(e)}
                  {e.quote && (
                    <>
                      {' · '}
                      <Link to={`/presupuestos/${e.quote.id}`} className="nowrap">{e.quote.reference ?? e.quote.title}</Link>
                    </>
                  )}
                </p>
                <p className="row__meta">
                  <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                    {formatRelative(e.createdAt)}
                  </time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FirstSteps() {
  return (
    <Panel title="Empieza en tres pasos">
      <ol className="steps">
        <li>
          <p className="strong">Registra un presupuesto enviado</p>
          <p className="muted">Cliente, importe y fecha de envío. Empieza por los que llevan más días sin respuesta.</p>
        </li>
        <li>
          <p className="strong">Programa o registra el seguimiento</p>
          <p className="muted">Una llamada, un email o una visita: anota los contactos que haces tú. Si activas el envío automático, Presupio también escribe a quien no responde.</p>
        </li>
        <li>
          <p className="strong">Anota la respuesta y el resultado</p>
          <p className="muted">Respondido, aceptado o rechazado. Así sabrás qué se reactivó gracias al seguimiento.</p>
        </li>
      </ol>
      <div className="form-actions" style={{ marginTop: 'var(--s-5)' }}>
        <Link to="/presupuestos/nuevo" className={buttonClass('primary')}>
          <FilePlus2 aria-hidden="true" /> Registrar el primer presupuesto
        </Link>
      </div>
    </Panel>
  );
}

export function DashboardPage() {
  usePageTitle('Panel');
  const session = useSession();
  const location = useLocation();
  const summary = useSummary();
  const state = location.state as { welcome?: boolean; verificationDelivery?: Delivery } | null;
  const s = summary.data?.summary;
  const isEmpty = s && Object.values(s.byStatus).reduce((a, b) => a + b, 0) === 0;
  const firstName = session.user.fullName.split(' ')[0];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__text">
          <h1>Hola, {firstName}</h1>
          <p>Estado de los presupuestos de {session.company.name}.</p>
        </div>
        <div className="page-header__actions">
          <Link to="/seguimientos" className={buttonClass('secondary')}>
            <ClipboardList aria-hidden="true" /> Seguimientos
          </Link>
          {session.can('quotes:write') && (
            <Link to="/presupuestos/nuevo" className={buttonClass('primary')}>
              <FilePlus2 aria-hidden="true" /> Nuevo presupuesto
            </Link>
          )}
        </div>
      </header>

      {state?.welcome && (
        <Alert tone={state.verificationDelivery === 'sent' ? 'success' : 'warning'} title="Cuenta creada">
          {state.verificationDelivery === 'sent'
            ? `Te hemos enviado un email a ${session.user.email} para confirmar tu dirección.`
            : 'No hemos podido enviarte el email de confirmación porque el envío de correo aún no está configurado en este entorno. Podrás pedirlo de nuevo desde tu perfil.'}
        </Alert>
      )}

      <UsageNotice />
      {s && s.followUps.awaitingApproval > 0 && (
        <Alert
          tone="warning"
          title={s.followUps.awaitingApproval === 1 ? '1 email automático espera tu aprobación' : `${s.followUps.awaitingApproval} emails automáticos esperan tu aprobación`}
          action={<Link to="/seguimientos?estado=aprobar">Revisar ahora</Link>}
        >
          Si no se aprueban en 72 horas desde su fecha prevista, se cancelan sin enviarse.
        </Alert>
      )}
      {s && s.followUps.failed > 0 && (
        <Alert
          tone="warning"
          title={s.followUps.failed === 1 ? '1 email automático no se pudo enviar' : `${s.followUps.failed} emails automáticos no se pudieron enviar`}
          action={<Link to="/seguimientos?estado=failed">Ver el motivo</Link>}
        />
      )}

      <Ledger />
      {isEmpty && session.can('quotes:write') ? <FirstSteps /> : <PortfolioPanel />}

      <div className="grid-2">
        <UpcomingFollowUps />
        <RecentActivity />
      </div>
    </div>
  );
}
