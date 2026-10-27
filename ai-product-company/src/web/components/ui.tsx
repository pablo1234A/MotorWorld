import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, X } from 'lucide-react';

/* ───────────── status vocabulary ───────────── */
type Tone = 'ok' | 'review' | 'wait' | 'err' | 'appr' | 'info' | 'idle' | 'ivory';

const TONES: Record<string, [Tone, boolean?]> = {
  // agents
  WORKING: ['ok', true], REVIEWING: ['review', true], WAITING: ['wait'], ERROR: ['err'], APPROVAL_REQUIRED: ['appr'], IDLE: ['idle'],
  // tasks
  PENDING: ['idle'], ASSIGNED: ['info'], RUNNING: ['ok', true], WAITING_REVIEW: ['review'], REVISION_REQUIRED: ['wait'], APPROVED: ['ok'], COMPLETED: ['ok'], BLOCKED: ['appr'], FAILED: ['err'],
  // deliveries / videos
  PROCESSING: ['info', true], WAITING_QA: ['review'], REVISION: ['wait'], DELIVERED: ['ivory'], REJECTED: ['err'], AWAITING_OWNER: ['appr'],
  HOOKS: ['info', true], BLUEPRINT: ['info', true], PRODUCING: ['info', true], EDITING: ['info', true],
  // workflows / approvals
  WAITING_APPROVAL: ['appr'], CANCELLED: ['idle'], CHANGES_REQUESTED: ['wait'],
  // integrations / findings / risk
  CONNECTED: ['ok'], BUILTIN: ['info'], INTEGRATION_REQUIRED: ['wait'], UNAVAILABLE: ['err'],
  PROPOSED: ['info'], READY_TO_APPLY: ['ok'], AWAITING_APPROVAL: ['appr'], APPLIED: ['ivory'],
  LOW: ['ok'], MEDIUM: ['wait'], HIGH: ['err'], CRITICAL: ['err'],
};

export const STATUS_COLOR: Record<Tone, string> = {
  ok: 'var(--ok)', review: 'var(--review)', wait: 'var(--wait)', err: 'var(--err)', appr: 'var(--appr)', info: 'var(--info)', idle: 'var(--idle)', ivory: 'var(--ivory)',
};

export function toneOf(status: string): Tone {
  return TONES[status]?.[0] ?? 'idle';
}

export function Status({ value, label, pulse }: { value: string; label?: string; pulse?: boolean }) {
  const [tone, live] = TONES[value] ?? ['idle'];
  return (
    <span className={`pill tone-${tone} ${pulse ?? live ? 'pulse' : ''}`}>
      <span className="dot" />
      {label ?? value.replace(/_/g, ' ')}
    </span>
  );
}

/* ───────────── agents ───────────── */
const MONO: Record<string, string> = { ATLAS: 'AT', ALEX: 'AX', NOVA: 'NV', NEO: 'NE', REX: 'RX', MAX: 'MX', LUNA: 'LN', EVA: 'EV', NOAH: 'NH', IRIS: 'IR' };
export const AGENT_COLOR: Record<string, string> = {
  ATLAS: '#E9C46A', ALEX: '#6C8CFF', NOVA: '#FF5C93', NEO: '#A78BFA', REX: '#FF6B6B', MAX: '#38D0E8', LUNA: '#E2E8F0', EVA: '#84CC16', NOAH: '#10B981', IRIS: '#FB923C',
};

export function AgentMark({ id, size = 32, status }: { id: string; size?: number; status?: string }) {
  const known = id in AGENT_COLOR;
  return (
    <span className="agent-mark" style={{ ['--c' as string]: AGENT_COLOR[id] ?? 'var(--ivory)', ['--s' as string]: `${size}px` }} title={id} aria-label={id}>
      {known ? MONO[id] : id === 'OWNER' ? 'YO' : id.slice(0, 2)}
      {status && <span className="st" style={{ ['--st' as string]: STATUS_COLOR[toneOf(status)] }} />}
    </span>
  );
}

export function AgentName({ id }: { id: string }) {
  return (
    <span className="row gap-6 nowrap">
      <AgentMark id={id} size={20} />
      <b style={{ fontWeight: 600, fontSize: 12.5, letterSpacing: '0.03em' }}>{id === 'OWNER' ? 'Tú' : id}</b>
    </span>
  );
}

/* ───────────── layout pieces ───────────── */
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </header>
  );
}

export function Panel({ title, actions, children, flush, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          <h2>{title}</h2>
          <span className="spacer" />
          {actions}
        </header>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <h3>{title}</h3>
      {children && <div style={{ maxWidth: '46ch', fontSize: 13 }}>{children}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack gap-12" style={{ padding: 16 }} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={14} w={`${92 - i * 11}%`} />
      ))}
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="banner err" role="alert">
      <X />
      <div>{error}</div>
    </div>
  );
}

/** Side sheet: details without leaving the page (escape closes, focus moves inside). */
export function Sheet({ open, onClose, title, children, wide, actions }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; actions?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <aside className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header className="sheet-head">
          <div className="grow">{typeof title === 'string' ? <h2 className="ellipsis">{title}</h2> : title}</div>
          {actions}
          <button className="btn ghost icon" onClick={onClose} aria-label="Cerrar" autoFocus>
            <X />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ───────────── toasts ───────────── */
type ToastItem = { id: number; text: string; err?: boolean };
let pushToast: (t: Omit<ToastItem, 'id'>) => void = () => {};
export const toast = (text: string) => pushToast({ text });
export const toastError = (text: string) => pushToast({ text, err: true });

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs, { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.err ? 7000 : 4000);
    };
  }, []);
  return (
    <div className="toast-zone" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Wrap an async action with busy state + error toast. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toastError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
