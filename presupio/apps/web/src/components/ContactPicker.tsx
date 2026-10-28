import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useContacts } from '../api/queries';
import type { Contact } from '../api/types';
import { Spinner } from './ui';

/** Buscador de contactos existentes con selección por radio (accesible con teclado). */
export function ContactPicker({
  value,
  onChange,
  error,
}: {
  value: Contact | null;
  onChange: (c: Contact | null) => void;
  error?: string | undefined;
}) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const id = useId();
  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 250);
    return () => window.clearTimeout(t);
  }, [input]);
  const contacts = useContacts(q);
  const items = contacts.data?.pages[0]?.items ?? [];

  return (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-search`}>
        Buscar contacto
      </label>
      <div className="input-affix input-affix--prefix">
        <span className="input-affix__prefix">
          <Search aria-hidden="true" />
        </span>
        <input
          id={`${id}-search`}
          className="input"
          type="search"
          placeholder="Nombre, email o teléfono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <fieldset className="picker" aria-label="Contactos encontrados">
        {contacts.isPending ? (
          <div className="picker__empty">
            <Spinner label="Buscando contactos…" />
          </div>
        ) : items.length === 0 ? (
          <p className="picker__empty small muted">{q ? 'No hay contactos que coincidan.' : 'Todavía no hay contactos.'}</p>
        ) : (
          items.slice(0, 8).map((c) => (
            <label key={c.id} className="picker__option">
              <input type="radio" name={`${id}-contact`} checked={value?.id === c.id} onChange={() => onChange(c)} />
              <span>
                <span className="strong">{c.fullName}</span>
                <span className="cell-sub">{[c.email, c.phone, c.organization].filter(Boolean).join(' · ')}</span>
              </span>
            </label>
          ))
        )}
      </fieldset>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
