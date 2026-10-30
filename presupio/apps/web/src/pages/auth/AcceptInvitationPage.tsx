import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useMe } from '../../api/queries';
import type { Role } from '../../api/types';
import { useStartSession } from '../../auth/session';
import { LegalConsentText } from '../../components/LegalConsentText';
import { Alert, Button, ErrorAlert, Field, Spinner } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useFormErrors } from '../../lib/forms';
import { ROLE_LABEL } from '../../lib/labels';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required, validatePassword } from '../../lib/validation';

interface Preview {
  email: string;
  role: Role;
  expiresAt: string;
  companyName: string;
  accountExists: boolean;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function AcceptInvitationPage() {
  usePageTitle('Aceptar invitación');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const me = useMe();
  const startSession = useStartSession();
  const [form, setForm] = useState({ fullName: '', password: '', acceptTerms: false });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();

  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => api<Preview>('/auth/invitations/preview', { method: 'POST', body: { token } }),
    enabled: TOKEN.test(token),
    retry: false,
    staleTime: Infinity,
  });

  const accept = useMutation({
    mutationFn: (body: object) => api('/auth/invitations/accept', { method: 'POST', body: { token, ...body } }),
    onSuccess: async () => {
      await startSession();
      navigate('/', { replace: true });
    },
    onError: (e) => handleError(e),
  });

  if (!TOKEN.test(token) || preview.isError) {
    return (
      <>
        <header>
          <h1>Invitación no válida</h1>
        </header>
        <Alert tone="error">
          La invitación ha caducado, se ha anulado o ya se ha usado. Pide a quien te invitó que te envíe una nueva.
        </Alert>
        <Link to="/iniciar-sesion">Ir a iniciar sesión</Link>
      </>
    );
  }
  if (preview.isPending || me.isPending) return <Spinner label="Cargando invitación…" />;

  const inv = preview.data;
  const loggedIn = !!me.data;
  const sameUser = me.data?.user.email === inv.email;

  return (
    <>
      <header>
        <h1>Únete a {inv.companyName}</h1>
        <p>
          Invitación para <strong>{inv.email}</strong> con el rol de {ROLE_LABEL[inv.role].toLowerCase()}. Caduca el {formatDate(inv.expiresAt)}.
        </p>
      </header>
      {formError != null && <ErrorAlert error={formError} />}

      {loggedIn && sameUser && (
        <Button variant="primary" block loading={accept.isPending} onClick={() => accept.mutate({})}>
          Aceptar y entrar en {inv.companyName}
        </Button>
      )}

      {loggedIn && !sameUser && (
        <Alert tone="warning" title="Has iniciado sesión con otra cuenta">
          Esta invitación es para {inv.email}. Cierra sesión e inicia sesión con esa cuenta para aceptarla.
        </Alert>
      )}

      {!loggedIn && inv.accountExists && (
        <>
          <Alert tone="info">Ya tienes una cuenta con este email. Inicia sesión y vuelve a abrir el enlace de la invitación.</Alert>
          <Link
            className="btn btn--primary btn--block"
            to={`/iniciar-sesion?siguiente=${encodeURIComponent(`/aceptar-invitacion?token=${token}`)}`}
          >
            Iniciar sesión para aceptar
          </Link>
        </>
      )}

      {!loggedIn && !inv.accountExists && (
        <form
          ref={formRef}
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            const errs = compact({
              fullName: required(form.fullName, 120, 'Tu nombre'),
              password: validatePassword(form.password),
              acceptTerms: form.acceptTerms ? undefined : 'Debes aceptar los términos para continuar',
            });
            setErrors(errs);
            if (!Object.keys(errs).length) {
              accept.mutate({ fullName: form.fullName.trim(), password: form.password, acceptTerms: true });
            }
          }}
        >
          <Field label="Email">
            <input className="input" value={inv.email} disabled readOnly />
          </Field>
          <Field label="Tu nombre y apellidos" error={errors.fullName}>
            <input
              className="input"
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => {
                setForm((f) => ({ ...f, fullName: e.target.value }));
                clearField('fullName');
              }}
            />
          </Field>
          <Field label="Crea una contraseña" error={errors.password} hint="Mínimo 10 caracteres.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => {
                setForm((f) => ({ ...f, password: e.target.value }));
                clearField('password');
              }}
            />
          </Field>
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={form.acceptTerms}
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={errors.acceptTerms ? 'inv-terms-error' : undefined}
                onChange={(e) => {
                  setForm((f) => ({ ...f, acceptTerms: e.target.checked }));
                  clearField('acceptTerms');
                }}
              />
              <LegalConsentText />
            </label>
            {errors.acceptTerms && (
              <p className="field__error" id="inv-terms-error">
                {errors.acceptTerms}
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" block loading={accept.isPending}>
            Crear cuenta y unirme
          </Button>
        </form>
      )}
    </>
  );
}
