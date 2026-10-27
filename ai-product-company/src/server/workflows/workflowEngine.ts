import type { Company } from '../company.js';
import type { Database, Row } from '../db.js';
import { parseJson } from '../db.js';
import { newId, now } from '../core/ids.js';
import { NotFoundError, ValidationError } from '../core/errors.js';
import type { Priority, WorkflowType } from '../campaigns/campaignService.js';
import type { Task } from '../tasks/taskEngine.js';
import { getTaskType } from '../tasks/types/index.js';
import { WORKFLOWS } from './definitions.js';

export type RunStatus = 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WorkflowRun {
  id: string;
  type: WorkflowType;
  title: string;
  productId: string | null;
  campaignId: string | null;
  objectiveId: string | null;
  parentRunId: string | null;
  status: RunStatus;
  currentStep: string | null;
  cycle: number;
  context: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StartOptions {
  title?: string;
  productId?: string | null;
  campaignId?: string | null;
  objectiveId?: string | null;
  parentRunId?: string | null;
  priority?: Priority;
  context?: Record<string, unknown>;
  createdBy: string;
}

export interface StepSpec {
  key: string;
  agent: string;
  label: string;
  taskType: string;
  deadlineHours: number;
}

/** A workflow definition reacts to its tasks finishing and decides what happens next. */
export interface WorkflowDefinition {
  type: WorkflowType;
  title: string;
  description: string;
  requiresProduct: boolean;
  steps: StepSpec[];
  start(api: WorkflowApi, run: WorkflowRun): void;
  onTaskCompleted(api: WorkflowApi, run: WorkflowRun, task: Task): Promise<void> | void;
  onChildFinished?(api: WorkflowApi, run: WorkflowRun, child: WorkflowRun): Promise<void> | void;
}

/** Operations workflow definitions use (keeps them declarative and testable). */
export class WorkflowApi {
  constructor(readonly c: Company) {}

  step(run: WorkflowRun, key: string): StepSpec {
    const def = WORKFLOWS[run.type];
    const s = def.steps.find((x) => x.key === key);
    if (!s) throw new Error(`Workflow ${run.type} has no step ${key}`);
    return s;
  }

  /** Create the task for a step. Dependencies make the queue wait for upstream work. */
  createStepTask(run: WorkflowRun, key: string, opts: { input?: Record<string, unknown>; dependsOn?: string[]; title?: string; description?: string; createdBy?: string; priority?: Priority } = {}): Task {
    const s = this.step(run, key);
    const tt = getTaskType(s.taskType);
    const priority = opts.priority ?? (run.context.priority as Priority) ?? 'normal';
    const task = this.c.tasks.create({
      title: opts.title ?? `${s.label}${run.cycle ? ` · rev ${run.cycle}` : ''} — ${run.title}`,
      description: opts.description ?? tt.description,
      type: s.taskType,
      agentId: s.agent,
      supervisorId: tt.reviewer,
      priority,
      productId: run.productId,
      campaignId: run.campaignId,
      workflowRunId: run.id,
      stepKey: key,
      deadlineHours: s.deadlineHours,
      dependsOn: opts.dependsOn ?? [],
      input: { ...(run.context.videoId ? { videoId: run.context.videoId } : {}), cycle: run.cycle, ...opts.input },
      maxAttempts: this.c.settings.get().maxTaskAttempts,
      createdBy: opts.createdBy ?? 'ALEX',
    });
    this.c.workflows.setStep(run.id, key);
    return task;
  }

  update(run: WorkflowRun, patch: { cycle?: number; context?: Record<string, unknown>; status?: RunStatus; campaignId?: string }) {
    this.c.workflows.patch(run.id, patch);
  }

  complete(run: WorkflowRun, summary: string) {
    this.c.workflows.finish(run.id, 'COMPLETED', null, summary);
  }

  fail(run: WorkflowRun, error: string) {
    this.c.workflows.finish(run.id, 'FAILED', error, error);
  }
}

/** WORKFLOW ENGINE — runs multi-agent workflows on top of the task engine. */
export class WorkflowEngine {
  readonly api: WorkflowApi;

  constructor(private db: Database, private c: Company) {
    this.api = new WorkflowApi(c);
  }

  start(type: WorkflowType, opts: StartOptions): WorkflowRun {
    const def = WORKFLOWS[type];
    if (!def) throw new ValidationError(`Unknown workflow ${type}`);
    const productId = opts.productId === undefined ? this.c.products.getActive()?.id ?? null : opts.productId;
    if (def.requiresProduct && !productId) throw new ValidationError('No ACTIVE PRODUCT. Activate a product in the Product Center first.');
    const id = newId('run');
    const ts = now();
    this.db.insert('workflow_runs', {
      id,
      type,
      title: opts.title ?? def.title,
      product_id: productId,
      campaign_id: opts.campaignId ?? null,
      objective_id: opts.objectiveId ?? null,
      parent_run_id: opts.parentRunId ?? null,
      status: 'RUNNING',
      cycle: 0,
      context: { priority: opts.priority ?? 'normal', createdBy: opts.createdBy, ...opts.context },
      created_at: ts,
      updated_at: ts,
    });
    const run = this.get(id);
    this.c.events.emit('WORKFLOW_STARTED', { runId: id, type, title: run.title, productId, createdBy: opts.createdBy, parentRunId: run.parentRunId });
    this.c.activity.record({ agentId: opts.createdBy === 'OWNER' ? null : opts.createdBy, kind: 'decision', action: `Lanza workflow ${type}: ${run.title}` });
    def.start(this.api, run);
    return this.get(id);
  }

  get(id: string): WorkflowRun {
    const r = this.db.get('SELECT * FROM workflow_runs WHERE id = ?', id);
    if (!r) throw new NotFoundError('Workflow run');
    return toRun(r);
  }

  list(filter: { status?: string; type?: string; parentRunId?: string; limit?: number } = {}): WorkflowRun[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter.parentRunId) {
      where.push('parent_run_id = ?');
      params.push(filter.parentRunId);
    }
    params.push(filter.limit ?? 100);
    return this.db.all(`SELECT * FROM workflow_runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`, ...params).map(toRun);
  }

  activeCount(): number {
    return Number(this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM workflow_runs WHERE status IN ('RUNNING', 'WAITING_APPROVAL')")?.n ?? 0);
  }

  setStep(id: string, step: string) {
    this.db.update('workflow_runs', id, { current_step: step, updated_at: now() });
    this.c.events.emit('WORKFLOW_STEP', { runId: id, step });
  }

  reopen(id: string) {
    const run = this.get(id);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      this.db.update('workflow_runs', id, { status: 'RUNNING', completed_at: null, error: null, updated_at: now() });
    }
  }

  patch(id: string, patch: { cycle?: number; context?: Record<string, unknown>; status?: RunStatus; campaignId?: string }) {
    const run = this.get(id);
    const map: Record<string, unknown> = { updated_at: now() };
    if (patch.campaignId) map.campaign_id = patch.campaignId;
    if (patch.cycle !== undefined) map.cycle = patch.cycle;
    if (patch.context) map.context = { ...run.context, ...patch.context };
    if (patch.status) map.status = patch.status;
    this.db.update('workflow_runs', id, map);
  }

  finish(id: string, status: 'COMPLETED' | 'FAILED' | 'CANCELLED', error: string | null, summary: string) {
    const run = this.get(id);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return;
    this.db.update('workflow_runs', id, { status, error, completed_at: now(), updated_at: now(), context: { ...run.context, summary } });
    this.c.events.emit(status === 'COMPLETED' ? 'WORKFLOW_COMPLETED' : 'WORKFLOW_FAILED', { runId: id, type: run.type, title: run.title, summary, error });
    if (run.objectiveId) this.c.campaigns.setObjectiveStatus(run.objectiveId, status === 'COMPLETED' ? 'DONE' : 'FAILED');
    if (run.parentRunId) {
      const parent = this.get(run.parentRunId);
      const def = WORKFLOWS[parent.type];
      void Promise.resolve(def.onChildFinished?.(this.api, parent, this.get(id))).catch((err) => console.error('[workflow] onChildFinished', err));
    }
  }

  cancel(id: string) {
    const run = this.get(id);
    for (const t of this.c.tasks.list({ workflowRunId: id })) {
      if (['PENDING', 'BLOCKED', 'REVISION_REQUIRED'].includes(t.status)) this.c.tasks.transition(t.id, 'FAILED', { error: 'Workflow cancelled by owner' }, 'cancelled');
    }
    this.finish(id, 'CANCELLED', 'Cancelled by owner', 'Cancelado por el propietario');
    return this.get(run.id);
  }

  /** Called by the executor after a task reaches COMPLETED. */
  async onTaskCompleted(task: Task) {
    if (!task.workflowRunId) return;
    const run = this.get(task.workflowRunId);
    if (!['RUNNING', 'WAITING_APPROVAL'].includes(run.status)) return;
    await WORKFLOWS[run.type].onTaskCompleted(this.api, run, task);
  }

  /** Called by the executor after a task FAILED or got BLOCKED for good. */
  onTaskFailed(task: Task, reason: string) {
    if (!task.workflowRunId) return;
    const run = this.get(task.workflowRunId);
    if (run.context.videoId) this.c.videos.setStatus(String(run.context.videoId), 'FAILED', task.agentId, reason);
    this.finish(run.id, 'FAILED', reason, `Fallo en ${task.agentId}: ${reason}`);
  }

  /** Steps for the UI timeline: what's done, running, pending. */
  timeline(run: WorkflowRun) {
    const tasks = this.c.tasks.list({ workflowRunId: run.id, limit: 500 }).reverse();
    return WORKFLOWS[run.type].steps.map((s) => {
      const forStep = tasks.filter((t) => t.stepKey === s.key);
      const last = forStep[forStep.length - 1] ?? null;
      return { ...s, attempts: forStep.length, status: last?.status ?? 'NOT_STARTED', taskId: last?.id ?? null };
    });
  }
}

function toRun(r: Row): WorkflowRun {
  return {
    id: String(r.id),
    type: r.type as WorkflowType,
    title: String(r.title),
    productId: (r.product_id as string) ?? null,
    campaignId: (r.campaign_id as string) ?? null,
    objectiveId: (r.objective_id as string) ?? null,
    parentRunId: (r.parent_run_id as string) ?? null,
    status: r.status as RunStatus,
    currentStep: (r.current_step as string) ?? null,
    cycle: Number(r.cycle),
    context: parseJson(r.context, {}),
    error: (r.error as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    completedAt: (r.completed_at as string) ?? null,
  };
}
