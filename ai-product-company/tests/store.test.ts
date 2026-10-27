import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany, activeTestProduct } from './helpers.js';
import { extractSignals } from '../src/server/integrations/store.js';

describe('Store audit (EVA → NOAH → Approval Center)', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('extracts observable signals from a product page', () => {
    const html = `<html><head><title>PostureFlex</title><meta name="description" content="Cojín"></head><body>
      <h1>Adiós dolor de espalda</h1><p>Solo 39,90 € · Envío gratis · Devolución 30 días</p>
      <button>Añadir al carrito</button><img src="a.jpg"><img src="b.jpg"></body></html>`;
    const s = extractSignals('https://example.com/p', 200, html);
    expect(s.title).toBe('PostureFlex');
    expect(s.h1).toEqual(['Adiós dolor de espalda']);
    expect(s.prices[0]).toMatch(/39,90/);
    expect(s.ctaTexts).toContain('Añadir al carrito');
    expect(s.imageCount).toBe(2);
    expect(s.trustSignals).toEqual(expect.arrayContaining(['envío gratis', 'devolución']));
  });

  it('classifies risk and sends HIGH RISK changes to the owner; approval never fakes an applied change', async () => {
    env = makeCompany();
    const { c } = env;
    activeTestProduct(c, { cost: 30, cta: '' }); // low margin + no CTA → offer + copy findings
    const run = c.workflows.start('store_audit', { createdBy: 'OWNER' });
    await c.scheduler.drain();
    expect(c.workflows.get(run.id).status).toBe('COMPLETED');
    const findings = c.findings.list({ workflowRunId: run.id });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.risk && f.status !== 'PROPOSED')).toBe(true);
    // Inject a pricing finding and review it → HIGH RISK → approval.
    const f = c.findings.create({ productId: findings[0].productId, workflowRunId: null, category: 'price', problem: 'Precio alto frente a competidores', whyItMatters: 'x', expectedImpact: 'y', recommendedAction: 'Bajar el precio a 34,90 € durante 2 semanas', createdBy: 'EVA' });
    const run2 = c.workflows.start('store_audit', { createdBy: 'OWNER' });
    c.findings.setStatus(f.id, 'PROPOSED');
    c.db.run('UPDATE store_findings SET workflow_run_id = ? WHERE id = ?', run2.id, f.id);
    await c.scheduler.drain();
    expect(c.findings.get(f.id)).toMatchObject({ risk: 'HIGH', status: 'AWAITING_APPROVAL' });
    const approval = c.approvals.list('PENDING').find((a) => a.payload.findingId === f.id)!;
    expect(approval.risk).toBe('HIGH');
    expect(c.agentState.get('NOAH').status).toBe('APPROVAL_REQUIRED');
    await c.approvals.resolve(approval.id, { decision: 'APPROVE' });
    // Approved, but NOT "applied": there is no store write connector.
    expect(c.findings.get(f.id).status).toBe('APPROVED');
  });
});
