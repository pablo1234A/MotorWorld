import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useStore } from '../data/store';
import { SECTORS, defaultProfile, planFromProfile } from '../data/defaults';
import type { Profile } from '../data/types';
import { money } from '../lib/format';
import { workDaysLeftInMonth } from '../lib/dates';

const STEPS = 7;

export default function Onboarding() {
  const { state, actions } = useStore();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>({ ...defaultProfile(), ...state.profile });
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((s) => ({ ...s, [k]: v }));
  // elegir una opción rápida avanza solo (como un formulario conversacional)
  const pickAndNext = (k: 'monthlyRevenueGoal' | 'avgPrice' | 'hoursPerDay', v: number) => {
    set(k, v);
    setTimeout(() => setStep((s) => s + 1), 220);
  };
  const workDaysMonth = Math.round((state.settings.workDays.length / 7) * 30);
  const plan = planFromProfile(p, workDaysMonth);

  const valid = [p.name.trim().length > 0, p.monthlyRevenueGoal > 0, p.avgPrice > 0, p.hoursPerDay > 0, true, true, true][step];
  const next = () => {
    if (!valid) return;
    if (step < STEPS - 1) setStep(step + 1);
    else actions.completeOnboarding({ ...p, name: p.name.trim(), market: p.market.trim() }, plan.goals);
  };

  return (
    <div className="onb">
      <div className="ambient" />
      <div className="onb-top">
        <div className="row">
          <div className="brand-mark">WS</div>
          <span className="small strong">WEB SELLER OS</span>
        </div>
        <div className="onb-progress" aria-label={`Paso ${step + 1} de ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>
      <div className="onb-body">
        <form
          key={step}
          className="onb-step"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          {step === 0 && (
            <>
              <div className="eyebrow">Bienvenido</div>
              <h1 className="display mt-12">Vamos a convertirte en un vendedor de webs profesional.</h1>
              <p className="lead mt-16">Seis preguntas rápidas y configuro tu centro de operaciones. ¿Cómo te llamas?</p>
              <input className="input input-lg mt-32" autoFocus value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Tu nombre" />
            </>
          )}
          {step === 1 && (
            <>
              <div className="eyebrow">Objetivo</div>
              <h1 className="display mt-12">{p.name.split(' ')[0]}, ¿cuánto quieres facturar al mes?</h1>
              <p className="lead mt-16">Sé ambicioso pero realista. Lo podrás cambiar cuando quieras.</p>
              <div className="grid g4 keep mt-32">
                {[1000, 2000, 3000, 5000].map((v) => (
                  <button type="button" key={v} className={`choice ${p.monthlyRevenueGoal === v ? 'on' : ''}`} onClick={() => pickAndNext('monthlyRevenueGoal', v)}>
                    {money(v)}
                  </button>
                ))}
              </div>
              <input className="input input-lg mt-12" type="number" min={100} step={100} value={p.monthlyRevenueGoal || ''} onChange={(e) => set('monthlyRevenueGoal', Number(e.target.value))} placeholder="Otra cantidad (€)" />
            </>
          )}
          {step === 2 && (
            <>
              <div className="eyebrow">Precio</div>
              <h1 className="display mt-12">¿Cuál es el precio medio de tus webs?</h1>
              <p className="lead mt-16">Si todavía no has vendido ninguna, pon lo que te gustaría cobrar.</p>
              <div className="grid g4 keep mt-32">
                {[500, 900, 1500, 2500].map((v) => (
                  <button type="button" key={v} className={`choice ${p.avgPrice === v ? 'on' : ''}`} onClick={() => pickAndNext('avgPrice', v)}>
                    {money(v)}
                  </button>
                ))}
              </div>
              <input className="input input-lg mt-12" type="number" min={50} step={50} value={p.avgPrice || ''} onChange={(e) => set('avgPrice', Number(e.target.value))} placeholder="Otro precio (€)" />
            </>
          )}
          {step === 3 && (
            <>
              <div className="eyebrow">Tiempo</div>
              <h1 className="display mt-12">¿Cuántas horas al día puedes dedicar a vender?</h1>
              <p className="lead mt-16">Solo tiempo de venta: prospectar, contactar, reuniones. No el de diseñar webs.</p>
              <div className="grid g4 keep mt-32">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                  <button type="button" key={v} className={`choice ${p.hoursPerDay === v ? 'on' : ''}`} onClick={() => pickAndNext('hoursPerDay', v)}>
                    {v} h
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="eyebrow">Cliente ideal</div>
              <h1 className="display mt-12">¿A qué tipo de negocios quieres vender?</h1>
              <p className="lead mt-16">Elige uno o varios. Especializarte te hará vender más y más caro.</p>
              <div className="chips mt-32">
                {SECTORS.map((s) => {
                  const on = p.targetSectors.includes(s);
                  return (
                    <button type="button" key={s} className={`chip ${on ? 'on' : ''}`} onClick={() => set('targetSectors', on ? p.targetSectors.filter((x) => x !== s) : [...p.targetSectors, s])}>
                      {on && <Check />}
                      {s}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {step === 5 && (
            <>
              <div className="eyebrow">Mercado</div>
              <h1 className="display mt-12">¿En qué ciudad o zona vas a buscar clientes?</h1>
              <p className="lead mt-16">Lo usaré para personalizar mensajes, argumentos y recomendaciones.</p>
              <input className="input input-lg mt-32" autoFocus value={p.market} onChange={(e) => set('market', e.target.value)} placeholder="Ej. Valencia, Madrid centro, toda España…" />
            </>
          )}
          {step === 6 && (
            <>
              <div className="eyebrow">Tu plan</div>
              <h1 className="display mt-12">Esto es lo que necesitas hacer.</h1>
              <div className="card mt-32">
                <div className="grid g3 keep">
                  <div className="kpi">
                    <span className="kpi-label">Ventas / mes</span>
                    <span className="kpi-value">{plan.salesNeeded}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Reuniones / mes</span>
                    <span className="kpi-value">{plan.meetingsMonth}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Contactos / día</span>
                    <span className="kpi-value accent">{plan.contactsDay}</span>
                  </div>
                </div>
                <hr className="sep" />
                <p className="muted small">
                  Para facturar {money(p.monthlyRevenueGoal)} a {money(p.avgPrice)} por web necesitas {plan.salesNeeded} {plan.salesNeeded === 1 ? 'venta' : 'ventas'}. Con tasas de conversión de referencia (20% respuesta → 40% reunión → 30%
                  cierre) eso son unos {plan.contactsPerSale} contactos por venta.
                  {plan.contactsDay >= plan.capacity && ` Tu capacidad con ${p.hoursPerDay} h/día está al límite: prioriza calidad y referidos.`}
                </p>
                <p className="tiny dim mt-12">Son estimaciones iniciales. En cuanto registres actividad real, la app usará tus propios datos. Quedan {workDaysLeftInMonth(state.settings.workDays)} días laborables este mes.</p>
              </div>
            </>
          )}

          <div className="row between mt-40">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft /> Atrás
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="btn btn-primary btn-lg" disabled={!valid}>
              {step === STEPS - 1 ? 'Empezar a vender' : step === 4 && p.targetSectors.length === 0 ? 'Saltar' : 'Continuar'} <ArrowRight />
            </button>
          </div>
          {step < STEPS - 1 && (
            <div className="tiny dim mt-16" style={{ textAlign: 'right' }}>
              Pulsa <kbd>↵</kbd> para continuar
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
