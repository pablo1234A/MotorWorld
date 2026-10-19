import { Settings as SettingsIcon, Focus } from 'lucide-react';
import { useNav } from '../components/Shell';
import { useUI } from '../components/AppUI';

/** Menú "Más" de la navegación inferior en móvil. */
export default function More() {
  const groups = useNav();
  const ui = useUI();
  const primary = ['#/', '#/prospects', '#/calendar', '#/tasks'];
  return (
    <div className="page">
      {groups.map((g) => {
        const items = g.items.filter((i) => !primary.includes(i.href));
        if (!items.length) return null;
        return (
          <section key={g.label} className="mb-24">
            <div className="eyebrow mb-8">{g.label}</div>
            <div className="grid g2 keep" style={{ gap: 8 }}>
              {items.map((it) => (
                <a key={it.href} href={it.href} className="card tight hover row gap-12" style={{ padding: 14 }}>
                  <span style={{ color: 'var(--accent)', display: 'grid' }}>{it.icon}</span>
                  <span className="small strong grow trunc">{it.label}</span>
                  {!!it.count && <span className={`badge ${it.hot ? 'hot' : ''}`}>{it.count}</span>}
                </a>
              ))}
            </div>
          </section>
        );
      })}
      <div className="grid g2 keep" style={{ gap: 8 }}>
        <button className="card tight hover row gap-12" style={{ padding: 14 }} onClick={() => ui.setFocus(true)}>
          <Focus size={18} style={{ color: 'var(--accent)' }} />
          <span className="small strong">Modo concentración</span>
        </button>
        <a href="#/settings" className="card tight hover row gap-12" style={{ padding: 14 }}>
          <SettingsIcon size={18} style={{ color: 'var(--accent)' }} />
          <span className="small strong">Ajustes</span>
        </a>
      </div>
    </div>
  );
}
