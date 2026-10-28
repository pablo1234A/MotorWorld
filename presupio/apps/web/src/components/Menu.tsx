import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface MenuProps {
  /** Contenido del botón que abre el menú. */
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'menu'; onClick: () => void }) => ReactNode;
  placement?: 'up' | 'down';
  children: (close: () => void) => ReactNode;
  label: string;
}

/**
 * Menú desplegable accesible: se abre con clic o teclado, se cierra con Escape o al
 * hacer clic fuera, y las flechas recorren sus opciones.
 */
export function Menu({ trigger, placement = 'down', children, label }: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const first = list.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      {trigger({ 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': 'menu', onClick: () => setOpen((o) => !o) })}
      {open && (
        <ul id={id} ref={list} role="menu" aria-label={label} className={`menu__list menu__list--${placement}`}>
          {children(() => setOpen(false))}
        </ul>
      )}
    </div>
  );
}
