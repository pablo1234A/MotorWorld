import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Info, X, AlertTriangle, CircleAlert, CircleCheck, BarChart3 } from 'lucide-react';
import { bus, type BusEvent } from '../lib/bus';
import { clamp, fmtNum } from '../lib/format';

/* ───────── Modal ───────── */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', on);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal glass ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-head">
            <div>
              <div className="h2">{title}</div>
              {subtitle && <div className="muted small mt-4">{subtitle}</div>}
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ───────── Confirm ───────── */
type ConfirmReq = { title: string; body?: string; confirm?: string; danger?: boolean; resolve: (v: boolean) => void };
let pushConfirm: ((r: ConfirmReq) => void) | null = null;
export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushConfirm) return resolve(window.confirm(opts.title));
    pushConfirm({ ...opts, resolve });
  });
}
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    pushConfirm = setReq;
    return () => {
      pushConfirm = null;
    };
  }, []);
  const close = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => close(false)}>
            Cancelar
          </button>
          <button className={`btn ${req?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
            {req?.confirm ?? 'Confirmar'}
          </button>
        </>
      }
    >
      {req?.body && <p className="muted">{req.body}</p>}
    </Modal>
  );
}

/* ───────── Toasts + XP ───────── */
type ToastItem = { id: number; message: string; tone: string; out?: boolean; action?: { label: string; run: () => void } };
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [xps, setXps] = useState<{ id: number; amount: number; x: number; y: number }[]>([]);
  useEffect(
    () =>
      bus.on((e: BusEvent) => {
        if (e.type === 'toast') {
          const id = Date.now() + Math.random();
          setItems((s) => [...s.slice(-3), { id, message: e.message, tone: e.tone ?? 'ok', action: e.action }]);
          setTimeout(() => setItems((s) => s.map((t) => (t.id === id ? { ...t, out: true } : t))), e.action ? 5200 : 3200);
          setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), e.action ? 5500 : 3500);
        }
        if (e.type === 'xp') {
          const id = Date.now() + Math.random();
          const mobile = window.innerWidth < 760;
          setXps((s) => [...s, { id, amount: e.amount, x: mobile ? window.innerWidth / 2 - 30 : window.innerWidth - 140, y: mobile ? 96 : 110 }]);
          setTimeout(() => setXps((s) => s.filter((x) => x.id !== id)), 1300);
        }
      }),
    [],
  );
  const Icon = (t: string) => (t === 'ok' ? <CircleCheck className="t-ok" /> : t === 'warn' ? <AlertTriangle className="t-warn" /> : t === 'error' ? <CircleAlert className="t-error" /> : <Info className="t-info" />);
  return createPortal(
    <>
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast glass ${t.out ? 'out' : ''}`}>
            {Icon(t.tone)}
            <span className="grow">{t.message}</span>
            {t.action && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  t.action!.run();
                  setItems((s) => s.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      {xps.map((x) => (
        <div key={x.id} className="xp-float" style={{ left: x.x, top: x.y }}>
          +{x.amount} XP
        </div>
      ))}
    </>,
    document.body,
  );
}

/* ───────── Confeti sutil ───────── */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(0);
  useEffect(() => bus.on((e) => e.type === 'celebrate' && setOn(Date.now())), []);
  useEffect(() => {
    if (!on || !ref.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion')) return;
    const c = ref.current;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c6f432';
    const colors = [accent, '#ffffff', accent, '#a3a7b0'];
    const parts = Array.from({ length: 90 }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: window.innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12,
      w: 4 + Math.random() * 5,
      h: 7 + Math.random() * 7,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - frame / 140);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.r * Math.PI) / 180);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (frame < 140) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return createPortal(<canvas ref={ref} className="confetti" />, document.body);
}

/* ───────── Número animado ───────── */
export function AnimatedNumber({ value, format = (n) => fmtNum(n), duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = clamp((t - start) / duration, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return <span className="num">{format(shown)}</span>;
}

/* ───────── Barras de progreso ───────── */
export function Bar({ value, max, className = '', color }: { value: number; max: number; className?: string; color?: string }) {
  const [w, setW] = useState(0);
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className={`bar ${className}`}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function BlockBar({ value, max, blocks = 10 }: { value: number; max: number; blocks?: number }) {
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  const on = Math.round(pct * blocks);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown === on) return;
    const t = setTimeout(() => setShown((s) => s + (on > s ? 1 : -1)), 45);
    return () => clearTimeout(t);
  }, [shown, on]);
  return (
    <span className="blockbar" aria-label={`${Math.round(pct * 100)}%`}>
      <span className="on">{'█'.repeat(shown)}</span>
      <span className="off">{'░'.repeat(blocks - shown)}</span>
    </span>
  );
}

export function Ring({ value, max = 100, size = 120, stroke = 9, children, color }: { value: number; max?: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setK(max > 0 ? clamp(value / max, 0, 1) : 0));
    return () => cancelAnimationFrame(id);
  }, [value, max]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - k)} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

/* ───────── Estados ───────── */
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="h3">{title}</div>
      {children && <p>{children}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function NeedsData({ text = 'Necesitamos más datos' }: { text?: string }) {
  return (
    <span className="needs-data" data-tip="Se calculará cuando haya suficientes registros reales">
      <BarChart3 />
      {text}
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CheckBox({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      className={`check ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={label ?? (on ? 'Marcar como pendiente' : 'Marcar como hecho')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {on && <Check />}
    </button>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function Field({ label, help, children, className = '' }: { label: string; help?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}
