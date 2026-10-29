import { Link, useLocation } from 'react-router';
import { useSubscription } from '../api/queries';
import { formatDate } from '../lib/format';
import { Alert } from './ui';

/**
 * Aviso permanente cuando la cuenta no tiene un plan activo (decisión D1). Es solo
 * información: el bloqueo real de las escrituras lo hace el servidor.
 */
export function AccountStatusBanner() {
  const sub = useSubscription();
  const location = useLocation();
  const s = sub.data?.subscription;
  if (!s) return null;
  if (s.readOnly) {
    const reason =
      s.status === 'trialing'
        ? 'Tu prueba gratuita ha terminado'
        : s.status === 'past_due'
          ? 'Hay un pago pendiente desde hace varios días'
          : s.status === 'canceled'
            ? 'Tu suscripción ha terminado'
            : 'Tu cuenta no tiene un plan activo';
    return (
      <div className="account-status">
        <Alert
          tone="warning"
          title={`${reason}: la cuenta está en modo de solo lectura`}
          action={location.pathname === '/configuracion/plan' ? undefined : <Link to="/configuracion/plan">Ver planes</Link>}
        >
          Puedes consultar y exportar todos tus datos. No se envían seguimientos automáticos ni se pueden crear o editar presupuestos, contactos o
          seguimientos.
          {s.dataRetentionUntil && ` Conservaremos tus datos hasta el ${formatDate(s.dataRetentionUntil)}; te avisaremos antes por email.`}
        </Alert>
      </div>
    );
  }
  if (s.status === 'past_due') {
    return (
      <div className="account-status">
        <Alert tone="warning" title="No hemos podido cobrar tu suscripción" action={<Link to="/configuracion/plan">Revisar el pago</Link>}>
          Tu cuenta sigue funcionando unos días mientras se reintenta el cobro. Actualiza tu método de pago para no pasar a solo lectura.
        </Alert>
      </div>
    );
  }
  return null;
}
