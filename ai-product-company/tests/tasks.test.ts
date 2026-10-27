import { afterEach, describe, expect, it } from 'vitest';
import { makeCompany, activeTestProduct } from './helpers.js';

describe('Task Engine', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('enforces the state machine', () => {
    env = makeCompany();
    const t = env.c.tasks.create({ title: 't', description: 'd', type: 'iris.analytics', agentId: 'IRIS', createdBy: 'OWNER' });
    expect(t.status).toBe('PENDING');
    expect(() => env.c.tasks.transition(t.id, 'COMPLETED')).toThrow(/Illegal/);
    env.c.tasks.transition(t.id, 'ASSIGNED');
    env.c.tasks.transition(t.id, 'RUNNING');
    expect(env.c.tasks.get(t.id).startedAt).not.toBeNull();
    expect(env.c.events.recent(20).map((e) => e.type)).toEqual(expect.arrayContaining(['TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STARTED']));
  });

  it('respects dependencies and priorities, and blocks on failed dependencies', () => {
    env = makeCompany();
    const { tasks } = env.c;
    const a = tasks.create({ title: 'a', description: '', type: 'iris.analytics', agentId: 'IRIS', priority: 'low', createdBy: 'OWNER' });
    const b = tasks.create({ title: 'b', description: '', type: 'iris.analytics', agentId: 'IRIS', priority: 'critical', dependsOn: [a.id], createdBy: 'OWNER' });
    const c2 = tasks.create({ title: 'c', description: '', type: 'iris.analytics', agentId: 'IRIS', priority: 'high', createdBy: 'OWNER' });
    expect(tasks.runnable().map((t) => t.id)).toEqual([c2.id, a.id]); // b waits for a; high before low
    tasks.transition(a.id, 'FAILED', { error: 'boom' });
    tasks.runnable();
    expect(tasks.get(b.id).status).toBe('BLOCKED');
  });

  it('retries failing tasks, then escalates ALEX → ATLAS and shows the error (never hidden)', async () => {
    env = makeCompany();
    const { c } = env;
    const p = activeTestProduct(c);
    // REX on a video that has no blueprint yet fails for real ("No blueprint from NEO") — a retryable error.
    const video = c.videos.create({ workflowRunId: 'run_test', productId: p.id, campaignId: null, title: 'v', createdBy: 'ALEX' });
    const t = c.tasks.create({ title: 'Producción sin blueprint', description: '', type: 'rex.produce', agentId: 'REX', productId: p.id, input: { videoId: video.id }, maxAttempts: 2, createdBy: 'ALEX' });
    await c.scheduler.drain();
    const done = c.tasks.get(t.id);
    expect(done.status).toBe('FAILED');
    expect(done.attempts).toBe(2);
    expect(c.events.recent(50, 'TASK_RETRY').length).toBe(1);
    expect(c.events.recent(50, 'ERROR_ESCALATED').length).toBe(1);
    const msgs = c.messages.internal({ limit: 50 });
    expect(msgs.some((m) => m.fromId === 'REX' && m.toId === 'ALEX' && m.kind === 'escalation')).toBe(true);
    expect(msgs.some((m) => m.fromId === 'ALEX' && m.toId === 'ATLAS' && m.kind === 'escalation')).toBe(true);
    expect(c.agentState.get('REX').status).toBe('ERROR');
    expect(c.activity.list({ kind: 'error' }).length).toBeGreaterThan(0);
    // Owner can retry manually.
    c.retryTask(t.id);
    expect(c.tasks.get(t.id).status).toBe('PENDING');
  });

  it('blocks (not fails) tasks that need a missing integration or product', async () => {
    env = makeCompany();
    const t = env.c.tasks.create({ title: 'hooks sin producto', description: '', type: 'nova.hooks', agentId: 'NOVA', input: { videoId: 'x' }, createdBy: 'ALEX' });
    await env.c.scheduler.drain();
    expect(env.c.tasks.get(t.id).status).toBe('BLOCKED');
    expect(env.c.tasks.get(t.id).error).toMatch(/INTEGRATION_REQUIRED/);
  });

  it('runs the supervisor quality gate and sends work back with feedback', async () => {
    env = makeCompany();
    const { c } = env;
    activeTestProduct(c);
    const run = c.workflows.start('analytics_review', { createdBy: 'OWNER' });
    await c.scheduler.drain();
    const task = c.tasks.list({ workflowRunId: run.id })[0];
    expect(task.status).toBe('COMPLETED');
    expect(task.review[0]).toMatchObject({ reviewer: 'ALEX', passed: true });
    expect(task.engine).toBe('local-heuristic');
  });
});
