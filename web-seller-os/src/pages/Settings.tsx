import { useRef, useState } from 'react';
import { Download, Keyboard, RotateCcw, Upload } from 'lucide-react';
import { useStore } from '../data/store';
import { useUI } from '../components/AppUI';
import { Field, Switch, confirmDialog } from '../components/ui';
import { ACCENTS, SECTORS } from '../data/defaults';
import { downloadJson } from '../data/storage';
import { toast } from '../lib/bus';
import { sound } from '../lib/sound';
import { WEEKDAYS_MED } from '../lib/dates';
import type { AppState } from '../data/types';

export default function Settings() {
  const { state, actions } = useStore();
  const ui = useUI();
  const file = useRef<HTMLInputElement>(null);
  const [p, setP] = useState(state.profile);
  const dirty = JSON.stringify(p) !== JSON.stringify(state.profile);

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as AppState;
      if (!data || !Array.isArray(data.prospects)) throw new Error('Formato no válido');
      if (await confirmDialog({ title: 'Importar copia de seguridad', body: `Se reemplazarán tus datos actuales por los del archivo (${data.prospects.length} prospectos).`, confirm: 'Importar' })) {
        actions.replaceState(data);
        toast('Datos importados');
      }
    } catch (e) {
      toast(`No se pudo importar: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 className="h1">Ajustes</h1>
          <p className="muted">Tu perfil, apariencia y datos.</p>
        </div>
        <button className="btn btn-ghost hide-mobile" onClick={() => ui.setShortcuts(true)}>
          <Keyboard /> Atajos
        </button>
      </div>

      <div className="col gap-16">
        <section className="card">
          <div className="h3 mb-16">Perfil</div>
          <div className="grid g2">
            <Field label="Nombre">
              <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
            </Field>
            <Field label="Ciudad / mercado">
              <input className="input" value={p.market} onChange={(e) => setP({ ...p, market: e.target.value })} />
            </Field>
            <Field label="Objetivo mensual (€)">
              <input className="input" type="number" min={0} value={p.monthlyRevenueGoal} onChange={(e) => setP({ ...p, monthlyRevenueGoal: Number(e.target.value) })} />
            </Field>
            <Field label="Precio medio de tus webs (€)">
              <input className="input" type="number" min={0} value={p.avgPrice} onChange={(e) => setP({ ...p, avgPrice: Number(e.target.value) })} />
            </Field>
            <Field label="Horas de venta al día">
              <input className="input" type="number" min={1} max={12} value={p.hoursPerDay} onChange={(e) => setP({ ...p, hoursPerDay: Number(e.target.value) })} />
            </Field>
            <Field label="Tarifa por hora (€)" help="Para la calculadora de precios">
              <input className="input" type="number" min={1} value={state.settings.hourlyRate} onChange={(e) => actions.updateSettings({ hourlyRate: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="label mt-16 mb-8">Clientes objetivo</div>
          <div className="chips">
            {SECTORS.map((s) => {
              const on = p.targetSectors.includes(s);
              return (
                <button key={s} className={`chip ${on ? 'on' : ''}`} onClick={() => setP({ ...p, targetSectors: on ? p.targetSectors.filter((x) => x !== s) : [...p.targetSectors, s] })}>
                  {s}
                </button>
              );
            })}
          </div>
          {dirty && (
            <div className="row gap-6 mt-16" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setP(state.profile)}>
                Descartar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  actions.updateProfile(p);
                  toast('Perfil guardado');
                }}
              >
                Guardar perfil
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="h3 mb-16">Apariencia</div>
          <div className="label mb-8">Color de acento</div>
          <div className="row row-wrap gap-6">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                aria-label={a.name}
                data-tip={a.name}
                onClick={() => actions.updateSettings({ accent: a.value })}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: a.value,
                  outline: state.settings.accent === a.value ? '2px solid var(--text)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
            <input type="color" value={state.settings.accent} onChange={(e) => actions.updateSettings({ accent: e.target.value })} aria-label="Color personalizado" data-tip="Personalizado" />
          </div>
          <div className="col mt-16" style={{ gap: 2 }}>
            <label className="row between" style={{ padding: '10px 0', cursor: 'pointer' }}>
              <div>
                <div className="small">Sonidos</div>
                <div className="tiny dim">Feedback sonoro discreto al completar acciones y cerrar ventas.</div>
              </div>
              <Switch
                on={state.settings.sound}
                onChange={(v) => {
                  actions.updateSettings({ sound: v });
                  if (v) sound.success();
                }}
                label="Sonidos"
              />
            </label>
            <label className="row between" style={{ padding: '10px 0', cursor: 'pointer' }}>
              <div>
                <div className="small">Reducir animaciones</div>
                <div className="tiny dim">Desactiva transiciones y confeti.</div>
              </div>
              <Switch on={state.settings.reduceMotion} onChange={(v) => actions.updateSettings({ reduceMotion: v })} label="Reducir animaciones" />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="h3 mb-8">Días laborables</div>
          <p className="tiny dim mb-12">Los días no laborables no rompen tu racha.</p>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = state.settings.workDays.includes(d);
              return (
                <button
                  key={d}
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => {
                    const next = on ? state.settings.workDays.filter((x) => x !== d) : [...state.settings.workDays, d];
                    if (next.length) actions.updateSettings({ workDays: next });
                  }}
                >
                  {WEEKDAYS_MED[(d + 6) % 7]}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="h3 mb-8">Integraciones</div>
          <Field label="Clave de Google PageSpeed (opcional)" help="Sin clave funciona con límite de uso compartido. Es gratuita en Google Cloud Console → PageSpeed Insights API.">
            <input className="input mono" value={state.settings.psiKey} onChange={(e) => actions.updateSettings({ psiKey: e.target.value.trim() })} placeholder="AIza…" />
          </Field>
        </section>

        <section className="card">
          <div className="h3 mb-8">Datos</div>
          <p className="small muted mb-16">
            Tus datos se guardan en este navegador. Exporta una copia regularmente; la arquitectura está preparada para conectarse a un backend (ver README).
          </p>
          <div className="row row-wrap gap-6">
            <button className="btn" onClick={() => downloadJson(state)}>
              <Download /> Exportar copia (JSON)
            </button>
            <button className="btn" onClick={() => file.current?.click()}>
              <Upload /> Importar copia
            </button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            <span className="grow" />
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (await confirmDialog({ title: '¿Borrar todos los datos?', body: 'Se eliminarán prospectos, agenda, actividad y ajustes de este navegador. No se puede deshacer. Exporta una copia antes.', confirm: 'Borrar todo', danger: true })) {
                  actions.resetAll();
                  location.hash = '#/';
                }
              }}
            >
              <RotateCcw /> Borrar todo
            </button>
          </div>
          <div className="tiny dim mt-16">
            {state.prospects.length} prospectos · {state.items.length} elementos de agenda · {state.activities.length} acciones registradas · {state.resources.length} recursos
          </div>
        </section>
      </div>
    </div>
  );
}
