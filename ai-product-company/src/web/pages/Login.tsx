import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { BrandMark } from '../components/Shell';
import { Field } from '../components/ui';

export function Login({ hasOwner, onDone }: { hasOwner: boolean; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (hasOwner) await api.post('/api/auth/login', { email, password });
      else await api.post('/api/auth/setup', { email, name, password });
      onDone();
    } catch (err) {
      setError((err as Error).message === 'Invalid credentials' ? 'Email o contraseña incorrectos.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card panel" onSubmit={submit} style={{ padding: 28 }}>
        <div className="brand">
          <BrandMark />
          <div className="brand-name">
            AI PRODUCT
            <span>Company</span>
          </div>
        </div>
        <h1 style={{ fontSize: 22 }}>{hasOwner ? 'Entrar en tu empresa' : 'Crea la cuenta del propietario'}</h1>
        <p className="muted" style={{ margin: '8px 0 22px' }}>
          {hasOwner ? 'Solo el propietario tiene acceso al centro de operaciones.' : 'Primera puesta en marcha: esta será la única cuenta con acceso. ATLAS te responderá directamente a ti.'}
        </p>
        <div className="stack gap-12">
          {!hasOwner && (
            <Field label="Tu nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Contraseña" hint={hasOwner ? undefined : 'Mínimo 10 caracteres. Se guarda con scrypt; nunca en texto plano.'}>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={hasOwner ? 1 : 10} autoComplete={hasOwner ? 'current-password' : 'new-password'} />
          </Field>
          {error && <div className="banner err">{error}</div>}
          <button className="btn primary" type="submit" disabled={busy} style={{ height: 40, marginTop: 6 }}>
            {busy ? 'Comprobando…' : hasOwner ? 'Entrar' : 'Crear empresa'}
          </button>
        </div>
      </form>
    </div>
  );
}
