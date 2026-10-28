import { useMutation } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarPlus,
  Check,
  CircleSlash,
  FileQuestion,
  History,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  ShieldBan,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, isApiError } from '../../api/client';
import { useContact, useMembers, useQuote, useQuoteActivity, useQuoteFollowUps } from '../../api/queries';
import type { FollowUp, Quote, QuoteStatus } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { Menu } from '../../components/Menu';
import { useToast } from '../../components/Toasts';
import { Alert, Button, buttonClass, EmptyState, ErrorAlert, Field, Ref, Skeleton, SkeletonRows, StatusPill } from '../../components/ui';
import { dateInputToIsoAfter, daysSince, formatDate, formatDateTime, formatDays, formatMoney, formatRelative, toDateInput } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import {
  CONTACT_CHANNEL_LABEL,
  EXCLUSION_REASON_LABEL,
  FOLLOW_UP_CHANNEL_LABEL,
  OUTCOME_LABEL,
  QUOTE_STATUS_LABEL,
  QUOTE_TRANSITION_LABEL,
  cancelReasonLabel,
  describeActivity,
} from '../../lib/labels';
import { centsToInput, parseEuroInput } from '../../lib/money';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required } from '../../lib/validation';
import { blockedChannels, CancelFollowUpDialog, CHANNEL_ICON, CompleteFollowUpDialog, NewFollowUpDialog } from './FollowUpDialogs';
import { useRefreshQuoteData } from './quoteMutations';
import { StatusDialog } from './StatusDialogs';

// Transiciones "hacia delante" frente a correcciones de estados finales (solo propietario/administrador).
const CORRECTIONS: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  accepted: ['responded'],
  rejected: ['responded', 'sent'],
};

function Outcome({ quote }: { quote: Quote }) {
  if (quote.outcome.recoveredSale && quote.acceptance) {
    return (
      <Alert tone="success" title="Venta confirmada tras seguimiento">
        Aceptado el {formatDate(quote.acceptedAt)} después de un seguimiento registrado. Evidencia: «{quote.acceptance.evidence}».
        {quote.acceptance.amountCents !== null && ` Importe declarado por tu empresa: ${formatMoney(quote.acceptance.amountCents, quote.currency)}.`}
      </Alert>
    );
  }
  if (quote.status === 'accepted' && quote.acceptance) {
    return (
      <Alert tone="success" title="Venta confirmada">
        Aceptado el {formatDate(quote.acceptedAt)}. Evidencia: «{quote.acceptance.evidence}». No consta un seguimiento previo a la respuesta, así
        que no cuenta como venta recuperada.
      </Alert>
    );
  }
  if (quote.outcome.reactivated) {
    return (
      <Alert tone="info" title="Oportunidad reactivada">
        El cliente respondió el {formatDate(quote.reactivatedAt)}, después de un seguimiento registrado. Aún no es una venta.
      </Alert>
    );
  }
  return null;
}

function EditQuoteDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const members = useMembers();
  const refresh = useRefreshQuoteData();
  const toast = useToast();
  const today = toDateInput(new Date());
  const [f, setF] = useState({
    title: quote.title,
    reference: quote.reference ?? '',
    amount: centsToInput(quote.amountCents),
    description: quote.description ?? '',
    sentDate: quote.sentAt ? toDateInput(new Date(quote.sentAt)) : '',
    validUntil: quote.validUntil ?? '',
    owner: quote.owner?.id ?? '',
  });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    clearField(k);
  };
  const mutation = useMutation({
    mutationFn: (body: object) => api(`/quotes/${quote.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      refresh(quote.contact.id);
      toast.success('Presupuesto actualizado.');
      onClose();
    },
    onError: (e) => handleError(e, { amountCents: 'amount', sentAt: 'sentDate', ownerUserId: 'owner' }),
  });

  const submit = () => {
    setFormError(null);
    const amountCents = f.amount.trim() ? parseEuroInput(f.amount) : null;
    const errs = compact({
      title: required(f.title, 200, 'El título'),
      amount: f.amount.trim() && amountCents === null ? 'Importe no válido' : undefined,
      sentDate: quote.status === 'draft' ? undefined : !f.sentDate ? 'Indica la fecha de envío' : f.sentDate > today ? 'No puede ser una fecha futura' : undefined,
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, unknown> = {};
    if (f.title.trim() !== quote.title) body.title = f.title.trim();
    if ((f.reference.trim() || null) !== quote.reference) body.reference = f.reference.trim() || null;
    if (amountCents !== quote.amountCents) body.amountCents = amountCents;
    if ((f.description.trim() || null) !== quote.description) body.description = f.description.trim();
    if ((f.validUntil || null) !== quote.validUntil) body.validUntil = f.validUntil || null;
    if ((f.owner || null) !== (quote.owner?.id ?? null)) body.ownerUserId = f.owner || null;
    if (quote.status !== 'draft' && quote.sentAt && f.sentDate !== toDateInput(new Date(quote.sentAt))) body.sentAt = dateInputToIsoAfter(f.sentDate, null);
    if (!Object.keys(body).length) {
      onClose();
      return;
    }
    mutation.mutate(body);
  };

  return (
    <Dialog open onClose={onClose} title="Editar presupuesto" onSubmit={submit} submitLabel="Guardar cambios" submitting={mutation.isPending}>
      <div className="form" ref={(el) => void (formRef.current = el?.closest('form') ?? null)}>
        {formError != null && <ErrorAlert error={formError} />}
        <Field label="Título" error={errors.title}>
          <input className="input" value={f.title} onChange={set('title')} maxLength={200} />
        </Field>
        <div className="form-row">
          <Field label="Referencia" error={errors.reference} optional>
            <input className="input" value={f.reference} onChange={set('reference')} maxLength={80} />
          </Field>
          <Field label="Importe" error={errors.amount} optional>
            <div className="input-affix">
              <input className="input num" inputMode="decimal" value={f.amount} onChange={set('amount')} />
              <span className="input-affix__suffix">€</span>
            </div>
          </Field>
        </div>
        <div className="form-row">
          {quote.status !== 'draft' && (
            <Field label="Fecha de envío" error={errors.sentDate}>
              <input className="input" type="date" max={today} value={f.sentDate} onChange={set('sentDate')} />
            </Field>
          )}
          <Field label="Válido hasta" error={errors.validUntil} optional>
            <input className="input" type="date" value={f.validUntil} onChange={set('validUntil')} />
          </Field>
        </div>
        <Field label="Responsable" error={errors.owner}>
          <select className="select" value={f.owner} onChange={set('owner')}>
            <option value="">Sin asignar</option>
            {(members.data?.items ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descripción" optional>
          <textarea className="textarea" rows={3} value={f.description} onChange={set('description')} maxLength={10000} />
        </Field>
      </div>
    </Dialog>
  );
}

function ArchiveDialog({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  const refresh = useRefreshQuoteData();
  const toast = useToast();
  const archiving = !quote.archivedAt;
  const mutation = useMutation({
    mutationFn: () => api<{ cancelledFollowUps?: number }>(`/quotes/${quote.id}/${archiving ? 'archive' : 'unarchive'}`, { method: 'POST' }),
    onSuccess: (res) => {
      refresh(quote.contact.id);
      toast.success(
        archiving
          ? `Presupuesto archivado.${res.cancelledFollowUps ? ` ${res.cancelledFollowUps} seguimiento(s) pendiente(s) cancelado(s).` : ''}`
          : 'Presupuesto recuperado del archivo.',
      );
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={archiving ? 'Archivar presupuesto' : 'Recuperar del archivo'}
      description={
        archiving
          ? 'Dejará de aparecer en los listados y en el panel, y se cancelarán sus seguimientos pendientes. No se borra: podrás recuperarlo.'
          : 'Volverá a aparecer en los listados y en el panel.'
      }
      onSubmit={() => mutation.mutate()}
      submitLabel={archiving ? 'Archivar' : 'Recuperar'}
      submitting={mutation.isPending}
    >
      {mutation.isError && <ErrorAlert error={mutation.error} />}
    </Dialog>
  );
}

function FollowUpItem({
  f,
  canWrite,
  onComplete,
  onCancel,
}: {
  f: FollowUp;
  canWrite: boolean;
  onComplete: (f: FollowUp) => void;
  onCancel: (f: FollowUp) => void;
}) {
  const Icon = CHANNEL_ICON[f.channel];
  const overdue = f.status === 'pending' && f.dueAt && new Date(f.dueAt).getTime() < Date.now();
  return (
    <li className="fu">
      <span className={`fu__icon fu__icon--${f.status}`} aria-hidden="true">
        <Icon />
      </span>
      <div className="fu__main">
        <p className="fu__title">{f.title}</p>
        <p className="row__meta">
          <span>{FOLLOW_UP_CHANNEL_LABEL[f.channel]}</span>
          {f.status === 'pending' && (
            <span className={overdue ? 'fu__overdue' : undefined}>
              {f.dueAt ? `${overdue ? 'Vencido · ' : ''}${formatDateTime(f.dueAt)}` : 'Sin fecha'}
            </span>
          )}
          {f.status === 'completed' && <span>Hecho el {formatDate(f.completedAt)}</span>}
          {f.status === 'completed' && f.outcome && <span>{OUTCOME_LABEL[f.outcome]}</span>}
          {f.status === 'cancelled' && <span>Cancelado: {cancelReasonLabel(f.cancelReason)}</span>}
          {f.assignedUser && f.status === 'pending' && <span>{f.assignedUser.fullName}</span>}
        </p>
        {f.notes && <p className="fu__notes">{f.notes}</p>}
      </div>
      {canWrite && f.status === 'pending' && (
        <div className="fu__actions">
          <Button size="sm" icon={Check} onClick={() => onComplete(f)}>
            Hecho
          </Button>
          <Button size="sm" variant="ghost" iconOnly icon={X} aria-label={`Cancelar «${f.title}»`} onClick={() => onCancel(f)} />
        </div>
      )}
    </li>
  );
}

export function QuoteDetailPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const quoteQuery = useQuote(id);
  const quote = quoteQuery.data?.quote;
  const contact = useContact(quote?.contact.id);
  const followUps = useQuoteFollowUps(id);
  const activity = useQuoteActivity(id);
  usePageTitle(quote ? quote.title : 'Presupuesto');

  const [statusTarget, setStatusTarget] = useState<{ status: QuoteStatus; correction: boolean } | null>(null);
  const [followUpMode, setFollowUpMode] = useState<'logged' | 'scheduled' | null>(null);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const blocked = useMemo(() => blockedChannels(contact.data?.activeExclusions ?? []), [contact.data]);
  const groups = useMemo(() => {
    const items = followUps.data?.items ?? [];
    const pending = items
      .filter((f) => f.status === 'pending')
      .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
    const done = items.filter((f) => f.status !== 'pending');
    return { pending, done };
  }, [followUps.data]);

  if (quoteQuery.isPending) {
    return (
      <div className="page" role="status" aria-label="Cargando presupuesto">
        <Skeleton width="10rem" />
        <Skeleton width="60%" height="2rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }
  if (quoteQuery.isError) {
    if (isApiError(quoteQuery.error, 404) || isApiError(quoteQuery.error, 400)) {
      return (
        <div className="page">
          <EmptyState
            icon={FileQuestion}
            title="Presupuesto no encontrado"
            action={
              <Link to="/presupuestos" className={buttonClass('secondary')}>
                Volver a presupuestos
              </Link>
            }
          >
            No existe o no pertenece a tu empresa.
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorAlert error={quoteQuery.error} title="No se ha podido cargar el presupuesto" onRetry={() => void quoteQuery.refetch()} />
      </div>
    );
  }

  const q = quoteQuery.data.quote;
  const canWrite = session.can('quotes:write');
  const canFollowUp = session.can('follow_ups:write') && !q.archivedAt && ['draft', 'sent', 'responded'].includes(q.status);
  const allowed = quoteQuery.data.allowedTransitions;
  const forward = allowed.filter((s) => !(CORRECTIONS[q.status] ?? []).includes(s));
  const corrections = allowed.filter((s) => (CORRECTIONS[q.status] ?? []).includes(s));
  const waitingDays = q.status === 'sent' && q.sentAt ? daysSince(q.sentAt) : null;
  const activityItems = activity.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="page">
      <header className="page-header quote-header">
        <div className="page-header__text">
          <nav className="breadcrumb" aria-label="Ruta de navegación">
            <Link to="/presupuestos">
              <ArrowLeft aria-hidden="true" /> Presupuestos
            </Link>
          </nav>
          {q.reference && <Ref>{q.reference}</Ref>}
          <h1>{q.title}</h1>
          <div className="cluster">
            <StatusPill status={q.status} archived={!!q.archivedAt} />
            {waitingDays !== null && <span className="small muted">{waitingDays === 0 ? 'Enviado hoy' : `${formatDays(waitingDays)} sin respuesta`}</span>}
          </div>
        </div>
        {canWrite && (
          <div className="page-header__actions">
            {!q.archivedAt && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
            <Menu
              label="Más acciones"
              trigger={(props) => (
                <button type="button" className="btn btn--icon" aria-label="Más acciones" {...props}>
                  <MoreHorizontal aria-hidden="true" />
                </button>
              )}
            >
              {(close) => (
                <>
                  {corrections.map((s) => (
                    <li role="none" key={s}>
                      <button
                        role="menuitem"
                        type="button"
                        className="menu__item"
                        onClick={() => {
                          close();
                          setStatusTarget({ status: s, correction: true });
                        }}
                      >
                        <History aria-hidden="true" /> Corregir a «{QUOTE_STATUS_LABEL[s]}»
                      </button>
                    </li>
                  ))}
                  <li role="none">
                    <button
                      role="menuitem"
                      type="button"
                      className="menu__item"
                      onClick={() => {
                        close();
                        setArchiving(true);
                      }}
                    >
                      {q.archivedAt ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                      {q.archivedAt ? 'Recuperar del archivo' : 'Archivar'}
                    </button>
                  </li>
                </>
              )}
            </Menu>
          </div>
        )}
      </header>

      {q.archivedAt && <Alert tone="info">Este presupuesto está archivado desde el {formatDate(q.archivedAt)}. Recupéralo para editarlo o cambiar su estado.</Alert>}
      <Outcome quote={q} />
      {contact.data && contact.data.activeExclusions.length > 0 && (
        <Alert tone="warning" title="Contacto en la lista de exclusión">
          {contact.data.activeExclusions
            .map((ex) => `${ex.channel ? CONTACT_CHANNEL_LABEL[ex.channel] : 'Todos los canales'} (${EXCLUSION_REASON_LABEL[ex.reason].toLowerCase()})`)
            .join(' · ')}
          . Presupio no te dejará registrar contactos por esos canales.
        </Alert>
      )}

      {canWrite && !q.archivedAt && forward.length > 0 && (
        <section className="next-step" aria-labelledby="next-step-title">
          <h2 id="next-step-title" className="next-step__title">
            Siguiente paso
          </h2>
          <div className="cluster">
            {forward.map((s) => (
              <Button
                key={s}
                variant={s === 'accepted' ? 'primary' : 'secondary'}
                icon={s === 'rejected' ? CircleSlash : s === 'accepted' ? Check : undefined}
                onClick={() => setStatusTarget({ status: s, correction: false })}
              >
                {QUOTE_TRANSITION_LABEL[s]}
              </Button>
            ))}
          </div>
        </section>
      )}

      <div className="detail-grid">
        <div className="stack stack--lg">
          <section className="panel" aria-labelledby="fu-title">
            <div className="panel__header">
              <div>
                <h2 id="fu-title">Seguimiento</h2>
                <p>Lo hecho y lo pendiente con este cliente.</p>
              </div>
              {canFollowUp && (
                <div className="cluster">
                  <Button size="sm" icon={CalendarPlus} onClick={() => setFollowUpMode('scheduled')}>
                    Programar
                  </Button>
                  <Button size="sm" variant="primary" icon={NotebookPen} onClick={() => setFollowUpMode('logged')}>
                    Registrar contacto
                  </Button>
                </div>
              )}
            </div>
            {followUps.isPending ? (
              <SkeletonRows rows={2} />
            ) : followUps.isError ? (
              <div className="panel__body">
                <ErrorAlert error={followUps.error} onRetry={() => void followUps.refetch()} />
              </div>
            ) : groups.pending.length + groups.done.length === 0 ? (
              <EmptyState icon={NotebookPen} title="Sin seguimientos todavía">
                {canFollowUp
                  ? 'Registra la primera llamada o mensaje, o programa cuándo volver a contactar.'
                  : 'No se ha registrado ningún contacto con este cliente.'}
              </EmptyState>
            ) : (
              <div className="fu-groups">
                <div>
                  <h3 className="fu-groups__title">
                    Pendiente <span className="tab__count">{groups.pending.length}</span>
                  </h3>
                  {groups.pending.length === 0 ? (
                    <p className="small muted fu-groups__empty">No hay nada programado.</p>
                  ) : (
                    <ul className="fu-list">
                      {groups.pending.map((f) => (
                        <FollowUpItem key={f.id} f={f} canWrite={session.can('follow_ups:write')} onComplete={setCompleting} onCancel={setCancelling} />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="fu-groups__title">
                    Realizado y cancelado <span className="tab__count">{groups.done.length}</span>
                  </h3>
                  {groups.done.length === 0 ? (
                    <p className="small muted fu-groups__empty">Aún no hay contactos realizados.</p>
                  ) : (
                    <ul className="fu-list">
                      {groups.done.map((f) => (
                        <FollowUpItem key={f.id} f={f} canWrite={false} onComplete={setCompleting} onCancel={setCancelling} />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="history-title">
            <div className="panel__header">
              <h2 id="history-title">Historial</h2>
            </div>
            <div className="panel__body">
              {activity.isPending ? (
                <SkeletonRows rows={3} />
              ) : activity.isError ? (
                <ErrorAlert error={activity.error} onRetry={() => void activity.refetch()} />
              ) : (
                <>
                  <ol className="timeline">
                    {activityItems.map((e) => {
                      const tone =
                        e.action === 'quote.status_changed'
                          ? e.metadata.to === 'accepted' || e.metadata.reactivated
                            ? 'good'
                            : 'status'
                          : e.action.startsWith('follow_up.logged') || e.action === 'follow_up.completed'
                            ? 'contact'
                            : '';
                      const note = typeof e.metadata.note === 'string' ? e.metadata.note : null;
                      return (
                        <li key={e.id}>
                          <span className={`timeline__mark ${tone ? `timeline__mark--${tone}` : ''}`} aria-hidden="true" />
                          <div>
                            <p className="timeline__text">
                              <strong>{e.actor?.fullName ?? 'Sistema'}</strong> {describeActivity(e)}
                            </p>
                            <time className="timeline__time" dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                              {formatRelative(e.createdAt)}
                            </time>
                            {note && <p className="timeline__note">{note}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {activity.hasNextPage && (
                    <Button size="sm" onClick={() => void activity.fetchNextPage()} loading={activity.isFetchingNextPage}>
                      Ver más historial
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="stack stack--lg" aria-label="Datos del presupuesto">
          <section className="panel" aria-labelledby="data-title">
            <div className="panel__header">
              <h2 id="data-title">Datos</h2>
            </div>
            <div className="panel__body">
              <dl className="kv">
                <dt>Importe</dt>
                <dd className="num strong">{formatMoney(q.amountCents, q.currency)}</dd>
                <dt>Enviado</dt>
                <dd>{q.sentAt ? formatDate(q.sentAt) : 'Todavía no'}</dd>
                <dt>Válido hasta</dt>
                <dd>{q.validUntil ? formatDate(q.validUntil) : '—'}</dd>
                <dt>Último contacto</dt>
                <dd>{q.lastFollowUpAt ? formatDate(q.lastFollowUpAt) : 'Ninguno registrado'}</dd>
                {q.respondedAt && (
                  <>
                    <dt>Respuesta</dt>
                    <dd>{formatDate(q.respondedAt)}</dd>
                  </>
                )}
                {q.rejectedAt && (
                  <>
                    <dt>Motivo del rechazo</dt>
                    <dd>{q.rejectionReason ?? 'No indicado'}</dd>
                  </>
                )}
                <dt>Responsable</dt>
                <dd>{q.owner?.fullName ?? 'Sin asignar'}</dd>
                <dt>Registrado</dt>
                <dd>{formatDate(q.createdAt)}</dd>
              </dl>
              {q.description && <p className="quote-description">{q.description}</p>}
            </div>
          </section>

          <section className="panel" aria-labelledby="client-title">
            <div className="panel__header">
              <h2 id="client-title">Cliente</h2>
              <Link to={`/contactos/${q.contact.id}`} className={buttonClass('ghost', 'sm')}>
                Ver ficha
              </Link>
            </div>
            <div className="panel__body">
              <dl className="kv">
                <dt>Nombre</dt>
                <dd className="strong">{q.contact.fullName}</dd>
                {q.contact.organization && (
                  <>
                    <dt>Empresa</dt>
                    <dd>{q.contact.organization}</dd>
                  </>
                )}
                <dt>Email</dt>
                <dd>{q.contact.email ? <a href={`mailto:${q.contact.email}`}>{q.contact.email}</a> : '—'}</dd>
                <dt>Teléfono</dt>
                <dd>{q.contact.phone ? <a href={`tel:${q.contact.phone}`}>{q.contact.phone}</a> : '—'}</dd>
              </dl>
              {contact.data && contact.data.activeExclusions.length > 0 && (
                <p className="small exclusion-note">
                  <ShieldBan aria-hidden="true" /> Con exclusiones activas
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>

      {statusTarget && <StatusDialog quote={q} target={statusTarget.status} correction={statusTarget.correction} onClose={() => setStatusTarget(null)} />}
      {followUpMode && <NewFollowUpDialog quote={q} mode={followUpMode} blocked={blocked} onClose={() => setFollowUpMode(null)} />}
      {completing && <CompleteFollowUpDialog followUp={completing} contactId={q.contact.id} onClose={() => setCompleting(null)} />}
      {cancelling && <CancelFollowUpDialog followUp={cancelling} contactId={q.contact.id} onClose={() => setCancelling(null)} />}
      {editing && <EditQuoteDialog quote={q} onClose={() => setEditing(false)} />}
      {archiving && <ArchiveDialog quote={q} onClose={() => setArchiving(false)} />}
    </div>
  );
}
