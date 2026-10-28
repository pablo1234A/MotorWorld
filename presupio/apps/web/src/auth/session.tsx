import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { fetchMe, keys, useMe } from '../api/queries';
import type { Me, Permission } from '../api/types';
import { ErrorAlert, Spinner } from '../components/ui';
import { safeRedirect } from '../lib/validation';

export const LOGIN_PATH = '/iniciar-sesion';

/** Sesión del usuario autenticado. Solo se usa dentro de <RequireAuth>. */
export function useSession(): Me & { can: (p: Permission) => boolean } {
  const { data } = useMe();
  if (!data) throw new Error('useSession requiere una sesión activa');
  return { ...data, can: (p) => data.permissions.includes(p) };
}

function FullPageState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div style={{ width: 'min(100%, 28rem)' }}>{children}</div>
    </div>
  );
}

/**
 * Rutas privadas: sin sesión válida se redirige al inicio de sesión, conservando la ruta
 * de destino. La protección real de los datos la hace el servidor en cada petición.
 */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <FullPageState>
        <div className="cluster" style={{ justifyContent: 'center' }}>
          <Spinner label="Comprobando tu sesión…" />
        </div>
      </FullPageState>
    );
  }
  if (me.isError) {
    return (
      <FullPageState>
        <ErrorAlert error={me.error} title="No se ha podido comprobar tu sesión" onRetry={() => void me.refetch()} />
      </FullPageState>
    );
  }
  if (!me.data) {
    const next = location.pathname + location.search;
    const to = next && next !== '/' ? `${LOGIN_PATH}?siguiente=${encodeURIComponent(next)}` : LOGIN_PATH;
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}

/** Pantallas de acceso: si ya hay sesión, se va a la aplicación. */
export function GuestOnly() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <FullPageState>
        <div className="cluster" style={{ justifyContent: 'center' }}>
          <Spinner />
        </div>
      </FullPageState>
    );
  }
  if (me.data) {
    const next = new URLSearchParams(location.search).get('siguiente');
    return <Navigate to={safeRedirect(next)} replace />;
  }
  return <Outlet />;
}

/**
 * Tras iniciar sesión, registrarse o cambiar de empresa: se vacía toda la caché para que
 * nunca se muestren datos de otra cuenta o empresa, y se carga la sesión nueva.
 */
export function useStartSession() {
  const queryClient = useQueryClient();
  return async () => {
    queryClient.clear();
    const me = await queryClient.fetchQuery({ queryKey: keys.me, queryFn: fetchMe });
    return me;
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Aunque falle la red, en este navegador la sesión se da por cerrada.
      queryClient.clear();
      queryClient.setQueryData(keys.me, null);
      navigate(LOGIN_PATH, { replace: true });
    },
  });
}

export function useSwitchCompany() {
  const start = useStartSession();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (companyId: string) => api('/auth/switch-company', { method: 'POST', body: { companyId } }),
    onSuccess: async () => {
      await start();
      navigate('/', { replace: true });
    },
  });
}
