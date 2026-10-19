import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Seg } from '../components/ui';
import { KIND_COLOR } from '../components/forms';
import { ITEM_KINDS, KIND_LABEL, type AgendaItem, type Prospect } from '../data/types';
import { WEEKDAYS_MED, addDays, fmtLongDay, minutesOf, monthName, nowTime, parseDay, pad, startOfMonth, startOfWeek, today } from '../lib/dates';
import { navigate } from '../lib/router';
import { upperFirst } from '../lib/format';

type View = 'day' | 'week' | 'month';
const START_H = 7;
const END_H = 22;
const HOUR_PX = 52;

interface CalEntry {
  key: string;
  item?: AgendaItem;
  followUp?: Prospect;
  title: string;
  kind: string;
  date: string;
  time: string | null;
  duration: number;
  done: boolean;
}

export default function Calendar() {
  const { state } = useStore();
  const ui = useUI();
  const [view, setView] = useState<View>(() => (window.innerWidth < 760 ? 'day' : 'week'));
  const [cursor, setCursor] = useState(today());
  const [hidden, setHidden] = useState<string[]>([]);
  const t = today();

  // entradas: elementos de agenda + seguimientos del CRM (virtuales)
  const entries = useMemo<CalEntry[]>(() => {
    const list: CalEntry[] = state.items
      .filter((i) => i.date && i.status !== 'cancelado')
      .map((i) => ({ key: i.id, item: i, title: i.title, kind: i.kind, date: i.date!, time: i.time, duration: i.duration, done: i.status === 'hecho' }));
    for (const p of state.prospects) {
      if (!p.nextFollowUp || p.stage === 'ganado' || p.stage === 'perdido') continue;
      // si hay un elemento de seguimiento real ese día para el mismo cliente, no duplicar
      if (state.items.some((i) => i.prospectId === p.id && i.date === p.nextFollowUp && i.kind === 'seguimiento')) continue;
      list.push({ key: 'fu-' + p.id, followUp: p, title: `Seguimiento · ${p.business}`, kind: 'seguimiento', date: p.nextFollowUp < t ? t : p.nextFollowUp, time: null, duration: 15, done: false });
    }
    return list.filter((e) => !hidden.includes(e.kind));
  }, [state.items, state.prospects, hidden, t]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.time ?? '00') < (b.time ?? '00') ? -1 : 1);
    return m;
  }, [entries]);

  const open = (e: CalEntry) => {
    if (e.item) ui.editItem(e.item);
    else if (e.followUp) navigate(`#/prospects/${e.followUp.id}`);
  };

  const shift = (dir: number) => {
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else {
      const d = parseDay(cursor);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setCursor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
    }
  };

  const label = view === 'day' ? fmtLongDay(cursor) : view === 'week' ? `Semana del ${fmtLongDay(startOfWeek(cursor)).replace(/^\S+ /, '')}` : upperFirst(monthName(cursor));

  return (
    <div className="page" style={{ maxWidth: 1440 }}>
      <div className="page-head">
        <div>
          <h1 className="h1">
            {label}
          </h1>
          <p className="muted">Llamadas, reuniones, seguimientos y tareas en un solo sitio.</p>
        </div>
        <div className="row gap-6 row-wrap">
          <Seg
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Día' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mes' },
            ]}
          />
          <div className="row gap-4">
            <button className="btn btn-icon" onClick={() => shift(-1)} aria-label="Anterior">
              <ChevronLeft />
            </button>
            <button className="btn" onClick={() => setCursor(today())}>
              Hoy
            </button>
            <button className="btn btn-icon" onClick={() => shift(1)} aria-label="Siguiente">
              <ChevronRight />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => ui.newItem({ kind: 'reunion', date: cursor, time: '10:00' })}>
            <Plus /> Evento
          </button>
        </div>
      </div>

      <div className="chips mb-16">
        {ITEM_KINDS.map((k) => {
          const on = !hidden.includes(k);
          return (
            <button key={k} className={`chip ${on ? '' : ''}`} style={{ opacity: on ? 1 : 0.4 }} onClick={() => setHidden(on ? [...hidden, k] : hidden.filter((x) => x !== k))} aria-pressed={on}>
              <span className="kind-dot" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>

      {view === 'month' && <MonthView cursor={cursor} byDay={byDay} onDay={(d) => (setCursor(d), setView('day'))} onOpen={open} onNew={(d) => ui.newItem({ kind: 'tarea', date: d })} />}
      {view === 'week' && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))} byDay={byDay} onOpen={open} onDayClick={(d) => (setCursor(d), setView('day'))} />}
      {view === 'day' && (
        <>
          <TimeGrid days={[cursor]} byDay={byDay} onOpen={open} />
          {(byDay.get(cursor) ?? []).length === 0 && <p className="muted small mt-16">Nada programado. Haz clic en una hora para crear un evento.</p>}
        </>
      )}
    </div>
  );
}

function MonthView({ cursor, byDay, onDay, onOpen, onNew }: { cursor: string; byDay: Map<string, CalEntry[]>; onDay: (d: string) => void; onOpen: (e: CalEntry) => void; onNew: (d: string) => void }) {
  const first = startOfMonth(cursor);
  const start = startOfWeek(first);
  const t = today();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = first.slice(0, 7);
  const weeks = cells[35].slice(0, 7) === month ? 6 : 5;
  return (
    <div className="cal-month">
      {WEEKDAYS_MED.map((d) => (
        <div key={d} className="cal-dow">
          {d}
        </div>
      ))}
      {cells.slice(0, weeks * 7).map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div key={d} className={`cal-cell ${d.slice(0, 7) !== month ? 'out' : ''} ${d === t ? 'today' : ''}`} onClick={() => onDay(d)} onDoubleClick={() => onNew(d)}>
            <span className="cal-num">{parseDay(d).getDate()}</span>
            <div className="col cal-evs" style={{ gap: 3 }}>
              {list.slice(0, 3).map((e) => (
                <button
                  key={e.key}
                  className={`cal-ev ${e.followUp ? 'virtual' : ''} ${e.done ? 'done' : ''}`}
                  style={{ ['--ev' as string]: KIND_COLOR[e.kind] }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onOpen(e);
                  }}
                  title={e.title}
                >
                  <span className="kind-dot" style={{ background: KIND_COLOR[e.kind] }} />
                  <span className="trunc">
                    {e.time ? `${e.time} ` : ''}
                    {e.title}
                  </span>
                </button>
              ))}
              {list.length > 3 && <span className="cal-more">+{list.length - 3} más</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({ days, byDay, onOpen, onDayClick }: { days: string[]; byDay: Map<string, CalEntry[]>; onOpen: (e: CalEntry) => void; onDayClick?: (d: string) => void }) {
  const ui = useUI();
  const t = today();
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(nowTime());
  useEffect(() => {
    const i = setInterval(() => setNow(nowTime()), 60000);
    return () => clearInterval(i);
  }, []);
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const nowMin = minutesOf(now) - START_H * 60;
  const single = days.length === 1;

  return (
    <div className="card flush cal-scroll" style={{ overflow: 'hidden' }} ref={ref}>
      <div className={`cal-week ${single ? 'day' : ''}`}>
        <div className="cw-head" style={{ borderLeft: 'none' }} />
        {days.map((d) => (
          <div key={d} className={`cw-head ${d === t ? 'today' : ''}`} onClick={() => onDayClick?.(d)}>
            <div className="tiny dim">{WEEKDAYS_MED[(parseDay(d).getDay() + 6) % 7]}</div>
            <div className="d num">{parseDay(d).getDate()}</div>
          </div>
        ))}
        {/* todo el día / sin hora */}
        <div className="tiny dim" style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
          día
        </div>
        {days.map((d) => (
          <div key={d} className="cw-allday">
            {(byDay.get(d) ?? [])
              .filter((e) => !e.time)
              .map((e) => (
                <button key={e.key} className={`cal-ev ${e.followUp ? 'virtual' : ''} ${e.done ? 'done' : ''}`} style={{ ['--ev' as string]: KIND_COLOR[e.kind], fontSize: 11.5, padding: '2px 6px', width: 'auto', height: 'auto', borderRadius: 5, display: 'flex' }} onClick={() => onOpen(e)} title={e.title}>
                  <span className="kind-dot" style={{ background: KIND_COLOR[e.kind], display: 'block' }} />
                  <span className="trunc" style={{ display: 'block' }}>
                    {e.title}
                  </span>
                </button>
              ))}
          </div>
        ))}
        <div className="cw-hours">
          {hours.map((h) => (
            <div key={h} className="cw-hour">
              {pad(h)}:00
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d}
            className="cw-col"
            style={{ height: hours.length * HOUR_PX }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const y = e.clientY - rect.top;
              const mins = Math.floor((y / HOUR_PX) * 2) * 30 + START_H * 60;
              ui.newItem({ kind: 'llamada', date: d, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` });
            }}
          >
            {d === t && nowMin > 0 && nowMin < hours.length * 60 && <div className="now-line" style={{ top: (nowMin / 60) * HOUR_PX }} />}
            {(byDay.get(d) ?? [])
              .filter((e) => e.time)
              .map((e) => {
                const top = ((minutesOf(e.time!) - START_H * 60) / 60) * HOUR_PX;
                const h = Math.max(22, (e.duration / 60) * HOUR_PX - 2);
                if (top < 0 || top > hours.length * HOUR_PX) return null;
                return (
                  <div
                    key={e.key}
                    className={`cw-ev ${e.done ? 'done' : ''}`}
                    style={{ top, height: h, borderLeftColor: KIND_COLOR[e.kind], background: `color-mix(in srgb, ${KIND_COLOR[e.kind]} 14%, var(--panel))` }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(e);
                    }}
                  >
                    <div className="strong trunc" style={{ fontSize: 11.5 }}>
                      {e.title}
                    </div>
                    {h > 30 && <div className="tiny dim">{e.time}</div>}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
