import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany } from './helpers.js';

describe('Memory', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('recalls only the scopes an agent is allowed to see, bound to the current product', () => {
    env = makeCompany();
    const m = env.c.memory;
    m.write('ATLAS', { scope: 'global', scopeId: 'company', kind: 'decision', title: 'Decisión global', content: 'x', importance: 5 });
    m.write('NOVA', { scope: 'product', scopeId: 'prd_A', kind: 'insight', title: 'Insight A', content: 'a' });
    m.write('NOVA', { scope: 'product', scopeId: 'prd_B', kind: 'insight', title: 'Insight B', content: 'b' });
    m.write('LUNA', { scope: 'agent', scopeId: 'MAX', kind: 'lesson', title: 'Lección MAX', content: 'm' });
    m.write('LUNA', { scope: 'agent', scopeId: 'NEO', kind: 'lesson', title: 'Lección NEO', content: 'n' });

    const maxView = m.recall({ agentId: 'MAX', scopes: ['product', 'brand', 'agent', 'video'], productId: 'prd_A' }).map((e) => e.title);
    expect(maxView).toContain('Insight A');
    expect(maxView).toContain('Lección MAX');
    expect(maxView).not.toContain('Insight B');
    expect(maxView).not.toContain('Lección NEO');
    expect(maxView).not.toContain('Decisión global'); // MAX has no global scope

    const atlasView = m.recall({ agentId: 'ATLAS', scopes: ['global', 'product'], productId: 'prd_A' }).map((e) => e.title);
    expect(atlasView).toContain('Decisión global');
  });

  it('validates memory input', () => {
    env = makeCompany();
    expect(() => env.c.memory.write('OWNER', { scope: 'nope' as never, scopeId: 'x', kind: 'note', title: 't', content: 'c' })).toThrow();
  });
});
