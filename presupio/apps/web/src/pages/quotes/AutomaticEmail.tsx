import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Check } from 'lucide-react';
import { api } from '../../api/client';
import { keys, useAutomation, useFollowUpDeliveries, useFollowUpPreview } from '../../api/queries';
import type { FollowUp, MessageDelivery } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, Button, ErrorAlert, Skeleton } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { cancelReasonLabel, DELIVERY_STATUS_LABEL, failureReasonLabel } from '../../lib/labels';
import { useRefreshQuoteData } from './quoteMutations';

export type RuleTone = 'due' | 'fresh' | 'accepted' | 'danger' | 'neutral';

/** Estado de un email automático en una frase corta, con su tono visual. */
export function ruleStatus(f: FollowUp, requireApproval: boolean | undefined, now = Date.now()): { text: string; tone: RuleTone } {
  const due = f.dueAt ? formatDateTime(f.dueAt) : 'sin fecha';
  const overdue = !!f.dueAt && Date.parse(f.dueAt) <= now;
  switch (f.status) {
    case 'pending':
      if (f.attemptCount > 0) return { text: `Reintento previsto ${due} (${failureReasonLabel(f.failureReason)})`, tone: 'due' };
      if (f.approvedAt) return { text: overdue ? 'Aprobado · sale en el próximo ciclo de envío' : `Aprobado · sale el ${due}`, tone: 'fresh' };
      if (requireApproval) return { text: `Pendiente de aprobación · previsto ${due}`, tone: 'due' };
      return { text: overdue ? 'Programado · sale en el próximo ciclo de envío' : `Programado · ${due}`, tone: 'fresh' };
    case 'sending':
      return { text: 'Enviándose…', tone: 'neutral' };
    case 'sent':
      return { text: `Enviado el ${formatDateTime(f.sentAt)}`, tone: 'accepted' };
    case 'failed':
      return { text: `No se pudo enviar: ${failureReasonLabel(f.failureReason)}`, tone: 'danger' };
    case 'cancelled':
      return { text: `Cancelado: ${cancelReasonLabel(f.cancelReason)}`, tone: 'neutral' };
    case 'unknown':
      return { text: 'Por revisar: el envío se interrumpió y no se sabe si salió', tone: 'due' };
    default:
      return { text: '', tone: 'neutral' };
  }
}

export function needsApproval(f: FollowUp, requireApproval: boolean | undefined): boolean {
  return f.source === 'rule' && f.status === 'pending' && !f.approvedAt && !!requireApproval;
}

function Attempt({ d, tracksDelivery }: { d: MessageDelivery; tracksDelivery: boolean }) {
  const tone = d.status === 'delivered' ? 'accepted' : d.status === 'sent' ? 'fresh' : d.status === 'failed' || d.status === 'unknown' ? 'danger' : 'neutral';
  return (
    <li className="attempt">
      <div className="attempt__head">
        <span className="strong">Intento {d.attemptNumber}</span>
        <span className={`pill pill--${tone}`}>{DELIVERY_STATUS_LABEL[d.status]}</span>
      </div>
      <dl className="kv kv--compact">
        <dt>Para</dt>
        <dd className="truncate">{d.recipient}</dd>
        <dt>Iniciado</dt>
        <dd>{formatDateTime(d.createdAt)}</dd>
        {d.sentAt && (
          <>
            <dt>Aceptado</dt>
            <dd>{formatDateTime(d.sentAt)}</dd>
          </>
        )}
        {d.deliveredAt && (
          <>
            <dt>Entregado</dt>
            <dd>{formatDateTime(d.deliveredAt)}</dd>
          </>
        )}
        {(d.failedAt || d.errorCode) && (
          <>
            <dt>Error</dt>
            <dd>
              {failureReasonLabel(d.errorCode)}
              {d.errorDetail && <span className="cell-sub">{d.errorDetail}</span>}
            </dd>
          </>
        )}
        <dt>Proveedor</dt>
        <dd>
          {d.provider}
          {d.providerMessageId && <span className="cell-sub ref-id">Id. {d.providerMessageId}</span>}
        </dd>
        <dt>Plantilla</dt>
        <dd>
          Email {d.templateStep}, versión {d.templateVersion}
        </dd>
      </dl>
      {d.status === 'sent' && !tracksDelivery && (
        <p className="small muted">Este proveedor no confirma entregas: «aceptado» no garantiza que haya llegado a la bandeja del cliente.</p>
      )}
      {d.contentPurgedAt ? (
        <p className="small muted">El texto de este envío se borró el {formatDateTime(d.contentPurgedAt)} según la política de conservación.</p>
      ) : (
        d.bodyText && (
          <details className="attempt__content">
            <summary>Ver el mensaje enviado</summary>
            <p className="strong">{d.subject}</p>
            <pre className="email-text">{d.bodyText}</pre>
          </details>
        )
      )}
    </li>
  );
}

/**
 * Revisión de un email automático: contenido exacto (el aprobado o el que se enviaría ahora),
 * aprobación y trazabilidad de cada intento de envío.
 */
export function AutomaticEmailDialog({
  followUp: f,
  contactId,
  onClose,
  onCancelRequest,
}: {
  followUp: FollowUp;
  contactId?: string;
  onClose: () => void;
  onCancelRequest?: (f: FollowUp) => void;
}) {
  const session = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useRefreshQuoteData();
  const automation = useAutomation();
  const requireApproval = automation.data?.automation.requireApproval;
  const showPreview = f.status === 'pending' || f.status === 'sending';
  const preview = useFollowUpPreview(f.id, showPreview);
  const attempts = useFollowUpDeliveries(f.id, f.attemptCount > 0 || f.status !== 'pending');
  const canWrite = session.can('follow_ups:write');

  const approve = useMutation({
    mutationFn: () => api<{ followUp: FollowUp }>(`/follow-ups/${f.id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      refresh(contactId);
      void queryClient.invalidateQueries({ queryKey: keys.automation });
      toast.success('Email aprobado. Saldrá en la fecha prevista si el cliente sigue sin responder.');
      onClose();
    },
  });

  const status = ruleStatus(f, requireApproval);
  const canApprove = canWrite && needsApproval(f, requireApproval);
  const canCancel = canWrite && f.status === 'pending' && !!onCancelRequest;
  const canResolve = f.status === 'unknown' && session.can('settings:update');
  const resolve = useMutation({
    mutationFn: (outcome: 'sent' | 'not_sent') =>
      api<{ resolution: { outcome: string; attemptCounted: boolean } }>(`/follow-ups/${f.id}/resolve`, { method: 'POST', body: { outcome } }),
    onSuccess: (res) => {
      refresh(contactId);
      void queryClient.invalidateQueries({ queryKey: keys.automation });
      void queryClient.invalidateQueries({ queryKey: keys.usage });
      toast.success(
        res.resolution.outcome === 'sent'
          ? res.resolution.attemptCounted
            ? 'Marcado como enviado. Cuenta como un intento de tu plan.'
            : 'Marcado como enviado. No se ha descontado: tu periodo ya no tenía intentos libres.'
          : 'Marcado como no enviado. No consume intentos y no se reenvía solo.',
      );
      onClose();
    },
  });

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={f.title}
      description={<span className={`pill pill--${status.tone}`}>{status.text}</span>}
      onSubmit={canApprove ? () => approve.mutate() : undefined}
      submitLabel="Aprobar envío"
      submitting={approve.isPending}
      cancelLabel="Cerrar"
      footerExtra={
        canCancel ? (
          <Button variant="quiet-danger" icon={Ban} onClick={() => onCancelRequest!(f)}>
            No enviar este email
          </Button>
        ) : undefined
      }
    >
      <div className="stack">
        {approve.isError && <ErrorAlert error={approve.error} />}
        {f.status === 'unknown' && (
          <Alert tone="warning" title="Este email necesita revisión">
            El envío se interrumpió después de entregarlo al proveedor de email, así que puede haber salido o no. Presupio no lo reenvía (para no
            duplicarlo) ni lo cobra mientras no se confirme. Compruébalo en tu proveedor de email o con el cliente.
            {canResolve && (
              <span className="cluster" style={{ marginTop: 'var(--s-3)' }}>
                <Button size="sm" loading={resolve.isPending && resolve.variables === 'sent'} onClick={() => resolve.mutate('sent')}>
                  Sí se envió
                </Button>
                <Button size="sm" variant="ghost" loading={resolve.isPending && resolve.variables === 'not_sent'} onClick={() => resolve.mutate('not_sent')}>
                  No se envió
                </Button>
              </span>
            )}
          </Alert>
        )}
        {resolve.isError && <ErrorAlert error={resolve.error} />}
        {showPreview &&
          (preview.isPending ? (
            <Skeleton height="14rem" />
          ) : preview.isError ? (
            <ErrorAlert error={preview.error} onRetry={() => void preview.refetch()} />
          ) : (
            <section className="email-preview" aria-label="Vista previa del email">
              <dl className="email-preview__meta">
                <dt>Para</dt>
                <dd>{preview.data.preview.to ?? 'El contacto no tiene email'}</dd>
                <dt>Responder a</dt>
                <dd>{preview.data.preview.replyTo ?? 'Sin configurar'}</dd>
                <dt>Asunto</dt>
                <dd className="strong">{preview.data.preview.subject}</dd>
              </dl>
              <pre className="email-text">{preview.data.preview.text}</pre>
              <p className="small muted">
                {preview.data.preview.approved ? (
                  <>
                    <Check aria-hidden="true" className="inline-icon" /> Este es el texto aprobado: es exactamente lo que se enviará, aunque edites la
                    plantilla después.
                  </>
                ) : (
                  `Texto generado con la plantilla vigente (email ${preview.data.preview.templateStep}, versión ${preview.data.preview.templateVersion}). Al aprobarlo, se guarda tal cual.`
                )}{' '}
                El enlace de baja es personal y se genera en el momento del envío.
              </p>
            </section>
          ))}
        {canApprove && (
          <Alert tone="info">
            Antes de enviarse se comprueba otra vez que el cliente no haya respondido, no se haya dado de baja y que el envío automático siga activo.
          </Alert>
        )}
        {(f.attemptCount > 0 || f.status !== 'pending') && (
          <section aria-labelledby="attempts-title" className="stack">
            <h3 id="attempts-title" className="section-title">
              Intentos de envío
            </h3>
            {attempts.isPending ? (
              <Skeleton height="6rem" />
            ) : attempts.isError ? (
              <ErrorAlert error={attempts.error} />
            ) : attempts.data.items.length === 0 ? (
              <p className="small muted">No hubo ningún intento de envío.</p>
            ) : (
              <ol className="attempts">
                {attempts.data.items.map((d) => (
                  <Attempt key={d.id} d={d} tracksDelivery={!!automation.data?.provider.tracksDelivery} />
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
