import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import type { QuoteStatus } from '../api/types';
import { QUOTE_STATUS_LABEL } from '../lib/labels';

// ---------------------------------------------------------------------------
// Botón
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md', extra = '') {
  return ['btn', variant !== 'secondary' && `btn--${variant}`, size === 'sm' && 'btn--sm', extra].filter(Boolean).join(' ');
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  block = false,
  iconOnly = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, [block && 'btn--block', iconOnly && 'btn--icon', className].filter(Boolean).join(' '))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <span role="status" className="cluster muted">
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Campos de formulario
// ---------------------------------------------------------------------------

const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

/**
 * Pasa id y atributos ARIA al control real (input/select/textarea), aunque esté dentro de
 * un envoltorio (p. ej. el campo de importe con el símbolo €).
 */
function attachToControl(node: ReactNode, props: Record<string, unknown>): ReactNode {
  let done = false;
  const visit = (n: ReactNode): ReactNode => {
    if (done || !isValidElement<Record<string, unknown>>(n)) return n;
    if (typeof n.type === 'string' && FORM_CONTROLS.has(n.type)) {
      done = true;
      return cloneElement(n, props);
    }
    const kids = n.props.children as ReactNode;
    if (kids === undefined) return n;
    const mapped = Array.isArray(kids) ? Children.map(kids, visit) : visit(kids);
    return cloneElement(n, undefined, mapped);
  };
  return visit(node);
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}

/** Etiqueta, ayuda y error enlazados al control (aria-describedby, aria-invalid). */
export function Field({ label, error, hint, optional, children, className = '' }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = attachToControl(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });
  return (
    <div className={`field ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label} {optional && <span className="field__optional">(opcional)</span>}
      </label>
      {control}
      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId}>
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

type AlertTone = 'info' | 'error' | 'warning' | 'success';
const ALERT_ICON: Record<AlertTone, LucideIcon> = { info: Info, error: AlertCircle, warning: AlertTriangle, success: CheckCircle2 };

export function Alert({
  tone = 'info',
  title,
  children,
  meta,
  action,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div>{children}</div>}
        {meta && <p className="alert__meta">{meta}</p>}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

/** Mensaje de error de la API, legible y sin detalles internos. */
export function ErrorAlert({ error, title, onRetry }: { error: unknown; title?: string; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError?.message ?? 'Ha ocurrido un error inesperado.';
  const showRef = apiError && (apiError.status >= 500 || apiError.status === 0) && apiError.requestId;
  return (
    <Alert
      tone="error"
      title={title}
      meta={showRef ? `Código de referencia para soporte: ${apiError.requestId}` : undefined}
      action={
        onRetry ? (
          <button type="button" className="link-button" onClick={onRetry}>
            Reintentar
          </button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Estados vacíos y de carga
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  center = false,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`empty ${center ? 'empty--center' : ''}`}>
      <span className="empty__icon" aria-hidden="true">
        <Icon />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = '1rem', className = '' }: { width?: string; height?: string; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 5, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <ul className="rows">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="row">
            <div className="row__main stack" style={{ gap: '0.4rem' }}>
              <Skeleton width={`${55 - (i % 3) * 10}%`} />
              <Skeleton width="30%" height="0.75rem" />
            </div>
            <Skeleton width="5rem" height="1.5rem" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export function StatusPill({ status, archived = false }: { status: QuoteStatus; archived?: boolean }) {
  return (
    <span className="cluster" style={{ gap: '0.375rem' }}>
      <span className={`pill pill--${status}`}>{QUOTE_STATUS_LABEL[status]}</span>
      {archived && <span className="pill pill--neutral">Archivado</span>}
    </span>
  );
}

export function Ref({ children }: { children: ReactNode }) {
  return <span className="ref">{children}</span>;
}

// ---------------------------------------------------------------------------
// Cabecera de página y paneles
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { to: string; label: string; icon?: LucideIcon };
}) {
  const BIcon = breadcrumb?.icon;
  return (
    <header className="page-header">
      <div className="page-header__text">
        {breadcrumb && (
          <nav className="breadcrumb" aria-label="Ruta de navegación">
            <Link to={breadcrumb.to}>
              {BIcon && <BIcon aria-hidden="true" />}
              {breadcrumb.label}
            </Link>
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  footer,
  flush = false,
  as: Tag = 'section',
  labelledBy,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  as?: 'section' | 'div';
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <Tag className={`panel ${flush ? 'panel--flush' : ''}`} aria-labelledby={title ? (labelledBy ?? id) : undefined}>
      {(title || actions) && (
        <div className="panel__header">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="cluster">{actions}</div>}
        </div>
      )}
      <div className="panel__body">{children}</div>
      {footer && <div className="panel__footer">{footer}</div>}
    </Tag>
  );
}
