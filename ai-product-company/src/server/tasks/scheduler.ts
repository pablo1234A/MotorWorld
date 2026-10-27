import type { Company } from '../company.js';
import { getAgent } from '../agents/definitions.js';
import { buildSystemPrompt } from '../agents/prompt.js';
import { buildProductContext } from '../products/productContext.js';
import { BudgetExceededError, IntegrationRequiredError, PermissionDeniedError, errorMessage, isRetryable } from '../core/errors.js';
import { localDate, now } from '../core/ids.js';
import { ToolBelt } from '../tools/registry.js';
import type { Task } from './taskEngine.js';
import { getTaskType } from './types/index.js';
import type { TaskContext } from './types/base.js';

const MAX_GATE_REVISIONS = 2;

/**
 * SCHEDULER + EXECUTOR — the company's heartbeat.
 * Every tick: watch deadlines, run autopilot / daily report triggers, refresh
 * agent states and dispatch runnable tasks (one per agent, bounded concurrency).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private running = new Map<string, Promise<void>>(); // agentId → execution
  /** Base retry delay (ms); tests shrink it. */
  retryBaseMs = 5_000;
  /** Disable time-based triggers (autopilot, daily report) in tests. */
  triggersEnabled = true;

  constructor(private c: Company) {}

  start(intervalMs = 1500) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get busyAgents(): string[] {
    return [...this.running.keys()];
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.watchDeadlines();
      if (this.triggersEnabled) {
        this.autopilot();
        this.dailyReport();
      }
      this.dispatch();
      this.refreshAgentStates();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    } finally {
      this.ticking = false;
    }
  }

  /** Run until the queue is empty and nothing is executing (tests, scripts). */
  async drain(timeoutMs = 120_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      await this.tick();
      if (this.running.size) await Promise.race(this.running.values());
      else {
        const pending = this.c.tasks.list({ status: 'PENDING' });
        if (!pending.length) break;
        const waitingRetry = pending.filter((t) => t.nextAttemptAt && t.nextAttemptAt > now());
        if (waitingRetry.length === pending.length) await new Promise((r) => setTimeout(r, 25));
        else if (!this.c.tasks.runnable().length) break; // only dependency-blocked work left
      }
      if (Date.now() - start > timeoutMs) throw new Error('Scheduler drain timed out');
    }
    this.refreshAgentStates();
  }

  private dispatch() {
    const max = this.c.settings.get().maxConcurrentTasks;
    for (const task of this.c.tasks.runnable()) {
      if (this.running.size >= max) break;
      if (this.running.has(task.agentId)) continue;
      this.c.tasks.transition(task.id, 'ASSIGNED', {}, `assigned to ${task.agentId}`);
      const exec = this.execute(task.id).finally(() => this.running.delete(task.agentId));
      this.running.set(task.agentId, exec);
    }
  }

  /** Execute one task end-to-end: context → think (LLM or local) → supervisor gate → apply → workflow. */
  async execute(taskId: string): Promise<void> {
    let task = this.c.tasks.get(taskId);
    const agent = getAgent(task.agentId);
    const tt = getTaskType(task.type);
    task = this.c.tasks.transition(task.id, 'RUNNING', { attempts: task.attempts + 1 }, `attempt ${task.attempts + 1}/${task.maxAttempts}`);
    this.c.agentState.set(agent.id, tt.workingStatus ?? 'WORKING', { taskId: task.id, note: task.title });
    this.c.activity.record({ agentId: agent.id, kind: 'action', action: `Empieza: ${task.title}`, taskId: task.id });
    try {
      const ctx = this.buildContext(task);
      const useLlm = this.c.llm.available && !tt.deterministic;
      ctx.engine = useLlm ? 'llm' : 'local';
      let output: unknown;
      if (useLlm) {
        const userParts = [
          `# TAREA: ${task.title}\n${task.description}`,
          await tt.instructions(ctx),
          ctx.productContext ? ctx.productContext.text : '# PRODUCTO ACTIVO\nNo hay producto activo.',
          `# MEMORIA RELEVANTE\n${ctx.memoryText}`,
        ];
        const res = await this.c.llm.generate({
          agentId: agent.id,
          taskId: task.id,
          system: buildSystemPrompt(agent, tt.skills, ctx.settings.language),
          user: userParts.join('\n\n'),
          images: tt.images ? await tt.images(ctx) : undefined,
          schema: tt.schema,
          effort: agent.effort,
          maxTokens: tt.maxTokens,
        });
        output = res.data;
        this.c.tasks.log(task.id, 'info', `LLM ${res.model}: ${res.usage.inputTokens} in / ${res.usage.outputTokens} out tokens`);
      } else {
        output = await tt.local(ctx);
        this.c.tasks.log(task.id, 'info', tt.deterministic ? 'deterministic task (no LLM)' : 'LOCAL HEURISTIC ENGINE (no LLM connected)');
      }
      const parsed = tt.schema.parse(output);
      const engine = useLlm ? this.c.llm.engineLabel : tt.deterministic ? 'deterministic' : 'local-heuristic';
      task = this.c.tasks.transition(task.id, 'WAITING_REVIEW', { result: { output: parsed }, engine });

      // Supervisor quality gate.
      if (tt.reviewer && tt.gate) {
        const issues = tt.gate(parsed, ctx);
        this.c.tasks.addReview(task.id, { reviewer: tt.reviewer, passed: issues.length === 0, issues, at: now() });
        this.c.activity.record({ agentId: tt.reviewer, kind: 'decision', action: `Quality gate de "${task.title}": ${issues.length ? `REVISION (${issues.length})` : 'OK'}`, taskId: task.id });
        if (issues.length) {
          if (task.revision < MAX_GATE_REVISIONS) {
            this.c.tasks.transition(task.id, 'REVISION_REQUIRED', {}, issues.join(' | '));
            this.c.messages.send({ from: tt.reviewer, to: agent.id, kind: 'review', content: `Revision required: ${issues.join(' · ')}`, taskId: task.id, workflowRunId: task.workflowRunId });
            this.c.tasks.transition(task.id, 'PENDING', { revision: task.revision + 1, input: { ...task.input, gateFeedback: issues } }, 'back to queue with supervisor feedback');
            this.c.agentState.set(agent.id, 'IDLE', { taskId: null, note: null });
            return;
          }
          throw new Error(`Quality gate failed ${MAX_GATE_REVISIONS + 1} times: ${issues.join(' | ')}`);
        }
      }
      task = this.c.tasks.transition(task.id, 'APPROVED', {}, tt.reviewer ? `approved by ${tt.reviewer}` : 'no supervisor gate');

      const outcome = await tt.apply(ctx, parsed);
      task = this.c.tasks.transition(task.id, 'COMPLETED', { result: { output: parsed, summary: outcome.summary, score: outcome.score ?? null, data: outcome.data ?? {} }, error: null }, outcome.summary);
      this.c.agentState.recordOutcome(agent.id, 'completed', outcome.score ?? null);
      this.c.activity.record({ agentId: agent.id, kind: 'action', action: `Completa: ${task.title}`, taskId: task.id, result: outcome.summary });
      this.c.agentState.set(agent.id, 'IDLE', { taskId: null, note: outcome.summary.slice(0, 140) });
      await this.c.workflows.onTaskCompleted(task);
    } catch (err) {
      this.handleFailure(task.id, err);
    }
  }

  private buildContext(task: Task): TaskContext {
    const agent = getAgent(task.agentId);
    const tt = getTaskType(task.type);
    const run = task.workflowRunId ? this.c.workflows.get(task.workflowRunId) : null;
    const product = this.c.products.find(task.productId ?? run?.productId) ?? (tt.requiresProduct ? null : this.c.products.getActive());
    if (tt.requiresProduct && !product) throw new IntegrationRequiredError('product', 'No product for this task — activate a product in the Product Center');
    const memory = this.c.memory.recall({
      agentId: agent.id,
      scopes: agent.memoryScopes,
      productId: product?.id,
      campaignId: task.campaignId,
      videoId: typeof task.input.videoId === 'string' ? task.input.videoId : null,
      taskId: task.id,
    });
    const feedback = [...((task.input.feedback as string[] | undefined) ?? []), ...((task.input.gateFeedback as string[] | undefined) ?? [])];
    return {
      c: this.c,
      task,
      agent,
      product,
      productContext: product ? buildProductContext(product, agent.productFields) : null,
      memoryText: this.c.memory.render(memory),
      run,
      tools: new ToolBelt(this.c, agent.id, task.id, task.workflowRunId),
      settings: this.c.settings.get(),
      feedback,
      engine: 'local',
    };
  }

  /** ERROR HANDLING: log → inform ALEX → retry if safe → escalate to ATLAS → dashboard. Never hidden. */
  private handleFailure(taskId: string, err: unknown) {
    const task = this.c.tasks.get(taskId);
    const msg = errorMessage(err);
    if (!(err instanceof IntegrationRequiredError) && !(err instanceof BudgetExceededError)) console.error(`[task ${task.id}] ${task.type} failed:`, err);
    this.c.tasks.log(task.id, 'error', msg);
    this.c.activity.record({ agentId: task.agentId, kind: 'error', action: `Error en "${task.title}"`, taskId: task.id, error: msg });
    this.c.agentState.set(task.agentId, 'ERROR', { taskId: task.id, note: msg.slice(0, 160) });
    const boss = task.agentId === 'ALEX' ? 'ATLAS' : 'ALEX';
    if (task.agentId !== 'ATLAS') this.c.messages.send({ from: task.agentId, to: boss, kind: 'escalation', content: `Error en "${task.title}": ${msg}`, taskId: task.id, workflowRunId: task.workflowRunId });

    const blocking = err instanceof IntegrationRequiredError || err instanceof BudgetExceededError || err instanceof PermissionDeniedError;
    if (blocking) {
      this.c.tasks.transition(task.id, 'BLOCKED', { error: msg }, 'blocked — needs owner action');
      this.escalate(task, msg, 'BLOCKED');
      return;
    }
    if (isRetryable(err) && task.attempts < task.maxAttempts) {
      const delay = this.retryBaseMs * 2 ** (task.attempts - 1);
      this.c.tasks.transition(task.id, 'PENDING', { error: msg, nextAttemptAt: new Date(Date.now() + delay).toISOString() }, `retry in ${Math.round(delay / 1000)}s`);
      this.c.events.emit('TASK_RETRY', { taskId: task.id, agentId: task.agentId, attempt: task.attempts, delayMs: delay, error: msg });
      return;
    }
    this.c.tasks.transition(task.id, 'FAILED', { error: msg }, 'retries exhausted');
    this.c.agentState.recordOutcome(task.agentId, 'failed');
    this.escalate(task, msg, 'FAILED');
    this.c.workflows.onTaskFailed(task, msg);
  }

  private escalate(task: Task, msg: string, state: 'FAILED' | 'BLOCKED') {
    if (task.agentId !== 'ATLAS') {
      this.c.messages.send({ from: 'ALEX', to: 'ATLAS', kind: 'escalation', content: `Escalado: "${task.title}" (${task.agentId}) ${state}. ${msg}`, taskId: task.id, workflowRunId: task.workflowRunId });
    }
    this.c.events.emit('ERROR_ESCALATED', { taskId: task.id, agentId: task.agentId, state, error: msg, title: task.title });
  }

  /** Deadline monitoring: overdue work is reported to ALEX once. */
  private watchDeadlines() {
    for (const t of this.c.tasks.overdue()) {
      this.c.tasks.markOverdueNotified(t.id);
      this.c.messages.send({ from: 'SYSTEM', to: 'ALEX', kind: 'escalation', content: `Deadline superado: "${t.title}" (${t.agentId}, estado ${t.status}).`, taskId: t.id, workflowRunId: t.workflowRunId });
      this.c.events.emit('TASK_OVERDUE', { taskId: t.id, agentId: t.agentId, title: t.title, deadline: t.deadline });
    }
  }

  /** AUTONOMY: ATLAS periodically reviews the company and may create objectives on its own. */
  private autopilot() {
    const s = this.c.settings.get();
    if (!s.autopilot) return;
    const product = this.c.products.getActive();
    if (!product) return;
    const last = this.c.settings.getState('autopilot:last');
    if (last && Date.now() - Date.parse(last) < s.autopilotIntervalMinutes * 60_000) return;
    if (this.c.workflows.list({ status: 'RUNNING', type: 'strategy' }).length) return;
    this.c.settings.setState('autopilot:last', now());
    this.c.workflows.start('strategy', { title: 'Revisión autónoma de ATLAS', productId: product.id, createdBy: 'ATLAS', context: { goal: 'Revisión autónoma de la empresa', autopilot: true } });
    this.c.activity.record({ agentId: 'ATLAS', kind: 'decision', action: 'Autopilot: inicia una revisión autónoma de la empresa' });
  }

  /** DAILY REPORT at the configured hour (once per day). */
  private dailyReport() {
    const s = this.c.settings.get();
    const today = localDate();
    if (new Date().getHours() < s.dailyReportHour) return;
    if (this.c.settings.getState('report:last') === today || this.c.reports.byDate(today)) return;
    this.c.settings.setState('report:last', today);
    this.c.workflows.start('daily_report', { title: `Daily Report ${today}`, productId: null, createdBy: 'SYSTEM', priority: 'high', context: { date: today } });
  }

  /** Visual states for idle agents: WAITING (queued work), APPROVAL_REQUIRED, ERROR stays until next task, else IDLE. */
  private refreshAgentStates() {
    for (const st of this.c.agentState.all()) {
      if (this.running.has(st.agentId)) continue;
      const queued = this.c.tasks.list({ agentId: st.agentId, status: 'PENDING', limit: 1 }).length + this.c.tasks.list({ agentId: st.agentId, status: 'BLOCKED', limit: 1 }).length;
      const approvals = this.c.approvals.pendingCount(st.agentId);
      if (st.status === 'ERROR' && !queued) continue;
      const next = approvals ? 'APPROVAL_REQUIRED' : queued ? 'WAITING' : 'IDLE';
      if (st.status !== next) this.c.agentState.set(st.agentId, next, { taskId: next === 'IDLE' ? null : st.currentTaskId });
    }
  }
}
