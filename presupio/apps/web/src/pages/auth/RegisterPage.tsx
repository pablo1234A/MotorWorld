import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { Delivery } from '../../api/types';
import { useStartSession } from '../../auth/session';
import { Button, ErrorAlert, Field } from '../../components/ui';
import { useFormErrors } from '../../lib/forms';
import { usePageTitle } from '../../lib/usePageTitle';
import { compact, required, validateEmail, validatePassword } from '../../lib/validation';

export function RegisterPage() {
  usePageTitle('Crear cuenta');
  const navigate = useNavigate();
  const startSession = useStartSession();
  const [form, setForm] = useState({ fullName: '', companyName: '', email: '', password: '', acceptTerms: false });
  const { errors, setErrors, formError, setFormError, handleError, clearField, formRef } = useFormErrors();

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    clearField(key);
  };

  const register = useMutation({
    mutationFn: () =>
      api<{ emailVerification: { delivery: Delivery }; trial: { granted: boolean } }>('/auth/register', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          email: form.email.trim(),
          password: form.password,
          acceptTerms: form.acceptTerms,
        },
      }),
    onSuccess: async (res) => {
      await startSession();
      navigate('/', { replace: true, state: { welcome: true, verificationDelivery: res.emailVerification.delivery, trialGranted: res.trial.granted } });
    },
    onError: (error) => handleError(error),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = compact({
      fullName: required(form.fullName, 120, 'Tu nombre'),
      companyName: required(form.companyName, 120, 'El nombre de la empresa'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      acceptTerms: form.acceptTerms ? undefined : 'Debes aceptar los términos para crear la cuenta',
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    register.mutate();
  };

  return (
    <>
      <header>
        <h1>Crea la cuenta de tu empresa</h1>
        <p>Serás la persona propietaria de la cuenta y podrás invitar a tu equipo después.</p>
      </header>

      {formError != null && <ErrorAlert error={formError} />}

      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        <Field label="Tu nombre y apellidos" error={errors.fullName}>
          <input className="input" autoComplete="name" value={form.fullName} onChange={set('fullName')} maxLength={120} />
        </Field>
        <Field label="Nombre de la empresa" error={errors.companyName}>
          <input className="input" autoComplete="organization" value={form.companyName} onChange={set('companyName')} maxLength={120} />
        </Field>
        <Field label="Email de trabajo" error={errors.email}>
          <input className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Contraseña" error={errors.password} hint="Mínimo 10 caracteres. Una frase larga es más segura y fácil de recordar.">
          <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} maxLength={128} />
        </Field>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={form.acceptTerms}
              onChange={set('acceptTerms')}
              aria-invalid={errors.acceptTerms ? true : undefined}
              aria-describedby={errors.acceptTerms ? 'terms-error' : undefined}
            />
            <span>Acepto los términos del servicio y la política de privacidad de Presupio.</span>
          </label>
          {errors.acceptTerms && (
            <p className="field__error" id="terms-error">
              {errors.acceptTerms}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" block loading={register.isPending}>
          Crear cuenta
        </Button>
      </form>

      <p className="auth__switch">
        ¿Ya tienes cuenta? <Link to="/iniciar-sesion">Inicia sesión</Link>
      </p>
    </>
  );
}
