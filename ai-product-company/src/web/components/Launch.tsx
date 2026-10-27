import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { useRouter } from '../lib/router';
import { Field, Sheet, useAction } from './ui';

const TYPES = [
  { id: 'strategy', label: 'Objetivo de negocio para ATLAS', help: 'ATLAS analiza el producto y la empresa, decide objetivos; ALEX los convierte en tareas para los especialistas.' },
  { id: 'video_pipeline', label: 'Vídeo (NOVA → NEO → REX → MAX → LUNA)', help: 'Pipeline completo de vídeo con QA y entrega en el Delivery Center.' },
  { id: 'store_audit', label: 'Auditoría de tienda (EVA → NOAH)', help: 'Problemas de conversión clasificados por riesgo. HIGH RISK → tu aprobación.' },
  { id: 'analytics_review', label: 'Análisis de rendimiento (IRIS)', help: 'Solo datos reales: internos y conectores. Sin métricas inventadas.' },
  { id: 'daily_report', label: 'Informe diario ahora (ATLAS)', help: 'Genera el DAILY COMPANY REPORT de hoy con los hechos registrados.' },
] as const;

/** Owner launches work directly. Every option maps to a real workflow. */
export function LaunchButton({ label = 'Lanzar trabajo', defaultType = 'strategy' }: { label?: string; defaultType?: (typeof TYPES)[number]['id'] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(defaultType);
  const [goal, setGoal] = useState('');
  const [angle, setAngle] = useState('');
  const [count, setCount] = useState(1);
  const { busy, run } = useAction();
  const { navigate } = useRouter();
  const t = TYPES.find((x) => x.id === type)!;

  const submit = async () => {
    const res = await run(() => api.post<{ id: string }[]>('/api/workflows', { type, goal: goal || undefined, angle: angle || undefined, count: type === 'video_pipeline' ? count : undefined }), 'Trabajo lanzado. La empresa ya está en marcha.');
    if (res) {
      setOpen(false);
      setGoal('');
      navigate('/work');
    }
  };

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>
        <Rocket /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Lanzar trabajo">
        <div className="stack gap-16">
          <Field label="¿Qué quieres que haga la empresa?">
            <div className="stack gap-6">
              {TYPES.map((x) => (
                <label key={x.id} className="check" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: type === x.id ? 'var(--surface-2)' : 'transparent' }}>
                  <input type="radio" name="wf" checked={type === x.id} onChange={() => setType(x.id)} />
                  <span className="stack">
                    <b style={{ fontWeight: 600 }}>{x.label}</b>
                    <span className="xs faint">{x.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          {type !== 'daily_report' && type !== 'analytics_review' && (
            <Field label={type === 'strategy' ? 'Objetivo' : 'Brief (opcional)'} hint={t.help}>
              <textarea className="textarea" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={type === 'strategy' ? 'Ej.: Quiero vender más este producto este mes' : 'Ej.: Enfocar en profesionales que teletrabajan'} />
            </Field>
          )}
          {type === 'video_pipeline' && (
            <div className="grid-2">
              <Field label="Ángulo (opcional)" hint="problem, desire, demonstration, contrarian…">
                <input className="input" value={angle} onChange={(e) => setAngle(e.target.value)} />
              </Field>
              <Field label="Número de vídeos">
                <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[1, 2, 3].map((n) => <option key={n}>{n}</option>)}
                </select>
              </Field>
            </div>
          )}
          <div className="row gap-8">
            <span className="spacer" />
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn primary" disabled={busy || (type === 'strategy' && !goal.trim())} onClick={submit}>
              <Rocket /> {busy ? 'Lanzando…' : 'Lanzar'}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
