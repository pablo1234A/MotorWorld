import { useMutation } from '@tanstack/react-query';
import { ClipboardList, Mail, MapPin, MessageCircle, MessageSquare, Phone, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import { useMembers } from '../../api/queries';
import type { ContactChannel, FollowUp, FollowUpChannel, FollowUpOutcome, Quote } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, ErrorAlert, Field } from '../../components/ui';
import { dateInputToIsoAfter, dateTimeInputToIso, toDateInput } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { FOLLOW_UP_CHANNEL_LABEL, OUTCOME_LABEL } from '../../lib/labels';
import { compact } from '../../lib/validation';
import { useRefreshQuoteData } from './quoteMutations';

export const CHANNEL_ICON: Record<FollowUpChannel, LucideIcon> = {
  phone: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  in_person: MapPin,
  task: ClipboardList,
};

const CHANNELS: FollowUpChannel[] = ['phone', 'email', 'whatsapp', 'sms', 'in_person', 'task'];

/** Canales bloqueados por las exclusiones activas del contacto. */
export function blockedChannels(exclusions: Array<{ channel: ContactChannel | null }>): Set<FollowUpChannel> {
  const blocked = new Set<FollowUpChannel>();
  for (const ex of exclusions) {
    if (ex.channel === null) ['phone', 'email', 'whatsapp', 'sms', 'in_person'].forEach((c) => blocked.add(c as FollowUpChannel));
    else blocked.add(ex.channel);
  }
  return blocked;
}

interface NewFollowUpProps {
  quote: Quote;
  mode: 'logged' | 'scheduled';
  blocked: Set<FollowUpChannel>;
  onClose: () => void;
}

/** Registrar un contacto ya hecho, o programar un seguimiento o tarea. */
export function NewFollowUpDialog({ quote, mode, blocked, onClose }: NewFollowUpProps) {
  const session = useSession();
  const members = useMembers();
  const refresh = useRefreshQuoteData();
  const toast = useToast();
  const today = toDateInput(new Date());
  const minDate = quote.sentAt ? toDateInput(new Date(quote.sentAt)) : undefined;
  const contactAllowed = quote.status === 'sent' || quote.status === 'responded';
  const firstChannel = CHANNELS.find((c) => !blocked.has(c) && (c === 'task' || contactAllowed)) ?? 'task';

  const [channel, setChannel] = useState<FollowUpChannel>(firstChannel);
  const [outcome, setOutcome] = useState<'' | FollowUpOutcome>('');
  const [date, setDate] = useState(today);
  const [dueAt, setDueAt] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [assignee, setAssignee] = useState(session.user.id);
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();

  const mutation = useMutation({
    mutationFn: (body: object) => api<{ followUp: FollowUp }>(`/quotes/${quote.id}/follow-ups`, { method: 'POST', body }),
    onSuccess: () => {
      refresh(quote.contact.id);
      toast.success(mode === 'logged' ? 'Contacto registrado en el historial.' : 'Seguimiento programado.');
      onClose();
    },
    onError: (e) => handleError(e, { completedAt: 'date', assignedUserId: 'assignee' }),
  });

  const submit = () => {
    setFormError(null);
    const errs = compact({
      date: mode !== 'logged' ? undefined : !date ? 'Indica la fecha' : date > today ? 'No puede ser una fecha futura' : undefined,
      title: title.trim().length > 200 ? 'Máximo 200 caracteres' : undefined,
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      channel,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(mode === 'logged'
        ? {
            status: 'completed',
            completedAt: channel === 'task' ? dateInputToIsoAfter(date, null) : dateInputToIsoAfter(date, quote.sentAt),
            ...(outcome && channel !== 'task' ? { outcome } : {}),
          }
        : { status: 'pending', ...(dueAt ? { dueAt: dateTimeInputToIso(dueAt) } : {}), assignedUserId: assignee || null }),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === 'logged' ? 'Registrar un contacto realizado' : 'Programar un seguimiento'}
      description={
        mode === 'logged'
          ? 'Anota una llamada, un mensaje o una visita que ya has hecho. Aquí se registra lo que haces tú; los emails automáticos van aparte.'
          : 'Deja anotado el próximo paso para no olvidarlo. Aparecerá en Seguimientos.'
      }
      onSubmit={submit}
      submitLabel={mode === 'logged' ? 'Registrar contacto' : 'Programar'}
      submitting={mutation.isPending}
    >
      <div className="form" ref={(el) => void (formRef.current = el?.closest('form') ?? null)}>
        {formError != null && <ErrorAlert error={formError} />}
        <fieldset className="choice-group" aria-label="Canal">
          <legend className="field__label" style={{ width: '100%', marginBottom: 'var(--s-1)' }}>
            Canal
          </legend>
          {CHANNELS.map((c) => {
            const Icon = CHANNEL_ICON[c];
            const disabled = blocked.has(c) || (c !== 'task' && !contactAllowed);
            return (
              <label key={c} className="choice" title={blocked.has(c) ? 'Este contacto pidió no ser contactado por este canal' : undefined}>
                <input type="radio" name="channel" value={c} checked={channel === c} disabled={disabled} onChange={() => setChannel(c)} />
                <span>
                  <Icon aria-hidden="true" />
                  {FOLLOW_UP_CHANNEL_LABEL[c]}
                  {blocked.has(c) && <span className="visually-hidden"> (excluido)</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
        {blocked.size > 0 && <Alert tone="warning">Los canales desactivados están en la lista de exclusión de este contacto.</Alert>}
        {!contactAllowed && <Alert tone="info">Mientras el presupuesto sea un borrador solo puedes anotar tareas internas.</Alert>}

        {mode === 'logged' ? (
          <div className="form-row">
            <Field label="Fecha" error={errors.date}>
              <input
                className="input"
                type="date"
                value={date}
                max={today}
                min={channel === 'task' ? undefined : minDate}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearField('date');
                }}
              />
            </Field>
            {channel !== 'task' && (
              <Field label="Resultado" optional>
                <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}>
                  <option value="">Sin indicar</option>
                  {(Object.keys(OUTCOME_LABEL) as FollowUpOutcome[]).map((o) => (
                    <option key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        ) : (
          <div className="form-row">
            <Field label="Fecha y hora previstas" optional>
              <input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
            <Field label="Responsable" error={errors.assignee}>
              <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Sin asignar</option>
                {(members.data?.items ?? [{ userId: session.user.id, fullName: session.user.fullName }]).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                    {m.userId === session.user.id ? ' (tú)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Título" error={errors.title} optional hint={`Si lo dejas vacío: «${defaultTitle(channel)}».`}>
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Notas" optional>
          <textarea className="textarea" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {mode === 'logged' && outcome === 'responded' && (
          <Alert tone="info">
            Después, usa «Registrar respuesta del cliente» en la ficha para que el presupuesto pase a respondido y cuente como reactivado.
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

function defaultTitle(channel: FollowUpChannel): string {
  return {
    task: 'Tarea',
    email: 'Email de seguimiento',
    phone: 'Llamada de seguimiento',
    whatsapp: 'WhatsApp de seguimiento',
    sms: 'SMS de seguimiento',
    in_person: 'Visita de seguimiento',
  }[channel];
}

/** Marcar como hecho un seguimiento programado. */
export function CompleteFollowUpDialog({ followUp, contactId, onClose }: { followUp: FollowUp; contactId?: string; onClose: () => void }) {
  const refresh = useRefreshQuoteData();
  const toast = useToast();
  const [outcome, setOutcome] = useState<'' | FollowUpOutcome>('');
  const [notes, setNotes] = useState(followUp.notes ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      api(`/follow-ups/${followUp.id}/complete`, {
        method: 'POST',
        body: {
          ...(outcome && followUp.channel !== 'task' ? { outcome } : {}),
          ...(notes.trim() !== (followUp.notes ?? '') ? { notes: notes.trim() || null } : {}),
        },
      }),
    onSuccess: () => {
      refresh(contactId);
      toast.success('Seguimiento marcado como hecho.');
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Marcar como hecho"
      description={followUp.title}
      onSubmit={() => mutation.mutate()}
      submitLabel="Marcar como hecho"
      submitting={mutation.isPending}
    >
      <div className="form">
        {mutation.isError && <ErrorAlert error={mutation.error} />}
        {followUp.channel !== 'task' && (
          <Field label="Resultado" optional>
            <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}>
              <option value="">Sin indicar</option>
              {(Object.keys(OUTCOME_LABEL) as FollowUpOutcome[]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notas" optional>
          <textarea className="textarea" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Cancelar un seguimiento programado. */
export function CancelFollowUpDialog({ followUp, contactId, onClose }: { followUp: FollowUp; contactId?: string; onClose: () => void }) {
  const refresh = useRefreshQuoteData();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => api(`/follow-ups/${followUp.id}/cancel`, { method: 'POST', body: reason.trim() ? { reason: reason.trim() } : {} }),
    onSuccess: () => {
      refresh(contactId);
      toast.success('Seguimiento cancelado.');
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancelar seguimiento"
      description={followUp.title}
      onSubmit={() => mutation.mutate()}
      submitLabel="Cancelar seguimiento"
      submitVariant="danger"
      cancelLabel="Volver"
      submitting={mutation.isPending}
    >
      <div className="form">
        {mutation.isError && <ErrorAlert error={mutation.error} />}
        <Field label="Motivo" optional>
          <input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
