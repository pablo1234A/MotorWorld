import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Search, ShieldBan, ShieldCheck, UserRoundSearch, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, isApiError } from '../../api/client';
import { useContact, useContacts } from '../../api/queries';
import type { Contact, ContactChannel, ContactDetail, ExclusionReason } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, Button, buttonClass, EmptyState, ErrorAlert, Field, PageHeader, Ref, Skeleton, SkeletonRows, StatusPill } from '../../components/ui';
import { formatDate, formatMoney } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { CONTACT_CHANNEL_LABEL, EXCLUSION_REASON_LABEL } from '../../lib/labels';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required, validateEmail, validatePhone } from '../../lib/validation';

export function ContactsListPage() {
  usePageTitle('Contactos');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(t);
  }, [input]);
  const contacts = useContacts(q);
  const items = contacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="page">
      <PageHeader title="Contactos" description="Las personas y empresas a las que has enviado presupuestos." />
      <section className="panel" aria-label="Listado de contactos">
        <div className="toolbar">
          <div className="toolbar__search toolbar__search--full">
            <label className="visually-hidden" htmlFor="contact-search">
              Buscar contactos
            </label>
            <div className="input-affix input-affix--prefix">
              <span className="input-affix__prefix">
                <Search aria-hidden="true" />
              </span>
              <input
                id="contact-search"
                className="input"
                type="search"
                placeholder="Nombre, email, teléfono o empresa"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
          </div>
        </div>
        {contacts.isPending ? (
          <SkeletonRows rows={6} label="Cargando contactos…" />
        ) : contacts.isError ? (
          <div className="panel__body">
            <ErrorAlert error={contacts.error} onRetry={() => void contacts.refetch()} />
          </div>
        ) : items.length === 0 ? (
          q ? (
            <EmptyState icon={UserRoundSearch} title="Ningún contacto coincide con la búsqueda" />
          ) : (
            <EmptyState icon={Users} title="Todavía no hay contactos">
              Los contactos se crean al registrar un presupuesto para un cliente nuevo.
            </EmptyState>
          )
        ) : (
          <ul className="rows">
            {items.map((c) => (
              <li key={c.id}>
                <Link to={`/contactos/${c.id}`} className="row">
                  <span className="avatar avatar--light" aria-hidden="true">
                    {c.fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="row__main">
                    <p className="row__title">{c.fullName}</p>
                    <p className="row__meta">
                      {c.organization && <span>{c.organization}</span>}
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span className="num">{c.phone}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {contacts.hasNextPage && (
          <div className="panel__footer">
            <span className="small muted">{items.length} cargados</span>
            <Button onClick={() => void contacts.fetchNextPage()} loading={contacts.isFetchingNextPage}>
              Cargar más
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function EditContactDialog({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    fullName: contact.fullName,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    organization: contact.organization ?? '',
    preferredChannel: contact.preferredChannel ?? '',
    notes: contact.notes ?? '',
  });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    clearField(k);
  };
  const mutation = useMutation({
    mutationFn: (body: object) => api(`/contacts/${contact.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Contacto actualizado.');
      onClose();
    },
    onError: (e) => handleError(e),
  });
  const submit = () => {
    setFormError(null);
    const errs = compact({
      fullName: required(f.fullName, 160, 'El nombre'),
      email: f.email.trim() ? validateEmail(f.email) : undefined,
      phone: validatePhone(f.phone) ?? (!f.email.trim() && !f.phone.trim() ? 'Indica al menos un email o un teléfono' : undefined),
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      fullName: f.fullName.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      organization: f.organization.trim(),
      preferredChannel: f.preferredChannel || null,
      notes: f.notes.trim(),
    });
  };
  return (
    <Dialog open onClose={onClose} title="Editar contacto" onSubmit={submit} submitLabel="Guardar cambios" submitting={mutation.isPending}>
      <div className="form" ref={(el) => void (formRef.current = el?.closest('form') ?? null)}>
        {formError != null && <ErrorAlert error={formError} />}
        <Field label="Nombre" error={errors.fullName}>
          <input className="input" value={f.fullName} onChange={set('fullName')} maxLength={160} />
        </Field>
        <Field label="Empresa o comunidad" optional>
          <input className="input" value={f.organization} onChange={set('organization')} maxLength={160} />
        </Field>
        <div className="form-row">
          <Field label="Email" error={errors.email} optional>
            <input className="input" type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Teléfono" error={errors.phone} optional>
            <input className="input" type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="Canal preferido" optional>
          <select className="select" value={f.preferredChannel} onChange={set('preferredChannel')}>
            <option value="">Sin preferencia indicada</option>
            {(Object.keys(CONTACT_CHANNEL_LABEL) as ContactChannel[]).map((c) => (
              <option key={c} value={c}>
                {CONTACT_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas" optional>
          <textarea className="textarea" rows={3} value={f.notes} onChange={set('notes')} maxLength={5000} />
        </Field>
      </div>
    </Dialog>
  );
}

function ExclusionDialog({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [channel, setChannel] = useState<'' | ContactChannel>('');
  const [reason, setReason] = useState<ExclusionReason>('opt_out_request');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api<{ cancelledFollowUps: number }>('/exclusions', {
        method: 'POST',
        body: { contactId: contact.id, channel: channel || null, reason, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      void queryClient.invalidateQueries({ queryKey: ['exclusions'] });
      toast.success(
        `Exclusión registrada.${res.cancelledFollowUps ? ` Se han detenido ${res.cancelledFollowUps} seguimiento(s) pendiente(s).` : ''}`,
      );
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="No contactar"
      description="Registra que este cliente no quiere recibir más mensajes. Se detendrán los seguimientos pendientes por ese canal y Presupio no dejará registrar nuevos."
      onSubmit={() => mutation.mutate()}
      submitLabel="Registrar exclusión"
      submitting={mutation.isPending}
    >
      <div className="form">
        {mutation.isError && <ErrorAlert error={mutation.error} />}
        <Field label="Canal">
          <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as '' | ContactChannel)}>
            <option value="">Todos los canales</option>
            {(Object.keys(CONTACT_CHANNEL_LABEL) as ContactChannel[]).map((c) => (
              <option key={c} value={c}>
                Solo {CONTACT_CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo">
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value as ExclusionReason)}>
            {(Object.keys(EXCLUSION_REASON_LABEL) as ExclusionReason[]).map((r) => (
              <option key={r} value={r}>
                {EXCLUSION_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas" optional hint="Por ejemplo, cómo y cuándo lo pidió.">
          <textarea className="textarea" rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function LiftDialog({ exclusionId, onClose }: { exclusionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const mutation = useMutation({
    mutationFn: () => api(`/exclusions/${exclusionId}/lift`, { method: 'POST', body: { reason: reason.trim() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['exclusions'] });
      toast.success('Exclusión levantada.');
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Levantar exclusión"
      description="Solo si el cliente ha pedido volver a recibir mensajes. El motivo quedará registrado."
      onSubmit={() => {
        if (reason.trim().length < 3) {
          setError('Explica por qué se levanta');
          return;
        }
        mutation.mutate();
      }}
      submitLabel="Levantar exclusión"
      submitting={mutation.isPending}
    >
      <div className="form">
        {mutation.isError && <ErrorAlert error={mutation.error} />}
        <Field label="Motivo" error={error}>
          <input
            className="input"
            value={reason}
            maxLength={500}
            onChange={(e) => {
              setReason(e.target.value);
              setError(undefined);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function ContactDetailPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const contact = useContact(id);
  usePageTitle(contact.data?.contact.fullName ?? 'Contacto');
  const [editing, setEditing] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [lifting, setLifting] = useState<string | null>(null);

  if (contact.isPending) {
    return (
      <div className="page" role="status" aria-label="Cargando contacto">
        <Skeleton width="40%" height="2rem" />
        <Skeleton height="10rem" />
      </div>
    );
  }
  if (contact.isError) {
    if (isApiError(contact.error, 404) || isApiError(contact.error, 400)) {
      return (
        <div className="page">
          <EmptyState icon={UserRoundSearch} title="Contacto no encontrado" action={<Link to="/contactos" className={buttonClass()}>Volver a contactos</Link>}>
            No existe o no pertenece a tu empresa.
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorAlert error={contact.error} onRetry={() => void contact.refetch()} />
      </div>
    );
  }

  const { contact: c, activeExclusions, quotes }: ContactDetail = contact.data;
  return (
    <div className="page">
      <PageHeader
        breadcrumb={{ to: '/contactos', label: 'Contactos', icon: ArrowLeft }}
        title={c.fullName}
        description={c.organization ?? undefined}
        actions={
          <>
            {session.can('exclusions:create') && (
              <Button icon={ShieldBan} onClick={() => setExcluding(true)}>
                No contactar
              </Button>
            )}
            {session.can('contacts:write') && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
          </>
        }
      />

      {activeExclusions.length > 0 && (
        <section className="panel" aria-labelledby="ex-title">
          <div className="panel__header">
            <h2 id="ex-title">Lista de exclusión</h2>
          </div>
          <ul className="rows">
            {activeExclusions.map((ex) => (
              <li key={ex.id} className="row">
                <span className="pill pill--danger">{ex.channel ? CONTACT_CHANNEL_LABEL[ex.channel] : 'Todos los canales'}</span>
                <div className="row__main">
                  <p>{EXCLUSION_REASON_LABEL[ex.reason]}</p>
                  <p className="row__meta">Desde el {formatDate(ex.createdAt)}</p>
                </div>
                {session.can('exclusions:lift') && (
                  <Button size="sm" variant="ghost" icon={ShieldCheck} onClick={() => setLifting(ex.id)}>
                    Levantar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="detail-grid detail-grid--contact">
        <section className="panel" aria-labelledby="quotes-title">
          <div className="panel__header">
            <h2 id="quotes-title">Presupuestos</h2>
          </div>
          {quotes.length === 0 ? (
            <EmptyState icon={Users} title="Sin presupuestos" />
          ) : (
            <ul className="rows">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link to={`/presupuestos/${q.id}`} className="row">
                    <div className="row__main">
                      {q.reference && <Ref>{q.reference}</Ref>}
                      <p className="row__title">{q.title}</p>
                      <p className="row__meta">
                        <span className="num">{formatMoney(q.amountCents)}</span>
                        <span>{q.sentAt ? `Enviado el ${formatDate(q.sentAt)}` : 'Sin enviar'}</span>
                      </p>
                    </div>
                    <StatusPill status={q.status} archived={!!q.archivedAt} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel" aria-labelledby="cdata-title">
          <div className="panel__header">
            <h2 id="cdata-title">Datos de contacto</h2>
          </div>
          <div className="panel__body">
            <dl className="kv">
              <dt>Email</dt>
              <dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Teléfono</dt>
              <dd>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</dd>
              <dt>Canal preferido</dt>
              <dd>{c.preferredChannel ? CONTACT_CHANNEL_LABEL[c.preferredChannel] : 'Sin indicar'}</dd>
              <dt>Alta</dt>
              <dd>{formatDate(c.createdAt)}</dd>
            </dl>
            {c.notes && <p className="quote-description">{c.notes}</p>}
            {activeExclusions.length === 0 && (
              <Alert tone="info">Sin exclusiones. Si este cliente pide no recibir mensajes, regístralo con «No contactar».</Alert>
            )}
          </div>
        </section>
      </div>

      {editing && <EditContactDialog contact={c} onClose={() => setEditing(false)} />}
      {excluding && <ExclusionDialog contact={c} onClose={() => setExcluding(false)} />}
      {lifting && <LiftDialog exclusionId={lifting} onClose={() => setLifting(null)} />}
    </div>
  );
}
