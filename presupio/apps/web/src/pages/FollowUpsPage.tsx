import { CalendarCheck, Check, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAutomation, useFollowUps, type FollowUpFilters } from '../api/queries';
import type { FollowUp } from '../api/types';
import { useSession } from '../auth/session';
import { Button, EmptyState, ErrorAlert, PageHeader, SkeletonRows } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { cancelReasonLabel, FOLLOW_UP_CHANNEL_LABEL, OUTCOME_LABEL } from '../lib/labels';
import { usePageTitle } from '../lib/usePageTitle';
import { AutomaticEmailDialog, needsApproval, ruleStatus } from './quotes/AutomaticEmail';
import { CancelFollowUpDialog, CHANNEL_ICON, CompleteFollowUpDialog } from './quotes/FollowUpDialogs';
import { useNow } from '../lib/useNow';

type Tab = 'pending' | 'approval' | 'sent' | 'failed' | 'unknown' | 'completed' | 'cancelled';

const TABS: Array<{ value: Tab; label: string; automatic?: boolean }> = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approval', label: 'Por aprobar', automatic: true },
  { value: 'sent', label: 'Emails enviados', automatic: true },
  { value: 'failed', label: 'Fallidos', automatic: true },
  { value: 'unknown', label: 'Por revisar', automatic: true },
  { value: 'completed', label: 'Realizados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const PARAM: Record<string, Tab> = { aprobar: 'approval', sent: 'sent', failed: 'failed', revisar: 'unknown', completed: 'completed', cancelled: 'cancelled' };

function filtersFor(tab: Tab): Pick<FollowUpFilters, 'status' | 'approval'> {
  if (tab === 'approval') return { status: 'pending', approval: 'awaiting' };
  return { status: tab };
}

const EMPTY: Record<Tab, { title: string; text: string }> = {
  pending: { title: 'No hay seguimientos pendientes', text: 'Programa el siguiente contacto desde la ficha de cada presupuesto pendiente.' },
  approval: { title: 'Ningún email espera aprobación', text: 'Los emails automáticos que necesiten tu revisión aparecerán aquí.' },
  sent: { title: 'Aún no se ha enviado ningún email automático', text: 'Cuando salgan, verás aquí cada envío con su estado.' },
  failed: { title: 'Ningún envío ha fallado', text: 'Si un email no puede enviarse, aparecerá aquí con el motivo.' },
  unknown: { title: 'Nada que revisar', text: 'Si un envío se interrumpe y no se sabe si salió, aparecerá aquí para que lo confirmes.' },
  completed: { title: 'Nada por aquí', text: 'Cuando se registren seguimientos, aparecerán en esta lista.' },
  cancelled: { title: 'Nada por aquí', text: 'Los seguimientos cancelados aparecerán en esta lista.' },
};

export function FollowUpsPage() {
  usePageTitle('Seguimientos');
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const tab: Tab = PARAM[params.get('estado') ?? ''] ?? 'pending';
  const mine = params.get('mios') === '1';
  const automation = useAutomation();
  const followUps = useFollowUps({ ...filtersFor(tab), ...(mine ? { assignedTo: 'me' as const } : {}) });
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const [reviewing, setReviewing] = useState<FollowUp | null>(null);
  const items = followUps.data?.pages.flatMap((p) => p.items) ?? [];
  const sorted =
    tab === 'pending' || tab === 'approval'
      ? [...items].sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
      : items;
  const now = useNow();
  const canWrite = session.can('follow_ups:write');
  const requireApproval = automation.data?.automation.requireApproval;
  const counts = automation.data?.counts;
  // Las pestañas de emails automáticos solo aparecen si el envío está activo o ya hay envíos.
  const showAutomatic = !!automation.data?.automation.enabled || !!(counts && counts.sent30d + counts.failed + counts.awaitingApproval > 0) || TABS.find((t) => t.value === tab)?.automatic;
  const tabs = TABS.filter((t) => !t.automatic || showAutomatic);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title="Seguimientos"
        description="Llamadas, emails, visitas y tareas de todos los presupuestos: lo que tu equipo ha programado o registrado y, si lo has activado, los emails automáticos."
      />

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Estado del seguimiento">
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.value}
                onClick={() => update('estado', t.value === 'pending' ? null : t.value === 'approval' ? 'aprobar' : t.value)}
              >
                {t.label}
                {t.value === 'approval' && !!counts?.awaitingApproval && <span className="tab__count">{counts.awaitingApproval}</span>}
                {t.value === 'failed' && !!counts?.failed && <span className="tab__count">{counts.failed}</span>}
                {t.value === 'unknown' && !!counts?.unknown && <span className="tab__count">{counts.unknown}</span>}
              </button>
            ))}
          </div>
          <label className="check toolbar__toggle">
            <input type="checkbox" checked={mine} onChange={(e) => update('mios', e.target.checked ? '1' : null)} />
            <span>Solo los asignados a mí</span>
          </label>
        </div>

        <div role="tabpanel" aria-busy={followUps.isFetching}>
          {followUps.isPending ? (
            <SkeletonRows rows={5} label="Cargando seguimientos…" />
          ) : followUps.isError ? (
            <div className="panel__body">
              <ErrorAlert error={followUps.error} onRetry={() => void followUps.refetch()} />
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={CalendarCheck} title={EMPTY[tab].title}>
              {EMPTY[tab].text}
            </EmptyState>
          ) : (
            <ul className="fu-list fu-list--page">
              {sorted.map((f) => {
                const Icon = CHANNEL_ICON[f.channel];
                const automatic = f.source === 'rule';
                const overdue = f.status === 'pending' && f.dueAt && Date.parse(f.dueAt) < now;
                const rule = automatic ? ruleStatus(f, requireApproval) : null;
                const iconState = f.status === 'sent' ? 'completed' : f.status === 'sending' ? 'pending' : f.status;
                const approve = canWrite && needsApproval(f, requireApproval);
                return (
                  <li key={f.id} className="fu">
                    <span className={`fu__icon fu__icon--${iconState}`} aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="fu__main">
                      <p className="fu__title">
                        <Link to={`/presupuestos/${f.quoteId}`}>{f.title}</Link>
                        {automatic && <span className="pill pill--neutral fu__badge">Automático</span>}
                      </p>
                      <p className="row__meta">
                        <span>{f.contact.fullName}</span>
                        <span className="truncate" style={{ maxWidth: '18rem' }}>
                          {f.quote.title}
                        </span>
                        {rule ? (
                          <span className={rule.tone === 'danger' ? 'fu__overdue' : undefined}>{rule.text}</span>
                        ) : (
                          <>
                            <span>{FOLLOW_UP_CHANNEL_LABEL[f.channel]}</span>
                            {f.status === 'pending' && (
                              <span className={overdue ? 'fu__overdue' : undefined}>
                                {f.dueAt ? `${overdue ? 'Vencido · ' : ''}${formatDateTime(f.dueAt)}` : 'Sin fecha'}
                              </span>
                            )}
                            {f.status === 'completed' && <span>Hecho el {formatDate(f.completedAt)}</span>}
                            {f.status === 'completed' && f.outcome && <span>{OUTCOME_LABEL[f.outcome]}</span>}
                            {f.status === 'cancelled' && <span>Cancelado: {cancelReasonLabel(f.cancelReason)}</span>}
                          </>
                        )}
                        {f.assignedUser && <span>{f.assignedUser.fullName}</span>}
                      </p>
                    </div>
                    {automatic
                      ? f.status !== 'cancelled' && (
                          <div className="fu__actions">
                            <Button size="sm" variant={approve ? 'primary' : 'secondary'} icon={Eye} onClick={() => setReviewing(f)}>
                              {approve ? 'Revisar' : f.status === 'pending' ? 'Ver' : 'Ver envío'}
                            </Button>
                          </div>
                        )
                      : canWrite &&
                        f.status === 'pending' && (
                          <div className="fu__actions">
                            <Button size="sm" icon={Check} onClick={() => setCompleting(f)}>
                              Hecho
                            </Button>
                            <Button size="sm" variant="ghost" iconOnly icon={X} aria-label={`Cancelar «${f.title}»`} onClick={() => setCancelling(f)} />
                          </div>
                        )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {followUps.hasNextPage && (
          <div className="panel__footer">
            <span className="small muted">{items.length} cargados</span>
            <Button onClick={() => void followUps.fetchNextPage()} loading={followUps.isFetchingNextPage}>
              Cargar más
            </Button>
          </div>
        )}
      </section>

      {completing && <CompleteFollowUpDialog followUp={completing} onClose={() => setCompleting(null)} />}
      {cancelling && <CancelFollowUpDialog followUp={cancelling} onClose={() => setCancelling(null)} />}
      {reviewing && (
        <AutomaticEmailDialog
          followUp={reviewing}
          onClose={() => setReviewing(null)}
          onCancelRequest={(f) => {
            setReviewing(null);
            setCancelling(f);
          }}
        />
      )}
    </div>
  );
}
