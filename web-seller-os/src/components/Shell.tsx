import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Calculator,
  CalendarDays,
  CheckSquare,
  Crosshair,
  GraduationCap,
  Home,
  LayoutGrid,
  Library,
  MessageSquareText,
  Plus,
  Repeat,
  ScanSearch,
  Search,
  Settings as SettingsIcon,
  ShieldQuestion,
  Sparkles,
  Target,
  Users,
  Zap,
  Focus,
  Keyboard,
  ArrowRight,
  X,
  Pause,
  Play,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from './AppUI';
import { navigate, useRoute } from '../lib/router';
import { followUpBuckets, itemsOn, nextActions, notifications } from '../lib/insights';
import { today } from '../lib/dates';
import { levelFor, totalXp } from '../lib/progress';
import { initials, matches } from '../lib/format';
import { bus } from '../lib/bus';
import { sound } from '../lib/sound';
import { Modal } from './ui';
import { STAGE_LABEL } from '../data/types';
import { RESOURCE_LABEL } from '../data/types';
import { OBJECTIONS } from '../content/objections';

interface NavDef {
  href: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
  count?: number;
  hot?: boolean;
}

export function useNav() {
  const { state } = useStore();
  const fu = followUpBuckets(state);
  const pendingToday = itemsOn(state, today()).filter((i) => i.status === 'pendiente').length;
  const groups: { label: string; items: NavDef[] }[] = [
    {
      label: 'Hoy',
      items: [
        { href: '#/', label: 'Inicio', icon: <Home />, match: (p) => p === '/' },
        { href: '#/followups', label: 'Seguimientos', icon: <Repeat />, match: (p) => p.startsWith('/followups'), count: fu.overdue.length + fu.today.length, hot: fu.overdue.length > 0 },
        { href: '#/calendar', label: 'Calendario', icon: <CalendarDays />, match: (p) => p.startsWith('/calendar') },
        { href: '#/tasks', label: 'Tareas', icon: <CheckSquare />, match: (p) => p.startsWith('/tasks'), count: pendingToday },
      ],
    },
    {
      label: 'Clientes',
      items: [
        { href: '#/prospects', label: 'Prospectos', icon: <Users />, match: (p) => p.startsWith('/prospects'), count: state.prospects.filter((p) => p.stage !== 'ganado' && p.stage !== 'perdido').length },
        { href: '#/prospecting', label: 'Prospección', icon: <Crosshair />, match: (p) => p.startsWith('/prospecting') },
      ],
    },
    {
      label: 'Vender',
      items: [
        { href: '#/messages', label: 'Mensajes', icon: <MessageSquareText />, match: (p) => p.startsWith('/messages') },
        { href: '#/audit', label: 'Auditoría web', icon: <ScanSearch />, match: (p) => p.startsWith('/audit') },
        { href: '#/pricing', label: 'Calculadora', icon: <Calculator />, match: (p) => p.startsWith('/pricing') },
        { href: '#/objections', label: 'Objeciones', icon: <ShieldQuestion />, match: (p) => p.startsWith('/objections') },
      ],
    },
    {
      label: 'Crecer',
      items: [
        { href: '#/coach', label: 'Sales Coach', icon: <GraduationCap />, match: (p) => p.startsWith('/coach'), count: state.coach.trainingsDone[today()] ? 0 : undefined },
        { href: '#/assistant', label: 'My Sales AI', icon: <Bot />, match: (p) => p.startsWith('/assistant') },
        { href: '#/goals', label: 'Objetivos', icon: <Target />, match: (p) => p.startsWith('/goals') },
        { href: '#/analytics', label: 'Analytics', icon: <BarChart3 />, match: (p) => p.startsWith('/analytics') },
        { href: '#/resources', label: 'Recursos', icon: <Library />, match: (p) => p.startsWith('/resources') },
      ],
    },
  ];
  return groups;
}

export function Shell({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const ui = useUI();
  const route = useRoute();
  const groups = useNav();
  const lvl = levelFor(totalXp(state));
  const [scrolled, setScrolled] = useState(false);
  const [levelUp, setLevelUp] = useState<{ level: number; name: string } | null>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.path]);

  // Sonidos y subidas de nivel
  useEffect(
    () =>
      bus.on((e) => {
        if (e.type === 'levelup') setLevelUp({ level: e.level, name: e.name });
        if (!state.settings.sound) return;
        if (e.type === 'celebrate') sound.win();
        else if (e.type === 'xp') sound.success();
      }),
    [state.settings.sound],
  );

  // Atajos de teclado
  useEffect(() => {
    let g = false;
    let gTimer: number | undefined;
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.palette);
        return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.backdrop, .focus')) return;
      const k = e.key.toLowerCase();
      if (g) {
        g = false;
        const map: Record<string, string> = { h: '#/', i: '#/', p: '#/prospects', c: '#/calendar', t: '#/tasks', s: '#/followups', a: '#/analytics', m: '#/messages', o: '#/goals', r: '#/resources', e: '#/coach', x: '#/prospecting' };
        if (map[k]) {
          e.preventDefault();
          navigate(map[k]);
        }
        return;
      }
      if (k === 'g') {
        g = true;
        window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => (g = false), 1000);
        return;
      }
      const actions: Record<string, () => void> = {
        '/': () => ui.setPalette(true),
        '.': () => ui.setWhatNow(true),
        n: () => ui.newProspect(),
        t: () => ui.newItem({ kind: 'tarea' }),
        e: () => ui.newItem({ kind: 'reunion', time: '10:00' }),
        f: () => ui.setFocus(true),
        '?': () => ui.setShortcuts(true),
      };
      const fn = actions[e.key] ?? actions[k];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ui]);

  const title = useMemo(() => {
    for (const gr of groups) for (const it of gr.items) if (it.match(route.path)) return it.label;
    if (route.path.startsWith('/settings')) return 'Ajustes';
    if (route.path.startsWith('/more')) return 'Más';
    return 'WEB SELLER OS';
  }, [groups, route.path]);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Navegación principal">
        <a href="#/" className="brand">
          <div className="brand-mark">WS</div>
          <div className="brand-name">
            WEB SELLER OS
            <small>Sales command center</small>
          </div>
        </a>
        <button className="whatnow" onClick={() => ui.setWhatNow(true)} data-tip="¿Qué hago ahora? ( . )">
          <Zap />
          <span>¿Qué hago ahora?</span>
          <kbd>.</kbd>
        </button>
        {groups.map((gr) => (
          <nav key={gr.label} className="nav-group">
            <div className="nav-label">{gr.label}</div>
            {gr.items.map((it) => (
              <a key={it.href} href={it.href} className={`nav-item ${it.match(route.path) ? 'active' : ''}`} title={it.label}>
                {it.icon}
                <span>{it.label}</span>
                {!!it.count && <span className={`count ${it.hot ? 'hot' : ''}`}>{it.count}</span>}
              </a>
            ))}
          </nav>
        ))}
        <div className="sidebar-foot">
          <a href="#/settings" className="me-card" title="Ajustes">
            <div className="avatar">{initials(state.profile.name)}</div>
            <div className="me-info grow" style={{ minWidth: 0 }}>
              <div className="small strong trunc">{state.profile.name || 'Tu perfil'}</div>
              <div className="tiny dim">
                Nv {lvl.level} · {lvl.name}
              </div>
              <div className="bar thin mt-4">
                <i style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>
            <SettingsIcon className="hide-mobile me-info" style={{ width: 16, height: 16, color: 'var(--text-3)' }} />
          </a>
        </div>
      </aside>

      <div className="main">
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="topbar-title">{title}</div>
          <button className="searchbox" onClick={() => ui.setPalette(true)} aria-label="Buscar o ejecutar comando">
            <Search size={16} />
            <span>Buscar clientes, acciones…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="spacer" />
          <button className="icon-btn hide-mobile" onClick={() => ui.setFocus(true)} data-tip="Modo concentración (F)">
            <Focus />
          </button>
          <Notifications />
          <button className="btn btn-sm btn-primary hide-mobile" onClick={() => ui.newProspect()} data-tip="Nuevo prospecto (N)">
            <Plus /> Prospecto
          </button>
          <a href="#/settings" className="icon-btn hide-desktop" aria-label="Ajustes">
            <SettingsIcon />
          </a>
        </header>
        {children}
      </div>

      <BottomNav />
      <button className="fab" hidden={route.path.startsWith('/coach/roleplay') || route.path.startsWith('/assistant')} onClick={() => ui.setWhatNow(true)}>
        <Zap /> ¿Qué hago ahora?
      </button>

      <CommandPalette />
      <WhatNow />
      <ShortcutsHelp />
      {ui.focus && <FocusMode onClose={() => ui.setFocus(false)} />}
      {levelUp && (
        <div className="levelup" onClick={() => setLevelUp(null)}>
          <div className="card glass">
            <div style={{ fontSize: 48 }}>🏆</div>
            <div className="eyebrow mt-16">Has subido de nivel</div>
            <div className="display mt-8">Nivel {levelUp.level}</div>
            <div className="h2 accent mt-8">{levelUp.name}</div>
            <button className="btn btn-primary mt-24" onClick={() => setLevelUp(null)}>
              Seguir vendiendo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNav() {
  const route = useRoute();
  const { state } = useStore();
  const fu = followUpBuckets(state);
  const pending = itemsOn(state, today()).filter((i) => i.status === 'pendiente').length;
  const items = [
    { href: '#/', label: 'Inicio', icon: <Home />, on: route.path === '/' },
    { href: '#/prospects', label: 'Prospectos', icon: <Users />, on: route.path.startsWith('/prospects') },
    { href: '#/calendar', label: 'Calendario', icon: <CalendarDays />, on: route.path.startsWith('/calendar') },
    { href: '#/tasks', label: 'Tareas', icon: <CheckSquare />, on: route.path.startsWith('/tasks'), badge: pending },
    { href: '#/more', label: 'Más', icon: <LayoutGrid />, on: !['/', ''].includes(route.path) && !['/prospects', '/calendar', '/tasks'].some((p) => route.path.startsWith(p)), badge: fu.overdue.length },
  ];
  return (
    <nav className="bottom-nav" aria-label="Navegación">
      {items.map((it) => (
        <a key={it.href} href={it.href} className={it.on ? 'active' : ''}>
          {it.icon}
          {it.label}
          {!!it.badge && <span className="badge-dot">{it.badge}</span>}
        </a>
      ))}
    </nav>
  );
}

function Notifications() {
  const { state, actions } = useStore();
  const [open, setOpen] = useState(false);
  const list = notifications(state);
  const unread = list.filter((n) => !state.readNotifications.includes(n.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        aria-label={`Notificaciones (${unread.length})`}
        onClick={() => {
          setOpen(!open);
          if (!open && unread.length) actions.markRead(unread.map((n) => n.id));
        }}
      >
        <Bell />
        {unread.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover glass">
          <div className="row between" style={{ padding: '8px 10px 10px' }}>
            <div className="h3">Notificaciones</div>
            <span className="tiny dim">{list.length ? `${list.length} activas` : ''}</span>
          </div>
          {list.length === 0 ? (
            <div className="empty" style={{ padding: '24px 12px' }}>
              <div style={{ fontSize: 24 }}>✨</div>
              <p>Todo al día. Nada urgente ahora mismo.</p>
            </div>
          ) : (
            list.map((n) => (
              <a key={n.id} href={n.href} className="menu-item" onClick={() => setOpen(false)} style={{ alignItems: 'flex-start' }}>
                <span style={{ fontSize: 15 }}>{n.emoji}</span>
                <span className="grow">
                  <span className="strong small" style={{ display: 'block' }}>
                    {n.title}
                  </span>
                  <span className="tiny dim">{n.detail}</span>
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ───────── Command palette ───────── */
interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

function CommandPalette() {
  const { state } = useStore();
  const ui = useUI();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const groups = useNav();
  useEffect(() => {
    if (ui.palette) {
      setQ('');
      setSel(0);
    }
  }, [ui.palette]);

  const cmds = useMemo<Cmd[]>(() => {
    const close = () => ui.setPalette(false);
    const go = (h: string) => () => {
      close();
      navigate(h);
    };
    const base: Cmd[] = [
      { id: 'wn', group: 'Acciones', label: '¿Qué hago ahora?', hint: '.', icon: <Zap />, run: () => (close(), ui.setWhatNow(true)) },
      { id: 'np', group: 'Acciones', label: 'Añadir prospecto', hint: 'N', icon: <Plus />, run: () => (close(), ui.newProspect()) },
      { id: 'nt', group: 'Acciones', label: 'Crear tarea', hint: 'T', icon: <CheckSquare />, run: () => (close(), ui.newItem({ kind: 'tarea' })) },
      { id: 'ne', group: 'Acciones', label: 'Crear evento / reunión', hint: 'E', icon: <CalendarDays />, run: () => (close(), ui.newItem({ kind: 'reunion', time: '10:00' })) },
      { id: 'nl', group: 'Acciones', label: 'Programar llamada', icon: <CalendarDays />, run: () => (close(), ui.newItem({ kind: 'llamada', time: '10:00' })) },
      { id: 'fm', group: 'Acciones', label: 'Modo concentración', hint: 'F', icon: <Focus />, run: () => (close(), ui.setFocus(true)) },
      { id: 'au', group: 'Acciones', label: 'Auditar una web', icon: <ScanSearch />, run: go('#/audit') },
      { id: 'ms', group: 'Acciones', label: 'Generar mensaje', icon: <MessageSquareText />, run: go('#/messages') },
      { id: 'rp', group: 'Acciones', label: 'Practicar roleplay', icon: <Sparkles />, run: go('#/coach/roleplay') },
      { id: 'kb', group: 'Acciones', label: 'Atajos de teclado', hint: '?', icon: <Keyboard />, run: () => (close(), ui.setShortcuts(true)) },
    ];
    const nav: Cmd[] = groups.flatMap((g) => g.items.map((it) => ({ id: 'nav' + it.href, group: 'Ir a', label: it.label, icon: it.icon, run: go(it.href) })));
    nav.push({ id: 'nav-settings', group: 'Ir a', label: 'Ajustes', icon: <SettingsIcon />, run: go('#/settings') });
    const prospects: Cmd[] = state.prospects.map((p) => ({
      id: 'p' + p.id,
      group: 'Clientes',
      label: p.business,
      hint: `${STAGE_LABEL[p.stage]}${p.city ? ' · ' + p.city : ''}`,
      icon: <div className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(p.business)}</div>,
      run: go(`#/prospects/${p.id}`),
    }));
    const res: Cmd[] = state.resources.map((r) => ({ id: 'r' + r.id, group: 'Recursos', label: r.title, hint: RESOURCE_LABEL[r.kind], icon: <BookOpen />, run: go(`#/resources?open=${r.id}`) }));
    const obj: Cmd[] = OBJECTIONS.map((o) => ({ id: 'o' + o.id, group: 'Objeciones', label: o.phrase.replace(/"/g, ''), hint: o.category, icon: <ShieldQuestion />, run: go(`#/objections/${o.id}`) }));
    return [...base, ...nav, ...prospects, ...res, ...obj];
  }, [state.prospects, state.resources, groups, ui]);

  const filtered = useMemo(() => {
    if (!q.trim()) return cmds.filter((c) => c.group === 'Acciones' || c.group === 'Ir a' || (c.group === 'Clientes' && cmds.indexOf(c) < 60)).slice(0, 40);
    return cmds.filter((c) => matches(`${c.label} ${c.hint ?? ''} ${c.group}`, q)).slice(0, 50);
  }, [cmds, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!ui.palette) return null;
  let lastGroup = '';
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && ui.setPalette(false)}>
      <div className="cmdk glass" role="dialog" aria-label="Comandos">
        <div className="cmdk-input">
          <Search />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca un cliente, una acción o una página…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(filtered.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                filtered[sel]?.run();
              } else if (e.key === 'Escape') ui.setPalette(false);
            }}
          />
          <button className="icon-btn" onClick={() => ui.setPalette(false)} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="empty" style={{ padding: 28 }}>
              <p>Sin resultados para "{q}".</p>
              <button
                className="btn btn-sm"
                onClick={() => {
                  ui.setPalette(false);
                  ui.newProspect({ business: q });
                }}
              >
                <Plus /> Crear prospecto "{q}"
              </button>
            </div>
          )}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head && <div className="cmdk-group">{head}</div>}
                <div className={`cmdk-item ${i === sel ? 'on' : ''}`} onMouseMove={() => setSel(i)} onClick={() => c.run()}>
                  {c.icon}
                  <span className="trunc">{c.label}</span>
                  {c.hint && <span className="hint">{c.hint.length <= 2 ? <kbd>{c.hint}</kbd> : c.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot hide-mobile">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>↵</kbd> abrir
          </span>
          <span>
            <kbd>esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────── ¿Qué hago ahora? ───────── */
function WhatNow() {
  const { state } = useStore();
  const ui = useUI();
  const [thinking, setThinking] = useState(true);
  const [skip, setSkip] = useState(0);
  useEffect(() => {
    if (!ui.whatNow) return;
    setSkip(0);
    setThinking(true);
    const t = setTimeout(() => setThinking(false), 650);
    return () => clearTimeout(t);
  }, [ui.whatNow]);
  if (!ui.whatNow) return null;
  const list = nextActions(state);
  const a = list[skip % Math.max(1, list.length)];
  const checks = ['calendario', 'tareas', 'CRM', 'seguimientos', 'objetivos', 'estadísticas'];
  return (
    <Modal open onClose={() => ui.setWhatNow(false)}>
      <div className="row between">
        <div className="eyebrow">¿Qué hago ahora?</div>
        <button className="icon-btn" onClick={() => ui.setWhatNow(false)} aria-label="Cerrar">
          <X />
        </button>
      </div>
      {thinking ? (
        <div className="col gap-12 mt-24" style={{ minHeight: 210 }}>
          <div className="muted small">Analizando…</div>
          <div className="chips">
            {checks.map((c, i) => (
              <span key={c} className="badge" style={{ animation: `rise 400ms ${i * 80}ms var(--ease-out) both` }}>
                <Check size={12} /> {c}
              </span>
            ))}
          </div>
          <div className="skeleton mt-12" style={{ height: 26, width: '80%' }} />
          <div className="skeleton" style={{ height: 14, width: '95%' }} />
          <div className="skeleton" style={{ height: 14, width: '60%' }} />
        </div>
      ) : !a ? (
        <div className="empty">
          <div style={{ fontSize: 34 }}>✨</div>
          <div className="h2">Lo tienes todo al día</div>
          <p>No hay nada urgente. Buen momento para entrenar o buscar nuevos negocios.</p>
        </div>
      ) : (
        <div className="mt-24" style={{ animation: 'rise 420ms var(--ease-out) both' }} key={a.id}>
          <div style={{ fontSize: 36 }}>{a.emoji}</div>
          <div className="h1 mt-12">{a.title}</div>
          <p className="lead mt-12">{a.detail}</p>
          <div className="row mt-32 gap-12 row-wrap">
            <button
              className="btn btn-primary btn-xl"
              onClick={() => {
                ui.setWhatNow(false);
                navigate(a.href);
              }}
            >
              {a.cta === 'Hacerlo' ? 'HACERLO' : a.cta} <ArrowRight />
            </button>
            {list.length > 1 && (
              <button className="btn btn-ghost" onClick={() => setSkip((s) => s + 1)}>
                Otra opción
              </button>
            )}
          </div>
          {list.length > 1 && <div className="tiny dim mt-16">Prioridad {(skip % list.length) + 1} de {list.length} · ordenado por impacto en ventas</div>}
        </div>
      )}
    </Modal>
  );
}

function ShortcutsHelp() {
  const ui = useUI();
  const rows: [string, string][] = [
    ['⌘/Ctrl + K', 'Buscar y comandos'],
    ['.', '¿Qué hago ahora?'],
    ['N', 'Nuevo prospecto'],
    ['T', 'Nueva tarea'],
    ['E', 'Nuevo evento'],
    ['F', 'Modo concentración'],
    ['G → H', 'Ir a Inicio'],
    ['G → P', 'Ir a Prospectos'],
    ['G → S', 'Ir a Seguimientos'],
    ['G → C', 'Ir a Calendario'],
    ['G → T', 'Ir a Tareas'],
    ['G → M', 'Ir a Mensajes'],
    ['G → A', 'Ir a Analytics'],
    ['?', 'Esta ayuda'],
  ];
  return (
    <Modal open={ui.shortcuts} onClose={() => ui.setShortcuts(false)} title="Atajos de teclado">
      <div className="list">
        {rows.map(([k, l]) => (
          <div key={k} className="list-row between">
            <span className="muted">{l}</span>
            <span className="row gap-4">
              {k.split(' ').map((p, i) => (p === '→' || p === '+' ? <span key={i} className="dim tiny">{p}</span> : <kbd key={i}>{p}</kbd>))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ───────── Modo concentración ───────── */
function FocusMode({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const ui = useUI();
  const [secs, setSecs] = useState(25 * 60);
  const [running, setRunning] = useState(true);
  const startCount = useRef(state.activities.length);
  const done = state.activities.length - startCount.current;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (secs === 0) {
      setRunning(false);
      if (state.settings.sound) sound.win();
    }
  }, [secs, state.settings.sound]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.backdrop') && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  const queue = nextActions(state).slice(0, 4);
  const fu = followUpBuckets(state);
  const work = [...fu.overdue, ...fu.today].slice(0, 6);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <div className="focus">
      <div className="row between" style={{ padding: '18px 24px' }}>
        <div className="row gap-12">
          <span className="eyebrow">Modo concentración</span>
          {done > 0 && <span className="badge accent">{done} acciones completadas</span>}
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Salir <kbd>esc</kbd>
        </button>
      </div>
      <div className="focus-inner">
        <div className="row between row-wrap gap-16">
          <div className="timer" style={{ color: secs === 0 ? 'var(--accent)' : undefined }}>
            {mm}:{ss}
          </div>
          <div className="row gap-6">
            <button className="btn btn-icon" onClick={() => setRunning(!running)} aria-label={running ? 'Pausar' : 'Reanudar'}>
              {running ? <Pause /> : <Play />}
            </button>
            <button
              className="btn btn-icon"
              onClick={() => {
                setSecs(25 * 60);
                setRunning(true);
              }}
              aria-label="Reiniciar"
            >
              <RotateCcw />
            </button>
          </div>
        </div>
        <p className="muted mt-12">{secs === 0 ? 'Bloque terminado. Descansa 5 minutos.' : 'Un bloque de 25 minutos. Sin pestañas, sin redes. Solo acciones que venden.'}</p>

        {queue[0] && (
          <div className="card glow mt-32">
            <div className="eyebrow">Ahora</div>
            <div className="h2 mt-8">
              {queue[0].emoji} {queue[0].title}
            </div>
            <p className="muted mt-8">{queue[0].detail}</p>
            <a
              className="btn btn-primary mt-16"
              href={queue[0].href}
              onClick={(e) => {
                e.preventDefault();
                onClose();
                navigate(queue[0].href);
              }}
            >
              {queue[0].cta} <ArrowRight />
            </a>
          </div>
        )}

        {work.length > 0 && (
          <div className="card mt-16">
            <div className="h3 mb-12">Cola de seguimientos</div>
            <div className="list">
              {work.map((p) => (
                <div key={p.id} className="list-row">
                  <div className="grow">
                    <div className="strong trunc">{p.business}</div>
                    <div className="tiny dim">
                      {STAGE_LABEL[p.stage]} · {p.nextFollowUp! < today() ? 'atrasado' : 'hoy'}
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => ui.logTouch(p)}>
                    <Check /> Hecho
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {queue.length > 1 && (
          <div className="mt-24">
            <div className="eyebrow mb-12">Después</div>
            {queue.slice(1).map((a) => (
              <div key={a.id} className="row gap-12 small muted" style={{ padding: '6px 0' }}>
                <span>{a.emoji}</span>
                <span className="trunc">{a.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
