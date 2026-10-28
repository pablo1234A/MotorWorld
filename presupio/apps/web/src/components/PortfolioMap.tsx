import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { CompanySettings, Quote } from '../api/types';
import { daysSince, formatDays, formatMoney, formatMoneyCompact } from '../lib/format';
import { squarify } from '../lib/treemap';

export type Band = 'fresh' | 'due' | 'cold';

export interface BandRules {
  dueFrom: number;
  coldFrom: number;
}

/**
 * Tramos de antigüedad a partir de las reglas de seguimiento de la empresa:
 *  - reciente: aún no toca el primer seguimiento;
 *  - toca seguimiento: dentro de la secuencia configurada;
 *  - fuera de secuencia: la secuencia configurada ya habría terminado.
 */
export function bandRules(settings: Pick<CompanySettings, 'firstFollowUpAfterDays' | 'followUpIntervalDays' | 'maxFollowUps'>): BandRules {
  const dueFrom = settings.firstFollowUpAfterDays;
  const steps = Math.max(settings.maxFollowUps, 1);
  return { dueFrom, coldFrom: dueFrom + settings.followUpIntervalDays * steps };
}

export function bandOf(days: number, rules: BandRules): Band {
  if (days < rules.dueFrom) return 'fresh';
  if (days < rules.coldFrom) return 'due';
  return 'cold';
}

export const BAND_LABEL: Record<Band, string> = {
  fresh: 'Reciente',
  due: 'Toca seguimiento',
  cold: 'Fuera de secuencia',
};

export function bandDescription(band: Band, rules: BandRules): string {
  if (band === 'fresh') return `Menos de ${formatDays(rules.dueFrom)} desde el envío`;
  if (band === 'due') return `Entre ${rules.dueFrom} y ${rules.coldFrom - 1} días sin respuesta`;
  return `${formatDays(rules.coldFrom)} o más: tu secuencia de seguimiento ya habría terminado`;
}

interface Props {
  quotes: Quote[];
  rules: BandRules;
}

/** Plano de la cartera pendiente: cada parcela es un presupuesto sin respuesta, con área proporcional a su importe. */
export function PortfolioMap({ quotes, rules }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const parcels = useMemo(() => {
    const now = new Date();
    const inputs = quotes
      .filter((q) => q.amountCents && q.amountCents > 0 && q.sentAt)
      .map((q) => {
        const days = daysSince(q.sentAt!, now);
        return { value: q.amountCents!, item: { quote: q, days, band: bandOf(days, rules) } };
      });
    return squarify(inputs, size.w, size.h);
  }, [quotes, rules, size]);

  return (
    <div className="plano" ref={ref}>
      <ul className="plano__parcels" aria-label="Presupuestos pendientes de respuesta, ordenados por importe">
        {parcels.map(({ item, x, y, w, h }) => {
          const { quote, days, band } = item;
          const roomy = w >= 108 && h >= 66;
          const medium = !roomy && w >= 52 && h >= 28;
          const label = `${quote.reference ? `${quote.reference}, ` : ''}${quote.contact.fullName}, ${formatMoney(quote.amountCents, quote.currency)}, ${formatDays(days)} sin respuesta, ${BAND_LABEL[band].toLowerCase()}`;
          return (
            <li key={quote.id} style={{ left: x, top: y, width: w, height: h }} className="plano__cell">
              <Link to={`/presupuestos/${quote.id}`} className={`parcel parcel--${band}`} title={label}>
                {roomy && (
                  <>
                    <span className="parcel__ref">{quote.reference ?? 'Sin referencia'}</span>
                    <span className="parcel__client">{quote.contact.fullName}</span>
                    <span className="parcel__foot">
                      <span className="parcel__amount">{formatMoneyCompact(quote.amountCents!, quote.currency)}</span>
                      <span className="parcel__days">{formatDays(days)}</span>
                    </span>
                  </>
                )}
                {medium && <span className="parcel__days parcel__days--solo">{days} d</span>}
                <span className="visually-hidden">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
