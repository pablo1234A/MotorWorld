import { useState } from 'react';
import { Copy, Check, Info } from 'lucide-react';
import { useStore } from '../data/store';
import { Field, Seg, Switch } from '../components/ui';
import { computePrice, defaultPriceInput, priceReasons, type PriceInput } from '../lib/pricing';
import { money } from '../lib/format';
import { toast } from '../lib/bus';

export default function Pricing() {
  const { state } = useStore();
  const [i, setI] = useState<PriceInput>(() => defaultPriceInput(state.settings.hourlyRate));
  const set = <K extends keyof PriceInput>(k: K, v: PriceInput[K]) => setI((s) => ({ ...s, [k]: v }));
  const r = computePrice(i);
  const reasons = priceReasons(i, r);

  const toggles: [keyof PriceInput, string][] = [
    ['customDesign', 'Diseño personalizado'],
    ['cms', 'Gestor de contenidos (CMS)'],
    ['booking', 'Reservas / citas online'],
    ['ecommerce', 'Tienda online'],
    ['copywriting', 'Redacción de textos'],
    ['maintenance', 'Mantenimiento mensual'],
    ['hosting', 'Hosting gestionado'],
    ['domain', 'Dominio'],
  ];

  const summary = `Propuesta web\n\n· Opción Premium: ${money(r.premium)}\n· Opción Recomendada: ${money(r.recommended)}\n· Opción Básica: ${money(r.min)}\n${r.monthly ? `\nMantenimiento y hosting: ${r.monthly} €/mes` : ''}${r.yearlyDomain ? `\nDominio: ${r.yearlyDomain} €/año` : ''}\n\nIncluye:\n${r.lines.map((l) => `· ${l.label}`).join('\n')}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Calculadora de precios</h1>
          <p className="muted">Cobra lo que vale tu trabajo y sabe defenderlo.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)' }} data-stack>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="col gap-20">
            <Field label={`Número de páginas · ${i.pages}`}>
              <input type="range" min={1} max={30} value={i.pages} onChange={(e) => set('pages', Number(e.target.value))} />
            </Field>
            <div className="field">
              <span className="label">Complejidad</span>
              <Seg value={i.complexity} onChange={(v) => set('complexity', v)} options={[{ value: 'simple', label: 'Simple' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }]} />
            </div>
            <div className="field">
              <span className="label">Animaciones</span>
              <Seg value={i.animations} onChange={(v) => set('animations', v)} options={[{ value: 'no', label: 'No' }, { value: 'sutiles', label: 'Sutiles' }, { value: 'avanzadas', label: 'Avanzadas' }]} />
            </div>
            <div className="field">
              <span className="label">SEO</span>
              <Seg value={i.seo} onChange={(v) => set('seo', v)} options={[{ value: 'no', label: 'No' }, { value: 'basico', label: 'Básico' }, { value: 'local', label: 'Local' }, { value: 'avanzado', label: 'Avanzado' }]} />
            </div>
            <div className="field">
              <span className="label">Urgencia</span>
              <Seg value={i.urgency} onChange={(v) => set('urgency', v)} options={[{ value: 'normal', label: 'Normal' }, { value: 'rapida', label: 'Rápida +20%' }, { value: 'urgente', label: 'Urgente +40%' }]} />
            </div>
            <div className="col" style={{ gap: 2 }}>
              {toggles.map(([k, l]) => (
                <label key={k} className="row between" style={{ padding: '8px 0', cursor: 'pointer' }}>
                  <span className="small">{l}</span>
                  <Switch on={i[k] as boolean} onChange={(v) => set(k, v as never)} label={l} />
                </label>
              ))}
            </div>
            <hr className="sep" style={{ margin: 0 }} />
            <div className="grid g3">
              <Field label="Tu tarifa (€/h)">
                <input className="input" type="number" min={10} value={i.hourlyRate} onChange={(e) => set('hourlyRate', Number(e.target.value))} />
              </Field>
              <Field label="Ticket del cliente (€)" help="Lo que le deja un cliente">
                <input className="input" type="number" min={0} value={i.clientTicket || ''} placeholder="80" onChange={(e) => set('clientTicket', Number(e.target.value))} />
              </Field>
              <Field label="Clientes extra / mes" help="Estimación prudente">
                <input className="input" type="number" min={0} value={i.clientsPerMonth || ''} placeholder="3" onChange={(e) => set('clientsPerMonth', Number(e.target.value))} />
              </Field>
            </div>
          </div>
        </div>

        <div className="col gap-16" style={{ position: 'sticky', top: 76, alignSelf: 'start' }}>
          <div className="grid g3">
            <div className="price-tier">
              <span className="eyebrow">Mínimo</span>
              <span className="amount">{money(r.min)}</span>
              <span className="tiny dim">Tu suelo. No bajes de aquí.</span>
            </div>
            <div className="price-tier rec">
              <span className="eyebrow accent">Recomendado</span>
              <span className="amount">{money(r.recommended)}</span>
              <span className="tiny dim">{Math.round(r.hours)} h × {i.hourlyRate} €/h{r.urgency > 1 ? ` × ${r.urgency}` : ''}</span>
            </div>
            <div className="price-tier">
              <span className="eyebrow">Premium</span>
              <span className="amount">{money(r.premium)}</span>
              <span className="tiny dim">Con extras y prioridad. Ancla primero.</span>
            </div>
          </div>
          {(r.monthly > 0 || r.yearlyDomain > 0) && (
            <div className="card tight row between small">
              <span className="muted">Recurrente</span>
              <span>
                {r.monthly > 0 && <b className="strong">{r.monthly} €/mes</b>}
                {r.monthly > 0 && r.yearlyDomain > 0 && ' · '}
                {r.yearlyDomain > 0 && <span>{r.yearlyDomain} €/año dominio</span>}
              </span>
            </div>
          )}
          <div className="card">
            <div className="h3 mb-12">Por qué puedes cobrar este precio</div>
            <ul className="col gap-12" style={{ listStyle: 'none' }}>
              {reasons.map((t, k) => (
                <li key={k} className="row row-top gap-12 small">
                  <Check size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 3 }} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="h3">Desglose</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(summary).then(() => toast('Propuesta copiada'));
                }}
              >
                <Copy /> Copiar propuesta
              </button>
            </div>
            <div className="col gap-6">
              {r.lines.map((l) => (
                <div key={l.label} className="row between small">
                  <span className="muted">{l.label}</span>
                  <span className="mono dim">{Math.round(l.hours)} h</span>
                </div>
              ))}
            </div>
            <div className="tiny dim mt-12 row gap-6">
              <Info size={13} /> Horas estimadas. Ajusta tu tarifa por defecto en Ajustes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
