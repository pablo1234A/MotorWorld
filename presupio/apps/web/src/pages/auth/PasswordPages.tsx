import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../../api/client';
import { Alert, Button, ErrorAlert, Field } from '../../components/ui';
import { useFormErrors } from '../../lib/forms';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, validateEmail, validatePassword } from '../../lib/validation';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function ForgotPasswordPage() {
  usePageTitle('Recuperar contraseña');
  const [email, setEmail] = useState('');
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();
  const forgot = useMutation({
    mutationFn: () => api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } }),
    onError: (e) => handleError(e),
  });

  if (forgot.isSuccess) {
    return (
      <>
        <header>
          <h1>Revisa tu correo</h1>
        </header>
        <Alert tone="info" title="Solicitud recibida">
          {forgot.data.message} El enlace caduca en 30 minutos. Si no lo ves, revisa la carpeta de correo no deseado.
        </Alert>
        <p className="auth__switch">
          <Link to="/iniciar-sesion">Volver a iniciar sesión</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <header>
        <h1>Recupera tu contraseña</h1>
        <p>Escribe el email de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      </header>
      {formError != null && <ErrorAlert error={formError} />}
      <form
        ref={formRef}
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          const errs = compact({ email: validateEmail(email) });
          setErrors(errs);
          if (!Object.keys(errs).length) forgot.mutate();
        }}
      >
        <Field label="Email" error={errors.email}>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearField('email');
            }}
          />
        </Field>
        <Button type="submit" variant="primary" block loading={forgot.isPending}>
          Enviar enlace
        </Button>
      </form>
      <p className="auth__switch">
        <Link to="/iniciar-sesion">Volver a iniciar sesión</Link>
      </p>
    </>
  );
}

export function ResetPasswordPage() {
  usePageTitle('Nueva contraseña');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();

  const reset = useMutation({
    mutationFn: () => api('/auth/password/reset', { method: 'POST', body: { token, password } }),
    onSuccess: () => navigate('/iniciar-sesion?motivo=restablecida', { replace: true }),
    onError: (e) => handleError(e),
  });

  if (!TOKEN.test(token)) {
    return (
      <>
        <header>
          <h1>Enlace no válido</h1>
        </header>
        <Alert tone="error">El enlace para restablecer la contraseña no es válido o está incompleto. Solicita uno nuevo.</Alert>
        <Link className="btn btn--primary" to="/recuperar-contrasena">
          Solicitar un enlace nuevo
        </Link>
      </>
    );
  }

  const expired = formError instanceof ApiError && formError.code === 'INVALID_TOKEN';

  return (
    <>
      <header>
        <h1>Crea una contraseña nueva</h1>
        <p>Al guardarla se cerrarán todas las sesiones abiertas de tu cuenta.</p>
      </header>
      {expired ? (
        <Alert tone="error" title="El enlace ha caducado o ya se ha usado" action={<Link to="/recuperar-contrasena">Solicitar un enlace nuevo</Link>}>
          Por seguridad, cada enlace sirve una sola vez y caduca a los 30 minutos.
        </Alert>
      ) : (
        formError != null && <ErrorAlert error={formError} />
      )}
      <form
        ref={formRef}
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          const errs = compact({
            password: validatePassword(password),
            confirm: confirm === password ? undefined : 'Las contraseñas no coinciden',
          });
          setErrors(errs);
          if (!Object.keys(errs).length) reset.mutate();
        }}
      >
        <Field label="Contraseña nueva" error={errors.password} hint="Mínimo 10 caracteres.">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            maxLength={128}
            onChange={(e) => {
              setPassword(e.target.value);
              clearField('password');
            }}
          />
        </Field>
        <Field label="Repite la contraseña" error={errors.confirm}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            maxLength={128}
            onChange={(e) => {
              setConfirm(e.target.value);
              clearField('confirm');
            }}
          />
        </Field>
        <Button type="submit" variant="primary" block loading={reset.isPending}>
          Guardar contraseña
        </Button>
      </form>
    </>
  );
}

/**
 * Confirmación de email. Se pide un clic explícito en lugar de confirmar al cargar: algunos
 * filtros de correo abren los enlaces automáticamente y consumirían el token.
 */
export function VerifyEmailPage() {
  usePageTitle('Confirmar email');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useMutation({ mutationFn: () => api('/auth/email/verify', { method: 'POST', body: { token } }) });

  if (!TOKEN.test(token)) {
    return (
      <>
        <header>
          <h1>Enlace no válido</h1>
        </header>
        <Alert tone="error">El enlace de confirmación no es válido o está incompleto. Puedes pedir otro desde tu perfil.</Alert>
        <Link to="/configuracion/perfil">Ir a mi perfil</Link>
      </>
    );
  }

  if (verify.isSuccess) {
    return (
      <>
        <header>
          <h1>Email confirmado</h1>
        </header>
        <Alert tone="success" title="Todo listo">
          Hemos confirmado tu dirección de email.
        </Alert>
        <Link className="btn btn--primary" to="/">
          Ir al panel
        </Link>
      </>
    );
  }

  return (
    <>
      <header>
        <h1>Confirma tu email</h1>
        <p>Pulsa el botón para confirmar que esta dirección de email es tuya.</p>
      </header>
      {verify.isError && <ErrorAlert error={verify.error} />}
      <Button variant="primary" icon={MailCheck} block loading={verify.isPending} onClick={() => verify.mutate()}>
        Confirmar mi email
      </Button>
    </>
  );
}
