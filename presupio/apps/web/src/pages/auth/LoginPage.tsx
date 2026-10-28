import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import { useStartSession } from '../../auth/session';
import { Alert, Button, ErrorAlert, Field } from '../../components/ui';
import { useFormErrors } from '../../lib/forms';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, safeRedirect, validateEmail } from '../../lib/validation';

export function LoginPage() {
  usePageTitle('Iniciar sesión');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const startSession = useStartSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const next = safeRedirect(params.get('siguiente'));
  const reason = params.get('motivo');

  const login = useMutation({
    mutationFn: () => api('/auth/login', { method: 'POST', body: { email: email.trim(), password } }),
    onSuccess: async () => {
      await startSession();
      navigate(next, { replace: true });
    },
    onError: (error) => {
      // Credenciales incorrectas: mensaje general (no se indica qué dato falla).
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setPassword('');
        setFormError(error);
        return;
      }
      handleError(error);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = compact({ email: validateEmail(email), password: password ? undefined : 'Introduce tu contraseña' });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    login.mutate();
  };

  return (
    <>
      <header>
        <h1>Inicia sesión</h1>
        <p>Accede al seguimiento de presupuestos de tu empresa.</p>
      </header>

      {reason === 'restablecida' && <Alert tone="success">Contraseña actualizada. Ya puedes iniciar sesión con la nueva.</Alert>}
      {formError != null && <ErrorAlert error={formError} />}

      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        <Field label="Email" error={errors.email}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearField('email');
            }}
            required
          />
        </Field>
        <Field label="Contraseña" error={errors.password}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearField('password');
            }}
            required
          />
        </Field>
        <div className="cluster" style={{ justifyContent: 'space-between' }}>
          <Link to="/recuperar-contrasena" className="small">
            ¿Has olvidado tu contraseña?
          </Link>
        </div>
        <Button type="submit" variant="primary" block loading={login.isPending}>
          Iniciar sesión
        </Button>
      </form>

      <p className="auth__switch">
        ¿Tu empresa aún no usa Presupio? <Link to="/registro">Crea una cuenta</Link>
      </p>
    </>
  );
}
