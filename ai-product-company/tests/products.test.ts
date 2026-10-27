import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany, activeTestProduct } from './helpers.js';
import { buildProductContext } from '../src/server/products/productContext.js';
import { getAgent } from '../src/server/agents/definitions.js';

describe('Product Center', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('creates products, computes margin and keeps a single ACTIVE PRODUCT', () => {
    env = makeCompany();
    const { c } = env;
    const a = activeTestProduct(c);
    expect(a.isActive).toBe(true);
    expect(a.margin).toBeCloseTo(28.4);
    expect(a.marginPct).toBeCloseTo(71.18, 1);
    const b = c.products.create({ name: 'Otro producto', price: 10 });
    c.products.activate(b.id);
    expect(c.products.getActive()!.id).toBe(b.id);
    expect(c.products.get(a.id).isActive).toBe(false);
    expect(c.events.recent(20, 'PRODUCT_ACTIVATED').length).toBe(2);
    expect(c.events.recent(20, 'PRODUCT_DEACTIVATED').length).toBe(1);
  });

  it('rejects invalid product data', () => {
    env = makeCompany();
    expect(() => env.c.products.create({ name: '' })).toThrow();
    expect(() => env.c.products.create({ name: 'x', storeUrl: 'not a url' })).toThrow();
  });

  it('propagates product context to every agent, filtered by role', () => {
    env = makeCompany();
    const p = activeTestProduct(env.c);
    const nova = buildProductContext(p, getAgent('NOVA').productFields).text;
    const eva = buildProductContext(p, getAgent('EVA').productFields).text;
    const atlas = buildProductContext(p, getAgent('ATLAS').productFields).text;
    expect(nova).toContain('Dolor lumbar al final del día');
    expect(nova).not.toContain('coste 11.5'); // NOVA does not need the cost
    expect(eva).toContain('coste 11.5'); // EVA needs pricing for offers
    expect(atlas).toContain('PostureFlex');
    // Every agent is informed when the active product changes.
    const broadcasts = env.c.messages.internal({ limit: 50 }).filter((m) => m.kind === 'broadcast');
    expect(new Set(broadcasts.map((m) => m.toId)).size).toBe(9);
  });

  it('marks missing fields so agents do not invent them', () => {
    env = makeCompany();
    const p = env.c.products.create({ name: 'Minimal' });
    const ctx = buildProductContext(p, getAgent('NOVA').productFields);
    expect(ctx.missing).toContain('customerPains');
    expect(ctx.text).toContain('No inventes estos datos');
  });
});
