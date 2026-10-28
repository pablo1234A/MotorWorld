import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useMembers } from '../../api/queries';
import type { Contact, ContactChannel, Quote } from '../../api/types';
import { useSession } from '../../auth/session';
import { ContactPicker } from '../../components/ContactPicker';
import { useToast } from '../../components/Toasts';
import { Button, ErrorAlert, Field, PageHeader } from '../../components/ui';
import { dateInputToIso, toDateInput } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { CONTACT_CHANNEL_LABEL } from '../../lib/labels';
import { parseEuroInput } from '../../lib/money';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required, validateEmail, validatePhone } from '../../lib/validation';

// Campos de la API → campos del formulario, para colocar cada error junto a su input.
const FIELD_MAP: Record<string, string> = {
  'contact.fullName': 'contactName',
  'contact.email': 'contactEmail',
  'contact.phone': 'contactPhone',
  contactId: 'contactId',
  amountCents: 'amount',
  ownerUserId: 'owner',
};

export function NewQuotePage() {
  usePageTitle('Nuevo presupuesto');
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const members = useMembers();
  const today = toDateInput(new Date());

  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new');
  const [existing, setExisting] = useState<Contact | null>(null);
  const [f, setF] = useState({
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactOrganization: '',
    preferredChannel: '' as '' | ContactChannel,
    title: '',
    reference: '',
    amount: '',
    description: '',
    status: 'sent' as 'sent' | 'draft',
    sentDate: today,
    validUntil: '',
    owner: session.user.id,
  });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();

  const set =
    (key: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setF((prev) => ({ ...prev, [key]: e.target.value }));
      clearField(key);
    };

  const create = useMutation({
    mutationFn: (body: object) => api<{ quote: Quote }>('/quotes', { method: 'POST', body }),
    onSuccess: ({ quote }) => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
      toast.success('Presupuesto registrado.');
      navigate(`/presupuestos/${quote.id}`, { replace: true });
    },
    onError: (e) => handleError(e, FIELD_MAP),
  });

  if (!session.can('quotes:write')) return <Navigate to="/presupuestos" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amountCents = f.amount.trim() ? parseEuroInput(f.amount) : null;
    const errs = compact({
      title: required(f.title, 200, 'El título'),
      reference: f.reference.trim().length > 80 ? 'Máximo 80 caracteres' : undefined,
      amount: f.amount.trim() && amountCents === null ? 'Escribe un importe válido, por ejemplo 18.500 o 18.500,50' : undefined,
      sentDate:
        f.status !== 'sent' ? undefined : !f.sentDate ? 'Indica la fecha de envío' : f.sentDate > today ? 'No puede ser una fecha futura' : undefined,
      validUntil: f.validUntil && f.status === 'sent' && f.sentDate && f.validUntil < f.sentDate ? 'No puede terminar antes del envío' : undefined,
      ...(contactMode === 'new'
        ? {
            contactName: required(f.contactName, 160, 'El nombre del cliente'),
            contactEmail: f.contactEmail.trim() ? validateEmail(f.contactEmail) : undefined,
            contactPhone:
              validatePhone(f.contactPhone) ??
              (!f.contactEmail.trim() && !f.contactPhone.trim() ? 'Indica al menos un email o un teléfono' : undefined),
          }
        : { contactId: existing ? undefined : 'Elige un contacto de la lista' }),
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;

    create.mutate({
      title: f.title.trim(),
      ...(f.reference.trim() ? { reference: f.reference.trim() } : {}),
      ...(amountCents !== null ? { amountCents } : {}),
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      status: f.status,
      ...(f.status === 'sent' ? { sentAt: dateInputToIso(f.sentDate) } : {}),
      ...(f.validUntil ? { validUntil: f.validUntil } : {}),
      ownerUserId: f.owner || null,
      ...(contactMode === 'existing'
        ? { contactId: existing!.id }
        : {
            contact: {
              fullName: f.contactName.trim(),
              ...(f.contactEmail.trim() ? { email: f.contactEmail.trim() } : {}),
              ...(f.contactPhone.trim() ? { phone: f.contactPhone.trim() } : {}),
              ...(f.contactOrganization.trim() ? { organization: f.contactOrganization.trim() } : {}),
              ...(f.preferredChannel ? { preferredChannel: f.preferredChannel } : {}),
            },
          }),
    });
  };

  return (
    <div className="page page--narrow">
      <PageHeader
        breadcrumb={{ to: '/presupuestos', label: 'Presupuestos', icon: ArrowLeft }}
        title="Nuevo presupuesto"
        description="Registra un presupuesto que ya has enviado (o que vas a enviar) para hacerle seguimiento."
      />

      {formError != null && <ErrorAlert error={formError} title="No se ha podido registrar el presupuesto" />}

      <form ref={formRef} className="stack stack--lg" onSubmit={submit} noValidate>
        <section className="panel" aria-labelledby="sec-cliente">
          <div className="panel__header">
            <h2 id="sec-cliente">Cliente</h2>
          </div>
          <div className="panel__body form">
            <fieldset className="choice-group" aria-label="Tipo de cliente">
              <label className="choice">
                <input type="radio" name="contactMode" checked={contactMode === 'new'} onChange={() => setContactMode('new')} />
                <span>Cliente nuevo</span>
              </label>
              <label className="choice">
                <input type="radio" name="contactMode" checked={contactMode === 'existing'} onChange={() => setContactMode('existing')} />
                <span>Cliente que ya está en Presupio</span>
              </label>
            </fieldset>

            {contactMode === 'new' ? (
              <>
                <div className="form-row">
                  <Field label="Nombre del cliente" error={errors.contactName}>
                    <input className="input" autoComplete="off" value={f.contactName} onChange={set('contactName')} maxLength={160} />
                  </Field>
                  <Field label="Empresa o comunidad" optional>
                    <input className="input" autoComplete="off" value={f.contactOrganization} onChange={set('contactOrganization')} maxLength={160} />
                  </Field>
                </div>
                <div className="form-row">
                  <Field label="Email" error={errors.contactEmail} optional hint="Indica al menos un email o un teléfono.">
                    <input className="input" type="email" inputMode="email" autoComplete="off" value={f.contactEmail} onChange={set('contactEmail')} />
                  </Field>
                  <Field label="Teléfono" error={errors.contactPhone} optional>
                    <input className="input" type="tel" inputMode="tel" autoComplete="off" value={f.contactPhone} onChange={set('contactPhone')} />
                  </Field>
                </div>
                <Field label="Canal preferido del cliente" optional>
                  <select className="select" value={f.preferredChannel} onChange={set('preferredChannel')}>
                    <option value="">Sin preferencia indicada</option>
                    {(Object.keys(CONTACT_CHANNEL_LABEL) as ContactChannel[]).map((c) => (
                      <option key={c} value={c}>
                        {CONTACT_CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <ContactPicker
                value={existing}
                onChange={(c) => {
                  setExisting(c);
                  clearField('contactId');
                }}
                error={errors.contactId}
              />
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="sec-presupuesto">
          <div className="panel__header">
            <h2 id="sec-presupuesto">Presupuesto</h2>
          </div>
          <div className="panel__body form">
            <Field label="Título" error={errors.title} hint="Lo que verás en los listados, por ejemplo «Reforma integral de cocina».">
              <input className="input" value={f.title} onChange={set('title')} maxLength={200} />
            </Field>
            <div className="form-row">
              <Field label="Referencia" error={errors.reference} optional hint="El número que usas en tu programa de presupuestos.">
                <input className="input" value={f.reference} onChange={set('reference')} maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Importe" error={errors.amount} optional hint="En euros, por ejemplo 18.500,50">
                <div className="input-affix">
                  <input className="input num" inputMode="decimal" value={f.amount} onChange={set('amount')} autoComplete="off" />
                  <span className="input-affix__suffix">€</span>
                </div>
              </Field>
            </div>
            <Field label="Descripción" optional>
              <textarea className="textarea" value={f.description} onChange={set('description')} maxLength={10000} rows={3} />
            </Field>
          </div>
        </section>

        <section className="panel" aria-labelledby="sec-envio">
          <div className="panel__header">
            <h2 id="sec-envio">Envío y responsable</h2>
          </div>
          <div className="panel__body form">
            <fieldset className="choice-group" aria-label="Estado del presupuesto">
              <label className="choice">
                <input type="radio" name="status" checked={f.status === 'sent'} onChange={() => setF((p) => ({ ...p, status: 'sent' }))} />
                <span>Ya enviado al cliente</span>
              </label>
              <label className="choice">
                <input type="radio" name="status" checked={f.status === 'draft'} onChange={() => setF((p) => ({ ...p, status: 'draft' }))} />
                <span>Borrador (aún sin enviar)</span>
              </label>
            </fieldset>
            <div className="form-row">
              {f.status === 'sent' && (
                <Field label="Fecha de envío" error={errors.sentDate ?? errors.sentAt}>
                  <input className="input" type="date" max={today} value={f.sentDate} onChange={set('sentDate')} />
                </Field>
              )}
              <Field label="Válido hasta" error={errors.validUntil} optional>
                <input className="input" type="date" value={f.validUntil} onChange={set('validUntil')} />
              </Field>
            </div>
            <Field label="Responsable" error={errors.owner} hint="La persona que hace el seguimiento de este presupuesto.">
              <select className="select" value={f.owner} onChange={set('owner')} disabled={members.isPending}>
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
        </section>

        <div className="form-actions form-actions--end">
          <Link to="/presupuestos" className="btn btn--ghost">
            Cancelar
          </Link>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Registrar presupuesto
          </Button>
        </div>
      </form>
    </div>
  );
}
