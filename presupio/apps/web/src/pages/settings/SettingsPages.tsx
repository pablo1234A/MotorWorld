import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Lock, MailPlus, Trash2, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '../../api/client';
import { keys, useCompany, useInvitations, useMembers, useSettings, useSubscription } from '../../api/queries';
import type { Company, CompanySettings, ContactChannel, Delivery, Invitation, Member, Role } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { Alert, Button, ErrorAlert, Field, PageHeader, Skeleton, SkeletonRows } from '../../components/ui';
import { formatDate, formatMoney } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { CONTACT_CHANNEL_LABEL, ROLE_DESCRIPTION, ROLE_LABEL, SUBSCRIPTION_STATUS_LABEL, WEEKDAYS } from '../../lib/labels';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required, validateEmail, validatePassword, validatePhone } from '../../lib/validation';

const TABS = [
  { to: '/configuracion', label: 'Empresa', end: true },
  { to: '/configuracion/seguimiento', label: 'Reglas de seguimiento' },
  { to: '/configuracion/equipo', label: 'Equipo' },
  { to: '/configuracion/plan', label: 'Plan' },
  { to: '/configuracion/perfil', label: 'Mi perfil' },
];

export function SettingsLayout() {
  return (
    <div className="page page--narrow">
      <PageHeader title="Configuración" description="Datos de tu empresa, reglas de seguimiento, equipo y cuenta." />
      <nav className="tabs" aria-label="Secciones de configuración">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab">
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <Alert tone="info">
      <span className="cluster" style={{ gap: '0.4rem' }}>
        <Lock width={14} height={14} aria-hidden="true" /> Solo las personas propietarias o administradoras pueden modificar esta sección.
      </span>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

const TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'];

function CompanyForm({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    name: company.name,
    legalName: company.legalName ?? '',
    taxId: company.taxId ?? '',
    phone: company.phone ?? '',
    website: company.website ?? '',
    timezone: company.timezone,
  });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    clearField(k);
  };
  const mutation = useMutation({
    mutationFn: (body: object) => api<{ company: Company }>('/company', { method: 'PATCH', body }),
    onSuccess: (res) => {
      queryClient.setQueryData(keys.company, res);
      void queryClient.invalidateQueries({ queryKey: keys.me });
      toast.success('Datos de la empresa guardados.');
    },
    onError: (e) => handleError(e),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = compact({
      name: required(f.name, 120, 'El nombre comercial'),
      taxId: f.taxId.trim() && !/^[A-Za-z0-9\s-]{8,20}$/.test(f.taxId.trim()) ? 'NIF/CIF no válido' : undefined,
      phone: validatePhone(f.phone),
      website: f.website.trim() && !/^https?:\/\/\S+\.\S+/.test(f.website.trim()) ? 'Escribe la dirección completa, con https://' : undefined,
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      name: f.name.trim(),
      legalName: f.legalName.trim(),
      taxId: f.taxId.trim(),
      phone: f.phone.trim(),
      website: f.website.trim(),
      timezone: f.timezone,
    });
  };
  return (
    <form ref={formRef} className="panel" onSubmit={submit} noValidate aria-labelledby="company-title">
      <div className="panel__header">
        <div>
          <h2 id="company-title">Datos de la empresa</h2>
          <p>Aparecen en Presupio y en los emails que envía la plataforma (invitaciones, avisos).</p>
        </div>
      </div>
      <fieldset className="panel__body form" disabled={!canEdit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {!canEdit && <ReadOnlyNotice />}
        {formError != null && <ErrorAlert error={formError} />}
        <div className="form-row">
          <Field label="Nombre comercial" error={errors.name}>
            <input className="input" value={f.name} onChange={set('name')} maxLength={120} />
          </Field>
          <Field label="Razón social" error={errors.legalName} optional>
            <input className="input" value={f.legalName} onChange={set('legalName')} maxLength={200} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="NIF/CIF" error={errors.taxId} optional>
            <input className="input" value={f.taxId} onChange={set('taxId')} maxLength={20} />
          </Field>
          <Field label="Teléfono" error={errors.phone} optional>
            <input className="input" type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Web" error={errors.website} optional>
            <input className="input" type="url" placeholder="https://" value={f.website} onChange={set('website')} maxLength={200} />
          </Field>
          <Field label="Zona horaria" error={errors.timezone}>
            <select className="select" value={f.timezone} onChange={set('timezone')}>
              {[...new Set([f.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz === 'Europe/Madrid' ? 'Península y Baleares' : tz === 'Atlantic/Canary' ? 'Canarias' : tz === 'Africa/Ceuta' ? 'Ceuta y Melilla' : tz}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>
      {canEdit && (
        <div className="panel__footer">
          <span className="small muted">País: España · Moneda: {company.currency}</span>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Guardar cambios
          </Button>
        </div>
      )}
    </form>
  );
}

export function CompanySettingsPage() {
  usePageTitle('Empresa');
  const session = useSession();
  const company = useCompany();
  if (company.isPending) return <Skeleton height="20rem" />;
  if (company.isError) return <ErrorAlert error={company.error} onRetry={() => void company.refetch()} />;
  return <CompanyForm key={company.data.company.updatedAt} company={company.data.company} canEdit={session.can('company:update')} />;
}

// ---------------------------------------------------------------------------
// Reglas de seguimiento
// ---------------------------------------------------------------------------

function RulesForm({ settings, canEdit }: { settings: CompanySettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    firstFollowUpAfterDays: String(settings.firstFollowUpAfterDays),
    followUpIntervalDays: String(settings.followUpIntervalDays),
    maxFollowUps: String(settings.maxFollowUps),
    allowedWeekdays: settings.allowedWeekdays,
    contactWindowStart: settings.contactWindowStart,
    contactWindowEnd: settings.contactWindowEnd,
    defaultChannel: settings.defaultChannel,
    requireManualApproval: settings.requireManualApproval,
    legalBasisNote: settings.legalBasisNote ?? '',
  });
  const { errors, setErrors, formError, setFormError, handleError, formRef } = useFormErrors();
  const mutation = useMutation({
    mutationFn: (body: object) => api<{ settings: CompanySettings }>('/company/settings', { method: 'PATCH', body }),
    onSuccess: (res) => {
      queryClient.setQueryData(keys.settings, res);
      toast.success('Reglas de seguimiento guardadas.');
    },
    onError: (e) => handleError(e),
  });
  const int = (v: string, min: number, max: number) => (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? undefined : `Entre ${min} y ${max}`);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = compact({
      firstFollowUpAfterDays: int(f.firstFollowUpAfterDays, 1, 90),
      followUpIntervalDays: int(f.followUpIntervalDays, 1, 90),
      maxFollowUps: int(f.maxFollowUps, 0, 10),
      allowedWeekdays: f.allowedWeekdays.length ? undefined : 'Elige al menos un día',
      contactWindowEnd: f.contactWindowStart < f.contactWindowEnd ? undefined : 'Debe ser posterior a la hora de inicio',
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    mutation.mutate({
      firstFollowUpAfterDays: Number(f.firstFollowUpAfterDays),
      followUpIntervalDays: Number(f.followUpIntervalDays),
      maxFollowUps: Number(f.maxFollowUps),
      allowedWeekdays: f.allowedWeekdays,
      contactWindowStart: f.contactWindowStart,
      contactWindowEnd: f.contactWindowEnd,
      defaultChannel: f.defaultChannel,
      requireManualApproval: f.requireManualApproval,
      legalBasisNote: f.legalBasisNote.trim(),
    });
  };
  const num = (k: 'firstFollowUpAfterDays' | 'followUpIntervalDays' | 'maxFollowUps') => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value })),
    inputMode: 'numeric' as const,
    className: 'input num',
  });

  return (
    <form ref={formRef} className="panel" onSubmit={submit} noValidate aria-labelledby="rules-title">
      <div className="panel__header">
        <div>
          <h2 id="rules-title">Reglas de seguimiento</h2>
          <p>
            Definen cuándo un presupuesto «toca seguimiento» en el plano de tu cartera. En esta versión Presupio no envía mensajes
            automáticamente.
          </p>
        </div>
      </div>
      <fieldset className="panel__body form" disabled={!canEdit} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {!canEdit && <ReadOnlyNotice />}
        {formError != null && <ErrorAlert error={formError} />}
        <div className="form-row">
          <Field label="Primer seguimiento a los" error={errors.firstFollowUpAfterDays} hint="Días desde el envío">
            <input {...num('firstFollowUpAfterDays')} />
          </Field>
          <Field label="Días entre seguimientos" error={errors.followUpIntervalDays}>
            <input {...num('followUpIntervalDays')} />
          </Field>
          <Field label="Máximo de seguimientos" error={errors.maxFollowUps} hint="Por presupuesto">
            <input {...num('maxFollowUps')} />
          </Field>
        </div>
        <fieldset className="choice-group" aria-describedby={errors.allowedWeekdays ? 'weekdays-error' : undefined}>
          <legend className="field__label" style={{ width: '100%', marginBottom: 'var(--s-1)' }}>
            Días en los que se puede contactar
          </legend>
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="choice">
              <input
                type="checkbox"
                checked={f.allowedWeekdays.includes(d.value)}
                onChange={(e) =>
                  setF((p) => ({
                    ...p,
                    allowedWeekdays: e.target.checked ? [...p.allowedWeekdays, d.value].sort() : p.allowedWeekdays.filter((x) => x !== d.value),
                  }))
                }
              />
              <span>{d.long}</span>
            </label>
          ))}
        </fieldset>
        {errors.allowedWeekdays && (
          <p className="field__error" id="weekdays-error">
            {errors.allowedWeekdays}
          </p>
        )}
        <div className="form-row">
          <Field label="Desde las" error={errors.contactWindowStart}>
            <input className="input" type="time" value={f.contactWindowStart} onChange={(e) => setF((p) => ({ ...p, contactWindowStart: e.target.value }))} />
          </Field>
          <Field label="Hasta las" error={errors.contactWindowEnd}>
            <input className="input" type="time" value={f.contactWindowEnd} onChange={(e) => setF((p) => ({ ...p, contactWindowEnd: e.target.value }))} />
          </Field>
          <Field label="Canal habitual">
            <select className="select" value={f.defaultChannel} onChange={(e) => setF((p) => ({ ...p, defaultChannel: e.target.value as ContactChannel }))}>
              {(Object.keys(CONTACT_CHANNEL_LABEL) as ContactChannel[]).map((c) => (
                <option key={c} value={c}>
                  {CONTACT_CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.requireManualApproval} onChange={(e) => setF((p) => ({ ...p, requireManualApproval: e.target.checked }))} />
          <span>
            <span className="strong">Revisión humana obligatoria</span>
            <span className="cell-sub">Ningún mensaje saldrá sin que alguien de tu equipo lo apruebe. Recomendado mientras no se valide la base legal.</span>
          </span>
        </label>
        <Field label="Base legal para contactar" optional hint="Documenta por qué puedes contactar a tus clientes tras enviar un presupuesto (RGPD/LSSI).">
          <textarea className="textarea" rows={3} maxLength={2000} value={f.legalBasisNote} onChange={(e) => setF((p) => ({ ...p, legalBasisNote: e.target.value }))} />
        </Field>
      </fieldset>
      {canEdit && (
        <div className="panel__footer">
          <span className="small muted">Última modificación: {formatDate(settings.updatedAt)}</span>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Guardar reglas
          </Button>
        </div>
      )}
    </form>
  );
}

export function FollowUpRulesPage() {
  usePageTitle('Reglas de seguimiento');
  const session = useSession();
  const settings = useSettings();
  if (settings.isPending) return <Skeleton height="24rem" />;
  if (settings.isError) return <ErrorAlert error={settings.error} onRetry={() => void settings.refetch()} />;
  return <RulesForm key={settings.data.settings.updatedAt} settings={settings.data.settings} canEdit={session.can('settings:update')} />;
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

function InviteForm() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [result, setResult] = useState<{ acceptUrl: string; delivery: Delivery; email: string } | null>(null);
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const mutation = useMutation({
    mutationFn: () => api<{ invitation: Invitation; acceptUrl: string; delivery: Delivery }>('/members/invitations', { method: 'POST', body: { email: email.trim(), role } }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: keys.invitations });
      setResult({ acceptUrl: res.acceptUrl, delivery: res.delivery, email: res.invitation.email });
      if (res.delivery === 'sent') toast.success(`Invitación enviada a ${res.invitation.email}.`);
      setEmail('');
    },
    onError: (e) => handleError(e),
  });
  const roles: Role[] = session.role === 'owner' || session.role === 'admin' ? ['member', 'viewer', 'admin'] : [];
  return (
    <form
      ref={formRef}
      className="panel"
      noValidate
      aria-labelledby="invite-title"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(null);
        setResult(null);
        const errs = compact({ email: validateEmail(email) });
        setErrors(errs);
        if (!Object.keys(errs).length) mutation.mutate();
      }}
    >
      <div className="panel__header">
        <h2 id="invite-title">Invitar a una persona</h2>
      </div>
      <div className="panel__body form">
        {formError != null && <ErrorAlert error={formError} />}
        <div className="form-row">
          <Field label="Email" error={errors.email}>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearField('email');
              }}
            />
          </Field>
          <Field label="Rol" hint={ROLE_DESCRIPTION[role]}>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {result && result.delivery !== 'sent' && <InviteLink result={result} />}
        <div className="form-actions">
          <Button type="submit" variant="primary" icon={MailPlus} loading={mutation.isPending}>
            Invitar
          </Button>
        </div>
      </div>
    </form>
  );
}

function InviteLink({ result }: { result: { acceptUrl: string; delivery: Delivery; email: string } }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <Alert tone="warning" title="La invitación se ha creado, pero no se ha enviado ningún email">
      {result.delivery === 'not_configured'
        ? 'El envío de correo aún no está configurado.'
        : 'El proveedor de correo ha fallado.'}{' '}
      Comparte este enlace personal con {result.email} por un canal de confianza. Caduca en 7 días.
      <div className="copy-row">
        <input className="input" readOnly value={result.acceptUrl} aria-label="Enlace de invitación" onFocus={(e) => e.target.select()} />
        <Button
          icon={Copy}
          onClick={() => {
            void navigator.clipboard?.writeText(result.acceptUrl).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </Alert>
  );
}

function MemberRow({ member, canManage }: { member: Member; canManage: boolean }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState(false);
  const isSelf = member.userId === session.user.id;
  const actorIsOwner = session.role === 'owner';
  const editable = canManage && !isSelf && (actorIsOwner || member.role !== 'owner');
  const roleOptions: Role[] = actorIsOwner ? ['owner', 'admin', 'member', 'viewer'] : ['admin', 'member', 'viewer'];

  const change = useMutation({
    mutationFn: (role: Role) => api(`/members/${member.userId}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      toast.success(`Rol de ${member.fullName} actualizado.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/members/${member.userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      toast.success(`${member.fullName} ya no forma parte del equipo.`);
      setRemoving(false);
    },
  });

  return (
    <li className="row member-row">
      <div className="row__main">
        <p className="row__title">
          {member.fullName} {isSelf && <span className="muted">(tú)</span>}
        </p>
        <p className="row__meta">
          <span>{member.email}</span>
          <span>Desde el {formatDate(member.joinedAt)}</span>
        </p>
      </div>
      {editable ? (
        <>
          <label className="visually-hidden" htmlFor={`role-${member.userId}`}>
            Rol de {member.fullName}
          </label>
          <select
            id={`role-${member.userId}`}
            className="select member-row__role"
            value={member.role}
            disabled={change.isPending}
            onChange={(e) => change.mutate(e.target.value as Role)}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <Button variant="quiet-danger" size="sm" iconOnly icon={UserMinus} aria-label={`Quitar a ${member.fullName} del equipo`} onClick={() => setRemoving(true)} />
        </>
      ) : (
        <span className="pill pill--neutral">{ROLE_LABEL[member.role]}</span>
      )}
      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(false)}
          title={`Quitar a ${member.fullName}`}
          description="Perderá el acceso a esta empresa de inmediato. Sus presupuestos y su historial se conservan."
          onSubmit={() => remove.mutate()}
          submitLabel="Quitar del equipo"
          submitVariant="danger"
          submitting={remove.isPending}
        >
          {remove.isError && <ErrorAlert error={remove.error} />}
        </Dialog>
      )}
    </li>
  );
}

export function TeamPage() {
  usePageTitle('Equipo');
  const session = useSession();
  const canManage = session.can('members:manage');
  const members = useMembers();
  const invitations = useInvitations(canManage);
  const queryClient = useQueryClient();
  const toast = useToast();
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/members/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.invitations });
      toast.success('Invitación anulada.');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="stack stack--lg">
      <section className="panel" aria-labelledby="team-title">
        <div className="panel__header">
          <div>
            <h2 id="team-title">Miembros</h2>
            <p>Siempre debe haber al menos una persona propietaria.</p>
          </div>
        </div>
        {members.isPending ? (
          <SkeletonRows rows={3} />
        ) : members.isError ? (
          <div className="panel__body">
            <ErrorAlert error={members.error} onRetry={() => void members.refetch()} />
          </div>
        ) : (
          <ul className="rows">
            {members.data.items.map((m) => (
              <MemberRow key={m.userId} member={m} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <>
          <InviteForm />
          {invitations.data && invitations.data.items.length > 0 && (
            <section className="panel" aria-labelledby="inv-title">
              <div className="panel__header">
                <h2 id="inv-title">Invitaciones pendientes</h2>
              </div>
              <ul className="rows">
                {invitations.data.items.map((inv) => (
                  <li key={inv.id} className="row">
                    <div className="row__main">
                      <p className="row__title">{inv.email}</p>
                      <p className="row__meta">
                        <span>{ROLE_LABEL[inv.role]}</span>
                        <span>Caduca el {formatDate(inv.expiresAt)}</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="quiet-danger"
                      icon={Trash2}
                      loading={revoke.isPending && revoke.variables === inv.id}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      Anular
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <ReadOnlyNotice />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan (solo lectura: los pagos llegan en una fase posterior)
// ---------------------------------------------------------------------------

export function PlanPage() {
  usePageTitle('Plan');
  const sub = useSubscription();
  if (sub.isPending) return <Skeleton height="16rem" />;
  if (sub.isError) return <ErrorAlert error={sub.error} onRetry={() => void sub.refetch()} />;
  const { subscription: s, plans } = sub.data;
  return (
    <div className="stack stack--lg">
      <section className="panel" aria-labelledby="plan-title">
        <div className="panel__header">
          <h2 id="plan-title">Tu plan</h2>
          <span className={`pill ${s.hasActiveAccess ? 'pill--fresh' : 'pill--cold'}`}>{SUBSCRIPTION_STATUS_LABEL[s.status]}</span>
        </div>
        <div className="panel__body stack">
          <dl className="kv">
            <dt>Plan</dt>
            <dd className="strong">{s.planDetails?.name ?? 'Ninguno'}</dd>
            {s.status === 'trialing' && s.trialEndsAt && (
              <>
                <dt>Prueba gratuita hasta</dt>
                <dd>{formatDate(s.trialEndsAt)}</dd>
              </>
            )}
            {s.currentPeriodEnd && (
              <>
                <dt>Periodo actual hasta</dt>
                <dd>{formatDate(s.currentPeriodEnd)}</dd>
              </>
            )}
          </dl>
          {!s.paymentsEnabled && (
            <Alert tone="info" title="Los pagos todavía no están activos">
              Durante la prueba no se te cobrará nada y no necesitas tarjeta. La contratación de planes se habilitará más adelante.
            </Alert>
          )}
        </div>
      </section>
      <section className="panel" aria-labelledby="plans-title">
        <div className="panel__header">
          <div>
            <h2 id="plans-title">Planes disponibles</h2>
            <p>Precios por empresa y mes. Pendiente de confirmar si incluyen IVA.</p>
          </div>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de planes (desplazable)">
          <table className="table">
            <caption className="visually-hidden">Planes</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col" className="num">
                  Precio
                </th>
                <th scope="col">Recuperaciones al mes</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} aria-current={p.id === s.plan ? 'true' : undefined}>
                  <td className="strong">
                    {p.name} {p.id === s.plan && <span className="pill pill--neutral">Actual</span>}
                  </td>
                  <td className="num">{formatMoney(p.priceCents, p.currency)}/mes</td>
                  <td>{p.monthlyRecoveryLimit !== null ? `Hasta ${p.monthlyRecoveryLimit}` : 'Uso amplio, con política de uso razonable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mi perfil
// ---------------------------------------------------------------------------

export function ProfilePage() {
  usePageTitle('Mi perfil');
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(session.user.fullName);
  const [nameError, setNameError] = useState<string | undefined>();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const pwForm = useFormErrors();

  const saveName = useMutation({
    mutationFn: () => api('/me', { method: 'PATCH', body: { fullName: name.trim() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.me });
      void queryClient.invalidateQueries({ queryKey: keys.members });
      toast.success('Nombre actualizado.');
    },
    onError: (e) => setNameError(e.message),
  });
  const changePassword = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/password/change', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } }),
    onSuccess: (res) => {
      setPw({ current: '', next: '', confirm: '' });
      toast.success(res.message);
    },
    onError: (e) => pwForm.handleError(e, { newPassword: 'next', currentPassword: 'current' }),
  });
  const resend = useMutation({
    mutationFn: () => api<{ message: string; delivery: Delivery | null }>('/auth/email/verification', { method: 'POST' }),
  });

  return (
    <div className="stack stack--lg">
      <form
        className="panel"
        noValidate
        aria-labelledby="profile-title"
        onSubmit={(e) => {
          e.preventDefault();
          const err = required(name, 120, 'Tu nombre');
          setNameError(err);
          if (!err) saveName.mutate();
        }}
      >
        <div className="panel__header">
          <h2 id="profile-title">Tus datos</h2>
        </div>
        <div className="panel__body form">
          <Field label="Nombre y apellidos" error={nameError}>
            <input
              className="input"
              value={name}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
            />
          </Field>
          <dl className="kv">
            <dt>Email</dt>
            <dd>
              {session.user.email}{' '}
              {session.user.emailVerified ? <span className="pill pill--fresh">Confirmado</span> : <span className="pill pill--due">Sin confirmar</span>}
            </dd>
            <dt>Rol</dt>
            <dd>{ROLE_LABEL[session.role]}</dd>
          </dl>
          {!session.user.emailVerified &&
            (resend.isSuccess ? (
              <Alert tone={resend.data.delivery === 'sent' ? 'success' : 'warning'}>
                {resend.data.delivery === 'sent'
                  ? resend.data.message
                  : 'No se ha podido enviar el email de confirmación: el envío de correo aún no está configurado en este entorno.'}
              </Alert>
            ) : (
              <div>
                {resend.isError && <ErrorAlert error={resend.error} />}
                <button type="button" className="link-button" onClick={() => resend.mutate()} disabled={resend.isPending}>
                  {resend.isPending ? 'Enviando…' : 'Enviarme de nuevo el email de confirmación'}
                </button>
              </div>
            ))}
        </div>
        <div className="panel__footer">
          <span />
          <Button type="submit" variant="primary" loading={saveName.isPending}>
            Guardar
          </Button>
        </div>
      </form>

      <form
        ref={pwForm.formRef}
        className="panel"
        noValidate
        aria-labelledby="pw-title"
        onSubmit={(e) => {
          e.preventDefault();
          pwForm.setFormError(null);
          const errs = compact({
            current: pw.current ? undefined : 'Introduce tu contraseña actual',
            next: validatePassword(pw.next) ?? (pw.next === pw.current ? 'Debe ser distinta de la actual' : undefined),
            confirm: pw.confirm === pw.next ? undefined : 'Las contraseñas no coinciden',
          });
          pwForm.setErrors(errs);
          if (!Object.keys(errs).length) changePassword.mutate();
        }}
      >
        <div className="panel__header">
          <div>
            <h2 id="pw-title">Cambiar contraseña</h2>
            <p>Se cerrarán tus sesiones en otros dispositivos.</p>
          </div>
        </div>
        <div className="panel__body form">
          {pwForm.formError != null && <ErrorAlert error={pwForm.formError} />}
          <Field label="Contraseña actual" error={pwForm.errors.current}>
            <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
          </Field>
          <div className="form-row">
            <Field label="Contraseña nueva" error={pwForm.errors.next} hint="Mínimo 10 caracteres.">
              <input className="input" type="password" autoComplete="new-password" value={pw.next} maxLength={128} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
            </Field>
            <Field label="Repite la contraseña nueva" error={pwForm.errors.confirm}>
              <input className="input" type="password" autoComplete="new-password" value={pw.confirm} maxLength={128} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
            </Field>
          </div>
        </div>
        <div className="panel__footer">
          <span />
          <Button type="submit" variant="primary" loading={changePassword.isPending}>
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </div>
  );
}
