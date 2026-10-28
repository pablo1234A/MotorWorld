import { Link, Outlet } from 'react-router';
import { Brand } from '../components/Logo';

/** Composición geométrica de parcelas (ilustrativa: no representa datos). */
function ParcelPlate() {
  return (
    <svg viewBox="0 0 480 300" role="presentation" aria-hidden="true" style={{ width: '100%', maxWidth: '30rem' }}>
      <g stroke="#2a5a50" strokeWidth="1.5">
        <rect x="0" y="0" width="210" height="170" fill="#f7e6b0" />
        <rect x="210" y="0" width="150" height="95" fill="#e3efd9" />
        <rect x="360" y="0" width="120" height="95" fill="#e3efd9" />
        <rect x="210" y="95" width="120" height="75" fill="#f4cdbd" />
        <rect x="330" y="95" width="150" height="120" fill="#f7e6b0" />
        <rect x="0" y="170" width="130" height="130" fill="#e3efd9" />
        <rect x="130" y="170" width="200" height="130" fill="#f4cdbd" />
        <rect x="330" y="215" width="150" height="85" fill="#e3efd9" />
      </g>
      <g fill="#133a33" opacity="0.55">
        <rect x="16" y="16" width="44" height="6" />
        <rect x="226" y="16" width="36" height="6" />
        <rect x="376" y="16" width="30" height="6" />
        <rect x="226" y="111" width="30" height="6" />
        <rect x="346" y="111" width="40" height="6" />
        <rect x="16" y="186" width="34" height="6" />
        <rect x="146" y="186" width="46" height="6" />
        <rect x="346" y="231" width="30" height="6" />
      </g>
    </svg>
  );
}

export function AuthLayout() {
  return (
    <div className="auth">
      <aside className="auth__aside" aria-hidden="true">
        <Link to="/" className="brand" tabIndex={-1}>
          <Brand />
        </Link>
        <div className="auth__statement">
          <h2>Cada presupuesto enviado, a la vista hasta que el cliente conteste.</h2>
          <p>
            Presupio te muestra qué presupuestos siguen sin respuesta, cuánto llevan esperando según tus propias reglas y cuál es el
            siguiente contacto. Sin perder de vista a quien pidió no recibir más mensajes.
          </p>
        </div>
        <ParcelPlate />
      </aside>
      <main className="auth__main" id="contenido">
        <div className="auth__card">
          <Link to="/" className="brand auth__brand" aria-label="Presupio">
            <Brand />
          </Link>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
