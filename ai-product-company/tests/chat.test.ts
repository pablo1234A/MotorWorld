import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { makeCompany, activeTestProduct } from './helpers.js';
import type { LlmProvider, LlmRequest, LlmResult } from '../src/server/llm/provider.js';

/** Fake brain: records requests and returns scripted structured outputs (no network). */
class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-model';
  readonly available = true;
  requests: LlmRequest<z.ZodType>[] = [];
  constructor(private reply: (req: LlmRequest<z.ZodType>) => unknown) {}
  async generate<T extends z.ZodType>(req: LlmRequest<T>): Promise<LlmResult<z.infer<T>>> {
    this.requests.push(req);
    return { data: req.schema.parse(this.reply(req)), model: this.model, usage: { inputTokens: 10, outputTokens: 5 } };
  }
}

describe('Chat with the company', () => {
  let env: ReturnType<typeof makeCompany>;
  afterEach(() => env?.cleanup());

  it('"Atlas, quiero vender más este producto" activates the system (local engine)', async () => {
    env = makeCompany();
    activeTestProduct(env.c);
    const res = await env.c.chat.send('ATLAS', 'Atlas, quiero vender más este producto');
    expect(res.actions[0]).toMatchObject({ type: 'launch_strategy', ok: true });
    const run = env.c.workflows.list({ type: 'strategy' })[0];
    expect(run.context.goal).toBe('Atlas, quiero vender más este producto');
    expect(env.c.chat.history('ATLAS').map((m) => m.fromId)).toEqual(['OWNER', 'ATLAS']);
    expect(res.reply.content).toContain('Motor local');
  });

  it('keeps per-agent context and enforces per-agent chat permissions (LLM path)', async () => {
    const provider = new ScriptedProvider(() => ({
      reply: 'Hecho.',
      actions: [{ type: 'launch_strategy', goal: 'x', count: 0, angle: '', memoryTitle: '', memoryContent: '' }],
    }));
    env = makeCompany({ llmProvider: provider });
    activeTestProduct(env.c);
    await env.c.chat.send('EVA', 'Hola EVA, ¿qué ves en la tienda?');
    const res = await env.c.chat.send('EVA', 'Lanza una estrategia completa');
    // EVA is not allowed to launch strategies.
    expect(res.actions[0]).toMatchObject({ type: 'launch_strategy', ok: false });
    expect(env.c.workflows.list({ type: 'strategy' })).toHaveLength(0);
    // Second request carries the previous turn as history + EVA's identity, skills and product context.
    const req = provider.requests[1];
    expect(req.history?.map((h) => h.role)).toEqual(['user', 'assistant']);
    expect(req.system).toContain('Eres EVA');
    expect(req.system).toContain('E-commerce CRO');
    expect(req.user).toContain('PostureFlex');
    expect(env.c.llm.callsToday()).toBe(2);
  });

  it('loads only the skills relevant to the task (LLM path) and respects the daily budget', async () => {
    const provider = new ScriptedProvider((req) => {
      throw new Error(`unexpected call for ${req.agentId}`);
    });
    env = makeCompany({ llmProvider: provider });
    env.c.settings.update({ maxLlmCallsPerDay: 1 });
    activeTestProduct(env.c);
    env.c.db.insert('llm_usage', { agent_id: 'X', model: 'm', input_tokens: 1, output_tokens: 1, created_at: new Date().toISOString() });
    const t = env.c.tasks.create({ title: 'análisis', description: '', type: 'iris.analytics', agentId: 'IRIS', createdBy: 'OWNER' });
    await env.c.scheduler.drain();
    expect(env.c.tasks.get(t.id)).toMatchObject({ status: 'BLOCKED' });
    expect(env.c.tasks.get(t.id).error).toMatch(/budget/i);
    expect(provider.requests).toHaveLength(0);
  });
});
