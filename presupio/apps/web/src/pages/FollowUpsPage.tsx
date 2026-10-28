import { CalendarCheck, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useFollowUps, type FollowUpFilters } from '../api/queries';
import type { FollowUp } from '../api/types';
import { useSession } from '../auth/session';
import { Button, EmptyState, ErrorAlert, PageHeader, SkeletonRows } from '../components/ui';
import { formatDate, formatDateTime } from '../lib/format';
import { cancelReasonLabel, FOLLOW_UP_CHANNEL_LABEL, OUTCOME_LABEL } from '../lib/labels';
import { usePageTitle } from '../lib/usePageTitle';
import { CancelFollowUpDialog, CHANNEL_ICON, CompleteFollowUpDialog } from './quotes/FollowUpDialogs';

const TABS: Array<{ value: FollowUpFilters['status']; label: string }> = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'completed', label: 'Realizados' },
  { value: 'cancelled', label: 'Cancelados' },
];

export function FollowUpsPage() {
  usePageTitle('Seguimientos');
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('estado');
  const status: FollowUpFilters['status'] = statusParam === 'completed' || statusParam === 'cancelled' ? statusParam : 'pending';
  const mine = params.get('mios') === '1';
  const followUps = useFollowUps({ status, ...(mine ? { assignedTo: 'me' as const } : {}) });
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const items = followUps.data?.pages.flatMap((p) => p.items) ?? [];
  const sorted =
    status === 'pending'
      ? [...items].sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
      : items;
  const now = Date.now();
  const canWrite = session.can('follow_ups:write');

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
        description="Llamadas, emails, visitas y tareas de todos los presupuestos. Presupio no envía mensajes: aquí ves lo que tu equipo ha programado o registrado."
      />

      <section className="panel">
        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Estado del seguimiento">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                className="tab"
                aria-selected={status === t.value}
                onClick={() => update('estado', t.value === 'pending' ? null : t.value)}
              >
                {t.label}
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
            <EmptyState icon={CalendarCheck} title={status === 'pending' ? 'No hay seguimientos pendientes' : 'Nada por aquí'}>
              {status === 'pending'
                ? 'Programa el siguiente contacto desde la ficha de cada presupuesto pendiente.'
                : 'Cuando se registren seguimientos, aparecerán en esta lista.'}
            </EmptyState>
          ) : (
            <ul className="fu-list fu-list--page">
              {sorted.map((f) => {
                const Icon = CHANNEL_ICON[f.channel];
                const overdue = f.status === 'pending' && f.dueAt && Date.parse(f.dueAt) < now;
                return (
                  <li key={f.id} className="fu">
                    <span className={`fu__icon fu__icon--${f.status}`} aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="fu__main">
                      <p className="fu__title">
                        <Link to={`/presupuestos/${f.quoteId}`}>{f.title}</Link>
                      </p>
                      <p className="row__meta">
                        <span>{f.contact.fullName}</span>
                        <span className="truncate" style={{ maxWidth: '18rem' }}>
                          {f.quote.title}
                        </span>
                        <span>{FOLLOW_UP_CHANNEL_LABEL[f.channel]}</span>
                        {f.status === 'pending' && (
                          <span className={overdue ? 'fu__overdue' : undefined}>
                            {f.dueAt ? `${overdue ? 'Vencido · ' : ''}${formatDateTime(f.dueAt)}` : 'Sin fecha'}
                          </span>
                        )}
                        {f.status === 'completed' && <span>Hecho el {formatDate(f.completedAt)}</span>}
                        {f.status === 'completed' && f.outcome && <span>{OUTCOME_LABEL[f.outcome]}</span>}
                        {f.status === 'cancelled' && <span>Cancelado: {cancelReasonLabel(f.cancelReason)}</span>}
                        {f.assignedUser && <span>{f.assignedUser.fullName}</span>}
                      </p>
                    </div>
                    {canWrite && f.status === 'pending' && (
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
    </div>
  );
}
