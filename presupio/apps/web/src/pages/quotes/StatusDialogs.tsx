import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Quote, QuoteStatus } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, ErrorAlert, Field } from '../../components/ui';
import { dateInputToIso, dateInputToIsoAfter, formatDate, toDateInput } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { QUOTE_STATUS_LABEL, QUOTE_TRANSITION_LABEL } from '../../lib/labels';
import { centsToInput, parseEuroInput } from '../../lib/money';
import { compact } from '../../lib/validation';
import { useRefreshQuoteData } from './quoteMutations';

interface Props {
  quote: Quote;
  target: QuoteStatus | null;
  correction: boolean;
  onClose: () => void;
}

const DESCRIPTIONS: Partial<Record<QuoteStatus, string>> = {
  sent: 'A partir de esta fecha se cuentan los días sin respuesta.',
  responded: 'El cliente ha contestado, aunque todavía no haya decidido. Se detendrán los contactos pendientes.',
  accepted: 'Confirma la venta solo si tienes una evidencia: contrato firmado, pedido o señal. Se detendrán los seguimientos pendientes.',
  rejected: 'El cliente ha dicho que no. Se detendrán los seguimientos pendientes.',
};

/** Diálogo para cambiar el estado de un presupuesto (POST /quotes/:id/status). */
export function StatusDialog({ quote, target, correction, onClose }: Props) {
  const today = toDateInput(new Date());
  const minDate = quote.sentAt ? toDateInput(new Date(quote.sentAt)) : undefined;
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [amount, setAmount] = useState(centsToInput(quote.amountCents));
  const [reason, setReason] = useState('');
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const refresh = useRefreshQuoteData();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (body: object) =>
      api<{ reactivated: boolean; cancelledFollowUps: number }>(`/quotes/${quote.id}/status`, { method: 'POST', body }),
    onSuccess: (res) => {
      refresh(quote.contact.id);
      const parts = [`Estado actualizado: ${QUOTE_STATUS_LABEL[target!].toLowerCase()}.`];
      if (res.reactivated) parts.push('Oportunidad reactivada tras el seguimiento.');
      if (res.cancelledFollowUps > 0) parts.push(`${res.cancelledFollowUps} seguimiento(s) pendiente(s) detenido(s).`);
      toast.success(parts.join(' '));
      onClose();
    },
    onError: (e) => handleError(e, { occurredAt: 'date', acceptedAmountCents: 'amount' }),
  });

  if (!target) return null;
  const needsDate = !correction;
  const label = correction ? `Corregir a «${QUOTE_STATUS_LABEL[target]}»` : QUOTE_TRANSITION_LABEL[target];

  const submit = () => {
    setFormError(null);
    const amountCents = target === 'accepted' && amount.trim() ? parseEuroInput(amount) : null;
    const errs = compact({
      date: !needsDate
        ? undefined
        : !date
          ? 'Indica la fecha'
          : date > today
            ? 'No puede ser una fecha futura'
            : minDate && date < minDate && target !== 'sent'
              ? `No puede ser anterior al envío (${formatDate(quote.sentAt)})`
              : undefined,
      evidence: target === 'accepted' && evidence.trim().length < 3 ? 'Describe la evidencia de la venta' : undefined,
      amount: target === 'accepted' && amount.trim() && amountCents === null ? 'Importe no válido' : undefined,
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      status: target,
      ...(needsDate ? { occurredAt: target === 'sent' ? dateInputToIso(date) : dateInputToIsoAfter(date, quote.sentAt) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(target === 'accepted' ? { evidence: evidence.trim(), ...(amountCents !== null ? { acceptedAmountCents: amountCents } : {}) } : {}),
      ...(target === 'rejected' && reason.trim() ? { rejectionReason: reason.trim() } : {}),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={label}
      description={correction ? 'Usa la corrección solo si el estado se registró por error. Quedará en el historial.' : DESCRIPTIONS[target]}
      onSubmit={submit}
      submitLabel={correction ? 'Corregir estado' : target === 'accepted' ? 'Confirmar venta' : 'Guardar'}
      submitting={mutation.isPending}
    >
      <div className="form" ref={(el) => void (formRef.current = el?.closest('form') ?? null)}>
        {formError != null && <ErrorAlert error={formError} />}
        {needsDate && (
          <Field
            label={target === 'sent' ? 'Fecha de envío' : target === 'accepted' ? 'Fecha de la aceptación' : 'Fecha de la respuesta'}
            error={errors.date}
          >
            <input
              className="input"
              type="date"
              value={date}
              max={today}
              min={target === 'sent' ? undefined : minDate}
              onChange={(e) => {
                setDate(e.target.value);
                clearField('date');
              }}
            />
          </Field>
        )}
        {target === 'accepted' && (
          <>
            <Field label="Evidencia de la venta" error={errors.evidence} hint="Por ejemplo: «Contrato firmado nº 2026-045» o «Señal recibida por transferencia».">
              <input
                className="input"
                value={evidence}
                maxLength={1000}
                onChange={(e) => {
                  setEvidence(e.target.value);
                  clearField('evidence');
                }}
              />
            </Field>
            <Field label="Importe aceptado" error={errors.amount} optional hint="Si no lo indicas, se usa el importe del presupuesto. Se mostrará como importe declarado por tu empresa.">
              <div className="input-affix">
                <input
                  className="input num"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    clearField('amount');
                  }}
                />
                <span className="input-affix__suffix">€</span>
              </div>
            </Field>
          </>
        )}
        {target === 'rejected' && (
          <Field label="Motivo del rechazo" optional hint="Te ayudará a entender por qué se pierden presupuestos.">
            <input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Field label="Nota para el historial" optional>
          <textarea className="textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {target === 'responded' && (
          <Alert tone="info">Si el cliente respondió después de un seguimiento registrado, la oportunidad contará como reactivada.</Alert>
        )}
      </div>
    </Dialog>
  );
}
