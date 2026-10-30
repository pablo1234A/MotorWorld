import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClass, EmptyState } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Página no encontrada');
  return (
    <div className="page error-page">
      <EmptyState
        center
        heading="h1"
        icon={Compass}
        title="Esta página no existe"
        action={
          <Link to="/" className={buttonClass('primary')}>
            Ir al panel
          </Link>
        }
      >
        Puede que el enlace esté mal escrito o que la página se haya movido.
      </EmptyState>
    </div>
  );
}

/** Pantalla para errores inesperados de la interfaz (no expone detalles técnicos). */
export function RouteErrorPage() {
  const error = useRouteError();
  usePageTitle('Error');
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="page error-page" style={{ padding: '3rem 1rem' }}>
      <EmptyState
        center
        heading="h1"
        icon={TriangleAlert}
        title="Algo ha fallado al mostrar esta pantalla"
        action={
          <div className="cluster" style={{ justifyContent: 'center' }}>
            <button type="button" className={buttonClass('primary')} onClick={() => window.location.reload()}>
              Recargar la página
            </button>
            <a href="/" className={buttonClass('secondary')}>
              Ir al panel
            </a>
          </div>
        }
      >
        Tus datos están a salvo. Recarga la página y, si vuelve a ocurrir, avísanos indicando qué estabas haciendo.
      </EmptyState>
    </div>
  );
}
