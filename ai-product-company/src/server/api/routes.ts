import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Company } from '../company.js';
import { AGENTS, getAgent, isAgentId } from '../agents/definitions.js';
import { SKILLS, getSkills } from '../skills/registry.js';
import { TOOLS } from '../tools/registry.js';
import { ACTIONS, RESOURCES, riskOf } from '../permissions/permissions.js';
import { buildProductContext } from '../products/productContext.js';
import { SettingsSchema } from '../core/settings.js';
import { MEMORY_SCOPES, MemoryInputSchema } from '../memory/memoryService.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import { localDate } from '../core/ids.js';
import { WORKFLOWS } from '../workflows/definitions.js';
import { taskTypes } from '../tasks/types/index.js';
import { EVENT_TYPES } from '../core/events.js';

const LaunchSchema = z.object({
  type: z.enum(['strategy', 'video_pipeline', 'store_audit', 'analytics_review', 'daily_report']),
  title: z.string().trim().max(160).optional(),
  goal: z.string().trim().max(2000).optional(),
  angle: z.string().trim().max(200).optional(),
  count: z.number().int().min(1).max(3).optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
});

const RevisionSchema = z.object({ target: z.enum(['NEO', 'REX', 'MAX']), note: z.string().trim().min(3).max(2000) });
const ChatSchema = z.object({ message: z.string().trim().min(1).max(4000) });

function agentSummary(c: Company, id: string) {
  const a = getAgent(id);
  const st = c.agentState.get(id);
  const task = st.currentTaskId ? safe(() => c.tasks.get(st.currentTaskId!)) : null;
  return {
    id: a.id,
    name: a.name,
    title: a.title,
    department: a.department,
    color: a.color,
    reportsTo: a.reportsTo,
    supervises: a.supervises,
    mission: a.mission,
    state: st,
    currentTask: task ? { id: task.id, title: task.title, status: task.status, type: task.type, startedAt: task.startedAt } : null,
  };
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

const deliveryRows = (c: Company) => c.deliveries.list();

export function registerRoutes(app: FastifyInstance, c: Company) {
  /* ───────────── CONTROL CENTER ───────────── */
  app.get('/api/snapshot', async () => {
    const active = c.products.getActive();
    const counts = c.tasks.counts();
    const deliveries = deliveryRows(c);
    const runs = c.workflows.list({ limit: 30 });
    return {
      engine: c.llm.engineLabel,
      llmConnected: c.llm.available,
      activeProduct: active ? { id: active.id, name: active.name, status: active.status, price: active.price, currency: active.currency, image: active.images[0]?.id ?? null, marginPct: active.marginPct } : null,
      agents: AGENTS.map((a) => agentSummary(c, a.id)),
      tasks: counts,
      activeWorkflows: runs
        .filter((r) => ['RUNNING', 'WAITING_APPROVAL'].includes(r.status))
        .map((r) => ({ id: r.id, type: r.type, title: r.title, status: r.status, cycle: r.cycle, currentStep: r.currentStep, timeline: c.workflows.timeline(r), createdAt: r.createdAt })),
      recentWorkflows: runs.slice(0, 12).map((r) => ({ id: r.id, type: r.type, title: r.title, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt })),
      deliveries: {
        total: deliveries.length,
        byStatus: deliveries.reduce<Record<string, number>>((acc, d) => ((acc[d.status] = (acc[d.status] ?? 0) + 1), acc), {}),
        latest: deliveries.slice(0, 6),
      },
      approvals: { pending: c.approvals.pendingCount(), items: c.approvals.list('PENDING').slice(0, 5) },
      errors: {
        failed: counts.FAILED,
        blocked: counts.BLOCKED,
        agentsInError: c.agentState.all().filter((s) => s.status === 'ERROR').map((s) => s.agentId),
        recent: c.activity.list({ kind: 'error', limit: 8 }),
      },
      performance: c.reports.internalMetrics(),
      activity: c.activity.list({ limit: 40 }),
      messages: c.messages.internal({ limit: 30 }),
      settings: c.settings.get(),
      integrations: c.integrations.list().map((i) => ({ id: i.id, name: i.name, category: i.category, status: i.status, active: i.active })),
      busyAgents: c.scheduler.busyAgents,
    };
  });

  /* ───────────── PRODUCT CENTER ───────────── */
  app.get('/api/products', async () => c.products.list());
  app.post('/api/products', async (req) => c.products.create(req.body));
  app.get('/api/products/:id', async (req) => {
    const p = c.products.get((req.params as { id: string }).id);
    return { ...p, memory: c.memory.list({ scope: 'product', scopeId: p.id, limit: 50 }), brandMemory: c.memory.list({ scope: 'brand', scopeId: p.id, limit: 50 }) };
  });
  app.put('/api/products/:id', async (req) => c.products.update((req.params as { id: string }).id, req.body));
  app.delete('/api/products/:id', async (req) => {
    c.products.remove((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post('/api/products/:id/activate', async (req) => c.products.activate((req.params as { id: string }).id));
  app.post('/api/products/:id/deactivate', async (req) => c.products.deactivate((req.params as { id: string }).id));
  app.post('/api/products/:id/assets', async (req) => {
    const id = (req.params as { id: string }).id;
    const out = [];
    for await (const part of req.files()) {
      const buffer = await part.toBuffer();
      out.push(c.products.addAsset(id, { buffer, originalName: part.filename, mime: part.mimetype }));
    }
    if (!out.length) throw new ValidationError('No files uploaded');
    return out;
  });
  app.delete('/api/products/:id/assets/:assetId', async (req) => {
    const { id, assetId } = req.params as { id: string; assetId: string };
    c.products.removeAsset(id, assetId);
    return { ok: true };
  });
  /** What each agent actually receives from the product (context propagation, made visible). */
  app.get('/api/products/:id/context', async (req) => {
    const p = c.products.get((req.params as { id: string }).id);
    return AGENTS.map((a) => {
      const ctx = buildProductContext(p, a.productFields);
      return { agentId: a.id, fields: a.productFields, missing: ctx.missing, text: ctx.text };
    });
  });

  /* ───────────── AGENTS / SKILLS / PERMISSIONS ───────────── */
  app.get('/api/agents', async () => AGENTS.map((a) => agentSummary(c, a.id)));
  app.get('/api/agents/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    if (!isAgentId(id)) throw new NotFoundError('Agent');
    const a = getAgent(id);
    const tasks = c.tasks.list({ agentId: id, limit: 60 });
    return {
      ...agentSummary(c, id),
      definition: a,
      skills: getSkills(a.skills),
      tools: TOOLS.filter((t) => a.tools.includes(t.id)),
      taskTypes: taskTypes().filter((t) => t.agent === id).map((t) => ({ type: t.type, label: t.label, description: t.description, skills: t.skills, reviewer: t.reviewer })),
      memory: c.memory.list({ scope: 'agent', scopeId: id, limit: 50 }),
      tasks,
      errors: tasks.filter((t) => t.status === 'FAILED' || t.status === 'BLOCKED' || t.error),
      communications: c.messages.internal({ agentId: id, limit: 60 }),
      log: c.activity.list({ agentId: id, limit: 80 }),
    };
  });
  app.get('/api/skills', async () => SKILLS);
  app.get('/api/tools', async () => TOOLS);
  app.get('/api/permissions', async () => ({
    actions: ACTIONS,
    resources: RESOURCES,
    critical: ACTIONS.flatMap((a) => RESOURCES.map((r) => ({ action: a, resource: r, ...riskOf(a, r) }))).filter((x) => x.critical),
    agents: AGENTS.map((a) => ({ id: a.id, grants: a.grants })),
  }));

  /* ───────────── TASKS / WORKFLOWS ───────────── */
  app.get('/api/tasks', async (req) => {
    const q = req.query as { status?: string; agent?: string; run?: string };
    return c.tasks.list({ status: q.status, agentId: q.agent, workflowRunId: q.run, limit: 400 });
  });
  app.get('/api/tasks/:id', async (req) => {
    const t = c.tasks.get((req.params as { id: string }).id);
    return { ...t, logs: c.tasks.logs(t.id), messages: c.db.all('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at', t.id) };
  });
  app.post('/api/tasks/:id/retry', async (req) => {
    const t = c.retryTask((req.params as { id: string }).id);
    void c.scheduler.tick();
    return t;
  });

  app.get('/api/workflows', async () => c.workflows.list({ limit: 200 }));
  app.get('/api/workflows/definitions', async () => Object.values(WORKFLOWS).map((w) => ({ type: w.type, title: w.title, description: w.description, steps: w.steps, requiresProduct: w.requiresProduct })));
  app.get('/api/workflows/:id', async (req) => {
    const run = c.workflows.get((req.params as { id: string }).id);
    return {
      ...run,
      timeline: c.workflows.timeline(run),
      tasks: c.tasks.list({ workflowRunId: run.id, limit: 200 }),
      messages: c.messages.internal({ workflowRunId: run.id, limit: 200 }),
      children: c.workflows.list({ parentRunId: run.id }),
      findings: run.type === 'store_audit' ? c.findings.list({ workflowRunId: run.id }) : [],
    };
  });
  app.post('/api/workflows', async (req) => {
    const b = LaunchSchema.parse(req.body);
    const n = b.type === 'video_pipeline' ? b.count ?? 1 : 1;
    const runs = Array.from({ length: n }, (_, i) =>
      c.workflows.start(b.type, {
        title: (b.title || b.goal || WORKFLOWS[b.type].title) + (n > 1 ? ` #${i + 1}` : ''),
        createdBy: 'OWNER',
        priority: b.priority ?? 'high',
        productId: b.type === 'daily_report' ? null : undefined,
        context: { goal: b.goal, angle: b.angle, brief: b.goal, date: b.type === 'daily_report' ? localDate() : undefined },
      }),
    );
    void c.scheduler.tick();
    return runs;
  });
  app.post('/api/workflows/:id/cancel', async (req) => c.workflows.cancel((req.params as { id: string }).id));

  /* ───────────── COMMUNICATION / CHAT ───────────── */
  app.get('/api/messages', async (req) => {
    const q = req.query as { agent?: string; run?: string };
    return c.messages.internal({ agentId: q.agent, workflowRunId: q.run, limit: 300 });
  });
  app.get('/api/chat/:agentId', async (req) => {
    const id = (req.params as { agentId: string }).agentId;
    if (!isAgentId(id)) throw new NotFoundError('Agent');
    return c.chat.history(id);
  });
  app.post('/api/chat/:agentId', async (req) => {
    const id = (req.params as { agentId: string }).agentId;
    if (!isAgentId(id)) throw new NotFoundError('Agent');
    const { message } = ChatSchema.parse(req.body);
    const res = await c.chat.send(id, message);
    void c.scheduler.tick();
    return res;
  });

  /* ───────────── DELIVERY CENTER ───────────── */
  app.get('/api/deliveries', async () => deliveryRows(c));
  app.get('/api/deliveries/:videoId', async (req) => {
    const id = (req.params as { videoId: string }).videoId;
    const detail = c.deliveries.detail(id);
    const video = detail.video;
    return {
      ...detail,
      memory: c.memory.list({ scope: 'video', scopeId: id }),
      tasks: c.tasks.list({ workflowRunId: video.workflowRunId, limit: 100 }),
    };
  });
  app.post('/api/deliveries/:videoId/revision', async (req) => {
    const id = (req.params as { videoId: string }).videoId;
    const b = RevisionSchema.parse(req.body);
    const t = c.requestVideoRevision(id, b.target, b.note);
    void c.scheduler.tick();
    return t;
  });

  /* ───────────── APPROVAL CENTER / STORE ───────────── */
  app.get('/api/approvals', async (req) => {
    const s = (req.query as { status?: string }).status;
    return c.approvals.list(s as 'PENDING' | undefined);
  });
  app.post('/api/approvals/:id/resolve', async (req) => {
    const a = await c.approvals.resolve((req.params as { id: string }).id, req.body);
    void c.scheduler.tick();
    return a;
  });
  app.get('/api/findings', async () => c.findings.list());

  /* ───────────── REPORTS ───────────── */
  app.get('/api/reports', async () => c.reports.list());
  app.get('/api/reports/:date', async (req) => {
    const date = (req.params as { date: string }).date;
    return c.reports.byDate(date) ?? { date, preview: c.reports.collect(date) };
  });
  app.post('/api/reports/generate', async () => {
    const date = localDate();
    const run = c.workflows.start('daily_report', { title: `Daily Report ${date}`, productId: null, createdBy: 'OWNER', priority: 'high', context: { date } });
    void c.scheduler.tick();
    return run;
  });

  /* ───────────── MEMORY ───────────── */
  app.get('/api/memory', async (req) => {
    const q = req.query as { scope?: string; scopeId?: string };
    if (q.scope && !MEMORY_SCOPES.includes(q.scope as never)) throw new ValidationError('Unknown scope');
    return c.memory.list({ scope: q.scope as never, scopeId: q.scopeId, limit: 300 });
  });
  app.post('/api/memory', async (req) => c.memory.write('OWNER', MemoryInputSchema.parse(req.body)));
  app.delete('/api/memory/:id', async (req) => {
    c.memory.remove((req.params as { id: string }).id);
    return { ok: true };
  });

  /* ───────────── LOGS / EVENTS ───────────── */
  app.get('/api/activity', async (req) => {
    const q = req.query as { agent?: string; kind?: string };
    return c.activity.list({ agentId: q.agent, kind: q.kind, limit: 400 });
  });
  app.get('/api/events', async (req) => {
    const t = (req.query as { type?: string }).type;
    return { types: EVENT_TYPES, events: c.events.recent(300, t) };
  });
  app.get('/api/campaigns', async () => c.campaigns.campaigns().map((cp) => ({ ...cp, objectives: c.campaigns.objectives({ campaignId: cp.id }) })));

  /* ───────────── INTEGRATIONS / SETTINGS ───────────── */
  app.get('/api/integrations', async () => c.integrations.list());
  app.post('/api/integrations/shopify/test', async () => c.integrations.shopify.testConnection());
  app.get('/api/settings', async () => ({ settings: c.settings.get(), llm: { engine: c.llm.engineLabel, callsToday: c.llm.callsToday() } }));
  app.put('/api/settings', async (req) => {
    const s = c.settings.update(SettingsSchema.partial().parse(req.body));
    c.events.emit('SETTINGS_UPDATED', { by: 'OWNER' });
    return s;
  });
}
