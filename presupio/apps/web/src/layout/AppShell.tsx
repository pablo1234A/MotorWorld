import { ArrowLeftRight, Check, ChevronsUpDown, ClipboardList, FileText, LayoutDashboard, LogOut, Settings, UserRound, Users } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useSummary } from '../api/queries';
import { useLogout, useSession, useSwitchCompany } from '../auth/session';
import { Brand } from '../components/Logo';
import { Menu } from '../components/Menu';
import { useToast } from '../components/Toasts';
import { initials } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/presupuestos', label: 'Presupuestos', icon: FileText },
  { to: '/seguimientos', label: 'Seguimientos', icon: ClipboardList },
  { to: '/contactos', label: 'Contactos', icon: Users },
] as const;

function AccountMenu({ placement }: { placement: 'up' | 'down' }) {
  const session = useSession();
  const logout = useLogout();
  const switchCompany = useSwitchCompany();
  const toast = useToast();
  const others = session.memberships.filter((m) => m.companyId !== session.company.id);

  return (
    <Menu
      label="Cuenta"
      placement={placement}
      trigger={(props) => (
        <button type="button" className="account-button" {...props}>
          <span className="avatar" aria-hidden="true">
            {initials(session.user.fullName)}
          </span>
          <span className="account-button__text">
            <span className="account-button__company">{session.company.name}</span>
            <span className="account-button__user">
              {session.user.fullName} · {ROLE_LABEL[session.role]}
            </span>
          </span>
          <ChevronsUpDown aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <li role="none" className="menu__label">
            {session.user.email}
          </li>
          <li role="none">
            <Link role="menuitem" className="menu__item" to="/configuracion/perfil" onClick={close}>
              <UserRound aria-hidden="true" /> Mi perfil
            </Link>
          </li>
          <li role="none">
            <Link role="menuitem" className="menu__item" to="/configuracion" onClick={close}>
              <Settings aria-hidden="true" /> Configuración de la empresa
            </Link>
          </li>
          {others.length > 0 && (
            <>
              <li role="separator" className="menu__sep" />
              <li role="none" className="menu__label">
                Cambiar de empresa
              </li>
              <li role="none">
                <span className="menu__item" aria-current="true" style={{ cursor: 'default' }}>
                  <Check aria-hidden="true" /> {session.company.name}
                </span>
              </li>
              {others.map((m) => (
                <li role="none" key={m.companyId}>
                  <button
                    role="menuitem"
                    type="button"
                    className="menu__item"
                    disabled={switchCompany.isPending}
                    onClick={() => {
                      close();
                      switchCompany.mutate(m.companyId, {
                        onSuccess: () => toast.success(`Ahora trabajas en ${m.companyName}.`),
                        onError: (e) => toast.error(e.message),
                      });
                    }}
                  >
                    <ArrowLeftRight aria-hidden="true" /> {m.companyName}
                  </button>
                </li>
              ))}
            </>
          )}
          <li role="separator" className="menu__sep" />
          <li role="none">
            <button
              role="menuitem"
              type="button"
              className="menu__item"
              onClick={() => {
                close();
                logout.mutate();
              }}
            >
              <LogOut aria-hidden="true" /> Cerrar sesión
            </button>
          </li>
        </>
      )}
    </Menu>
  );
}

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const summary = useSummary();
  const pending = summary.data?.summary.followUps.pending ?? 0;
  const previousPath = useRef<string | null>(null);

  // Al navegar entre pantallas, el foco va al contenido (lectores de pantalla y teclado).
  // En la carga inicial no se mueve: el primer Tab debe llegar a «Saltar al contenido».
  useEffect(() => {
    const prev = previousPath.current;
    previousPath.current = location.pathname;
    if (prev === null || prev === location.pathname) return;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <aside className="rail" aria-label="Navegación principal">
        <Link to="/" className="brand" aria-label="Presupio, ir al panel">
          <Brand />
        </Link>
        <nav aria-label="Secciones">
          <ul className="nav">
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <li key={to}>
                <NavLink to={to} end={'end' in rest}>
                  <Icon aria-hidden="true" />
                  {label}
                  {to === '/seguimientos' && pending > 0 && (
                    <span className="nav__count" aria-label={`${pending} pendientes`}>
                      {pending}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="rail__section">Empresa</p>
          <ul className="nav">
            <li>
              <NavLink to="/configuracion">
                <Settings aria-hidden="true" />
                Configuración
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="rail__footer">
          <AccountMenu placement="up" />
        </div>
      </aside>

      <header className="topbar">
        <Link to="/" className="brand" aria-label="Presupio, ir al panel">
          <Brand />
        </Link>
        <AccountMenu placement="down" />
      </header>

      <main id="contenido" className="main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottomnav" aria-label="Navegación principal">
        {[...NAV, { to: '/configuracion', label: 'Ajustes', icon: Settings }].map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest}>
            <Icon aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
