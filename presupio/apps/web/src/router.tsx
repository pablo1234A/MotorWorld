import { createBrowserRouter, type RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from './auth/session';
import { AppShell } from './layout/AppShell';
import { Spinner } from './components/ui';
import { AuthLayout } from './layout/AuthLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage, RouteErrorPage } from './pages/ErrorPages';

// Las pantallas menos frecuentes se descargan al visitarlas (carga inicial más ligera en móvil).
const lazyPage =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) =>
  async () => ({ Component: (await load())[name] as React.ComponentType });

/** Rutas en español. Las privadas cuelgan de <RequireAuth>; el servidor valida cada petición. */
function InitialLoading() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Spinner label="Cargando Presupio…" />
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <InitialLoading />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            element: <GuestOnly />,
            children: [
              { path: '/iniciar-sesion', element: <LoginPage /> },
              { path: '/registro', lazy: lazyPage(() => import('./pages/auth/RegisterPage'), 'RegisterPage') },
              { path: '/recuperar-contrasena', lazy: lazyPage(() => import('./pages/auth/PasswordPages'), 'ForgotPasswordPage') },
              { path: '/restablecer-contrasena', lazy: lazyPage(() => import('./pages/auth/PasswordPages'), 'ResetPasswordPage') },
            ],
          },
          // Accesibles con o sin sesión (enlaces de los emails).
          { path: '/verificar-email', lazy: lazyPage(() => import('./pages/auth/PasswordPages'), 'VerifyEmailPage') },
          { path: '/aceptar-invitacion', lazy: lazyPage(() => import('./pages/auth/AcceptInvitationPage'), 'AcceptInvitationPage') },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            errorElement: <RouteErrorPage />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: '/presupuestos', lazy: lazyPage(() => import('./pages/quotes/QuotesListPage'), 'QuotesListPage') },
              { path: '/presupuestos/nuevo', lazy: lazyPage(() => import('./pages/quotes/NewQuotePage'), 'NewQuotePage') },
              { path: '/presupuestos/:id', lazy: lazyPage(() => import('./pages/quotes/QuoteDetailPage'), 'QuoteDetailPage') },
              { path: '/seguimientos', lazy: lazyPage(() => import('./pages/FollowUpsPage'), 'FollowUpsPage') },
              { path: '/contactos', lazy: lazyPage(() => import('./pages/contacts/ContactsPages'), 'ContactsListPage') },
              { path: '/contactos/:id', lazy: lazyPage(() => import('./pages/contacts/ContactsPages'), 'ContactDetailPage') },
              {
                path: '/configuracion',
                lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'SettingsLayout'),
                children: [
                  { index: true, lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'CompanySettingsPage') },
                  { path: 'seguimiento', lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'FollowUpRulesPage') },
                  { path: 'equipo', lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'TeamPage') },
                  { path: 'plan', lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'PlanPage') },
                  { path: 'perfil', lazy: lazyPage(() => import('./pages/settings/SettingsPages'), 'ProfilePage') },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
