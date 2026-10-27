import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  Brain, Building2, Clapperboard, FileText, LayoutDashboard, LogOut, Menu, MessagesSquare, Package, Plug, ScrollText, ShieldCheck, Users, Workflow,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { mediaUrl, api } from '../lib/api';
import { useLive, useResource } from '../lib/live';
import { isBrowserEdition } from '../lib/transport';
import type { Snapshot } from '../lib/types';

const SnapshotCtx = createContext<{ snap: Snapshot | null; reload: () => void }>({ snap: null, reload: () => {} });
export const useSnapshot = () => useContext(SnapshotCtx);

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1c1f23" />
      <path d="M16 6.5 25.5 24h-19L16 6.5Z" fill="none" stroke="#ede6da" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="18.2" r="2.5" fill="#E9C46A" />
    </svg>
  );
}

export function Shell({ owner, children }: { owner: { name: string }; children: ReactNode }) {
  const { data: snap, reload } = useResource<Snapshot>('/api/snapshot');
  const { connected } = useLive();
  const { path, navigate } = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const pending = snap?.approvals.pending ?? 0;
  const p = snap?.activeProduct;
  const close = () => setNavOpen(false);

  return (
    <SnapshotCtx.Provider value={{ snap, reload }}>
      <div className={`shell ${navOpen ? 'nav-open' : ''}`} onClick={(e) => navOpen && (e.target as HTMLElement).classList.contains('shell') && close()}>
        <aside className="sidebar" aria-label="Navegación">
          <div className="brand">
            <BrandMark />
            <div className="brand-name">
              AI PRODUCT
              <span>Company</span>
            </div>
          </div>
          <nav className="nav" onClick={close}>
            <Link to="/"><LayoutDashboard /> Control Center</Link>
            <Link to="/office"><Building2 /> Oficina</Link>
            <Link to="/chat"><MessagesSquare /> Chat</Link>
            <div className="nav-group">
              <div className="nav-label">Empresa</div>
              <Link to="/products"><Package /> Product Center</Link>
              <Link to="/work"><Workflow /> Workflows y tareas</Link>
              <Link to="/deliveries"><Clapperboard /> Delivery Center</Link>
              <Link to="/approvals">
                <ShieldCheck /> Approval Center {pending > 0 && <span className="count">{pending}</span>}
              </Link>
              <Link to="/reports"><FileText /> Daily Reports</Link>
            </div>
            <div className="nav-group">
              <div className="nav-label">Sistema</div>
              <Link to="/agents"><Users /> Agentes y skills</Link>
              <Link to="/memory"><Brain /> Memoria</Link>
              <Link to="/logs"><ScrollText /> Logs y comunicación</Link>
              <Link to="/settings"><Plug /> Integraciones y ajustes</Link>
            </div>
          </nav>
          <div className="sidebar-foot">
            <div className="row gap-8 small muted">
              <span className="agent-mark" style={{ ['--s' as string]: '24px' }}>YO</span>
              <span className="grow ellipsis">{owner.name} · Propietario</span>
              {!isBrowserEdition() && <button
                className="btn ghost sm icon"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={async () => {
                  await api.post('/api/auth/logout');
                  window.location.href = '/';
                }}
              >
                <LogOut />
              </button>}
            </div>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="btn ghost icon mobile-nav-toggle" aria-label="Menú" onClick={() => setNavOpen(true)}>
              <Menu />
            </button>
            {p ? (
              <Link to={`/products/${p.id}`} className="active-product" aria-current={undefined} title="Producto activo">
                {p.image ? <img src={mediaUrl(p.image)} alt="" /> : <span className="ph" />}
                <span className="stack" style={{ minWidth: 0 }}>
                  <span className="xs faint">Producto activo</span>
                  <span className="ellipsis" style={{ fontWeight: 600, fontSize: 13, maxWidth: 260 }}>{p.name}</span>
                </span>
              </Link>
            ) : (
              <Link to="/products" className="active-product" aria-current={undefined}>
                <span className="ph" />
                <span className="small muted">Sin producto activo — actívalo</span>
              </Link>
            )}
            <span className="spacer" />
            {isBrowserEdition() && (
              <span className="engine hide-sm" title="Toda la empresa se ejecuta en este navegador; los datos se guardan en este dispositivo.">
                <span className="dot" style={{ background: 'var(--info)' }} />
                Edición navegador
              </span>
            )}
            <span className="engine hide-sm" title={snap?.llmConnected ? 'Agentes razonando con Claude' : 'Sin ANTHROPIC_API_KEY: motor heurístico local'}>
              <span className="dot" style={{ background: snap?.llmConnected ? 'var(--ok)' : 'var(--wait)' }} />
              {snap ? (snap.llmConnected ? snap.engine.replace('anthropic:', 'Claude · ') : 'Motor local · INTEGRATION_REQUIRED') : '…'}
            </span>
            <span className="engine hide-sm" title={connected ? 'Conectado en tiempo real' : 'Reconectando…'}>
              <span className="dot" style={{ background: connected ? 'var(--ok)' : 'var(--err)' }} />
              {snap?.settings.autopilot ? 'Autopilot' : 'Manual'}
            </span>
            {path !== '/chat' && !path.startsWith('/chat/') && (
              <button className="btn primary sm" onClick={() => navigate('/chat/ATLAS')}>
                <MessagesSquare /> Hablar con ATLAS
              </button>
            )}
          </header>
          <main className="page">{children}</main>
        </div>
      </div>
    </SnapshotCtx.Provider>
  );
}
