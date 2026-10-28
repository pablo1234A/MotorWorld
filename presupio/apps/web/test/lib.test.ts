import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandOf, bandRules } from '../src/components/PortfolioMap';
import { dateInputToIso, dateInputToIsoAfter, daysSince, formatMoney, toDateInput } from '../src/lib/format';
import {
  CONTACT_CHANNEL_LABEL,
  EXCLUSION_REASON_LABEL,
  FOLLOW_UP_CHANNEL_LABEL,
  OUTCOME_LABEL,
  QUOTE_STATUS_LABEL,
  ROLE_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
} from '../src/lib/labels';
import { centsToInput, parseEuroInput } from '../src/lib/money';
import { squarify } from '../src/lib/treemap';
import { safeRedirect, validateEmail, validatePassword, validatePhone } from '../src/lib/validation';

describe('importes en formato español', () => {
  it.each([
    ['18.500', 1_850_000],
    ['18.500,50', 1_850_050],
    ['18500,5', 1_850_050],
    ['18500.5', 1_850_050],
    ['1.250.000', 125_000_000],
    ['18 500 €', 1_850_000],
    ['0', 0],
    ['950', 95_000],
  ])('%s → %i céntimos', (input, cents) => {
    expect(parseEuroInput(input)).toBe(cents);
  });

  it.each(['', 'abc', '-50', '18,500,00', '18.50.0', '10,999', '1.2.3,4', '1e5'])(
    'rechaza %j',
    (input) => {
      expect(parseEuroInput(input)).toBeNull();
    },
  );

  it('no acepta más de dos decimales', () => {
    expect(parseEuroInput('10,999')).toBeNull();
  });

  it('ida y vuelta entre céntimos y texto editable', () => {
    for (const cents of [0, 95_000, 1_850_050, 123]) expect(parseEuroInput(centsToInput(cents))).toBe(cents);
    expect(centsToInput(null)).toBe('');
  });

  it('formatea euros agrupando siempre los miles', () => {
    expect(formatMoney(320_000)).toMatch(/^3\.200\s€$/);
    expect(formatMoney(6_700_000)).toMatch(/^67\.000\s€$/);
    expect(formatMoney(null)).toBe('—');
  });
});

describe('fechas', () => {
  it('la fecha de hoy se envía como "ahora" (la API rechaza fechas futuras)', () => {
    const now = new Date('2026-10-28T10:00:00');
    expect(dateInputToIso(toDateInput(now), now)).toBe(now.toISOString());
    expect(new Date(dateInputToIso('2026-10-20', now)).getHours()).toBe(12);
  });

  it('nunca devuelve una fecha anterior al envío del presupuesto', () => {
    const now = new Date('2026-10-28T10:00:00');
    const sentAt = new Date('2026-10-20T17:30:00').toISOString();
    expect(dateInputToIsoAfter('2026-10-20', sentAt, now)).toBe(sentAt);
    expect(dateInputToIsoAfter('2026-10-21', sentAt, now)).not.toBe(sentAt);
  });

  it('días transcurridos', () => {
    expect(daysSince('2026-10-20T10:00:00Z', new Date('2026-10-28T09:00:00Z'))).toBe(7);
    expect(daysSince('2026-10-29T10:00:00Z', new Date('2026-10-28T09:00:00Z'))).toBe(0);
  });
});

describe('validación y redirecciones seguras', () => {
  it.each([
    [null, '/'],
    ['/presupuestos?estado=sent', '/presupuestos?estado=sent'],
    ['//atacante.example', '/'],
    ['https://atacante.example/x', '/'],
    ['/\\atacante.example', '/'],
    ['javascript:alert(1)', '/'],
    ['presupuestos', '/'],
    ['/a\u0000b', '/'],
  ])('safeRedirect(%j) → %s', (input, out) => {
    expect(safeRedirect(input)).toBe(out);
  });

  it('valida email, contraseña y teléfono como el servidor', () => {
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('no-es-email')).toBeTruthy();
    expect(validateEmail('ana@ejemplo.test')).toBeUndefined();
    expect(validatePassword('corta')).toBeTruthy();
    expect(validatePassword(' '.repeat(12))).toBeTruthy();
    expect(validatePassword('una-frase-larga')).toBeUndefined();
    expect(validatePhone('600 11 22 33')).toBeUndefined();
    expect(validatePhone('12')).toBeTruthy();
  });
});

describe('plano de la cartera', () => {
  it('las parcelas cubren el área, sin solaparse, con área proporcional al importe', () => {
    const values = [4_850_000, 2_390_000, 890_000, 6_700_000, 120_000, 50_000];
    const parcels = squarify(
      values.map((v, i) => ({ value: v, item: i })),
      800,
      300,
    );
    expect(parcels).toHaveLength(values.length);
    const total = values.reduce((a, b) => a + b, 0);
    for (const p of parcels) {
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.x + p.w).toBeLessThanOrEqual(800.001);
      expect(p.y + p.h).toBeLessThanOrEqual(300.001);
      expect((p.w * p.h) / (800 * 300)).toBeCloseTo(p.value / total, 5);
    }
    for (let i = 0; i < parcels.length; i++)
      for (let j = i + 1; j < parcels.length; j++) {
        const a = parcels[i]!;
        const b = parcels[j]!;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW <= 0.001 || overlapH <= 0.001).toBe(true);
      }
  });

  it('ignora importes nulos o cero y espacios vacíos', () => {
    expect(squarify([{ value: 0, item: 1 }], 100, 100)).toEqual([]);
    expect(squarify([{ value: 10, item: 1 }], 0, 100)).toEqual([]);
  });

  it('los tramos salen de las reglas de seguimiento de la empresa', () => {
    const rules = bandRules({ firstFollowUpAfterDays: 3, followUpIntervalDays: 4, maxFollowUps: 3 });
    expect(rules).toEqual({ dueFrom: 3, coldFrom: 15 });
    expect(bandOf(0, rules)).toBe('fresh');
    expect(bandOf(2, rules)).toBe('fresh');
    expect(bandOf(3, rules)).toBe('due');
    expect(bandOf(14, rules)).toBe('due');
    expect(bandOf(15, rules)).toBe('cold');
    expect(bandRules({ firstFollowUpAfterDays: 5, followUpIntervalDays: 7, maxFollowUps: 0 })).toEqual({ dueFrom: 5, coldFrom: 12 });
  });
});

describe('coherencia con el modelo de datos del backend', () => {
  // Lee los tipos del backend: el frontend no puede inventar ni olvidar estados.
  const source = readFileSync(path.resolve(__dirname, '../../api/src/db/types.ts'), 'utf8');
  const union = (name: string) => {
    const m = new RegExp(`export type ${name} = ([^;]+);`).exec(source);
    if (!m) throw new Error(`Tipo ${name} no encontrado`);
    return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  };
  it.each([
    ['QuoteStatus', QUOTE_STATUS_LABEL],
    ['MembershipRole', ROLE_LABEL],
    ['FollowUpChannel', FOLLOW_UP_CHANNEL_LABEL],
    ['ContactChannel', CONTACT_CHANNEL_LABEL],
    ['FollowUpOutcome', OUTCOME_LABEL],
    ['ExclusionReason', EXCLUSION_REASON_LABEL],
    ['SubscriptionStatus', SUBSCRIPTION_STATUS_LABEL],
  ] as const)('%s tiene exactamente una etiqueta en español por valor', (name, labels) => {
    expect(Object.keys(labels).sort()).toEqual(union(name));
  });
});
